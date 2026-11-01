#!/usr/bin/env node
// ショック比較の価格データ: Binance BTCUSDT の日足終値を、発生の15日前〜90日後まで取る(事案ごと)。
// 出力: x_out/shock.json  { events:[{id, d0, base, days:[{d, t, c, pct}]}] }   pct = 発生の前日の終値からの変化(%)
import fs from 'node:fs';
const EV = [
  { id: 'binance2019', d0: '2019-05-07' },   // Binance 2019(7,000 BTC・ハッキング・SAFUで補償)
  { id: 'luna2022', d0: '2022-05-09' },
  { id: 'ftx2022', d0: '2022-11-08' },   // FTX(取引所の破綻・ハッキングではない)
  { id: 'bybit2025', d0: '2025-02-21' },
  { id: 'binance2026', d0: '2026-10-29' },
];
const DAY = 864e5, PRE = 15, POST = 90;
async function kl(start, end) {
  for (const base of ['https://data-api.binance.vision', 'https://api.binance.com']) {
    try { const r = await fetch(`${base}/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${start}&endTime=${end}&limit=1000`); if (r.ok) return await r.json(); } catch (_) {}
  }
  throw new Error('取得できませんでした');
}
const out = [];
for (const e of EV) {
  const t0 = Date.parse(e.d0 + 'T00:00:00Z'), rows = await kl(t0 - (PRE + 1) * DAY, Math.min(Date.now(), t0 + POST * DAY));
  const by = new Map(rows.map((r) => [Math.round((r[0] - t0) / DAY), +r[4]]));
  const base = by.get(-1);
  const days = [...by.entries()].filter(([d]) => d >= -PRE && d <= POST).sort((a, b) => a[0] - b[0]).map(([d, c]) => ({ d, t: new Date(t0 + d * DAY).toISOString().slice(0, 10), c, pct: +((c / base - 1) * 100).toFixed(2) }));
  const rec = days.find((x) => x.d >= 0 && x.c >= base);
  out.push({ ...e, base, recover: rec ? rec.d : null, days });
  console.log(e.id, '前日終値', base, '日数', days.length, '回復', rec ? rec.d + '日目' : 'なし(90日以内)');
}
fs.mkdirSync('x_out', { recursive: true });
fs.writeFileSync('x_out/shock.json', JSON.stringify({ at: new Date().toISOString(), events: out }));
