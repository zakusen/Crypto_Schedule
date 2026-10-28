#!/usr/bin/env node
// X 投稿の下書きづくり(v81)。RX runner のワークフローの最後に1時間ごとに動く。時刻・日付はすべて日本時間(JST)。
// 作った下書きはサイトの下書き置き場(/api/admin/posts)に置き、/posts.html のカレンダーから投稿・予約する。X の API は使わない。
//   今日・今週の予定(daily)  : 今日から30日先まで、1日1本ずつ先に作る(まとめて X で予約できるように)。投稿 = その日 9:30。
//                              中身 = その日 9:30 以降の指標(前回の発表から1時間のBTC変動つき)+ 翌日〜日曜の予定(日曜は来週)。
//                              その日(9:30以降)にも翌日〜日曜にも予定が無い日は作らない(v85)。予定が変わったら作り直す。予約済みの印が付いたものは中身を置き換えず、新しい中身を upd に添える(画面が警告を出す)。
//   発表後の値動き(arch)     : 主要指標の発表65分後。BTC・ETH・SOL・BNB の1時間後の変化(v91)。ふだんは /posts.html がその時刻にブラウザで作る。ここは予備(タブを閉じていた時用)。
//   週間記録(week)           : 土曜 7時以降に1本。投稿 = 土曜 10:00(v92)。4銘柄の週の変化 + 重要度「高」の指標ごとの BTC +1h(重要度順。v93)。
//   S&P500 相関(v95)        : 6時間ごとに Pacifica の1時間足で計算し、サイトの表示用に保存(corr:v1)。
//   急変動(spike, v95/v98)   : Worker が見つけた BTC の急変動(x:spk)ごとに1本。すぐ投稿。URL付き(直近30日で10回まで)。
// 文面の作り方は public/xpost-lib.js(画面と共通)。
// 必要: RX_ADMIN_KEY。任意: NTFY_TOPIC(新しい下書きができたらスマホに通知)。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateGarch } from '../public/garch-model.mjs';   // v192
import { loadBtc5m, findSimilar, addContext } from './pattern.mjs';   // v196
import { weekBoth } from './weekmatch.mjs';   // v204: BTC実況
import { recsFrom, liqFrom, appendLog, fillLog } from './pattern-ctx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(here, '..', 'public', 'xpost-lib.js'))).toString('base64'));
const { uDay, uhm, AUTO_DAILY_FROM } = L;   // v103: 英語は UTC(毎朝の予定は自動投稿になる日から。手で予約済みの分は作り直さない)
const { H, DAY, DAILY_AT, ARCH_WAIT, WEEK_AT, J, xlen, enDay, enDate, hm, jaDay, pct, pctTxt, usd, dayStart, weekStart, isoDay, hashStr,
  pickEvents, groups, MAJOR, archId, groupLine, tags, siteLine, moves, COINS, barsStart, klinesUrl, archPost, kindOf, weekPost, dueList } = L;
