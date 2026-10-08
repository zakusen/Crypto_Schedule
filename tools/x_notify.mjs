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

const here = path.dirname(fileURLToPath(import.meta.url));
const L = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(here, '..', 'public', 'xpost-lib.js'))).toString('base64'));
const { uDay, uhm, AUTO_DAILY_FROM } = L;   // v103: 英語は UTC(毎朝の予定は自動投稿になる日から。手で予約済みの分は作り直さない)
const { H, DAY, DAILY_AT, ARCH_WAIT, WEEK_AT, J, xlen, enDay, enDate, hm, jaDay, pct, pctTxt, usd, dayStart, weekStart, isoDay, hashStr,
  pickEvents, groups, MAJOR, archId, groupLine, tags, siteLine, moves, COINS, barsStart, klinesUrl, archPost, kindOf, weekPost, dueList } = L;

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
function dailyPost(day) {
  // v104: 英語(UTC)は「今日」= 投稿時刻〜UTC の 24:00、「今週」= UTC の翌日〜月曜 0:00(UTC)。日本語は日本時間の今日・今週のまま
  const utc = isoDay(day) >= AUTO_DAILY_FROM, eh = utc ? uhm : hm, ed = utc ? uDay : enDay;
  const due = day + DAILY_AT, J9 = 9 * H;                                   // day = 日本時間の0時。+9時間 = 同じ日付の UTC 0時
  const win = (lang) => {
    const u = lang === 'en' && utc, dEnd = u ? day + J9 + DAY : day + DAY;   // 「今日」の終わり
    let wa = dEnd, wb = weekStart(day) + 7 * DAY + (u ? J9 : 0), next = false;
    if (wb - wa <= 0) { wb = wa + 7 * DAY; next = true; }                     // 日曜は来週を出す
    const tg = between(due, dEnd);
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
        ...(nx ? ['', en ? `🟢 NEXT SIGNAL · ${dEn(nx[0].ts)} · ${eh(nx[0].ts)}` : `🟢 次の予定 · ${dJa(nx[0].ts)} · ${hm(nx[0].ts)}`, `🟡 ${isCB(nx) ? '🏦' : (REG[nx[0].c] || ['📅'])[0]} ${en ? groupLine(nx, 'en').toUpperCase() : groupLine(nx, 'ja')}`] : []),
        '', tag].join('\n');
    };
    const OPT = [{ brand: 1, cat: 1, rule: 18 }, { brand: 1, cat: 1, rule: 10 }, { cat: 1, rule: 10 }, { rule: 10 }];
    for (let tn = tg.length; tn >= 0; tn--) for (const o of OPT) { const t = mk(tn, o); if (xlen(t) <= 280) return t; }
    return mk(0, OPT[OPT.length - 1]);
  };
  const en = text('en'), ja = text('ja');
  const lists = (w) => ({ today: w.tg.map((g, i) => ({ t: g[0].ts, en: groupLine(g, 'en'), ja: groupLine(g, 'ja'), pv: w.prev[i] ? w.prev[i].chg : null })), week: w.wk.map((g) => ({ t: g[0].ts, en: groupLine(g, 'en'), ja: groupLine(g, 'ja') })) });
  return { id: 'daily:' + isoDay(day), sr: 'daily', due, en, ja, h: hashStr(en + ja),
    img: { day, next: WN.ja.next, ...lists(WN.ja), ...(utc ? { utc: 1, enl: { next: WN.en.next, ...lists(WN.en) } } : {}) } };   // enl = 英語の画像用(UTC の区切り)
}
const drop = [];                                                            // 作らない日の古い下書きは消す(済みの印が無いものだけ)
for (let i = 0; i <= AHEAD; i++) {
  const day = today + i * DAY, p = dailyPost(day);
  if (p.due < NOW && byId.has(p.id)) continue;                              // 投稿時刻を過ぎた分は作り直さない(今日の分が無ければ作る)
  if (!p.img.today.length && !p.img.week.length) { if (byId.has(p.id)) drop.push(p.id); continue; }   // v85: その日もその週の残りも予定が無い日は作らない(曜日に関係なく)
  put(p);
}

// ---- 2) 発表後の値動き(予備) ----
for (const g of groups(events.filter((e) => MAJOR(e) && NOW - e.ts >= ARCH_WAIT && NOW - e.ts < ARCH_MAX))) {
  if (byId.has(archId(g))) continue;
  const mv = {};                                                             // v91: BTC・ETH・SOL・BNB の1時間後(BTCは必須)
  for (const [c, sym] of COINS) { const bars = await klines(sym, '5m', barsStart(g[0].ts), 25); mv[c] = bars && moves(bars, g[0].ts); }
  if (!mv.BTC) { console.log('[x] 価格が取れないので次回:', archId(g)); continue; }
  put(archPost(g, mv, SITE));
}

