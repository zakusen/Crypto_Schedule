// v204: BTC実況(今のBTCがなぞっている過去 TOP3)。v205: 曜日ではなく日付の7日窓。
//   7日の窓(3日前の0時〜3日後の24時。日本語 = 日本時間 / 英語 = UTC。今日は常に左から4番目)の BTC の道のり(30分ごと・窓の始まりを0%)と、
//   2017年以降の過去の7日間(1日ずつずらす)の「同じ時点まで」を比べ、相関係数が高い順に3つ(7日以上離す)。一致率 = 相関係数×100。
//   過去の残り(その後)は事実の記録。予測ではない。点 = これまでの定時投稿(毎朝・夜)の時刻。
const M30 = 1800000, H = 3600000, DAY = 86400000, WEEK = 7 * DAY, PTS = 7 * 48;
export const SLOTS = { ja: [9.5 * H, 22 * H], en: [11.5 * H, 23.5 * H] };
export const wkStart = (t, off) => { const d = Math.floor((t + off) / DAY) * DAY - off; return d - ((new Date(d + off).getUTCDay() + 6) % 7) * DAY; };

function at(S, t) {   // t 以前で一番近い5分足の終値(30分以上あいていたら無し)
  let lo = 0, hi = S.t.length - 1; if (hi < 0 || S.t[0] > t) return null;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S.t[m] <= t) lo = m; else hi = m - 1; }
  return t - S.t[lo] <= M30 ? S.c[lo] : null;
}
function path(S, w, n, st = M30) {
  const b = at(S, w); if (!b) return null;
  const a = []; let miss = 0, last = 0;
  for (let k = 0; k <= n; k++) { const v = at(S, w + k * st); if (v == null) { miss++; a.push(last); } else { last = (v / b - 1) * 100; a.push(last); } }
  return miss > n * 0.05 ? null : a;
}
function pearson(a, b) {
  const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}
const rng = (a) => Math.max(...a) - Math.min(...a);
const r2 = (v) => Math.round(v * 100) / 100;

// v206: 期間を投稿ごとに変えられる共通の探し方。ws = 窓の始まり、N = 点の数、st = 刻み(ms)、shift = 過去をずらす幅
export function liveMatch(S, now, o) {
  const { ws, N, st, shift, lang = 'ja' } = o, end = Math.min(now, S.t[S.t.length - 1] + 300000);
  const K = Math.min(N, Math.floor((end - ws) / st)); if (K < 4) return null;
  const cur = path(S, ws, K, st); if (!cur) return null;
  const span = N * st, ra = rng(cur), cand = [];
  for (let w = ws - span; w >= S.t[0]; w -= shift) {
    const p = path(S, w, N, st); if (!p) continue;
    const head = p.slice(0, K + 1), rb = rng(head);
    if (ra > 0.3 && (rb > ra * 2.5 || rb < ra / 2.5)) continue;   // 大きさが極端に違う期間は外す
    cand.push({ w, r: pearson(cur, head), path: p });
  }
  cand.sort((a, b) => b.r - a.r);
  const pick = []; for (const c of cand) { if (pick.every((x) => Math.abs(x.w - c.w) >= span)) pick.push(c); if (pick.length >= 3) break; }
  if (!pick.length) return null;
  const top = pick.map((c) => ({ w: c.w, day: c.w + (now - ws), rate: Math.max(0, Math.round(c.r * 100)), path: c.path.map(r2) }));
  return { v: 3, lang, ws, N, st, end, K, cur: cur.map(r2), top, n: cand.length };
}
// 7日の窓(3日前の0時〜3日後の24時)。今日は常に左から4番目。過去は1日ずつずらす
export function weekMatch(S, now, lang = 'ja', ev = []) {
  const off = lang === 'en' ? 0 : 9 * H, today = Math.floor((now + off) / DAY) * DAY - off, ws = today - 3 * DAY;
  const r = liveMatch(S, now, { ws, N: PTS, st: M30, shift: DAY, lang }); if (!r) return null;
  r.today = today; r.top.forEach((m) => { m.day = m.w + 3 * DAY; });
  r.marks = []; for (let d = 0; d < 4; d++) for (const s of SLOTS[lang]) { const t = ws + d * DAY + s; if (t <= now + 70 * 60000) r.marks.push({ t, k: Math.min(r.K, Math.max(0, Math.round((t - ws) / M30))) }); }
  r.ev = ev.filter((e) => e.t >= ws && e.t < ws + WEEK).slice(0, 10);
  return r;
}