const { liqDayMult, liqHourMap, liqAlign, winMean, medOf, liqImpId, liqImpWinEnd, liqImpDue, liqImpPost, LIQ_IMP_WIN } = L;   // v171

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
const DAILY_LINK = false;                                                   // v87: 朝の予定の投稿にURLを入れるか(いったん入れない。true で入る)
const SITE_RE = /\n(Full calendar & past BTC moves|予定と過去の値動き): \S+/g;
// v86: 予約済みの下書きは、URL の行が増えた/減っただけなら作り直さない(予約し直しを求めない)。予定そのものが変わった時だけ ⚠
const sameButLink = (o, p) => o && o.done && (o.done.en || o.done.ja) && o.en.replace(SITE_RE, '') + o.ja.replace(SITE_RE, '') === p.en.replace(SITE_RE, '') + p.ja.replace(SITE_RE, '');
const put = (p) => { const o = byId.get(p.id); if (o && (o.h === p.h || (o.upd && o.upd.h === p.h) || sameButLink(o, p))) return; out.push({ at: NOW, ...p }); };
const today = dayStart(NOW);
// v110: 前の形の画像の下書き(まだ投稿していないもの)は作り直す(発表後の値動き = 画像 v3 / 週間記録 = v3 より前)
const oldImg = (p) => p && !(p.done && (p.done.en || p.done.ja)) && ((p.sr === 'arch' && !(p.img && p.img.v >= 3)) || (p.sr === 'week' && !(p.img && p.img.v >= 3)));
const redo = [...byId.values()].filter(oldImg).map((p) => p.id);
for (const id of redo) { byId.delete(id); console.log('[x] 前の形の画像なので作り直します', id); }
// v104: 自動投稿になった日の「毎朝の予定」は、手で予約した時の「予約済み」の印を外して作り直す(X の予約は手で消してもらう)。
//   投稿時刻がまだ先のものだけ(X API で出したものは投稿時刻を過ぎているので触らない)
for (const o of byId.values()) {
  if (o.sr !== 'daily' || !L.isAuto(o) || !(o.due > NOW) || !(o.done && (o.done.en || o.done.ja))) continue;
  for (const lang of ['en', 'ja']) if (o.done[lang]) await site('/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mark: { id: o.id, lang, v: false } }) });
  o.done = { en: 0, ja: 0 }; delete o.upd; o.h = '';                         // 下で必ず作り直す
  console.log('[x] 自動投稿に切り替え: 予約済みの印を外しました', o.id);
}

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
// v202: 5分足(KV の年ごとの控え)と「今の24時間に似た過去」。必要になった時に1回だけ読む・計算する
let PAT_S = null, NOW24 = null;
const getS = async () => PAT_S || (PAT_S = await loadBtc5m(NOW, site));
const REC_LIST = []; for (const doc of Object.values(dump.shards || {})) for (const r of (doc && doc.ev) || []) { const [s0, c0] = String(r.k || '').split('|'); if (r.t) REC_LIST.push({ t: r.t, s: s0, c: c0 }); }
async function now24() {
  if (NOW24 !== null) return NOW24;
  try { const S = await getS(), r = findSimilar(S, NOW, 24, { n: 288 }); if (r && r.top.length) { addContext(r, REC_LIST, null); r.kind = 'now'; NOW24 = r; console.log('[x] 今の24時間に似た過去:', r.top.map((m) => new Date(m.t0).toISOString()).join(' / ')); } else NOW24 = false; }
  catch (e) { console.log('[x] 今の24時間に似た過去: 作れませんでした', e.message); NOW24 = false; }
  return NOW24;
}
// 昨日の朝の計測(記録の kind: now)の答え合わせ: 計測から24時間後の実際の変化
async function yAnswer() {
  try { const lg = (await (await site('/api/admin/rx-one?name=pl')).json()) || {}, S = await getS();
    const y = (lg.ev || []).filter((x) => x.kind === 'now' && x.after && NOW - x.q.t1 > 24 * H && NOW - x.q.t1 < 34 * H).sort((a, b) => b.q.t1 - a.q.t1)[0]; if (!y) return null;
    const i = S.t.indexOf(Math.floor((y.q.t1 + 24 * H) / 300000) * 300000 - 300000); if (i < 0) return null;
    return { a24: Math.round((S.c[i] / y.q.p1 - 1) * 1e4) / 100, min: y.after.min, max: y.after.max };
  } catch (_) { return null; }
}
function dailyPost(day, vol = null, ext = null) {   // v195: vol = /api/vol(今日の分だけ。本文に1行・画像)。v202: ext = {pat(今の24時間に似た過去), ans(昨日の答え合わせ)}
  // v104: 英語(UTC)は「今日」= 投稿時刻〜UTC の 24:00、「今週」= UTC の翌日〜月曜 0:00(UTC)。日本語は日本時間の今日・今週のまま
  const utc = isoDay(day) >= AUTO_DAILY_FROM, eh = utc ? uhm : hm, ed = utc ? uDay : enDay;
  const due = day + DAILY_AT, J9 = 9 * H, split = isoDay(day) >= L.SPLIT_FROM, enDue = day + J9 + L.EN_DAILY_AT;   // v173: 英語は 11:30 UTC                                   // day = 日本時間の0時。+9時間 = 同じ日付の UTC 0時
  const win = (lang) => {
    const u = lang === 'en' && utc, dEnd = u ? day + J9 + DAY : day + DAY;   // 「今日」の終わり
    let wa = dEnd, wb = weekStart(day) + 7 * DAY + (u ? J9 : 0), next = false;
    if (wb - wa <= 0) { wb = wa + 7 * DAY; next = true; }                     // 日曜は来週を出す
    const tg = between(u && split ? enDue : due, dEnd);   // v173: 英語は英語の投稿時刻から
    return { tg, wk: between(wa, wb), next, prev: tg.map(prevOf) };
  };
  const WN = { en: win('en'), ja: win('ja') };
  const pv = (p, lang) => p ? (lang === 'en' ? ` (prev 1h: ${pctTxt(p.chg)})` : `(前回1h: ${pctTxt(p.chg)})`) : '';
  const T = { en: WN.en.tg.map((g, i) => eh(g[0].ts) + ' — ' + groupLine(g, 'en') + pv(WN.en.prev[i], 'en')), ja: WN.ja.tg.map((g, i) => hm(g[0].ts) + ' — ' + groupLine(g, 'ja') + pv(WN.ja.prev[i], 'ja')) };
  const W = { en: WN.en.wk.map((g) => `${ed(g[0].ts)} ${eh(g[0].ts)} — ` + groupLine(g, 'en')), ja: WN.ja.wk.map((g) => `${jaDay(g[0].ts)} ${hm(g[0].ts)} — ` + groupLine(g, 'ja')) };
  // v106: ユーザー指定の形(ブランド行・今日の予定を1件3行・次の予定1件)。英語 = UTC、日本語 = 日本時間
  const ME3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], WJ = ['日', '月', '火', '水', '木', '金', '土'];
  const REG = { US: ['🇺🇸', '米国'], JP: ['🇯🇵', '日本'], EU: ['🇪🇺', 'ユーロ圏'] };
  const isCB = (g) => g.some((e) => /FOMC|日銀|ECB|政策金利|BoJ|BOJ|Fed\b|総裁|議長/.test((e.s || '') + ' ' + (e.se || '') + ' ' + (e.t || '')));
  const dEn = (t) => { const d = new Date(utc ? t : t + J9); return `${String(d.getUTCDate()).padStart(2, '0')} ${ME3[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const dJa = (t) => { const d = new Date(t + J9); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WJ[d.getUTCDay()]}）`; };
  const nextOf = (lang) => { const end = lang === 'en' && utc ? day + J9 + DAY : day + DAY; return groups(events.filter((e) => e.ts >= end && e.ts < end + 14 * DAY))[0] || null; };
  const SG = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
  const EX = { en: [], ja: [] };   // v202: 追加の行(入る分だけ。上から優先)
  if (vol) { EX.en.push(`📊 BTC volatility: ${vol.ratio}x normal`); EX.ja.push(`📊 BTCの値動き: 普段の${vol.ratio}倍`); }
  if (ext && ext.pat) { EX.en.push(`🔁 Last 24h most resembles ${L.patDateEn(ext.pat.top[0].t0)}`); EX.ja.push(`🔁 直近24時間に一番似ているのは ${L.patDateJa(ext.pat.top[0].t0)}`); }
  if (ext && ext.ans) { const a = ext.ans, inR = a.a24 >= a.min && a.a24 <= a.max; EX.en.push(`✅ Yesterday's check: ${SG(a.a24)} (${inR ? 'inside' : 'outside'} the similar range ${SG(a.min)} to ${SG(a.max)})`); EX.ja.push(`✅ 昨日の答え合わせ: 実際 ${SG(a.a24)}（似た過去の幅 ${SG(a.min)}〜${SG(a.max)} の${inR ? '中' : '外'}）`); }
  const text = (lang) => {
    const en = lang === 'en', tg = WN[lang].tg, nx = nextOf(lang);
    const ev = (g, cat) => {
      const cb = isCB(g), r = REG[g[0].c] || ['📅', ''];
      const name = en ? groupLine(g, 'en').toUpperCase() : groupLine(g, 'ja');
      const c = en ? (cb ? 'MONETARY POLICY' : 'MACRO DATA') : `${r[1]}・${cb ? '金融政策' : '経済指標'}`;
      return [`🔴 ${en ? eh(g[0].ts) : hm(g[0].ts)}`, `🟡 ${cb ? '🏦' : r[0]} ${name}`, ...(cat ? ['   ' + c] : [])];
    };
    const tag = en ? '#Macro #Bitcoin #Crypto' : '#経済指標 #ビットコイン #仮想通貨';
    const mk = (tn, o) => {
      const rule = '━'.repeat(o.rule), rest = tg.length - tn;
      const body = tg.length ? tg.slice(0, tn).flatMap((g, i) => [...(i ? [''] : []), ...ev(g, o.cat)]) : [en ? 'No scheduled events' : '予定なし'];
      return [...(o.brand ? [en ? '🔹 CRYPTO SIGNAL ARCHIVE' : '🔹 暗号資産シグナル・アーカイブ', ''] : []),
        en ? `🟢 TODAY · ${dEn(due)} · ${utc ? 'UTC' : 'JST'}` : `🟢 本日 · ${dJa(due)} · 日本時間`, rule, '',
        ...body, ...(rest > 0 ? ['', en ? `+${rest} more` : `ほか${rest}件`] : []), '', rule,
        ...(o.ex ? EX[lang].slice(0, o.ex) : []),
        ...(nx ? ['', en ? `🟢 NEXT SIGNAL · ${dEn(nx[0].ts)} · ${eh(nx[0].ts)}` : `🟢 次の予定 · ${dJa(nx[0].ts)} · ${hm(nx[0].ts)}`, `🟡 ${isCB(nx) ? '🏦' : (REG[nx[0].c] || ['📅'])[0]} ${en ? groupLine(nx, 'en').toUpperCase() : groupLine(nx, 'ja')}`] : []),
        '', tag].join('\n');
    };
    const OPT = [{ brand: 1, cat: 1, rule: 18 }, { brand: 1, cat: 1, rule: 10 }, { cat: 1, rule: 10 }, { rule: 10 }];
    for (let tn = tg.length; tn >= 0; tn--) for (let k = EX[lang].length; k >= 0; k--) for (const o of OPT) { const t = mk(tn, { ...o, ex: k }); if (xlen(t) <= 260) return t; }   // 優先: 指標 > 追加の行 > ブランド行・線の長さ   // v195/v202: 追加の行(📊🔁✅)は指標より後回し。260 = 番号の行の分をあける   // v195: 📊の行は指標より後回し
    return mk(0, OPT[OPT.length - 1]);
  };
  const en = text('en'), ja = text('ja');
  const lists = (w) => ({ today: w.tg.map((g, i) => ({ t: g[0].ts, en: groupLine(g, 'en'), ja: groupLine(g, 'ja'), pv: w.prev[i] ? w.prev[i].chg : null })), week: w.wk.map((g) => ({ t: g[0].ts, en: groupLine(g, 'en'), ja: groupLine(g, 'ja') })) });
  return { id: 'daily:' + isoDay(day), sr: 'daily', due, ...(split ? { dues: { ja: due, en: enDue } } : {}), en, ja, h: hashStr(en + ja + (split ? 'split' : '') + (vol ? 'v' + vol.end : '') + (ext && ext.pat ? 'p' + ext.pat.q.t1 : '')),
    img: { day, next: WN.ja.next, ...lists(WN.ja), ...(utc ? { utc: 1, enl: { next: WN.en.next, ...lists(WN.en) } } : {}), ...(vol ? { vol: { ratio: vol.ratio, now1: vol.now1, typ: vol.typ, px: vol.px, end: vol.end, range24: vol.range24, g24: vol.garch ? vol.garch['24h'] : null } } : {}), ...(ext && ext.pat ? { pat: L.patImg(ext.pat) } : {}), ...(vol || ext ? { ex: 1 } : {}) } };   // enl = 英語の画像用(UTC の区切り)
}
const drop = [...redo];                                                            // 作らない日の古い下書きは消す(済みの印が無いものだけ)
// v195: 今日の分は、投稿の3時間前から(まだどちらの言語も出していなければ)ボラティリティを1回だけ入れて作り直す
let VOLNOW = null;
try { const r = await fetch(SITE + '/api/vol', { headers: { 'User-Agent': 'signal-archive-x-posts/1.0' }, signal: AbortSignal.timeout(20000) }); const j = r.ok ? await r.json() : null; if (j && j.available && j.ratio != null && NOW - j.end < 3 * H) VOLNOW = j; } catch (_) {}
for (let i = 0; i <= AHEAD; i++) {
  const day = today + i * DAY, o0 = byId.get('daily:' + isoDay(day));
  const wantVol = i === 0 && NOW >= day + DAILY_AT - 3 * H && !(o0 && o0.img && (o0.img.vol || o0.img.ex)) && !(o0 && o0.done && (o0.done.en || o0.done.ja));
  const ext = null;   // v204: 🔁(似ている24時間)と✅の行は BTC実況に置き換え(x_post が投稿時に1行と画像を足す)
  const p = dailyPost(day, wantVol ? VOLNOW : null, ext && (ext.pat || ext.ans) ? ext : null);
  if (wantVol && VOLNOW) {
    put(p);
    if (ext && ext.pat) { try { await appendLog(site, ext.pat); } catch (_) {} }   // 朝の計測を記録に残す(翌朝に答え合わせ)
    continue;
  }
  if (p.due < NOW && byId.has(p.id)) continue;
  if (i === 0 && o0 && o0.img && (o0.img.vol || o0.img.ex)) continue;   // ボラティリティ入りで作った後は作り直さない                              // 投稿時刻を過ぎた分は作り直さない(今日の分が無ければ作る)
  // v204: 予定が無い日も作る(毎朝の BTC実況は必ず出す)   // v85: その日もその週の残りも予定が無い日は作らない(曜日に関係なく)
  put(p);
}

