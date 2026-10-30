#!/usr/bin/env node
// v233: Bitcoin の資金の追跡。mempool.space の無料 API(キー不要)で、最初の受取先から出ていく送金をたどる。
//   UTXO なので「入力にそのアドレスがある取引の、ほかのアドレスへの出力」を送金とみなす(お釣りは除く)。
//   結果は /track.html 用のまとめ(nodes・edges・残高)として /api/admin/track に case = <事案>btc で置く。
// 使い方: node tools/chain-btc.mjs --case binance2026 [--depth 8] [--max 150] [--min 1]
import fs from 'node:fs';
import path from 'node:path';
import { CASES } from './chain/cases.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CASE = arg('case', 'binance2026'), DEPTH = +arg('depth', 8), MAX = +arg('max', 150), MINBTC = +arg('min', 1);
const C = CASES[CASE]; if (!C || !C.btcRoot) { console.log('[btc] Bitcoin の起点が無い事案:', CASE); process.exit(0); }
const API = 'https://mempool.space/api', SAT = 1e8, t0 = C.t0, now = Date.now();
let last = 0, calls = 0;
async function get(p, tries = 4) {
  for (let k = 0; k < tries; k++) {
    const w = last + 350 - Date.now(); if (w > 0) await new Promise((r) => setTimeout(r, w)); last = Date.now(); calls++;
    try { const r = await fetch(API + p, { signal: AbortSignal.timeout(30000) }); if (r.status === 429) { await new Promise((r2) => setTimeout(r2, 3000 * (k + 1))); continue; } if (!r.ok) throw new Error(r.status + ' ' + p); return await r.json(); }
    catch (e) { if (k === tries - 1) throw e; await new Promise((r2) => setTimeout(r2, 1500 * (k + 1))); }
  }
}
async function txsOf(a) {   // 発生の10分前より新しい取引(確定済み)。25件ずつさかのぼる
  const out = []; let lastId = null;
  for (let page = 0; page < 20; page++) {
    const arr = await get(`/address/${a}/txs` + (lastId ? `/chain/${lastId}` : '')); if (!Array.isArray(arr) || !arr.length) break;
    let old = false; for (const tx of arr) { const bt = tx.status && tx.status.block_time ? tx.status.block_time * 1000 : now; if (bt < t0 - 600000) { old = true; continue; } out.push(tx); }
    const conf = arr.filter((x) => x.status && x.status.confirmed); if (old || conf.length < 25) break; lastId = conf[conf.length - 1].txid;
  }
  return out;
}
const nodes = new Map(), edges = [];
const node = (a, d) => { if (!nodes.has(a)) nodes.set(a, { a, d, done: false }); return nodes.get(a); };
node(C.btcRoot, 0);
for (let d = 0; d <= DEPTH; d++) {
  for (const N of [...nodes.values()].filter((x) => x.d === d && !x.done)) {
    if ([...nodes.values()].filter((x) => x.done).length >= MAX) break;
    N.done = true;
    for (const tx of await txsOf(N.a)) {
      const ins = new Set((tx.vin || []).map((v) => v.prevout && v.prevout.scriptpubkey_address).filter(Boolean)); if (!ins.has(N.a)) continue;
      const t = tx.status && tx.status.block_time ? tx.status.block_time * 1000 : now;
      for (const o of tx.vout || []) { const to = o.scriptpubkey_address; if (!to || ins.has(to) || o.value / SAT < MINBTC) continue;
        edges.push({ f: N.a, to, asset: 'BTC', amt: o.value / SAT, n: 1, t, tx: tx.txid }); if (d < DEPTH) node(to, d + 1); }
    }
  }
  console.log(`[btc] 段 ${d}: アドレス ${nodes.size} / 送金 ${edges.length} / API ${calls}回`);
}
// 同じ送り元・送り先をまとめる
const eg = new Map(); for (const e of edges) { const k = e.f + '|' + e.to; const o = eg.get(k) || { ...e, amt: 0, n: 0 }; o.amt += e.amt; o.n++; o.t = Math.min(o.t, e.t); eg.set(k, o); }
const E2 = [...eg.values()].sort((x, y) => x.t - y.t);
// 今の残高(送金先と起点)
const status = [];
for (const N of [...nodes.values()].slice(0, 80)) { try { const s = await get(`/address/${N.a}`); const cs = s.chain_stats || {}, ms = s.mempool_stats || {}; status.push({ a: N.a, depth: N.d, at: now, ETH: ((cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0) + (ms.funded_txo_sum || 0) - (ms.spent_txo_sum || 0)) / SAT }); } catch (_) {} }
const outs = new Set(E2.map((e) => e.f)), bal = new Map(status.map((r) => [r.a, r.ETH]));
const nd = [...nodes.values()].filter((N) => N.a === C.btcRoot || E2.some((e) => e.to === N.a)).map((N) => ({ a: N.a, c: false, st: N.a === C.btcRoot ? 'root' : outs.has(N.a) ? 'moved' : (bal.get(N.a) || 0) > 0 ? 'held' : 'untracked', sw: null }));
const held = status.filter((r) => r.depth > 0 && !outs.has(r.a)).reduce((s2, r) => s2 + (r.ETH || 0), 0);
const big = E2.filter((e) => e.amt >= 100).map((e) => ({ t: e.t, kind: 'move', from: e.f, to: e.to, asset: 'BTC', amt: e.amt, n: e.n }));
const track = { v: 3, case: CASE + 'btc', chain: 0, chainName: 'Bitcoin', nat: 'BTC', roots: [C.btcRoot], t0, asof: now, nodes: nd, edges: E2.map(({ tx, ...e }) => e), status, events: big, hourly: [], heldBtc: held };
const dir = path.join(process.cwd(), 'x_out'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `track-${CASE}btc.json`), JSON.stringify(track));
console.log(`[btc] 送金先 ${nd.length - 1} / まとめた送金 ${E2.length} / 動いていない残高 ${held.toFixed(2)} BTC / API ${calls}回`);
if (process.env.RX_ADMIN_KEY) {
  const SITE = (process.env.SITE_URL || 'https://crypto-schedule.signalarchive.workers.dev').replace(/\/+$/, '');
  const r = await fetch(SITE + '/api/admin/track', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.RX_ADMIN_KEY }, body: JSON.stringify(track) });
  console.log('[btc] /track.html 用のまとめを置きました', r.status);
}