export async function weekBoth(S, now, ev = []) { return { at: now, ja: weekMatch(S, now, 'ja', ev), en: weekMatch(S, now, 'en', ev) }; }

// 本文に足す1行
export function liveLine(lv, lang) {
  if (!lv || !lv.top || !lv.top.length) return '';
  const d = new Date(lv.top[0].day + (lang === 'en' ? 0 : 9 * H)), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return lang === 'en' ? `📡 BTC is tracing the days around ${M[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} (match ${lv.top[0].rate}%)`
    : `📡 今のBTCがなぞっている過去: ${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}前後（一致率${lv.top[0].rate}%）`;
}

// ---- v208: FOMC 前の値動きが一番近い「過去のFOMC前」 ----
// 定例会合の声明の日(FRB 公式の日程。声明 = 米東部時間 14:00)。臨時会合は時刻がまちまちなので入れない。BTC の5分足は2017年8月から
export const FOMC_DAYS = ['2017-09-20', '2017-11-01', '2017-12-13',
  '2018-01-31', '2018-03-21', '2018-05-02', '2018-06-13', '2018-08-01', '2018-09-26', '2018-11-08', '2018-12-19',
  '2019-01-30', '2019-03-20', '2019-05-01', '2019-06-19', '2019-07-31', '2019-09-18', '2019-10-30', '2019-12-11',
  '2020-01-29', '2020-04-29', '2020-06-10', '2020-07-29', '2020-09-16', '2020-11-05', '2020-12-16',
  '2021-01-27', '2021-03-17', '2021-04-28', '2021-06-16', '2021-07-28', '2021-09-22', '2021-11-03', '2021-12-15',
  '2022-01-26', '2022-03-16', '2022-05-04', '2022-06-15', '2022-07-27', '2022-09-21', '2022-11-02', '2022-12-14',
  '2023-02-01', '2023-03-22', '2023-05-03', '2023-06-14', '2023-07-26', '2023-09-20', '2023-11-01', '2023-12-13',
  '2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18',
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09'];
export function etTs(day, hh = 14, mm = 0) {   // 米東部時間 hh:mm → UTC ms(夏時間を見る)
  const [y, m, d] = day.split('-').map(Number), t = Date.UTC(y, m - 1, d, hh + 4, mm);
  const h = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(t));
  return h === hh ? t : Date.UTC(y, m - 1, d, hh + 5, mm);
}
export const fomcTs = (day) => etTs(day, 14);
export const FOMC_TS = FOMC_DAYS.map(fomcTs);
// v215: 米CPI・米雇用統計(BLS 公式の過去の発表日)、米PCE(BEA 公式。2020年10月以降で取れた分)。どれも米東部時間 8:30
export const CPI_DAYS = ['2017-08-11', '2017-09-14', '2017-10-13', '2017-11-15', '2017-12-13',
  '2018-01-12', '2018-02-14', '2018-03-13', '2018-04-11', '2018-05-10', '2018-06-12', '2018-07-12', '2018-08-10', '2018-09-13', '2018-10-11', '2018-11-14', '2018-12-12',
  '2019-01-11', '2019-02-13', '2019-03-12', '2019-04-10', '2019-05-10', '2019-06-12', '2019-07-11', '2019-08-13', '2019-09-12', '2019-10-10', '2019-11-13', '2019-12-11',
  '2020-01-14', '2020-02-13', '2020-03-11', '2020-04-10', '2020-05-12', '2020-06-10', '2020-07-14', '2020-08-12', '2020-09-11', '2020-10-13', '2020-11-12', '2020-12-10',
  '2021-01-13', '2021-02-10', '2021-03-10', '2021-04-13', '2021-05-12', '2021-06-10', '2021-07-13', '2021-08-11', '2021-09-14', '2021-10-13', '2021-11-10', '2021-12-10',
  '2022-01-12', '2022-02-10', '2022-03-10', '2022-04-12', '2022-05-11', '2022-06-10', '2022-07-13', '2022-08-10', '2022-09-13', '2022-10-13', '2022-11-10', '2022-12-13',
  '2023-01-12', '2023-02-14', '2023-03-14', '2023-04-12', '2023-05-10', '2023-06-13', '2023-07-12', '2023-08-10', '2023-09-13', '2023-10-12', '2023-11-14', '2023-12-12',
  '2024-01-11', '2024-02-13', '2024-03-12', '2024-04-10', '2024-05-15', '2024-06-12', '2024-07-11', '2024-08-14', '2024-09-11', '2024-10-10', '2024-11-13', '2024-12-11',
  '2025-01-15', '2025-02-12', '2025-03-12', '2025-04-10', '2025-05-13', '2025-06-11', '2025-07-15', '2025-08-12', '2025-09-11', '2025-10-24', '2025-12-18',
  '2026-01-13', '2026-02-13', '2026-03-11', '2026-04-10', '2026-05-12', '2026-06-10', '2026-07-14', '2026-08-12', '2026-09-11', '2026-10-14'];