// ---- 2) 発表後の値動き(予備) ----
for (const g of groups(events.filter((e) => L.AUTOEV(e) && NOW - e.ts >= ARCH_WAIT && NOW - e.ts < ARCH_MAX))) {
  if (byId.has(archId(g))) continue;
  const mv = {};                                                             // v91: BTC・ETH・SOL・BNB の1時間後(BTCは必須)
  for (const [c, sym] of COINS) { const bars = await klines(sym, '5m', barsStart(g[0].ts), 25); mv[c] = bars && moves(bars, g[0].ts); }
  if (!mv.BTC) { console.log('[x] 価格が取れないので次回:', archId(g)); continue; }
  put(archPost(g, mv, SITE));
}

// ---- 2b) v181: 発表前の予告(v182: 主要指標の15分前。前回の同じ指標の「発表後の値動き」の画像を付ける) ----
{
  const soon = groups(events.filter((e) => L.AUTOEV(e) && e.ts - NOW > 60000 && e.ts - NOW <= 3 * H));
  if (soon.length) {
    let corr = null; try { corr = await (await site('/api/admin/rx-one?name=cr')).json(); } catch (_) {}
    const archs = [...byId.values()].filter((p) => p.sr === 'arch' && p.img && p.img.v === 3 && p.img.coins && p.img.coins.BTC);
    const kOf = (p) => { const c = String(p.id).split(':')[2]; return c + '|' + (kindOf([{ s: p.img.ja, te: p.img.en, c }]).short[0] || p.img.en); };
    for (const g of soon) {
      const k = (g[0].c || g[0].l) + '|' + (kindOf(g).short[0] || groupLine(g, 'en'));
      const pa = archs.filter((p) => p.img.t < g[0].ts - H && kOf(p) === k).sort((a, b) => b.img.t - a.img.t)[0];
      const r = prevOf(g);
      const prev = pa ? { chg: pa.img.coins.BTC.c60, t: pa.img.t } : r ? { chg: r.chg, t: r.t } : null;
      const p = L.prePost(g, prev, corr && corr.w ? corr : null, pa ? pa.img : null, NOW);
      const o = byId.get(p.id); if (o && o.done && (o.done.en || o.done.ja)) continue;   // 出した後は作り直さない
      put(p); console.log('[x] 発表前の予告:', p.id, pa ? '(画像: ' + pa.id + ')' : '(画像なし)');
    }
  }
}

