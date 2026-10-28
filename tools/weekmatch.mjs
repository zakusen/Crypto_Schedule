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
