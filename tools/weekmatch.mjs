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
export function fomcTs(day) {   // 米東部時間 14:00 → UTC ms(夏時間を見て 18:00 か 19:00 UTC)
  const [y, m, d] = day.split('-').map(Number), t = Date.UTC(y, m - 1, d, 18);
  const h = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(t));
  return h === 14 ? t : Date.UTC(y, m - 1, d, 19);
}
export const FOMC_TS = FOMC_DAYS.map(fomcTs);
const chgAt = (S, a, b) => { const x = at(S, a), y = at(S, b); return x && y ? r2((y / x - 1) * 100) : null; };
// 過去のFOMCの発表後1時間(新しい順)。E より前だけ
export function fomcHist(S, E, n = 6) { return FOMC_TS.filter((t) => t < E - 2 * H).reverse().map((t) => ({ t, chg: chgAt(S, t, t + H) })).filter((x) => x.chg != null).slice(0, n); }
// 今回(発表 E)の「発表24時間前〜選ぶ時点」と、過去の各FOMCの同じ区間を比べる(15分刻み・図は発表の4時間後まで)。
// sel = 選ぶのに使う最後の時刻(結果の投稿は「1時間前」と同じ選び方にするため E − 1時間を渡す)。発表後の動きは選ぶのに使わない
export function fomcMatch(S, now, E, lang = 'ja', sel = now) {
  const st = 15 * 60000, N = 112, ws = E - 24 * H, end = Math.min(now, S.t[S.t.length - 1] + 300000), se = Math.min(sel, end, E);
  const K = Math.min(N, Math.floor((end - ws) / st)), KS = Math.min(K, Math.floor((se - ws) / st)); if (KS < 4) return null;
  const cur = path(S, ws, K, st); if (!cur) return null;
  const cs = cur.slice(0, KS + 1), cand = [];
  for (const Ep of FOMC_TS) { if (Ep > E - 2 * DAY) continue; const p = path(S, Ep - 24 * H, N, st); if (!p) continue; cand.push({ Ep, r: pearson(cs, p.slice(0, KS + 1)), path: p }); }
  cand.sort((a, b) => b.r - a.r);
  const top = cand.slice(0, 3).map((c) => ({ w: c.Ep - 24 * H, day: c.Ep, fomc: c.Ep, a1: chgAt(S, c.Ep, c.Ep + H), rate: Math.max(0, Math.round(c.r * 100)), path: c.path.map(r2) }));
  if (!top.length) return null;
  return { v: 3, lang, ws, N, st, end, K, KS, E, cur: cur.map(r2), top, n: cand.length, fomc: 1, a1: end >= E + H ? chgAt(S, E, E + H) : null };
}