// ---- 2c) v202: 発表後の値動きに「発表後1時間の動きに一番似ている過去(全期間)」と「前回の同じ指標」を1行ずつ。まだ出していないものだけ ----
for (const o of [...byId.values()]) {
  if (o.sr !== 'arch' || (o.done && (o.done.en || o.done.ja)) || (o.img && o.img.pat1) || !(o.img && o.img.t) || NOW - o.img.t < 62 * 60000 || NOW - o.img.t > 4 * H) continue;
  try {
    const S = await getS(), t0 = Math.floor(o.img.t / 300000) * 300000, r = findSimilar(S, t0 + H, 1, { n: 12 });
    if (!r || !r.top.length) continue;
    const g = groups(events.filter((e) => Math.abs(e.ts - o.img.t) < 60000)), pv = g.length ? prevOf(g[0]) : null, SG = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
    const add = (txt, lines) => { let t = txt; for (const l of lines) if (xlen(t + '\n' + l) <= 260) t += '\n' + l; return t; };
    const en = add(o.en, ['', ...(pv ? [`Last time: BTC ${SG(pv.chg)} in the first hour`] : []), `🔁 Closest past 1h move: ${L.patDateEn(r.top[0].t0)}`]);
    const ja = add(o.ja, ['', ...(pv ? [`前回の発表: 1時間で ${SG(pv.chg)}`] : []), `🔁 発表後1時間の動きに一番似ているのは ${L.patDateJa(r.top[0].t0)}`]);
    put({ ...o, en: en.replace(/\n\n$/, ''), ja: ja.replace(/\n\n$/, ''), img: { ...o.img, pat1: { t0: r.top[0].t0, d: r.top[0].d } }, h: hashStr(en + ja) });
    console.log('[x] 発表後の値動き: 似ている過去を足しました', o.id);
  } catch (e) { console.log('[x] 発表後の値動き: 似ている過去を足せませんでした', e.message); }
}

// ---- 2d) v202: 夜のまとめ(日本語 22:00 JST・英語 23:30 UTC)。投稿の3時間前から作る ----
for (const [id, due] of L.sumDues(NOW)) {
  if (byId.has(id) || NOW < due - 3 * H || NOW > due + 2 * H) continue;
  try {
    const lang = id.startsWith('sum:en') ? 'en' : 'ja', S = await getS(), day = lang === 'en' ? Math.floor(NOW / DAY) * DAY : dayStart(NOW);
    let i0 = -1, hi = -Infinity, lo = Infinity; for (let i = S.t.length - 1; i >= 0 && S.t[i] >= day; i--) { i0 = i; hi = Math.max(hi, S.c[i]); lo = Math.min(lo, S.c[i]); }
    if (i0 < 0) continue;
    let vn = null, vol = null; try { const r = await fetch(SITE + '/api/vol', { signal: AbortSignal.timeout(20000) }); const j = r.ok ? await r.json() : null; if (j && j.available) { vn = j.ratio; vol = { ratio: j.ratio, now1: j.now1, typ: j.typ, px: j.px, end: j.end, range24: j.range24, g24: j.garch ? j.garch['24h'] : null }; } } catch (_) {}
    const dp = byId.get('daily:' + isoDay(dayStart(NOW))), vm = dp && dp.img && dp.img.vol ? dp.img.vol.ratio : null;
    const FLAG = { US: '🇺🇸', JP: '🇯🇵', EU: '🇪🇺' }, evs = [];
    for (const g of groups(events.filter((e) => e.l === 'macro' && e.ts >= day && e.ts < NOW - ARCH_WAIT))) {
      const a = byId.get(archId(g)), c60 = a && a.img && a.img.coins && a.img.coins.BTC ? a.img.coins.BTC.c60 : null;
      if (c60 != null) evs.push({ t: g[0].ts, name: L.headName(g, lang), flag: FLAG[g[0].c], c60 });
    }
    const spikes = [...byId.values()].filter((p) => p.sr === 'spike' && p.due >= day && p.due <= NOW).length, pt = null;   // v204: 🔁の行は BTC実況に置き換え
    const marks = evs.map((e) => ({ t: e.t, en: e.name, ja: e.name }));
    put(L.sumPost({ lang, day, p0: S.c[i0], p1: S.c[S.c.length - 1], hi, lo, vm, vn, ev: evs, spikes, pat: pt ? pt.top[0] : null, vol, marks }, id, due));
    console.log('[x] 夜のまとめ:', id);
  } catch (e) { console.log('[x] 夜のまとめ: 作れませんでした', e.message); }
}