export const NFP_DAYS = ['2017-09-01', '2017-10-06', '2017-11-03', '2017-12-08',
  '2018-01-05', '2018-02-02', '2018-03-09', '2018-04-06', '2018-05-04', '2018-06-01', '2018-07-06', '2018-08-03', '2018-09-07', '2018-10-05', '2018-11-02', '2018-12-07',
  '2019-01-04', '2019-02-01', '2019-03-08', '2019-04-05', '2019-05-03', '2019-06-07', '2019-07-05', '2019-08-02', '2019-09-06', '2019-10-04', '2019-11-01', '2019-12-06',
  '2020-01-10', '2020-02-07', '2020-03-06', '2020-04-03', '2020-05-08', '2020-06-05', '2020-07-02', '2020-08-07', '2020-09-04', '2020-10-02', '2020-11-06', '2020-12-04',
  '2021-01-08', '2021-02-05', '2021-03-05', '2021-04-02', '2021-05-07', '2021-06-04', '2021-07-02', '2021-08-06', '2021-09-03', '2021-10-08', '2021-11-05', '2021-12-03',
  '2022-01-07', '2022-02-04', '2022-03-04', '2022-04-01', '2022-05-06', '2022-06-03', '2022-07-08', '2022-08-05', '2022-09-02', '2022-10-07', '2022-11-04', '2022-12-02',
  '2023-01-06', '2023-02-03', '2023-03-10', '2023-04-07', '2023-05-05', '2023-06-02', '2023-07-07', '2023-08-04', '2023-09-01', '2023-10-06', '2023-11-03', '2023-12-08',
  '2024-01-05', '2024-02-02', '2024-03-08', '2024-04-05', '2024-05-03', '2024-06-07', '2024-07-05', '2024-08-02', '2024-09-06', '2024-10-04', '2024-11-01', '2024-12-06',
  '2025-01-10', '2025-02-07', '2025-03-07', '2025-04-04', '2025-05-02', '2025-06-06', '2025-07-03', '2025-08-01', '2025-09-05', '2025-11-20', '2025-12-16',
  '2026-01-09', '2026-02-11', '2026-03-06', '2026-04-03', '2026-05-08', '2026-06-05', '2026-07-02', '2026-08-07', '2026-09-04', '2026-10-02'];
