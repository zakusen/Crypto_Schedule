// v332→v335: 自分の X 投稿のビュー・いいねを X API で取って集計する(手で動かす)。v335 で詳しい集計に。
//   GET /2/users/me → GET /2/users/:id/tweets(public_metrics に impression_count=ビュー が入る)。
//   サイトの下書き(KV)の tw(投稿した X の ID)と突き合わせて「どの種類の投稿か」を付ける。手で出した投稿は「手動・その他」。
//   出力: x_stats/stats.csv(1投稿1行)と、Actions の Summary(種類別・時間帯別・言語別・上位20)。
//   費用: X API の読み取りは件数ぶん課金されるので、MAX(既定200件)と DAYS(既定14日)で上限をかける。
// 必要: X_API_KEY・X_API_SECRET・X_ACCESS_TOKEN・X_ACCESS_SECRET、(種類を付けるなら) SITE_URL・RX_ADMIN_KEY
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const X = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
const num = (v, d) => { const n = parseInt(String(v || '').replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : d; };   // v333: 数字以外(空・「200件」など)は既定値に
const DAYS = Math.max(1, Math.min(60, num(process.env.STATS_DAYS, 14)));
const MAX = Math.max(10, Math.min(1000, num(process.env.STATS_MAX, 200)));
const SITE = (process.env.SITE_URL || '').replace(/\/$/, ''), KEY = process.env.RX_ADMIN_KEY || '';
if (!(X.key && X.secret && X.token && X.tokenSecret)) { console.log('[stats] X の鍵(X_API_KEY など4つ)が未設定です'); process.exit(1); }

const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function oauth(method, url) {
  const o = { oauth_consumer_key: X.key, oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: X.token, oauth_version: '1.0' };
  const u = new URL(url), all = { ...o }; u.searchParams.forEach((v, k) => { all[k] = v; });
  const base = [method, enc(u.origin + u.pathname), enc(Object.keys(all).sort().map((k) => enc(k) + '=' + enc(all[k])).join('&'))].join('&');
  o.oauth_signature = crypto.createHmac('sha1', enc(X.secret) + '&' + enc(X.tokenSecret)).update(base).digest('base64');
  return 'OAuth ' + Object.keys(o).map((k) => `${enc(k)}="${enc(o[k])}"`).join(', ');
}
async function xget(url) {
  const r = await fetch(url, { headers: { authorization: oauth('GET', url), 'user-agent': 'signal-archive-x-stats/1.0' }, signal: AbortSignal.timeout(60000) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  if (!r.ok) throw new Error(`${url.replace('https://api.x.com', '').split('?')[0]} HTTP ${r.status} ${t.slice(0, 300)}`);
  return j;
}

// ---- 1) 自分の投稿を取る(v335: 画像・リンク・ハッシュタグ・プロフィールのクリックなども) ----
const me = (await xget('https://api.x.com/2/users/me?user.fields=public_metrics')).data, pm = me.public_metrics || {};   // v338: フォロワー数なども取る
console.log('[stats] アカウント:', '@' + me.username, '期間:', DAYS + '日', '上限:', MAX + '件');
// ---- v338: フォロワー数を日付ごとにサイト(KV の fh)へためる。1日1件(同じ日は上書き)。最大400日 ----
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
let FH = [];
if (SITE && KEY) {
  try { const j = await (await fetch(SITE + '/api/admin/rx-one?name=fh', { headers: { 'x-admin-key': KEY }, signal: AbortSignal.timeout(30000) })).json(); FH = Array.isArray(j.h) ? j.h : []; } catch (e) { console.log('[stats] フォロワーの記録が読めません:', e.message); }
  FH = FH.filter((x) => x.d !== today); FH.push({ d: today, at: Date.now(), followers: pm.followers_count ?? null, following: pm.following_count ?? null, tweets: pm.tweet_count ?? null, listed: pm.listed_count ?? null }); FH.sort((a, b) => a.d.localeCompare(b.d)); FH = FH.slice(-400);
  try { const r = await fetch(SITE + '/api/admin/rx-put?name=fh', { method: 'POST', headers: { 'x-admin-key': KEY, 'content-type': 'text/plain' }, body: JSON.stringify({ h: FH }), signal: AbortSignal.timeout(30000) }); console.log('[stats] フォロワーの記録を保存:', r.status, FH.length + '日分'); } catch (e) { console.log('[stats] フォロワーの記録を保存できません:', e.message); }
} else { FH = [{ d: today, followers: pm.followers_count ?? null, following: pm.following_count ?? null, tweets: pm.tweet_count ?? null, listed: pm.listed_count ?? null }]; console.log('[stats] SITE_URL・RX_ADMIN_KEY がないので、フォロワー数は今回の分だけ(ためられません)'); }
console.log('[stats] フォロワー', pm.followers_count, 'フォロー', pm.following_count, '投稿', pm.tweet_count);

if (process.env.FOLLOWERS_ONLY === '1') { console.log('[stats] フォロワーの記録だけで終わります(毎日の定時)'); process.exit(0); }   // v338: 毎日の定時は X API を1件読むだけ

const since = new Date(Date.now() - DAYS * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
const BASEF = 'created_at,public_metrics,in_reply_to_user_id,referenced_tweets,lang,conversation_id,attachments,entities';
let FIELDS = BASEF + ',non_public_metrics', npm = true;   // non_public_metrics(プロフィール・リンクのクリック)は自分の30日以内の投稿だけ。拒まれたら外す
const tweets = [], media = new Map(); let next = null;
do {
  const q = new URLSearchParams({ max_results: String(Math.min(100, Math.max(5, MAX - tweets.length))), 'tweet.fields': FIELDS, expansions: 'attachments.media_keys', 'media.fields': 'type,url,preview_image_url', exclude: 'retweets', start_time: since });
  if (next) q.set('pagination_token', next);
  let j; try { j = await xget(`https://api.x.com/2/users/${me.id}/tweets?${q}`); }
  catch (e) { if (npm && /HTTP (400|403)/.test(e.message)) { console.log('[stats] クリック数(non_public_metrics)は取れないので外します:', e.message.slice(0, 160)); npm = false; FIELDS = BASEF; continue; } throw e; }
  for (const m of (j.includes && j.includes.media) || []) media.set(m.media_key, { type: m.type, url: m.url || m.preview_image_url || null });   // v339: 画像の URL も
  for (const t of j.data || []) if (tweets.length < MAX) tweets.push(t);
  next = j.meta && j.meta.next_token;
} while (next && tweets.length < MAX);
console.log('[stats] 取った投稿:', tweets.length + '件', npm ? '(クリック数あり)' : '');

// ---- 2) 種類を付ける: 下書きの tw → 1行目の書き方 → 返信は親の種類を引き継ぐ ----
const LABEL = { daily: '予定表', corrts: 'BTC×S&P500 相関', fomc: '指標(FOMC・CPI など)', fomcc: '指標(FOMC・CPI など)', fomcres: '指標の結果', shockbn: 'Binance 2019/2026', shockcmp: 'ショック後のBTC', spike: '急変動', spikeliq: '急変動', spkcmp: '過去の急変動との比較', liq: '清算', liqday: '清算', liqimp: '清算', histw: 'ブームと危機', histm: 'ブームと危機', liqshock: '大量清算の後のBTC', week: '週のまとめ', sum: '夜のまとめ', midterm: '中間選挙' };
const bySr = new Map(); let nDraft = 0, nTw = 0;
if (SITE && KEY) {
  try { const r = await fetch(SITE + '/api/admin/posts', { headers: { 'x-admin-key': KEY }, signal: AbortSignal.timeout(30000) }); const j = await r.json();
    for (const p of j.posts || []) { nDraft++; for (const [lg, id] of Object.entries(p.tw || {})) { nTw++; bySr.set(String(id), { sr: p.sr, lg }); } } } catch (e) { console.log('[stats] 下書きが読めません:', e.message); }
} else console.log('[stats] SITE_URL か RX_ADMIN_KEY がないので、下書きとは突き合わせません');
// v334: 下書きと突き合わせられない投稿(コピペで出した分など)は、1行目の書き方で種類を推定する
const GUESS = [[/相関|correlation/i, 'BTC×S&P500 相関'], [/本日 ·|Today ·|今日・今週の予定|暗号資産シグナル・アーカイブ|Crypto Signal Archive/, '予定表'], [/まで、あと|in \d+(h|m)|発表後1時間|after the release|TOP3|似ていた過去3回/i, '指標(FOMC・CPI など)'],
  [/Binance.*(2019|ハッキングから)|Binance hack/i, 'Binance 2019/2026'], [/ショック/, 'ショック後のBTC'], [/大量清算|ロング清算|liquidation.*(30|after)/i, '大量清算の後のBTC'], [/清算|liquidat/i, '清算'], [/⚡|急変動|1時間で|時間で[−-]|直近\d+時間で/, '急変動'],
  [/ブームと危機|booms and crises/i, 'ブームと危機'], [/中間選挙|midterm/i, '中間選挙'], [/恐怖指数|Fear & Greed/i, '恐怖指数'], [/今年\d回目|下げ方|same shape/i, '今年◯回目の下げ方'], [/形が(近|最も)|same shape|今日と同じ形/i, '似た形の過去'], [/リバウンド|bounce/i, 'V字リバウンド'], [/週間|week/i, '週のまとめ']];
const guess = (t) => { const h = (t || '').split('\n').slice(0, 2).join(' '); for (const [re, k] of GUESS) if (re.test(h)) return k; return null; };
const J = (iso) => new Date(Date.parse(iso) + 9 * 3600e3), NOW = Date.now();
const byId = new Map(tweets.map((t) => [String(t.id), t]));
const kindOf = (t, depth = 0) => { const k = bySr.get(String(t.id)); if (k) return { kind: LABEL[k.sr] || k.sr, src: '下書き', lg: k.lg };
  const g = guess(t.text); if (g) return { kind: g, src: '本文' };
  const par = (t.referenced_tweets || []).find((r) => r.type === 'replied_to'); const pt = par && byId.get(String(par.id));
  if (pt && depth < 5) { const k2 = kindOf(pt, depth + 1); return { ...k2, src: '親' }; }
  return { kind: 'その他', src: '—' }; };
const sorted = tweets.slice().sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
const prevT = new Map(); { let last = null; for (const t of sorted) { if (!t.in_reply_to_user_id) { prevT.set(t.id, last); last = Date.parse(t.created_at); } } }
const rows = tweets.map((t) => { const m = t.public_metrics || {}, n = t.non_public_metrics || {}, d = J(t.created_at), reply = !!t.in_reply_to_user_id, selfReply = reply && String(t.in_reply_to_user_id) === String(me.id), K = kindOf(t);
  const txt = t.text || '', first = txt.split('\n')[0], mk = (t.attachments && t.attachments.media_keys) || [], mo = mk.map((x) => media.get(x)).filter(Boolean), mt = mo.map((x) => x.type), imgUrl = (mo.find((x) => x.url) || {}).url || null;
  const eng = (m.like_count || 0) + (m.retweet_count || 0) + (m.reply_count || 0) + (m.quote_count || 0) + (m.bookmark_count || 0);
  const pv = prevT.get(t.id);
  return { id: t.id, t: Date.parse(t.created_at), jst: d.toISOString().slice(0, 16).replace('T', ' '), day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), wd: '日月火水木金土'[d.getUTCDay()],
    lang: K.lg || (/[ぁ-んァ-ン一-龥]/.test(txt) ? 'ja' : 'en'), kind: K.kind, src: K.src, reply, to: reply ? (selfReply ? '自分への返信' : '他人への返信') : '親投稿',
    views: m.impression_count ?? null, likes: m.like_count || 0, rts: m.retweet_count || 0, replies: m.reply_count || 0, quotes: m.quote_count || 0, bm: m.bookmark_count || 0, eng,
    prof: n.user_profile_clicks ?? null, link: n.url_link_clicks ?? null, media: mt.length ? (mt.includes('video') || mt.includes('animated_gif') ? '動画' : '画像') : 'なし',
    len: [...txt].length, flen: [...first].length, emoji: /^\p{Extended_Pictographic}/u.test(first), tags: ((t.entities && t.entities.hashtags) || []).length, url: ((t.entities && t.entities.urls) || []).length > 0,
    gap: pv != null ? Math.round((Date.parse(t.created_at) - pv) / 60000) : null, age: (NOW - Date.parse(t.created_at)) / 3600e3, head: first.slice(0, 70), text: txt.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), imgUrl, img: null }; });   // v339: 本文そのままと画像
const matched = rows.filter((r) => r.src === '下書き').length;
console.log('[stats] 下書き', nDraft + '件(うち X の ID あり ' + nTw + '件)。下書きと一致', matched + '件・本文から推定', rows.filter((r) => r.src === '本文').length + '件・親から', rows.filter((r) => r.src === '親').length + '件');

// ---- 3) 集計 ----
const out = path.join(process.cwd(), 'x_stats'); fs.mkdirSync(out, { recursive: true });
const csvq = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
// ---- v339: 画像を軽くして保存(X の画像サーバーの small サイズの JPEG。だいたい幅680px・数十KB)。STATS_IMAGES=0 で取らない ----
if (process.env.STATS_IMAGES !== '0') { fs.mkdirSync(path.join(out, 'img'), { recursive: true }); let ok = 0, ng = 0; const todo = rows.filter((r) => r.imgUrl);
  for (let q = 0; q < todo.length; q += 8) await Promise.all(todo.slice(q, q + 8).map(async (r) => { try { const u = new URL(r.imgUrl); const base = u.origin + u.pathname.replace(/\.(jpg|jpeg|png|webp)$/i, ''); const res = await fetch(base + '?format=jpg&name=small', { signal: AbortSignal.timeout(20000) }); if (!res.ok) throw new Error(res.status); fs.writeFileSync(path.join(out, 'img', r.id + '.jpg'), Buffer.from(await res.arrayBuffer())); r.img = 'img/' + r.id + '.jpg'; ok++; } catch (_) { ng++; } }));
  console.log('[stats] 画像を保存:', ok + '枚', ng ? '(取れなかった ' + ng + '枚)' : ''); }
const COLS = [['日時(日本時間)', 'jst'], ['曜日', 'wd'], ['時', 'hour'], ['言語', 'lang'], ['種類', 'kind'], ['種類の決め方', 'src'], ['親/返信', 'to'], ['ビュー', 'views'], ['いいね', 'likes'], ['リポスト', 'rts'], ['返信', 'replies'], ['引用', 'quotes'], ['ブックマーク', 'bm'], ['反応の合計', 'eng'], ['プロフィールのクリック', 'prof'], ['リンクのクリック', 'link'], ['画像', 'media'], ['本文の字数', 'len'], ['1行目の字数', 'flen'], ['絵文字で始まる', 'emoji'], ['ハッシュタグ数', 'tags'], ['リンクあり', 'url'], ['前の親投稿から(分)', 'gap'], ['経過(時間)', 'age'], ['1行目', 'head'], ['本文', 'text'], ['画像ファイル', 'img'], ['画像のURL', 'imgUrl']];
fs.writeFileSync(path.join(out, 'stats.csv'), '﻿' + [[...COLS.map((c) => c[0]), 'URL'], ...rows.sort((a, b) => b.t - a.t).map((r) => [...COLS.map(([, k]) => r[k] == null ? '' : typeof r[k] === 'number' && k === 'age' ? r[k].toFixed(1) : r[k]), `https://x.com/${me.username}/status/${r.id}`])].map((a) => a.map(csvq).join(',')).join('\n'));
// v339: 一覧のページ(report.html)。画像と本文とビューを並べて、ブラウザで開いて見られる。列の見出しを押すと並べ替え
{ const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const trs = rows.slice().sort((a, b) => b.t - a.t).map((r) => `<tr><td data-v="${r.t}">${esc(r.jst)}<br><small>${esc(r.wd)}・${esc(r.lang)}・${esc(r.to)}</small></td><td>${esc(r.kind)}</td><td class="n" data-v="${r.views ?? -1}">${r.views ?? '—'}</td><td class="n" data-v="${r.likes}">${r.likes}</td><td class="n" data-v="${r.eng}">${r.eng}</td><td class="n" data-v="${r.prof ?? -1}">${r.prof ?? '—'}</td><td>${r.img ? `<a href="${esc(r.img)}"><img src="${esc(r.img)}" loading="lazy"></a>` : ''}</td><td class="t">${esc(r.text)}<br><a href="https://x.com/${esc(me.username)}/status/${esc(r.id)}">X で開く</a></td></tr>`).join('');
  fs.writeFileSync(path.join(out, 'report.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>X の投稿 @${esc(me.username)}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:16px;background:#0b0f16;color:#e6edf6}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #223;padding:6px 8px;vertical-align:top}th{position:sticky;top:0;background:#111a27;cursor:pointer;text-align:left}td.n{text-align:right;font-variant-numeric:tabular-nums}td.t{white-space:pre-wrap;max-width:520px}img{width:220px;border-radius:6px}a{color:#7cc4ff}small{color:#8aa}</style><h1>X の投稿 @${esc(me.username)}（直近${DAYS}日・${rows.length}件）</h1><p>列の見出しを押すと並べ替えます。</p><table id="t"><thead><tr><th>日時</th><th>種類</th><th>ビュー</th><th>いいね</th><th>反応</th><th>プロフィール</th><th>画像</th><th>本文</th></tr></thead><tbody>${trs}</tbody></table><script>document.querySelectorAll('th').forEach((th,i)=>th.onclick=()=>{const tb=document.querySelector('#t tbody'),rs=[...tb.rows],d=th.dataset.d=th.dataset.d==='1'?'-1':'1';rs.sort((a,b)=>{const x=a.cells[i].dataset.v??a.cells[i].textContent,y=b.cells[i].dataset.v??b.cells[i].textContent;return (isNaN(x)||isNaN(y)?String(x).localeCompare(y):x-y)*d});rs.forEach(r=>tb.append(r))});</script>`); }
fs.writeFileSync(path.join(out, 'stats.json'), JSON.stringify({ at: new Date().toISOString(), user: me.username, days: DAYS, rows }, null, 1));
const med = (a) => { a = a.filter((v) => v != null).sort((x, y) => x - y); if (!a.length) return null; const h = a.length >> 1; return a.length % 2 ? a[h] : Math.round((a[h - 1] + a[h]) / 2); };
const avg = (a, f = 0) => { a = a.filter((v) => v != null); return a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(f) : null; };
const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
const stat = (rs) => { const v = rs.map((r) => r.views), tv = sum(v); return { n: rs.length, avg: avg(v), med: med(v), max: Math.max(0, ...v.map((x) => x || 0)), likes: avg(rs.map((r) => r.likes), 1), er: tv ? (sum(rs.map((r) => r.eng)) / tv * 100).toFixed(2) + '%' : '—', prof: npm ? sum(rs.map((r) => r.prof)) : null, share: null, tv }; };
const group = (rs, key) => { const g = new Map(); for (const r of rs) { const k = key(r); if (k == null) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(r); } const tot = sum(rs.map((r) => r.views)) || 1; return [...g.entries()].map(([k, x]) => { const st = stat(x); st.share = (st.tv / tot * 100).toFixed(1) + '%'; return { k, ...st }; }); };
const T = (title, list, col, note) => [`### ${title}`, ...(note ? ['', note] : []), '', `| ${col} | 件数 | 平均ビュー | 中央値 | 最大 | ビューの割合 | 平均いいね | 反応率${npm ? ' | プロフィールのクリック' : ''} |`, `|---|---|---|---|---|---|---|---|${npm ? '---|' : ''}`, ...list.map((x) => `| ${x.k} | ${x.n} | ${x.avg ?? '—'} | ${x.med ?? '—'} | ${x.max} | ${x.share} | ${x.likes ?? '—'} | ${x.er}${npm ? ' | ' + x.prof : ''} |`), ''].join('\n');
const byAvg = (a, b) => (b.avg || 0) - (a.avg || 0);
const ripe = rows.filter((r) => r.age >= 24), par = ripe.filter((r) => !r.reply);   // 24時間たっていない投稿はビューが伸びきっていないので、比べる表からは外す
const bin = (v, edges, unit) => { if (v == null) return null; for (let i = 0; i < edges.length; i++) if (v < edges[i]) return `${i ? edges[i - 1] : 0}〜${edges[i] - 1}${unit}`; return `${edges[edges.length - 1]}${unit}〜`; };
const order = (edges, unit) => (a, b) => { const f = (k) => { const n = parseInt(k, 10); return Number.isFinite(n) ? n : 1e9; }; return f(a.k) - f(b.k); };
const kinds = group(par, (r) => r.kind).sort(byAvg).map((x) => x.k);
const heat = (rs, rowKey, rowsK) => { const H = ['0-2', '3-5', '6-8', '9-11', '12-14', '15-17', '18-20', '21-23'], hb = (h) => H[Math.floor(h / 3)];
  return ['| | ' + H.map((h) => h + '時').join(' | ') + ' |', '|---|' + H.map(() => '---').join('|') + '|', ...rowsK.map((k) => `| ${k} | ` + H.map((h) => { const x = rs.filter((r) => rowKey(r) === k && hb(r.hour) === h); return x.length ? `${avg(x.map((r) => r.views))}(${x.length})` : ''; }).join(' | ') + ' |')].join('\n'); };
const days = group(rows, (r) => r.day).sort((a, b) => a.k.localeCompare(b.k));
const all = stat(rows), allP = stat(rows.filter((r) => !r.reply));
const md = [`## X の投稿の数字（@${me.username}・直近${DAYS}日・${rows.length}件）`, '',
  `- フォロワー ${pm.followers_count ?? '—'}人・フォロー ${pm.following_count ?? '—'}人・これまでの投稿 ${pm.tweet_count ?? '—'}件（${today}）`,
  `- 全体：平均ビュー ${all.avg}・中央値 ${all.med}・合計 ${all.tv.toLocaleString('en-US')}・反応率 ${all.er}`,
  `- 親投稿だけ：${allP.n}件・平均 ${allP.avg}・中央値 ${allP.med}`,
  `- 種類の決め方：下書きと一致 ${matched}件・本文から推定 ${rows.filter((r) => r.src === '本文').length}件・親から ${rows.filter((r) => r.src === '親').length}件・不明 ${rows.filter((r) => r.src === '—').length}件`,
  `- 下の表の多くは「投稿から24時間以上たった親投稿」(${par.length}件)だけで数えています。反応率＝(いいね＋リポスト＋返信＋引用＋ブックマーク)÷ビュー。`, '',
  T('種類ごと（親投稿・平均ビューの高い順）', group(par, (r) => r.kind).sort(byAvg), '種類'),
  T('種類ごとの返信（自分の投稿への返信）', group(ripe.filter((r) => r.to === '自分への返信'), (r) => r.kind).sort(byAvg), '種類'),
  T('種類×言語（親投稿）', group(par, (r) => r.kind + '・' + r.lang).sort(byAvg), '種類・言語'),
  T('親投稿と返信', group(ripe, (r) => r.to), ''),
  T('言語ごと（親投稿）', group(par, (r) => r.lang), '言語'),
  T('時間帯ごと（日本時間・親投稿）', group(par, (r) => String(r.hour).padStart(2, '0') + '時').sort((a, b) => a.k.localeCompare(b.k)), '時間'),
  T('曜日ごと（親投稿）', group(par, (r) => r.wd).sort((a, b) => '月火水木金土日'.indexOf(a.k) - '月火水木金土日'.indexOf(b.k)), '曜日'),
  '### 種類×時間帯（親投稿の平均ビュー。かっこは件数）', '', heat(par, (r) => r.kind, kinds.slice(0, 12)), '',
  '### 曜日×時間帯（親投稿の平均ビュー。かっこは件数）', '', heat(par, (r) => r.wd, ['月', '火', '水', '木', '金', '土', '日']), '',
  T('画像の有無（親投稿）', group(par, (r) => r.media), '画像'),
  T('1行目が絵文字で始まるか（親投稿）', group(par, (r) => r.emoji ? '絵文字で始まる' : '文字で始まる'), ''),
  T('1行目の字数（親投稿）', group(par, (r) => bin(r.flen, [15, 25, 35, 50], '字')).sort(order()), '1行目'),
  T('本文の字数（親投稿）', group(par, (r) => bin(r.len, [80, 140, 200, 250], '字')).sort(order()), '本文'),
  T('ハッシュタグの数（親投稿）', group(par, (r) => r.tags + '個').sort((a, b) => parseInt(a.k) - parseInt(b.k)), 'ハッシュタグ'),
  T('リンクの有無（親投稿）', group(par, (r) => r.url ? 'リンクあり' : 'リンクなし'), ''),
  T('前の親投稿からの間隔（親投稿）', group(par, (r) => bin(r.gap, [30, 60, 120, 240, 480], '分')).sort(order()), '間隔', '連投すると伸びにくいかを見る表です。'),
  T('本文の直し(v322・11/18)の前と後（親投稿）', group(par, (r) => r.t < Date.parse('2026-11-18T15:00:00Z') ? '前(〜11/18)' : '後(11/19〜)'), ''),
  '### フォロワーの記録（X stats を回した日ごと）', '', '| 日付 | フォロワー | 前回から | フォロー | その日の投稿のビュー合計 | その日いちばん見られた投稿 |', '|---|---|---|---|---|---|',
  ...FH.slice(-30).map((x, i, a) => { const pv = i ? a[i - 1].followers : null, dr = rows.filter((r) => r.day === x.d), top = dr.slice().sort((p, q) => (q.views || 0) - (p.views || 0))[0];
    return `| ${x.d} | ${x.followers ?? '—'} | ${pv != null && x.followers != null ? (x.followers - pv >= 0 ? '+' : '') + (x.followers - pv) : '—'} | ${x.following ?? '—'} | ${dr.length ? sum(dr.map((r) => r.views)) : '—'} | ${top ? (top.views + '・' + top.head.slice(0, 30).replace(/\|/g, '｜')) : '—'} |`; }), '',
  '### 日ごとの推移（すべての投稿）', '', '| 日付 | 件数 | 平均ビュー | 中央値 | 最大 | 合計 |', '|---|---|---|---|---|---|', ...days.map((x) => `| ${x.k} | ${x.n} | ${x.avg ?? '—'} | ${x.med ?? '—'} | ${x.max} | ${x.tv} |`), '',
  '### ビューの多い投稿 30', '', '| 日時 | 種類 | 言語 | ビュー | いいね | 反応率 | 1行目 |', '|---|---|---|---|---|---|---|',
  ...rows.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 30).map((r) => `| ${r.jst} | ${r.kind}${r.reply ? '（返信）' : ''} | ${r.lang} | ${r.views ?? '—'} | ${r.likes} | ${r.views ? (r.eng / r.views * 100).toFixed(1) + '%' : '—'} | ${r.head.replace(/\|/g, '｜')} |`), '',
  '### ビューの少ない親投稿 15（24時間以上たったもの）', '', '| 日時 | 種類 | 言語 | ビュー | 1行目 |', '|---|---|---|---|---|',
  ...par.slice().sort((a, b) => (a.views || 0) - (b.views || 0)).slice(0, 15).map((r) => `| ${r.jst} | ${r.kind} | ${r.lang} | ${r.views ?? '—'} | ${r.head.replace(/\|/g, '｜')} |`), ''].join('\n');
fs.writeFileSync(path.join(out, 'summary.md'), md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(md);