// ---- 3) 週間記録(v92: 土曜 7時以降に作成 → 10:00 投稿。期間 = 前の土曜0時〜金曜24時 JST) ----
if (J(NOW).getUTCDay() === 6 && J(NOW).getUTCHours() >= 7) {
  const we = dayStart(NOW), ws = we - 7 * DAY, id = 'week:' + isoDay(ws);
  if (!byId.has(id)) {
    const coins = {}; let btc = null;
    for (const [c, sym] of COINS) {                                          // 日本時間の区切りなので1時間足で(始値 = 最初の足の始値、終値 = 最後の足の終値)
      const k = await klines(sym, '1h', ws, 168);
      if (k && k.length === 168 && +k[0][0] === ws && +k[167][0] === we - H) { coins[c] = { s: +k[0][1], e: +k[167][4], chg: pct(+k[0][1], +k[167][4]), spark: [+k[0][1], ...[23, 47, 71, 95, 119, 143, 167].map((i) => +k[i][4])] }; if (c === 'BTC') btc = [+k[0][1], ...k.map((x) => +x[4])]; }   // v109: BTC の1時間足(画像の線)
    }
    if (coins.BTC) {
      // v93: その週の重要度「高」の指標を全部。並び = 主要指標(決まった順) → 残りは過去の BTC +1h の変動幅(絶対値)の平均が大きい順
      const ORDER = [/^FOMC$/, /^日銀$/, /^ECB$/, /CPI/, /雇用統計/, /PCE/];
      const rank = (g) => { const i = ORDER.findIndex((re) => g.some((e) => MAJOR(e) && re.test(e.s || ''))); return i < 0 ? 99 : i; };
      const avgAbs = (g) => Math.max(0, ...g.map((e) => { const l = recs.get((e.s || e.t) + '|' + e.c) || []; return l.length ? l.reduce((a, r) => a + Math.abs(r.chg), 0) / l.length : 0; }));
      const ev = [];
      for (const g of groups(events.filter((e) => e.l === 'macro' && e.ts >= ws && e.ts < we))) {
        const p = byId.get(archId(g)); let btc = p && p.img && p.img.coins && p.img.coins.BTC ? p.img.coins.BTC.c60 : p && p.img && p.img.chg != null ? p.img.chg : null;
        if (btc == null) { const bars = await klines('BTCUSDT', '5m', barsStart(g[0].ts), 25); const m = bars && moves(bars, g[0].ts); btc = m ? m.c60 : null; }
        const k = kindOf(g), e0 = g[0];
        ev.push({ t: e0.ts, icon: k.icon, sen: k.short[0] || (e0.se || e0.te || e0.s), sja: k.short[1] || (e0.s || e0.t), en: groupLine(g, 'en'), ja: groupLine(g, 'ja'), btc, r: rank(g), a: avgAbs(g), major: g.some(MAJOR) });
      }
      ev.sort((x, y) => x.r - y.r || y.a - x.a || x.t - y.t);
      const wp = weekPost({ ws, we, coins, ev, btc }, SITE);
      try {   // v202: 今週の答え合わせ(似ている過去の記録のうち、今週に24時間がたったもの)
        const lg = (await (await site('/api/admin/rx-one?name=pl')).json()) || {}, d = (lg.ev || []).filter((x) => x.a24 != null && x.after && x.q.t1 >= ws - DAY && x.q.t1 < we);
        if (d.length) { const k = d.filter((x) => x.a24 >= x.after.min && x.a24 <= x.after.max).length;
          const le = `✅ This week's check: ${k} of ${d.length} stayed inside the similar range`, lj = `✅ 今週の答え合わせ: ${d.length}回中${k}回が似た過去の幅の中`;
          if (xlen(wp.en + '\n' + le) <= 260) wp.en += '\n' + le; if (xlen(wp.ja + '\n' + lj) <= 260) wp.ja += '\n' + lj; wp.h = hashStr(wp.en + wp.ja); }
      } catch (_) {}
      put(wp);
    } else console.log('[x] 週間記録: 1時間足が揃わないので次回');
  }
}