// ---- 3) 週間記録(v92: 土曜 7時以降に作成 → 10:00 投稿。期間 = 前の土曜0時〜金曜24時 JST) ----
if (J(NOW).getUTCDay() === 6 && J(NOW).getUTCHours() >= 7) {
  const we = dayStart(NOW), ws = we - 7 * DAY, id = 'week:' + isoDay(ws);
  if (!byId.has(id)) {
    const coins = {};
    for (const [c, sym] of COINS) {                                          // 日本時間の区切りなので1時間足で(始値 = 最初の足の始値、終値 = 最後の足の終値)
      const k = await klines(sym, '1h', ws, 168);
      if (k && k.length === 168 && +k[0][0] === ws && +k[167][0] === we - H) coins[c] = { s: +k[0][1], e: +k[167][4], chg: pct(+k[0][1], +k[167][4]), spark: [+k[0][1], ...[23, 47, 71, 95, 119, 143, 167].map((i) => +k[i][4])] };
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
      put(weekPost({ ws, we, coins, ev }, SITE));
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
    for (let k = 0; k < 3 && !j; k++) {
      try { const r = await fetch(`${PAC}/kline?symbol=${sym}&interval=${iv}&start_time=${a}&end_time=${b}`, { headers: { 'User-Agent': 'signal-archive-x-posts/1.0' }, signal: AbortSignal.timeout(15000) }); if (r.ok) j = await r.json(); else await sleep(2000); } catch (_) { await sleep(2000); }
    }
    if (!j) throw new Error(`Pacifica ${sym} ${iv} が取れません`);
    for (const x of (Array.isArray(j) ? j : j.data || [])) rows.set(+x.t, [+x.t, +x.o, +x.h, +x.l, +x.c]);
  }
  return [...rows.values()].sort((x, y) => x[0] - y[0]);
}
const SYM5 = ['SP500', ...COINS.map(([c]) => c)];
async function corrNow() {
  const B = {}; for (const s of SYM5) B[s] = await pac(s, '1h', NOW - (Math.max(...L.CORR_DAYS) + 2) * DAY, NOW);
  return L.corrCalc(B, NOW);
}
try {
  const spk = await (await site('/api/admin/rx-one?name=xk')).json();
  const pend = (spk.ev || []).filter((x) => NOW - x.t < L.AUTO_WINDOW && !byId.has(x.id));
  let corr = await (await site('/api/admin/rx-one?name=cr')).json();
  if (pend.length || !corr.at || NOW - corr.at > 6 * H) {
    const c = await corrNow();
    if (c) { corr = c; await site('/api/admin/rx-put?name=cr', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(c) }); console.log('[x] S&P500 相関を更新:', JSON.stringify(c.w)); }
  }
  for (const ev of pend) {
    const B = {}; for (const s of SYM5) B[s] = await pac(s, '5m', ev.t - 2 * H, Math.min(NOW, ev.t + 15 * 60000));
    const mv = L.spikeMoves(B, ev.t, NOW);
    if (!mv) { console.log('[x] 急変動: Pacifica の5分足では BTC が ±3% に届かないので出しません', ev.id, JSON.stringify(ev.hit)); continue; }
    // v98: URL を付けるのは直近30日で SPIKE_LINK_MAX 回まで(URL付きは1本 $0.20)
    const linked = [...byId.values(), ...out].filter((p) => p.sr === 'spike' && p.img && p.img.link && NOW - (p.due || 0) < 30 * DAY).length;
    const link = linked < L.SPIKE_LINK_MAX ? SITE : null;
    if (!link) console.log(`[x] 急変動: 直近30日の URL付きが ${linked} 回に達したので URL なしで出します`);
    put(L.spikePost({ ...mv, id: ev.id, due: ev.t }, corr && corr.w ? corr : null, link));
  }
} catch (e) { console.log('[x] S&P500 相関・急変動でエラー(ほかの下書きは続けます):', e.message); }

// ---- 保存・通知 ----
for (const p of out) for (const lg of ['en', 'ja']) if (xlen(p[lg]) > 280) console.log(`[x] 注意: ${p.id} ${lg} が280を超えています(${xlen(p[lg])})`);
let res = {};
if (out.length || drop.length) res = await (await site('/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ upsert: out, remove: drop }) })).json();
// v94: Worker が見張る自動投稿の予定(x:due)を書き直す
try {
  const merged = new Map((store.posts || []).map((p) => [p.id, p])); for (const p of out) merged.set(p.id, { ...(merged.get(p.id) || {}), ...p, done: (merged.get(p.id) || {}).done });
  await site('/api/admin/rx-put?name=xd', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(dueList([...merged.values()].filter((p) => !drop.includes(p.id)), events, Date.now())) });
} catch (e) { console.log('[x] x:due を書けませんでした:', e.message); }
const fresh = out.filter((p) => !byId.has(p.id) && p.sr !== 'daily');       // 通知は「すぐ投稿するもの」が新しくできた時だけ
if (TOPIC && fresh.length) {
  const r = await fetch(NTFY, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ topic: TOPIC, title: `投稿できる下書き ${fresh.length}件`, message: fresh.map((p) => p.ja.split('\n')[2] || p.id).join('\n'), tags: ['bird'], click: SITE + '/posts.html' }) });
  if (!r.ok) console.log('[x] ntfy HTTP ' + r.status);
}
console.log(`[x] 送った下書き ${out.length}件 (新規 ${res.added ?? '-'} / 更新 ${res.changed ?? '-'} / 予約済みに変更あり ${res.flagged ?? '-'})`);