export const PCE_DAYS = ['2020-10-30', '2020-11-25', '2020-12-23',
  '2021-01-29', '2021-02-26', '2021-03-26', '2021-04-30', '2021-05-28', '2021-06-25', '2021-07-30', '2021-08-27', '2021-10-01', '2021-10-29', '2021-11-24', '2021-12-23',
  '2022-01-28', '2022-02-25', '2022-03-31', '2022-04-29', '2022-05-27', '2022-06-30', '2022-07-29', '2022-08-26', '2022-09-30', '2022-10-28', '2022-12-01', '2022-12-23',
  '2023-01-27', '2023-02-24', '2023-03-31', '2023-04-28', '2023-05-26', '2023-06-30', '2023-07-28', '2023-08-31', '2023-09-29', '2023-10-27', '2023-11-30', '2023-12-22',
  '2024-01-26', '2024-02-29', '2024-03-29', '2024-04-26', '2024-05-31', '2024-06-28', '2024-07-26', '2024-08-30', '2024-09-27', '2024-10-31', '2024-11-27', '2024-12-20',
  '2025-01-31', '2025-02-28', '2025-03-28', '2025-04-30', '2025-05-30', '2025-06-27', '2025-07-31', '2025-08-29', '2025-09-26', '2025-12-05',
  '2026-01-22', '2026-03-13', '2026-06-25', '2026-07-30', '2026-08-26', '2026-09-30'];
export const BIG_TS = { fomc: FOMC_TS, cpi: CPI_DAYS.map((d) => etTs(d, 8, 30)), nfp: NFP_DAYS.map((d) => etTs(d, 8, 30)), pce: PCE_DAYS.map((d) => etTs(d, 8, 30)) };
const chgAt = (S, a, b) => { const x = at(S, a), y = at(S, b); return x && y ? r2((y / x - 1) * 100) : null; };
// 過去のFOMCの発表後1時間(新しい順)。E より前だけ
export function fomcHist(S, E, n = 6) { return FOMC_TS.filter((t) => t < E - 2 * H).reverse().map((t) => ({ t, chg: chgAt(S, t, t + H) })).filter((x) => x.chg != null).slice(0, n); }
// 今回(発表 E)の「発表24時間前〜選ぶ時点」と、過去の各FOMCの同じ区間を比べる(15分刻み・図は発表の4時間後まで)。
// sel = 選ぶのに使う最後の時刻(結果の投稿は「1時間前」と同じ選び方にするため E − 1時間を渡す)。発表後の動きは選ぶのに使わない
export function fomcMatch(S, now, E, lang = 'ja', sel = now, k = 'fomc') {   // v215: k = fomc / cpi / nfp / pce
  const st = 15 * 60000, N = 112, ws = E - 24 * H, end = Math.min(now, S.t[S.t.length - 1] + 300000), se = Math.min(sel, end, E);
  const K = Math.min(N, Math.floor((end - ws) / st)), KS = Math.min(K, Math.floor((se - ws) / st)); if (KS < 4) return null;
  const cur = path(S, ws, K, st); if (!cur) return null;
  const cs = cur.slice(0, KS + 1), cand = [];
  for (const Ep of BIG_TS[k] || FOMC_TS) { if (Ep > E - 2 * DAY) continue; const p = path(S, Ep - 24 * H, N, st); if (!p) continue; cand.push({ Ep, r: pearson(cs, p.slice(0, KS + 1)), path: p }); }
  cand.sort((a, b) => b.r - a.r);
  const top = cand.slice(0, 3).map((c) => ({ w: c.Ep - 24 * H, day: c.Ep, fomc: c.Ep, a1: chgAt(S, c.Ep, c.Ep + H), rate: Math.max(0, Math.round(c.r * 100)), path: c.path.map(r2) }));
  if (!top.length) return null;
  return { v: 3, lang, ws, N, st, end, K, KS, E, cur: cur.map(r2), top, n: cand.length, fomc: 1, k, a1: end >= E + H ? chgAt(S, E, E + H) : null };
}