// ---- 4) S&P500 との相関(サイトに常時表示)と急変動の投稿(v95) ----
// 相関: 前回から6時間以上たっていたら計算し直す(RX runner の1日3回で更新される)。急変動の投稿を作る時は必ず最新で計算する。
// 急変動: Worker が5分ごとに見張り、BTC が直近60分で ±3% 以上なら記録(x:spk)して「X post」を起こす。ここで下書きを作り、x_post.mjs がすぐ投稿する。
const PAC = 'https://api.pacifica.fi/api/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pac(sym, iv, start, end) {                                     // Pacifica の足(1回200本ずつ)。[開始ms, 始, 高, 安, 終]
  const step = iv === '1h' ? H : 5 * 60000, rows = new Map();
  for (let a = start; a < end; a += 200 * step) {
    const b = Math.min(end, a + 200 * step); let j = null;
    for (let k = 0; k < 4 && !j; k++) {   // v148: 断られたら 1.5 → 3 → 6秒待って取り直す。1回ごとに少し間をあける
      if (k) await sleep(1500 * 2 ** (k - 1));
      try { const r = await fetch(`${PAC}/kline?symbol=${sym}&interval=${iv}&start_time=${a}&end_time=${b}`, { headers: { 'User-Agent': 'signal-archive-x-posts/1.0' }, signal: AbortSignal.timeout(15000) }); if (r.ok) j = await r.json(); } catch (_) {}
    }
    await sleep(250);
    if (!j) throw new Error(`Pacifica ${sym} ${iv} が取れません`);
    for (const x of (Array.isArray(j) ? j : j.data || [])) rows.set(+x.t, [+x.t, +x.o, +x.h, +x.l, +x.c]);
  }
  return [...rows.values()].sort((x, y) => x[0] - y[0]);
}
const SYM5 = ['SP500', ...COINS.map(([c]) => c)];
async function corrNow() {
  const B = {}; for (const s of SYM5) B[s] = await pac(s, '1h', NOW - (Math.max(...L.CORR_DAYS) + 2) * DAY, NOW);
  try { B.CL = await pac('CL', '1h', NOW - (Math.max(...L.CORR_DAYS) + 2) * DAY, NOW); } catch (e) { console.log('[x] 原油(CL)が取れません:', e.message); }   // v180
  return L.corrCalc(B, NOW);
}
try {
  const spk = await (await site('/api/admin/rx-one?name=xk')).json();
  const pend = (spk.ev || []).filter((x) => NOW - x.t < L.SPIKE_WINDOW && !byId.has(x.id));
  let corr = await (await site('/api/admin/rx-one?name=cr')).json();
  if (pend.length || !corr.at || NOW - corr.at > 6 * H) {
    const c = await corrNow();
    if (c) { corr = c; await site('/api/admin/rx-put?name=cr', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(c) }); console.log('[x] S&P500 相関を更新:', JSON.stringify(c.w)); }
  }
  let liqH = null;   // v187
  for (const ev of pend) {
    // v148: 線を描く BTC と S&P500 だけ長く取る。ETH・SOL・BNB は始まりと終わりの前後だけ(取得の回数を減らす)。BTC 以外は取れなくても続ける
    const W = ev.win || 1, end = Math.min(NOW, ev.t + 15 * 60000), from = ev.t - (W > 6 ? 49 : W > 1 ? 13 : 7) * H, B = {};
    B.BTC = await pac('BTC', '5m', from, end);
    try { B.SP500 = await pac('SP500', '5m', from, end); } catch (e) { console.log('[x] 急変動:', e.message, '(S&P500 なしで続けます)'); B.SP500 = []; }
    for (const [c] of COINS) if (c !== 'BTC') {
      try { const s0 = ev.t - W * H; B[c] = [...await pac(c, '5m', s0 - 40 * 60000, s0 + 20 * 60000), ...await pac(c, '5m', ev.t - 40 * 60000, end)]; }
      catch (e) { console.log('[x] 急変動:', e.message, `(${c} なしで続けます)`); B[c] = []; }
    }
    const mv = L.spikeMoves(B, ev.t, NOW, ev.win || 1, ev.from ? { from: ev.from, th: L.SPIKE_DAY } : {});   // v199: その日の高値・安値からの判定は、その時刻から
    if (!mv) { console.log('[x] 急変動: Pacifica の5分足では BTC が ±3% に届かないので出しません', ev.id, JSON.stringify(ev.hit)); continue; }
    // v98: URL を付けるのは直近30日で SPIKE_LINK_MAX 回まで(URL付きは1本 $0.20)
    const linked = [...byId.values(), ...out].filter((p) => p.sr === 'spike' && p.img && p.img.link && NOW - (p.due || 0) < 30 * DAY).length;
    const link = linked < L.SPIKE_LINK_MAX ? SITE : null;
    if (!link) console.log(`[x] 急変動: 直近30日の URL付きが ${linked} 回に達したので URL なしで出します`);
    // v187: その時間の清算(4銘柄・1時間足の合計)と、直前14日の1時間あたり中央値との倍率。取れなければ返信なし
    let liq = null;
    try {
      if (!liqH) { liqH = {}; for (const [c] of COINS) { const r = await fetch(SITE + '/api/liq?sym=' + c + '&step=3600', { headers: { 'User-Agent': 'signal-archive-x-posts/1.0' }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('/api/liq ' + c + ' HTTP ' + r.status); liqH[c] = liqHourMap((await r.json()).buckets); } }
      const h0 = Math.floor(mv.t0 / H) * H, hs = []; for (let t = h0; t < mv.t1; t += H) hs.push(t);
      let l = 0, s = 0, got = 0; for (const t of hs) for (const [c] of COINS) { const b = liqH[c].get(t); if (b) { l += b[1]; s += b[2]; got++; } }
      if (got && l + s > 0) {
        const tot = []; for (let i = 1; i <= 14 * 24; i++) { let x = 0; for (const [c] of COINS) { const b = liqH[c].get(h0 - i * H); if (b) x += b[1] + b[2]; } tot.push(x); }
        const md = medOf(tot); liq = { l, s, mult: md > 0 ? Math.round((l + s) / (md * hs.length) * 10) / 10 : null };
      }
    } catch (e) { console.log('[x] 急変動: 清算が取れないので返信なし', e.message); }
    put(L.spikePost({ ...mv, id: ev.id, due: ev.t }, corr && corr.w ? corr : null, link, liq));
    if (liq) put(L.spikeLiqPost({ ...mv, id: ev.id, due: ev.t }, liq));
    // v196: 似ている過去の値動き(2017年以降の5分足・DTW)。親への返信 + サイトのカード(pat:v1)。6時間までの急変動だけ
    if (mv.t1 - mv.t0 <= 12 * H && !byId.has(ev.id + ':pat')) {
      try {
        const res = findSimilar(await getS(), mv.t1, mv.win, { n: Math.round((mv.t1 - mv.t0) / 300000) });
        if (res && res.top.length) {
          addContext(res, await recsFrom(site), await liqFrom(SITE));
          await site('/api/admin/rx-put?name=pt', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(res) });
          await appendLog(site, res);   // v201
          const pp = L.patPost(res, ev.id); pp.due = ev.t; put(pp);
          console.log('[x] 似ている過去:', res.top.map((m) => new Date(m.t0).toISOString()).join(' / '));
        }
      } catch (e) { console.log('[x] 似ている過去: 作れませんでした', e.message); }
    }
  }
} catch (e) { console.log('[x] S&P500 相関・急変動でエラー(ほかの下書きは続けます):', e.message); }


