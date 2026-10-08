// 清算の閾値(LIQ_TH)を、実測から決めるための確認用スクリプト(見るだけ。何も書き込まない)
// 使い方: node tools/liq_th.mjs https://あなたのサイト   (SITE 環境変数でも可)
// 判定(worker.js の detect)と同じく「直近1時間のロング or ショートの大きい方」を5分ごとに計算し、その分布を出す。
const SITE = (process.argv[2] || process.env.SITE || '').replace(/\/$/, '');
if (!SITE) { console.log('サイトのURLを渡してください: node tools/liq_th.mjs https://example.com'); process.exit(1); }
const COINS = ['BTC', 'ETH', 'SOL', 'BNB'], STEP = 300000, WIN = 12;   // 5分 × 12 = 1時間
const fmt = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(Math.round(v));
const nice = (v) => { if (v < 1e6) return Math.round(v / 1e5) * 1e5; return Math.round(v / 1e6) * 1e6; };   // 丸め(1M単位)
const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
let th = {}, since = null;
console.log('銘柄  | 時間  | 中央値 | p90   | p99   | 最大  | 今の閾値 | 超えた回数 | 提案(p99)');
for (const c of COINS) {
  const j = await (await fetch(`${SITE}/api/liq?sym=${c}&step=300`, { signal: AbortSignal.timeout(30000) })).json();
  if (j.th) th = j.th; if (j.since && (!since || j.since > since)) since = j.since;
  const m = new Map((j.buckets || []).map((b) => [b[0], b]));
  const t0 = j.since ? Math.ceil(j.since / STEP) * STEP : null, t1 = Math.floor(Date.now() / STEP) * STEP;
  if (!t0 || t1 - t0 < WIN * STEP) { console.log(`${c}    | 記録がまだ1時間分ありません`); continue; }
  const v = [];
  for (let t = t0 + (WIN - 1) * STEP; t <= t1; t += STEP) {
    let l = 0, s = 0; for (let k = 0; k < WIN; k++) { const b = m.get(t - k * STEP); if (b) { l += b[1]; s += b[2]; } }
    v.push(Math.max(l, s));
  }
  const sorted = [...v].sort((a, b) => a - b), cur = (th[c] || 0);
  // 「超えた回数」は連続した超過を1回と数える(= 事象の数に近い)
  let n = 0, was = false; for (const x of v) { const on = x >= cur; if (on && !was) n++; was = on; }
  const hrs = ((t1 - t0) / 36e5).toFixed(0);
  console.log(`${c.padEnd(5)} | ${String(hrs).padStart(4)}h | ${fmt(pct(sorted, 0.5)).padStart(6)} | ${fmt(pct(sorted, 0.9)).padStart(5)} | ${fmt(pct(sorted, 0.99)).padStart(5)} | ${fmt(sorted[sorted.length - 1]).padStart(5)} | ${fmt(cur).padStart(8)} | ${String(n).padStart(10)} | ${fmt(nice(pct(sorted, 0.99)))}`);
}
const days = since ? (Date.now() - since) / 864e5 : 0;
console.log(`\n記録の長さ: ${days.toFixed(1)}日。${days < 3 ? '3日未満なので、まだ決めないでください(平穏な期間だけだと閾値が低く出ます)。' : '目安: 週に数回(1日5本の上限以内)になるよう、p99付近から調整。'}`);
console.log('見直す場所: worker.js の LIQ_TH(閾値)。終わりの条件は閾値の半分(LIQ_QUIET)で自動で連動します。');