// ---- v217: 急変動の時、過去の急変動(同じ向き)だけと比べる ----
// 過去の急変動 = 2017年以降の5分足で、1時間の変化が th% 以上(同じ向き)になった時。12時間以内は一番大きい1回にまとめる。
// 比べる区間 = 急変動の終わりの3時間前〜今(5分刻み)。図は終わりの3時間後まで。その後3時間 = 終わりから3時間の変化(事実)
export function spikeEvents(S, dir, th) {
  const out = [], n = S.t.length;
  for (let j = 12; j < n; j++) {
    if (S.t[j] - S.t[j - 12] !== 12 * 300000) continue;
    const v = (S.c[j] / S.c[j - 12] - 1) * 100;
    if (dir < 0 ? v > -th : v < th) continue;
    const last = out[out.length - 1];
    if (last && S.t[j] - last.t < 12 * H) { if (Math.abs(v) > Math.abs(last.v)) { last.t = S.t[j]; last.v = v; } continue; }
    out.push({ t: S.t[j], v });
  }
  return out;
}
export function spikeMatch(S, now, t1, mv, lang = 'ja') {
  const st = 300000, N = 72, ws = t1 - 3 * H, end = Math.min(now, S.t[S.t.length - 1] + 300000), dir = mv < 0 ? -1 : 1, th = Math.max(2, Math.min(3, Math.abs(mv) * 0.75));
  const K = Math.min(N, Math.floor((end - ws) / st)); if (K < 4) return null;
  const cur = path(S, ws, K, st); if (!cur) return null;
  const ev = spikeEvents(S, dir, th).filter((e) => e.t < t1 - 12 * H), cand = [];
  for (const e of ev) { const p = path(S, e.t - 3 * H, N, st); if (!p) continue; cand.push({ e, r: pearson(cur, p.slice(0, K + 1)), path: p }); }
  cand.sort((a, b) => b.r - a.r);
  const top = cand.slice(0, 3).map((c) => ({ w: c.e.t - 3 * H, day: c.e.t, mv: r2(c.e.v), a1: chgAt(S, c.e.t, c.e.t + 3 * H), rate: Math.max(0, Math.round(c.r * 100)), path: c.path.map(r2) }));
  if (!top.length) return null;
  return { v: 3, lang, ws, N, st, end, K, cur: cur.map(r2), top, n: ev.length, th: r2(th), dir, spk: 1 };
}

// ---- v219: 「直近5時間」の急変動を、過去の同じくらいの5時間の動き(同じ向き)と比べる(投稿する時点が基準) ----
// 過去の候補 = 5時間の変化が今回の75%以上(最低2%)・同じ向き。24時間以内は一番大きい1回。図 = 直近5時間 + その後3時間(5分刻み)
export function moveMatch(S, now, lang = 'ja', hrs = 5) {
  const st = 300000, B = hrs * 12, N = B + 36, n = S.t.length, end = Math.min(now, S.t[n - 1] + st), ws = Math.floor(end / st) * st - hrs * H;
  const cur = path(S, ws, B, st); if (!cur) return null;
  const mv = cur[B], dir = mv < 0 ? -1 : 1, th = Math.max(2, Math.abs(mv) * 0.75), ev = [];
  for (let j = B; j < n; j++) {
    if (S.t[j] > end - DAY || S.t[j] - S.t[j - B] !== B * st) continue;
    const v = (S.c[j] / S.c[j - B] - 1) * 100; if (dir < 0 ? v > -th : v < th) continue;
    const last = ev[ev.length - 1];
    if (last && S.t[j] - last.t < DAY) { if (Math.abs(v) > Math.abs(last.v)) { last.t = S.t[j]; last.v = v; } continue; }
    ev.push({ t: S.t[j], v });
  }
  // v220: 下げる(上げる)前の価格(5時間前)に戻るまでの時間(最長30日)。戻らなければ null
  const idxOf = (t) => { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (S.t[m] < t) lo = m + 1; else hi = m; } return lo; };
  for (const e of ev) { const p0 = at(S, e.t - hrs * H); e.rec = null; if (!p0) continue; for (let i = idxOf(e.t) + 1; i < n && S.t[i] <= e.t + 30 * DAY; i++) if (dir < 0 ? S.c[i] >= p0 : S.c[i] <= p0) { e.rec = S.t[i] - e.t; break; } }
  const done = ev.filter((e) => S.t[n - 1] - e.t >= 30 * DAY), rate = (h) => done.length ? Math.round(done.filter((e) => e.rec != null && e.rec <= h).length / done.length * 100) : null;
  const recs = done.filter((e) => e.rec != null).map((e) => e.rec).sort((a, b) => a - b), med = recs.length ? recs[Math.floor(recs.length / 2)] : null;
  const stats = { n: done.length, r3: rate(3 * H), r24: rate(DAY), r7: rate(7 * DAY), med, never: done.length ? Math.round(done.filter((e) => e.rec == null).length / done.length * 100) : null };
  const cand = [];
  for (const e of ev) { const p = path(S, e.t - hrs * H, N, st); if (!p) continue; cand.push({ e, r: pearson(cur, p.slice(0, B + 1)), path: p }); }
  cand.sort((a, b) => b.r - a.r);
  const top = cand.slice(0, 3).map((c) => ({ w: c.e.t - hrs * H, day: c.e.t, mv: r2(c.e.v), rec: c.e.rec, a1: chgAt(S, c.e.t, c.e.t + 3 * H), rate: Math.max(0, Math.round(c.r * 100)), path: c.path.map(r2) }));
  if (!top.length) return null;
  const p0 = at(S, ws), p1 = at(S, end - 1);
  return { v: 3, lang, ws, N, st, end, K: B, cur: cur.map(r2), top, n: ev.length, th: r2(th), dir, mv: r2(mv), hrs, p0, p1, spk: 1, kind: 'spkcmp', stats };
}