// ---- 4b) v192: BTC ボラティリティ・モニター(トップのカード用に保存 vol:v1 + 普段の2倍以上で X に1本/24時間) ----
try {
  let vol = {}; try { vol = (await (await site('/api/admin/rx-one?name=vl')).json()) || {}; } catch (_) {}
  if (!vol.at || NOW - vol.at > 50 * 60000) {
    const B = await pac('BTC', '1h', NOW - (L.VOL_DAYS + 3) * DAY, NOW), v = L.volStats(B, NOW);
    try { const k = await fillLog(site, B, NOW); if (k) console.log('[x] 似ている過去の記録: 答え合わせ', k, '件'); } catch (_) {}   // v201
    if (v) {
      const closed = B.filter((b) => b[0] + H <= NOW).slice(-24 * L.VOL_DAYS).map((b) => [b[0] / 1000, b[1], b[2], b[3], b[4]]);
      const g = estimateGarch(closed, NOW, { step: 3600, stale: 2 * 3600, h: { 1: '1h', 6: '6h', 24: '24h' } });
      // 答え合わせ: 1日1回、その時点の「24時間先の見積もり(±1σ)」を控え、24時間後に実際の変化と比べる
      const cm = new Map(B.map((b) => [b[0], b[4]])), hist = (vol.hist || []).slice(-60);
      if (g.available && !hist.some((x) => x.t > v.end - 20 * H)) hist.push({ t: v.end, p0: cm.get(v.end - H), f: Math.round(g.sigma_pct['24h'] * 100) / 100 });
      for (const x of hist) if (x.r == null && x.p0) { const p1 = cm.get(x.t + 23 * H); if (p1) x.r = Math.round(Math.abs(Math.log(p1 / x.p0)) * 1e4) / 100; }
      const done = hist.filter((x) => x.r != null);
      // 次の主要指標と、その指標の過去の「発表から1時間のBTC」の平均(絶対値)
      const ng = groups(events.filter((e) => MAJOR(e) && e.ts > NOW && e.ts - NOW < 7 * DAY))[0];
      let next = null;
      if (ng) { const a = []; for (const e of ng) for (const r of recs.get((e.s || e.t) + '|' + e.c) || []) a.push(Math.abs(r.chg)); next = { ts: ng[0].ts, c: ng[0].c, en: L.headName(ng, 'en'), ja: L.headName(ng, 'ja'), avg: a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100 : null, n: a.length }; }
      vol = { ...v, garch: g.available ? g.sigma_pct : null, garchWhy: g.available ? null : g.reason, hist, acc: { n: done.length, hit: done.filter((x) => x.r <= x.f).length }, next };
      await site('/api/admin/rx-put?name=vl', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(vol) });
      console.log('[x] ボラティリティ: 普段の', v.ratio, '倍 / GARCH', g.available ? JSON.stringify(g.sigma_pct) : g.reason);
      if (v.ratio != null && v.ratio >= L.VOL_ALERT && ![...byId.values(), ...out].some((p) => p.sr === 'vol' && NOW - (p.due || 0) < DAY)) { { const dp = byId.get('daily:' + isoDay(dayStart(NOW))); put(L.volPost({ ...v, vm: dp && dp.img && dp.img.vol ? dp.img.vol.ratio : null })); } console.log('[x] ボラティリティの投稿を作りました'); }
    }
  }
} catch (e) { console.log('[x] ボラティリティでエラー(ほかの下書きは続けます):', e.message); }

// ---- 4c) v202: サイトの「似ている過去の値動き」カードを今の24時間で更新(直近6時間に急変動の計測が無い時) ----
try {
  let cur = {}; try { cur = (await (await site('/api/admin/rx-one?name=pt')).json()) || {}; } catch (_) {}
  const fresh = cur.q && cur.kind !== 'now' && NOW - (cur.at || 0) < 6 * H;
  if (!fresh && (!cur.at || cur.kind !== 'now' || NOW - cur.at > 50 * 60000)) { const r = await now24(); if (r) { await site('/api/admin/rx-put?name=pt', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(r) }); console.log('[x] サイトのカードを今の24時間で更新'); } }
} catch (e) { console.log('[x] サイトのカード(今の24時間)でエラー', e.message); }

// ---- 4d) v204: サイトの BTC実況カード(今週となぞっている過去の週 TOP3) ----
try { const S = await getS(), w = await weekBoth(S, NOW); if (w.ja || w.en) { await site('/api/admin/rx-put?name=wk', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(w) }); console.log('[x] BTC実況のカードを更新', w.ja && w.ja.top.map((m) => new Date(m.w).toISOString().slice(0, 10) + ' ' + m.rate + '%').join(' / ')); } }
catch (e) { console.log('[x] BTC実況のカードでエラー', e.message); }

