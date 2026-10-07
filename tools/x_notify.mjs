#!/usr/bin/env node
// X 投稿の下書きづくり(v81)。RX runner のワークフローの最後に1時間ごとに動く。時刻・日付はすべて日本時間(JST)。
// 作った下書きはサイトの下書き置き場(/api/admin/posts)に置き、/posts.html のカレンダーから投稿・予約する。X の API は使わない。
//   今日・今週の予定(daily)  : 今日から30日先まで、1日1本ずつ先に作る(まとめて X で予約できるように)。投稿 = その日 9:30。
//                              中身 = その日 9:30 以降の指標(前回の発表から1時間のBTC変動つき)+ 翌日〜日曜の予定(日曜は来週)。
//                              土曜は、9:30以降に予定がある時だけ作る(v83)。予定が変わったら作り直す。予約済みの印が付いたものは中身を置き換えず、新しい中身を upd に添える(画面が警告を出す)。
//   発表後の値動き(arch)     : 主要指標の発表65分後。ふだんは /posts.html がその時刻にブラウザで作る。ここは予備(タブを閉じていた時用)。
//   先週のまとめ(week)       : 月曜 7時以降に1本。投稿 = 月曜 10:00。BTC の週の始値 → 終値。
// 文面の作り方は public/xpost-lib.js(画面と共通)。
// 必要: RX_ADMIN_KEY。任意: NTFY_TOPIC(新しい下書きができたらスマホに通知)。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(here, '..', 'public', 'xpost-lib.js'))).toString('base64'));
const { H, DAY, DAILY_AT, ARCH_WAIT, WEEK_AT, J, xlen, enDay, enDate, hm, jaDay, pct, pctTxt, usd, dayStart, weekStart, isoDay, hashStr,
  pickEvents, groups, MAJOR, archId, groupLine, tags, siteLine, beforeAfter, klinesUrl, archPost } = L;

const SITE = (process.env.SITE_URL || 'https://crypto-schedule.signalarchive.workers.dev').replace(/\/+$/, '');
const KEY = process.env.RX_ADMIN_KEY || '';
const TOPIC = process.env.NTFY_TOPIC || '';
const NTFY = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
const NOW = Date.now();
const BASES = (process.env.BINANCE_BASES || 'https://data-api.binance.vision,https://api.binance.com,https://api1.binance.com').split(',').map((x) => x.trim()).filter(Boolean);
const AHEAD = 30, ARCH_MAX = 48 * H;

if (!KEY) { console.log('[x] RX_ADMIN_KEY が未設定のため何もしません'); process.exit(0); }

