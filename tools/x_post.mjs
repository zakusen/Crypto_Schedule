#!/usr/bin/env node
// X への自動投稿(v94)。GitHub Actions「X post」が動かす(Cloudflare の Worker が投稿時刻に合図を送る)。
//  - 投稿時刻を過ぎた(3時間以内の)自動投稿の下書きを、英語 → 日本語の順に投稿する(画像つき・URLなし)
//    対象: 発表後の値動き・週間記録・毎朝の予定(AUTO_DAILY_FROM 以降。それまでは手で予約済み)
//  - 投稿できたら下書きに「済み」の印を付け、Worker が見張る予定(x:due)を書き直す
// X の公式 API(使った分だけ払う方式)。認証は OAuth 1.0a(自分のアカウントの鍵 4つ)。
// 必要: RX_ADMIN_KEY、X_API_KEY・X_API_SECRET・X_ACCESS_TOKEN・X_ACCESS_SECRET
// X_DRY=1 で投稿しない(文面と画像を x_out/ に書き出すだけ。Actions の成果物で確認できる)
// --check: 投稿するものがあるかだけ調べて GITHUB_OUTPUT に need=true/false を書く(ブラウザの用意を省くため)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(here, '..', 'public', 'xpost-lib.js'))).toString('base64'));
const SITE = (process.env.SITE_URL || 'https://crypto-schedule.signalarchive.workers.dev').replace(/\/+$/, '');
const KEY = process.env.RX_ADMIN_KEY || '';
const DRY = process.env.X_DRY === '1';
const CHECK = process.argv.includes('--check');
const X = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
const MAX_POSTS = 6;                      // 1回の実行で出す上限(不具合で連投しないように)
const NOW = Date.now();

if (!KEY) { console.log('[post] RX_ADMIN_KEY が未設定'); process.exit(0); }
async function site(p, opt = {}) {
  const r = await fetch(SITE + p, { ...opt, headers: { 'User-Agent': 'signal-archive-x-post/1.0', 'x-admin-key': KEY, ...(opt.headers || {}) }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(p.split('?')[0] + ' HTTP ' + r.status);
  return r;
}

// ---- 投稿するもの ----
const store = await (await site('/api/admin/posts')).json();
const posts = store.posts || [];
const todo = [];
for (const p of posts.filter((p) => L.isAuto(p) && p.due && !p.upd))   // v173: 言語ごとの投稿時刻(dues)と出す言語(langs)
  for (const lg of L.langsOf(p)) { const d = L.dueOf(p, lg); if (!(p.done && p.done[lg]) && d <= NOW && NOW - d < L.winOf(p)) todo.push({ p, lg, d }); }
todo.sort((a, b) => a.d - b.d);
if (DRY && !todo.length) {                 // 試しの時、投稿時刻のものが無ければ、種類ごとに一番近い下書きを1つずつ使う(文面と画像の確認用)
  for (const sr of ['daily', 'arch', 'week']) { const p = posts.filter((x) => x.sr === sr && x.due).sort((a, b) => Math.abs(a.due - NOW) - Math.abs(b.due - NOW))[0]; if (p) for (const lg of ['en', 'ja']) todo.push({ p, lg }); }
}
console.log(`[post] 投稿するもの ${todo.length}件${todo.length ? ' (' + todo.map((t) => t.p.id + ':' + t.lg).join(', ') + ')' : ''}${DRY ? ' / DRY' : ''}`);
if (CHECK) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `need=${todo.length ? 'true' : 'false'}\n`);
  process.exit(0);
}
if (!todo.length) { await writeDue(); process.exit(0); }
if (!DRY && !(X.key && X.secret && X.token && X.tokenSecret)) { console.log('[post] X の鍵(X_API_KEY など4つ)が未設定のため投稿しません'); process.exit(0); }