// ---- 5) 清算(v152) ----
//   巨額清算の総括: Worker(LiqHub)が収まった時に x:liq へ記録した事象ごとに1本。6時間以内で、まだ下書きが無いものだけ作る。
//   毎朝のまとめ: 日本時間 9:00 以降に、その日の分を1本(直近24時間 = 前日 9:00 〜 今日 9:00)。サイトの /api/liq の1時間ごとの集計から作る。
try {
  const lq = await (await site('/api/admin/rx-one?name=xl')).json();
  for (const ev of (lq.ev || [])) { if (byId.has(ev.id) || NOW - ev.end > 6 * H) continue; put(L.liqPost(ev)); console.log('[x] 巨額清算の総括:', ev.id); }
  // v173: 日本語 = 9:00 JST(直近24時間)/ 英語 = 13:00 UTC(その時点までの直近24時間)。英語は平常日比なし(日足の区切りと合わないため)
  const liqWin = async (end) => {
    const start = end - DAY, coins = {}, hrs = new Map(), dly = {}; let from = null, ok = true, total = 0, cutMin = null;
    for (const [c] of COINS) {
      const r = await fetch(SITE + '/api/liq?sym=' + c + '&step=3600', { headers: { 'User-Agent': 'signal-archive-x-posts/1.0' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) { ok = false; console.log('[x] 清算(まとめ): /api/liq HTTP ' + r.status + ' なので次回'); break; }
      try { const r2 = await fetch(SITE + '/api/liq?sym=' + c + '&step=86400', { headers: { 'User-Agent': 'signal-archive-x-posts/1.0' }, signal: AbortSignal.timeout(30000) }); if (r2.ok) dly[c] = (await r2.json()).buckets || []; } catch (_) {}
      const j = await r.json(); let l = 0, s2 = 0;
      const ct = j.do && j.do.bf && j.do.bf.cut; if (ct && (cutMin == null || ct < cutMin)) cutMin = ct;
      for (const q of j.buckets || []) if (q[0] >= start && q[0] < end) { l += q[1]; s2 += q[2]; const h = hrs.get(q[0]) || [q[0], 0, 0]; h[1] += q[1]; h[2] += q[2]; hrs.set(q[0], h); }
      coins[c] = { long: l, short: s2 }; total += l + s2; if (j.since && (from == null || j.since > from)) from = j.since;
    }
    return { ok, total, coins, hours: [...hrs.values()].sort((x, y) => x[0] - y[0]), from, dly, cutMin, start };
  };
  const day = dayStart(NOW), lid = 'liqday:' + isoDay(day), split = isoDay(day) >= L.SPLIT_FROM;
  if (NOW >= day + L.LIQ_DAY_AT && !byId.has(lid)) {
    const end = day + L.LIQ_DAY_AT, w = await liqWin(end);
    // v171: 平常日比 = 前日(UTC。日本時間 9:00〜9:00 と同じ)の合計 ÷ 直前14日の中央値(/next.html の案Bと同じ定義)。足りない銘柄があれば出さない
    const mult = Object.keys(w.dly).length === COINS.length ? liqDayMult(w.dly, w.start) : null;
    if (mult) mult.live = w.cutMin == null || w.cutMin < end;
    if (w.ok && w.total > 0) put(L.liqDayPost(day, w.coins, w.hours, w.from, mult, split ? { langs: ['ja'] } : {}));
    else if (w.ok) console.log('[x] 清算(毎朝): 記録が0なので出しません(LiqHub が動いているか /api/liq を確認)');
  }
  const uday = Math.floor(NOW / DAY) * DAY, eend = uday + L.EN_LIQDAY_AT, eid = 'liqday-en:' + new Date(uday).toISOString().slice(0, 10);
  if (isoDay(uday + 9 * H) >= L.SPLIT_FROM && NOW >= eend && NOW - eend < L.AUTO_WINDOW && !byId.has(eid)) {
    const w = await liqWin(eend);
    if (w.ok && w.total > 0) put(L.liqDayPost(uday - 9 * H, w.coins, w.hours, w.from, null, { end: eend, id: eid, langs: ['en'] }));
  }
} catch (e) { console.log('[x] 清算でエラー(ほかの下書きは続けます):', e.message); }

// ---- 6) 清算の反応(v171。/next.html の案A: 発表を含む1時間を 0 として ±6時間) ----
//   主要指標(MAJOR)の発表を含む1時間から3時間が終わり、さらに「Coinalyze の4社合算に置き換わった」(/api/liq の do.bf.cut が3時間の終わり以降)後に1本。
//   直近の数時間は Bybit・OKX のライブ受信だけで、平常(直前14日 = 4社)と並べると倍率が小さく出るため、置き換わるまで作らない。
//   過去の回 = /api/admin/liqimpact(next.html と同じ集計・無料の絞り込みなし)。過去の回が3回未満なら出さない。
try {
  const cand = groups(events.filter((e) => MAJOR(e) && NOW >= liqImpWinEnd(e.ts) && NOW - e.ts < 48 * H)).filter((g) => !byId.has(liqImpId(g)));
  if (cand.length) {
    const types = ((await (await site('/api/admin/liqimpact?sym=BTC')).json()).types || []);
    const hourly = {};
    for (const [c] of COINS) { const r = await fetch(SITE + '/api/liq?sym=' + c + '&step=3600', { headers: { 'User-Agent': 'signal-archive-x-posts/1.0' }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('/api/liq ' + c + ' HTTP ' + r.status); const j = await r.json(); hourly[c] = { m: liqHourMap(j.buckets), since: j.since || null, cut: j.do && j.do.bf && j.do.bf.cut || null }; }
    for (const g of cand) {
      const e0 = g.find(MAJOR) || g[0], id = liqImpId(g), we = liqImpWinEnd(g[0].ts);
      if (!types.some((t) => t.k === e0.s)) { console.log('[x] 清算の反応: 過去の回が5回未満で種別に無いので出しません', id, e0.s); continue; }
      const cuts = COINS.map(([c]) => hourly[c].cut);
      if (cuts.some((t) => !t || t < we)) { console.log('[x] 清算の反応: 4社合算に置き換わるのを待ちます', id); continue; }
      const hist = await (await site('/api/admin/liqimpact?sym=BTC&type=' + encodeURIComponent(e0.s))).json();
      const past = []; for (const h of hist.events || []) { if (Math.abs(h.ts - g[0].ts) < H) continue; const a = liqAlign(hourly.BTC.m, hourly.BTC.since, h.ts); if (a && winMean(a.l) != null && winMean(a.s) != null) past.push({ ts: h.ts, l: a.l, s: a.s }); }
      const cur = liqAlign(hourly.BTC.m, hourly.BTC.since, g[0].ts);
      if (!cur || past.length < 3) { console.log('[x] 清算の反応: 比べる過去の回が足りないので出しません', id, 'n=' + past.length); continue; }
      const med = { l: cur.k.map((_, i) => medOf(past.map((q) => q.l[i]))), s: cur.k.map((_, i) => medOf(past.map((q) => q.s[i]))) };
      const cw = {}; for (const [c] of COINS) { const a = liqAlign(hourly[c].m, hourly[c].since, g[0].ts); const l = a && winMean(a.l), sh = a && winMean(a.s); if (l != null && sh != null) cw[c] = { l, s: sh }; }
      if (!cw.BTC) { console.log('[x] 清算の反応: BTC の倍率が出せないので出しません', id); continue; }
      const mw = { l: medOf(past.map((q) => winMean(q.l))), s: medOf(past.map((q) => winMean(q.s))) };
      put(liqImpPost(g, { sym: 'BTC', win: LIQ_IMP_WIN, cur, med, past, n: past.length, cw, mw, due: Math.max(liqImpDue(g[0].ts), NOW) }));
      console.log('[x] 清算の反応:', id, 'n=' + past.length);
    }
  }
} catch (e) { console.log('[x] 清算の反応でエラー(ほかの下書きは続けます):', e.message); }

// ---- 保存・通知 ----
for (const p of out) for (const lg of ['en', 'ja']) if (xlen(p[lg]) > 280) console.log(`[x] 注意: ${p.id} ${lg} が280を超えています(${xlen(p[lg])})`);
let res = {};
if (out.length || drop.length) res = await (await site('/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ upsert: out, remove: drop.filter((id) => !out.some((p) => p.id === id)) }) })).json();
// v94: Worker が見張る自動投稿の予定(x:due)を書き直す
try {
  const merged = new Map((store.posts || []).map((p) => [p.id, p])); for (const p of out) merged.set(p.id, { ...(merged.get(p.id) || {}), ...p, done: (merged.get(p.id) || {}).done });
  await site('/api/admin/rx-put?name=xd', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(dueList([...merged.values()].filter((p) => !drop.includes(p.id)), events, Date.now())) });
} catch (e) { console.log('[x] x:due を書けませんでした:', e.message); }
const fresh = out.filter((p) => !byId.has(p.id) && p.sr !== 'daily' && p.sr !== 'liqday');       // 通知は「すぐ投稿するもの」が新しくできた時だけ
if (TOPIC && fresh.length) {
  const r = await fetch(NTFY, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ topic: TOPIC, title: `投稿できる下書き ${fresh.length}件`, message: fresh.map((p) => p.ja.split('\n')[2] || p.id).join('\n'), tags: ['bird'], click: SITE + '/posts.html' }) });
  if (!r.ok) console.log('[x] ntfy HTTP ' + r.status);
}
console.log(`[x] 送った下書き ${out.length}件 (新規 ${res.added ?? '-'} / 更新 ${res.changed ?? '-'} / 予約済みに変更あり ${res.flagged ?? '-'})`);
