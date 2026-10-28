// v204: BTC実況(今週のBTCがなぞっている過去の週 TOP3)。
//   今週(日本語 = 日本時間の月曜0時から / 英語 = UTC の月曜0時から)の BTC の道のり(30分ごと・週初を0%)と、
//   2017年以降の過去の週の「同じ時点まで」の道のりを比べ、相関係数が高い順に3つ。一致率 = 相関係数×100。
//   過去の週の残り(その後)は事実の記録。予測ではない。
// 投稿の番号(#1〜#14)は、毎朝(日本語 9:30 / 英語 11:30 UTC)と夜(日本語 22:00 / 英語 23:30 UTC)の決まった時刻から決める(保存しない)。
const M30 = 1800000, H = 3600000, DAY = 86400000, WEEK = 7 * DAY, PTS = 7 * 48;
export const SLOTS = { ja: [9.5 * H, 22 * H], en: [11.5 * H, 23.5 * H] };
export const wkStart = (t, off) => { const d = Math.floor((t + off) / DAY) * DAY - off; return d - ((new Date(d + off).getUTCDay() + 6) % 7) * DAY; };

function at(S, t) {   // t 以前で一番近い5分足の終値(30分以上あいていたら無し)
  let lo = 0, hi = S.t.length - 1; if (hi < 0 || S.t[0] > t) return null;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S.t[m] <= t) lo = m; else hi = m - 1; }
  return t - S.t[lo] <= M30 ? S.c[lo] : null;
}
function path(S, w, n) {
  const b = at(S, w); if (!b) return null;
  const a = []; let miss = 0, last = 0;
  for (let k = 0; k <= n; k++) { const v = at(S, w + k * M30); if (v == null) { miss++; a.push(last); } else { last = (v / b - 1) * 100; a.push(last); } }
  return miss > n * 0.05 ? null : a;
}
function pearson(a, b) {
  const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}
const rng = (a) => Math.max(...a) - Math.min(...a);
const r2 = (v) => Math.round(v * 100) / 100;

// S = loadBtc5m の結果 {t, c}。lang = 'ja' | 'en'。返り値 = 画像・カード用のデータ(足りなければ null)
export function weekMatch(S, now, lang = 'ja') {
  const off = lang === 'en' ? 0 : 9 * H, ws = wkStart(now, off), end = Math.min(now, S.t[S.t.length - 1] + 300000);
  const K = Math.floor((end - ws) / M30); if (K < 4) return null;
  const cur = path(S, ws, K); if (!cur) return null;
  const ra = rng(cur), cand = [];
  for (let w = ws - WEEK; w >= S.t[0]; w -= WEEK) {
    const p = path(S, w, PTS); if (!p) continue;
    const head = p.slice(0, K + 1), rb = rng(head);
    if (ra > 0.3 && (rb > ra * 2.5 || rb < ra / 2.5)) continue;   // 大きさが極端に違う週は外す
    cand.push({ w, r: pearson(cur, head), path: p });
  }
  cand.sort((a, b) => b.r - a.r);
  const top = cand.slice(0, 3).map((c) => ({ w: c.w, rate: Math.max(0, Math.round(c.r * 100)), path: c.path.map(r2) }));
  if (!top.length) return null;
  const marks = [];
  for (let d = 0; d < 7; d++) for (const s of SLOTS[lang]) { const t = ws + d * DAY + s; if (t <= now + 70 * 60000) marks.push({ n: marks.length + 1, t, k: Math.min(K, Math.max(0, Math.round((t - ws) / M30))) }); }
  return { v: 1, lang, ws, end, K, cur: cur.map(r2), top, marks, no: marks.length, n: cand.length };
}

export async function weekBoth(S, now) { return { at: now, ja: weekMatch(S, now, 'ja'), en: weekMatch(S, now, 'en') }; }

// 本文に足す1行
export function liveLine(lv, lang) {
  if (!lv || !lv.top || !lv.top.length) return '';
  const d = new Date(lv.top[0].w + (lang === 'en' ? 0 : 9 * H)), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return lang === 'en' ? `📡 This week's BTC is tracing the week of ${M[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} (match ${lv.top[0].rate}%)`
    : `📡 今週のBTCがなぞっている過去: ${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}〜の週（一致率${lv.top[0].rate}%）`;
}