async function site(p, opt = {}) {
  const r = await fetch(SITE + p, { ...opt, headers: { 'User-Agent': 'signal-archive-x-posts/1.0', 'x-admin-key': KEY, ...(opt.headers || {}) }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(p.split('?')[0] + ' HTTP ' + r.status);
  return r;
}
async function klines(sym, interval, startTime, limit) {
  for (const base of BASES) {
    try { const r = await fetch(klinesUrl(base, sym, interval, startTime, limit), { signal: AbortSignal.timeout(15000) }); if (r.ok) return await r.json(); } catch (_) {}
  }
  return null;
}
// 行を入るだけ入れる(280を超える分は「+N more」にまとめる)
function fit(build, items, lang) {
  for (let n = items.length; n >= 0; n--) {
    const rest = items.length - n, t = build(items.slice(0, n), rest ? (lang === 'en' ? `+${rest} more` : `ほか${rest}件`) : null);
    if (xlen(t) <= 280) return t;
  }
  return build([], null);
}

const events = pickEvents(await (await site('/api/cal')).json());
const between = (a, b) => groups(events.filter((e) => e.ts >= a && e.ts < b));
const store = await (await site('/api/admin/posts')).json();
const byId = new Map((store.posts || []).map((p) => [p.id, p]));
const out = [];
// 中身が保存と同じなら送らない(書き込みを減らす)。予約済みで upd に同じ中身が添えてある時も送らない
const put = (p) => { const o = byId.get(p.id); if (o && (o.h === p.h || (o.upd && o.upd.h === p.h))) return; out.push({ at: NOW, ...p }); };
const today = dayStart(NOW);

// ---- 1) 今日・今週の予定(30日先まで) ----
const dump = await (await site('/api/admin/rx-get')).json();
const recs = new Map();                                                     // 指標ごとの過去の記録(前回の値動き用)
for (const doc of Object.values(dump.shards || {})) for (const r of (doc && doc.ev) || []) {
  const a = r.r && r.r.BTC; if (!Array.isArray(a) || a[3] == null) continue;
  const l = recs.get(r.k) || []; l.push({ t: r.t, chg: a[3] }); recs.set(r.k, l);
}
const prevOf = (g) => {                                                     // 前回の発表から1時間のBTC変動(同時刻の発表は記録が一番新しいもの)
  let best = null;
  for (const e of g) if (e.l === 'macro') for (const r of recs.get((e.s || e.t) + '|' + e.c) || []) if (r.t < g[0].ts - H && (!best || r.t > best.t)) best = r;
  return best;
};
function dailyPost(day) {
  const due = day + DAILY_AT;
  const tg = between(due, day + DAY);                                       // 投稿(9:30)より後の予定だけ
  let wa = day + DAY, wb = weekStart(day) + 7 * DAY, next = false;
  if (wb - wa <= 0) { wb = wa + 7 * DAY; next = true; }                     // 日曜は来週を出す
  const wk = between(wa, wb), prev = tg.map(prevOf);
  const pv = (i, lang) => prev[i] ? (lang === 'en' ? ` (prev 1h: ${pctTxt(prev[i].chg)})` : `(前回1h: ${pctTxt(prev[i].chg)})`) : '';
  const T = { en: tg.map((g, i) => hm(g[0].ts) + ' — ' + groupLine(g, 'en') + pv(i, 'en')), ja: tg.map((g, i) => hm(g[0].ts) + ' — ' + groupLine(g, 'ja') + pv(i, 'ja')) };
  const W = { en: wk.map((g) => `${enDay(g[0].ts)} ${hm(g[0].ts)} — ` + groupLine(g, 'en')), ja: wk.map((g) => `${jaDay(g[0].ts)} ${hm(g[0].ts)} — ` + groupLine(g, 'ja')) };
  const text = (lang) => {
    const en = lang === 'en';
    const head = en ? [`TODAY · ${enDate(day)}`, '', 'UPCOMING TODAY (JST)'] : [`今日のイベント ${jaDay(day)}`, '(このあとの予定・日本時間)'];
    const wTitle = en ? (next ? 'NEXT WEEK' : 'THIS WEEK') : (next ? '来週のイベント' : '今週のイベント');
    const none = en ? 'No scheduled events' : '予定なし', tag = en ? tags('Macro').en : tags('経済指標').ja;
    const more = (r) => r > 0 ? (en ? `+${r} more` : `ほか${r}件`) : null;
    const t = T[lang], w = W[lang];
    const mk = (tn, wn) => [...head, ...(t.length ? t.slice(0, tn) : [none]), ...(more(t.length - tn) ? [more(t.length - tn)] : []), '', wTitle,
      ...(w.length ? w.slice(0, wn) : [none]), ...(more(w.length - wn) ? [more(w.length - wn)] : []), '', tag].join('\n');
    let tn = t.length, wn = 0;                                              // 今日を優先し、残りに今週を入るだけ
    while (tn > 0 && xlen(mk(tn, 0)) > 280) tn--;
    while (wn < w.length && xlen(mk(tn, wn + 1)) <= 280) wn++;
    return mk(tn, wn);
  };
  const en = text('en'), ja = text('ja');
  return { id: 'daily:' + isoDay(day), sr: 'daily', due, en, ja, h: hashStr(en + ja),
    img: { day, next, today: tg.map((g, i) => ({ t: g[0].ts, en: groupLine(g, 'en'), ja: groupLine(g, 'ja'), pv: prev[i] ? prev[i].chg : null })), week: wk.map((g) => ({ t: g[0].ts, en: groupLine(g, 'en'), ja: groupLine(g, 'ja') })) } };
}
const drop = [];                                                            // v83: 作らない日(土曜で今日の予定が無い日)の古い下書きは消す(済みの印が無いものだけ)
for (let i = 0; i <= AHEAD; i++) {
  const day = today + i * DAY, p = dailyPost(day);
  if (p.due < NOW && byId.has(p.id)) continue;                              // 投稿時刻を過ぎた分は作り直さない(今日の分が無ければ作る)
  if (J(day).getUTCDay() === 6 && !p.img.today.length) { if (byId.has(p.id)) drop.push(p.id); continue; }   // 土曜は市場の発表がほぼ無いので作らない(予定がある土曜だけ作る)
  put(p);
}

// ---- 2) 発表後の値動き(予備) ----
for (const g of groups(events.filter((e) => MAJOR(e) && NOW - e.ts >= ARCH_WAIT && NOW - e.ts < ARCH_MAX))) {
  if (byId.has(archId(g))) continue;
  const bars = await klines('BTCUSDT', '5m', Math.floor(g[0].ts / 3e5) * 3e5 - 12 * 3e5, 25);
  const ba = bars && beforeAfter(bars, g[0].ts);
  if (!ba) { console.log('[x] 価格が取れないので次回:', archId(g)); continue; }
  put(archPost(g, ba, SITE));
}

// ---- 3) 先週のまとめ(月曜 7時以降) ----
if (J(NOW).getUTCDay() === 1 && J(NOW).getUTCHours() >= 7) {
  const we = weekStart(NOW), ws = we - 7 * DAY, id = 'week:' + isoDay(ws);
  if (!byId.has(id)) {
    const k = await klines('BTCUSDT', '1h', ws, 168);                        // 日本時間の週は日足と区切りがずれるので1時間足で
    if (k && k.length === 168 && +k[0][0] === ws && +k[167][0] === we - H) {
      const btc = { s: +k[0][1], e: +k[167][4], chg: pct(+k[0][1], +k[167][4]), dp: 0, spark: [+k[0][1], ...[23, 47, 71, 95, 119, 143, 167].map((i) => +k[i][4])] };
      const wk = between(ws, we), sl = siteLine(SITE), px = `${usd(btc.s)} → ${usd(btc.e)}`;
      const lines = (lang) => wk.map((g) => (lang === 'en' ? enDay(g[0].ts) : jaDay(g[0].ts)) + ' — ' + groupLine(g, lang));
      const en = fit((a, more) => ['WEEK IN CRYPTO', '', `${enDay(ws)} — ${enDay(we - DAY)}, ${J(ws).getUTCFullYear()} (JST)`, '', 'EVENTS', ...(a.length ? a : wk.length ? [] : ['None']), ...(more ? [more] : []), '', 'BTC', px, 'CHANGE ' + pctTxt(btc.chg), '', sl.en, '#Bitcoin #Crypto #Macro'].join('\n'), lines('en'), 'en');
      const ja = fit((a, more) => ['今週のCrypto', '', `${jaDay(ws)}〜${jaDay(we - DAY)}`, '', 'イベント', ...(a.length ? a : wk.length ? [] : ['なし']), ...(more ? [more] : []), '', 'BTC', px, '変動 ' + pctTxt(btc.chg), '', sl.ja, '#ビットコイン #仮想通貨 #経済指標'].join('\n'), lines('ja'), 'ja');
      put({ id, sr: 'week', due: we + WEEK_AT, en, ja, h: hashStr(en + ja), img: { ws, we, btc, ev: wk.map((g) => ({ t: g[0].ts, en: groupLine(g, 'en'), ja: groupLine(g, 'ja') })) } });
    } else console.log('[x] 先週のまとめ: 1時間足が揃わないので次回');
  }
}

// ---- 保存・通知 ----
for (const p of out) for (const lg of ['en', 'ja']) if (xlen(p[lg]) > 280) console.log(`[x] 注意: ${p.id} ${lg} が280を超えています(${xlen(p[lg])})`);
let res = {};
if (out.length || drop.length) res = await (await site('/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ upsert: out, remove: drop }) })).json();
const fresh = out.filter((p) => !byId.has(p.id) && p.sr !== 'daily');       // 通知は「すぐ投稿するもの」が新しくできた時だけ
if (TOPIC && fresh.length) {
  const r = await fetch(NTFY, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ topic: TOPIC, title: `投稿できる下書き ${fresh.length}件`, message: fresh.map((p) => p.ja.split('\n')[2] || p.id).join('\n'), tags: ['bird'], click: SITE + '/posts.html' }) });
  if (!r.ok) console.log('[x] ntfy HTTP ' + r.status);
}
console.log(`[x] 送った下書き ${out.length}件 (新規 ${res.added ?? '-'} / 更新 ${res.changed ?? '-'} / 予約済みに変更あり ${res.flagged ?? '-'})`);