// ---- OAuth 1.0a の署名(本文は署名に含めない: JSON の送信) ----
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function oauth(method, url) {
  const o = { oauth_consumer_key: X.key, oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: X.token, oauth_version: '1.0' };
  const u = new URL(url), all = { ...o }; u.searchParams.forEach((v, k) => { all[k] = v; });
  const base = [method, enc(u.origin + u.pathname), enc(Object.keys(all).sort().map((k) => enc(k) + '=' + enc(all[k])).join('&'))].join('&');
  o.oauth_signature = crypto.createHmac('sha1', enc(X.secret) + '&' + enc(X.tokenSecret)).update(base).digest('base64');
  return 'OAuth ' + Object.keys(o).map((k) => `${enc(k)}="${enc(o[k])}"`).join(', ');
}
async function xapi(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { authorization: oauth('POST', url), 'content-type': 'application/json', 'user-agent': 'signal-archive-x-post/1.0' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  if (!r.ok) throw new Error(`${url.replace('https://api.x.com', '')} HTTP ${r.status} ${t.slice(0, 300)}`);
  return j;
}

// ---- 画像(サイトの /render.html を裏のブラウザで開いて描く。/posts.html と同じ見た目) ----
let browser = null, page = null;
async function render(p, lg) {
  try {
    if (!page) {
      const { chromium } = await import('playwright');
      browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(SITE + '/render.html', { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForFunction(() => window.renderReady === true, null, { timeout: 30000 });
    }
    const url = await page.evaluate(([q, l]) => window.renderPost(q, l), [p, lg]);
    return url ? Buffer.from(url.split(',')[1], 'base64') : null;
  } catch (e) { console.log('[post] 画像を作れませんでした(文だけで投稿します):', String(e.message || e).slice(0, 200)); return null; }
}

// ---- 投稿 ----
const OUT = path.join(process.cwd(), 'x_out');
if (DRY) fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const { p, lg } of todo) {
  if (n >= MAX_POSTS) { console.log('[post] 1回の上限に達したので残りは次回'); break; }
  const text = p[lg], png = await render(p, lg), name = `${p.id.replace(/[^a-z0-9-]+/gi, '-')}-${lg}`;
  if (DRY) {
    fs.writeFileSync(path.join(OUT, name + '.txt'), text + `\n\n(${L.xlen(text)}/280)\n`);
    if (png) fs.writeFileSync(path.join(OUT, name + '.png'), png);
    console.log(`==== ${name} (${L.xlen(text)}/280${png ? ', 画像あり' : ', 画像なし'}) ====\n${text}\n`);
    n++; continue;
  }
  try {
    let media = null;
    if (png) {
      try { const m = await xapi('https://api.x.com/2/media/upload', { media: png.toString('base64'), media_category: 'tweet_image' }); media = m && m.data && m.data.id; }
      catch (e) { console.log('[post] 画像のアップロードに失敗(文だけで投稿します):', e.message); }
    }
    const res = await xapi('https://api.x.com/2/tweets', { text, ...(media ? { media: { media_ids: [String(media)] } } : {}) });
    console.log(`[post] 投稿しました ${p.id}:${lg} → ${res && res.data && res.data.id}${media ? ' (画像つき)' : ''}`);
    await site('/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mark: { id: p.id, lang: lg, v: true } }) });
    p.done = p.done || {}; p.done[lg] = Date.now();
    n++;
    await new Promise((r) => setTimeout(r, 3000));
  } catch (e) {
    console.log('[post] 投稿に失敗:', p.id + ':' + lg, e.message);
    if (/HTTP 4(01|02|03)/.test(e.message)) break;   // 鍵・権限・残高の問題は続けても同じなので止める
  }
}
if (browser) await browser.close();
if (!DRY) await writeDue();
console.log(`[post] ${DRY ? '試し(投稿なし)' : '投稿'} ${n}件`);

// Worker が見張る予定(x:due)を書き直す
async function writeDue() {
  try {
    const cal = await (await site('/api/cal')).json();
    const d = L.dueList(posts, L.pickEvents(cal), Date.now());
    await site('/api/admin/rx-put?name=xd', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(d) });
  } catch (e) { console.log('[post] x:due を書けませんでした:', e.message); }
}
