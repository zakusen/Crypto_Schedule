// v154: wrangler の設定に、清算の Durable Object(LiqHub)の2つの設定を足す(何度実行しても二重に入らない)。
// 使い方(プロジェクトの直下で): node tools/add_liq_config.mjs   → そのあと npx wrangler deploy
// 対象: wrangler.jsonc / wrangler.json / wrangler.toml(最初に見つかったもの)。書き換える前に .bak を作る。
// 既に durable_objects や migrations がある設定は、壊さないよう自動では触らず、足す内容を表示するだけ。
import fs from 'fs';
const dir = process.argv[2] || '.';
const file = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].map((n) => dir + '/' + n).find((p) => fs.existsSync(p));
if (!file) { console.log('wrangler.jsonc / wrangler.json / wrangler.toml が見つかりません。プロジェクトの直下で実行してください。'); process.exit(1); }
const src = fs.readFileSync(file, 'utf8');
const JSON_ADD = '  "durable_objects": { "bindings": [ { "name": "LIQ", "class_name": "LiqHub" } ] },\n  "migrations": [ { "tag": "v150-liq", "new_sqlite_classes": ["LiqHub"] } ]';
const TOML_ADD = '\n[[durable_objects.bindings]]\nname = "LIQ"\nclass_name = "LiqHub"\n\n[[migrations]]\ntag = "v150-liq"\nnew_sqlite_classes = ["LiqHub"]\n';
const manual = () => { console.log('既に durable_objects か migrations があるので、自動では書き換えません。次を手で足してください:\n' + (file.endsWith('.toml') ? TOML_ADD : '  durable_objects.bindings に { "name": "LIQ", "class_name": "LiqHub" }\n  migrations に { "tag": "v150-liq", "new_sqlite_classes": ["LiqHub"] }')); process.exit(2); };
// コメントと文字列の中身を空白にした「構造だけ」の写し(位置は元と同じ)
const mask = (t, toml, keep) => { let o = '', i = 0; while (i < t.length) { const c = t[i], n = t[i + 1];
  if (!toml && c === '/' && n === '/') { while (i < t.length && t[i] !== '\n') { o += ' '; i++; } continue; }
  if (!toml && c === '/' && n === '*') { while (i < t.length && !(t[i] === '*' && t[i + 1] === '/')) { o += t[i] === '\n' ? '\n' : ' '; i++; } o += '  '; i += 2; continue; }
  if (toml && c === '#') { while (i < t.length && t[i] !== '\n') { o += ' '; i++; } continue; }
  if (c === '"' || c === "'") { const q = c; o += q; i++; while (i < t.length && t[i] !== q && t[i] !== '\n') { if (t[i] === '\\') { o += keep ? t[i] + (t[i + 1] || '') : '  '; i += 2; continue; } o += keep ? t[i] : ' '; i++; } o += q; i++; continue; }
  o += c; i++; } return o; };
const toml = file.endsWith('.toml'), m = mask(src, toml), mk = mask(src, toml, true);   // m = 文字列も空白(構造用) / mk = コメントだけ空白(キー名の検出用)
const has = (k) => new RegExp('(^|[^A-Za-z_])"?' + k + '"?\\s*[=:\\[]').test(mk) || mk.includes('[' + k) || mk.includes('[[' + k);
if (/LiqHub/.test(src) && has('durable_objects') && has('migrations')) { console.log('もう入っています(' + file + ')。そのまま npx wrangler deploy してください。'); process.exit(0); }
if (has('durable_objects') || has('migrations')) manual();
fs.copyFileSync(file, file + '.bak');
let out;
if (toml) out = src.replace(/\s*$/, '\n') + TOML_ADD;
else {
  const end = m.lastIndexOf('}'); if (end < 0) { console.log('設定の終わりの } が見つかりません。手で足してください。'); process.exit(1); }
  let p = end - 1; while (p >= 0 && /\s/.test(m[p])) p--;     // 直前の「意味のある文字」
  const before = src.slice(0, p + 1) + (m[p] === '{' || m[p] === ',' ? '' : ',');
  out = before + '\n' + JSON_ADD + '\n' + src.slice(p + 1);
  if (m[p] === '{') out = out;   // 空の設定でも同じ形でOK
}
fs.writeFileSync(file, out);
console.log(file + ' に LiqHub の設定を足しました(元は ' + file + '.bak)。\n次: npx wrangler deploy  → ' + 'https://サイト/api/liq?sym=BTC&step=3600 の error が消えれば成功。');
