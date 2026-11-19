// v332: 自分の X 投稿のビュー・いいねを X API で取って集計する(手で動かす)。
//   GET /2/users/me → GET /2/users/:id/tweets(public_metrics に impression_count=ビュー が入る)。
//   サイトの下書き(KV)の tw(投稿した X の ID)と突き合わせて「どの種類の投稿か」を付ける。手で出した投稿は「手動・その他」。
//   出力: x_stats/stats.csv(1投稿1行)と、Actions の Summary(種類別・時間帯別・言語別・上位20)。
//   費用: X API の読み取りは件数ぶん課金されるので、MAX(既定200件)と DAYS(既定14日)で上限をかける。
// 必要: X_API_KEY・X_API_SECRET・X_ACCESS_TOKEN・X_ACCESS_SECRET、(種類を付けるなら) SITE_URL・RX_ADMIN_KEY
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const X = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
const DAYS = Math.max(1, Math.min(60, Number(process.env.STATS_DAYS || 14)));
const MAX = Math.max(10, Math.min(1000, Number(process.env.STATS_MAX || 200)));
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

// ---- 1) 自分の投稿を取る ----
const me = (await xget('https://api.x.com/2/users/me')).data;
console.log('[stats] アカウント:', '@' + me.username, '期間:', DAYS + '日', '上限:', MAX + '件');
const since = new Date(Date.now() - DAYS * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
const tweets = []; let next = null;
do {
  const q = new URLSearchParams({ max_results: String(Math.min(100, MAX - tweets.length < 5 ? 5 : MAX - tweets.length)), 'tweet.fields': 'created_at,public_metrics,in_reply_to_user_id,referenced_tweets,lang', exclude: 'retweets', start_time: since });
  if (next) q.set('pagination_token', next);
  const j = await xget(`https://api.x.com/2/users/${me.id}/tweets?${q}`);
  for (const t of j.data || []) { if (tweets.length < MAX) tweets.push(t); }
  next = j.meta && j.meta.next_token;
} while (next && tweets.length < MAX);
console.log('[stats] 取った投稿:', tweets.length + '件');

// ---- 2) 下書きと突き合わせて種類を付ける ----
const LABEL = { daily: '予定表', corrts: 'BTC×S&P500 相関', fomc: '指標の1時間前', fomcc: '指標 TOP3(返信)', fomcres: '指標の結果', shockbn: 'Binance 2019/2026', shockcmp: 'ショック後のBTC', spike: '急変動', spikeliq: '急変動の清算(返信)', spkcmp: '過去の急変動との比較', liq: '巨額清算', liqday: '24時間の清算', liqimp: '指標前後の清算', histw: 'ブームと危機(週)', histm: 'ブームと危機(月)', liqshock: '大量清算の後のBTC', week: '週のまとめ', sum: '夜のまとめ', midterm: '中間選挙' };
const bySr = new Map();
if (SITE && KEY) {
  try { const r = await fetch(SITE + '/api/admin/posts', { headers: { 'x-admin-key': KEY }, signal: AbortSignal.timeout(30000) }); const j = await r.json();
    for (const p of j.posts || []) for (const [lg, id] of Object.entries(p.tw || {})) bySr.set(String(id), { sr: p.sr, lg }); } catch (e) { console.log('[stats] 下書きが読めません(種類は付きません):', e.message); }
}
const J = (iso) => new Date(Date.parse(iso) + 9 * 3600e3);
const rows = tweets.map((t) => { const m = t.public_metrics || {}, k = bySr.get(String(t.id)), d = J(t.created_at), reply = !!t.in_reply_to_user_id;
  return { id: t.id, jst: d.toISOString().slice(0, 16).replace('T', ' '), hour: d.getUTCHours(), wd: '日月火水木金土'[d.getUTCDay()], lang: k ? k.lg : (/[ぁ-んァ-ン一-龥]/.test(t.text) ? 'ja' : 'en'), kind: k ? (LABEL[k.sr] || k.sr) : (reply ? '手動・返信' : '手動・その他'), reply,
    views: m.impression_count ?? null, likes: m.like_count || 0, rts: m.retweet_count || 0, replies: m.reply_count || 0, quotes: m.quote_count || 0, bm: m.bookmark_count || 0, head: (t.text || '').split('\n')[0].slice(0, 70) }; });

// ---- 3) 出力 ----
const out = path.join(process.cwd(), 'x_stats'); fs.mkdirSync(out, { recursive: true });
const csvq = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
const head = ['日時(日本時間)', '曜日', '時', '言語', '種類', 'ビュー', 'いいね', 'リポスト', '返信', '引用', 'ブックマーク', '1行目', 'URL'];
fs.writeFileSync(path.join(out, 'stats.csv'), '﻿' + [head, ...rows.map((r) => [r.jst, r.wd, r.hour, r.lang, r.kind, r.views ?? '', r.likes, r.rts, r.replies, r.quotes, r.bm, r.head, `https://x.com/${me.username}/status/${r.id}`])].map((a) => a.map(csvq).join(',')).join('\n'));
const med = (a) => { a = a.filter((v) => v != null).sort((x, y) => x - y); if (!a.length) return null; const h = a.length >> 1; return a.length % 2 ? a[h] : Math.round((a[h - 1] + a[h]) / 2); };
const avg = (a) => { a = a.filter((v) => v != null); return a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null; };
const group = (key) => { const g = new Map(); for (const r of rows) { const k = key(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); } return [...g.entries()].map(([k, rs]) => ({ k, n: rs.length, avg: avg(rs.map((r) => r.views)), med: med(rs.map((r) => r.views)), max: Math.max(0, ...rs.map((r) => r.views || 0)), likes: avg(rs.map((r) => r.likes)) })); };
const tbl = (title, list, col) => [`### ${title}`, '', `| ${col} | 件数 | 平均ビュー | 中央値 | 最大 | 平均いいね |`, '|---|---|---|---|---|---|', ...list.map((x) => `| ${x.k} | ${x.n} | ${x.avg ?? '—'} | ${x.med ?? '—'} | ${x.max} | ${x.likes ?? '—'} |`), ''].join('\n');
const all = rows.map((r) => r.views);
const md = [`## X の投稿の数字（@${me.username}・直近${DAYS}日・${rows.length}件）`, '', `平均ビュー ${avg(all) ?? '—'}・中央値 ${med(all) ?? '—'}・合計 ${all.reduce((a, v) => a + (v || 0), 0).toLocaleString('en-US')}`, '',
  tbl('種類ごと（平均ビューの高い順）', group((r) => r.kind).sort((a, b) => (b.avg || 0) - (a.avg || 0)), '種類'),
  tbl('時間帯ごと（日本時間）', group((r) => String(r.hour).padStart(2, '0') + '時').sort((a, b) => a.k.localeCompare(b.k)), '時間'),
  tbl('言語ごと', group((r) => r.lang), '言語'),
  tbl('親投稿と返信', group((r) => r.reply ? '返信' : '親投稿'), ''),
  '### ビューの多い投稿 20', '', '| 日時 | 種類 | ビュー | いいね | 1行目 |', '|---|---|---|---|---|',
  ...rows.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 20).map((r) => `| ${r.jst} | ${r.kind} | ${r.views ?? '—'} | ${r.likes} | ${r.head.replace(/\|/g, '｜')} |`), ''].join('\n');
fs.writeFileSync(path.join(out, 'summary.md'), md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(md);