// ---- v221: 大型ハッキングの後のBTC(発生の時刻でそろえて重ねる)。時刻は公式発表・報道で確かめたもの(UTC) ----
export const HACKS = [
  { id: 'coincheck2018', t: Date.UTC(2018, 0, 25, 18, 0), ja: 'Coincheck', en: 'Coincheck', note: '流出' },
  { id: 'binance2019', t: Date.UTC(2019, 4, 7, 17, 15), ja: 'Binance', en: 'Binance', note: '侵害の発見' },
  { id: 'kucoin2020', t: Date.UTC(2020, 8, 25, 19, 5), ja: 'KuCoin', en: 'KuCoin', note: '大口出金の検知' },
  { id: 'dmm2024', t: Date.UTC(2024, 4, 31, 4, 26), ja: 'DMM Bitcoin', en: 'DMM Bitcoin', note: '流出の発表' },
  { id: 'bybit2025', t: Date.UTC(2025, 1, 21, 14, 16), ja: 'Bybit', en: 'Bybit', note: '流出' },
  { id: 'binance2026', t: Date.UTC(2026, 9, 29, 20, 24), ja: 'Binance', en: 'Binance', note: 'ウォレットから大量流出(ハッキングの疑い・未確認)', cur: 1 },
];
// 発生の6時間前〜24時間後(15分刻み・発生 = 0%)。今回は今まで
export function hackMatch(S, now, ev = HACKS.find((h) => h.cur)) {
  const st = 15 * 60000, B = 24, N = B + 96, end = Math.min(now, S.t[S.t.length - 1] + 300000), base = (t) => at(S, t);
  const mk = (h, lim) => { const b = base(h.t); if (!b) return null; const a = []; for (let k = 0; k <= N; k++) { const t = h.t - 6 * H + k * st; if (t > lim) break; const v = at(S, t); a.push(v ? r2((v / b - 1) * 100) : (a.length ? a[a.length - 1] : 0)); } return a; };
  const past = HACKS.filter((h) => !h.cur && h.t < ev.t).map((h) => ({ ...h, path: mk(h, Infinity), a24: chgAt(S, h.t, h.t + DAY) })).filter((h) => h.path && h.path.length > N);
  const cur = mk(ev, end); if (!cur || cur.length < B + 2) return null;
  return { v: 1, kind: 'hack', ev: { ...ev }, end, N, B, st, cur, past, nowChg: chgAt(S, ev.t, end) };
}
