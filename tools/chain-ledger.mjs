#!/usr/bin/env node
// v222: 資金の台帳を作る(第1段: 送金・交換。凍結・取引所ラベル・ブリッジは次の段)。
//   最初の受取先から、発生〜発生+hours の間の「出ていく送金」をたどる(大きい順・深さと件数に上限)。
//   同じ取引の中で、あるアドレスから資産Xが出て資産Yが入った時は「交換 X→Y」として記録する(DEX の名前は判定しない)。
//   出力: x_out/chain-<case>.json(台帳・アドレス・1時間ごとの集計)と chain-<case>.md(人が読む要約)。
// 使い方: node tools/chain-ledger.mjs --case bybit2025 --hours 24 [--depth 5] [--max 250]
import fs from 'node:fs';
import path from 'node:path';
import { CASES, ASSETS } from './chain/cases.mjs';
import { blockAt, txlist, txinternal, tokentx, isContract, callCount } from './chain/etherscan.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CASE = arg('case', 'bybit2025'), HOURS = +arg('hours', 24), DEPTH = +arg('depth', 5), MAX = +arg('max', 250);
const C = CASES[CASE]; if (!C) { console.log('[chain] 事案が無い:', CASE); process.exit(1); }
const H = 3600000, t0 = C.t0, t1 = Math.min(Date.now(), t0 + HOURS * H), lc = (a) => String(a || '').toLowerCase();
const sb = await blockAt(C.chainid, Math.floor(t0 / 1000) - 600, 'before'), eb = await blockAt(C.chainid, Math.floor(t1 / 1000), 'before');
console.log(`[chain] ${CASE} 発生 ${new Date(t0).toISOString()} 〜 ${new Date(t1).toISOString()} / ブロック ${sb}〜${eb}`);

const amt = (v, dec) => Number(BigInt(v || '0')) / 10 ** dec;
const sym = (s) => { const k = Object.keys(ASSETS).find((a) => a.toLowerCase() === String(s || '').toLowerCase()); return k || null; };
const addrs = new Map();   // address → {depth, first, parent, contract, inflow{}, outflow{}, done}
const events = [];         // {t, hash, from, to, asset, amt, kind}
const seenEv = new Set();
const node = (a, depth, first, parent) => { a = lc(a); if (!addrs.has(a)) addrs.set(a, { a, depth, first, parent, inflow: {}, outflow: {}, contract: null, done: false }); return addrs.get(a); };
node(C.root, 0, t0, null);

async function moves(a) {   // a に出入りした送金(発生〜終わりの間)
  const [n, i, t] = await Promise.all([txlist(C.chainid, a, sb, eb), txinternal(C.chainid, a, sb, eb), tokentx(C.chainid, a, sb, eb)]);
  const out = [];
  for (const x of n) if (x.isError !== '1' && x.value !== '0') out.push({ t: +x.timeStamp * 1000, hash: x.hash, from: lc(x.from), to: lc(x.to), asset: 'ETH', amt: amt(x.value, 18), id: x.hash + ':n' });
  for (const x of i) if (x.isError !== '1' && x.value !== '0') out.push({ t: +x.timeStamp * 1000, hash: x.hash, from: lc(x.from), to: lc(x.to), asset: 'ETH', amt: amt(x.value, 18), id: x.hash + ':i:' + (x.traceId || x.from + x.to + x.value) });
  for (const x of t) { const s = sym(x.tokenSymbol); if (!s) continue; out.push({ t: +x.timeStamp * 1000, hash: x.hash, from: lc(x.from), to: lc(x.to), asset: s, amt: amt(x.value, +x.tokenDecimal), id: x.hash + ':t:' + (x.logIndex || x.from + x.to + x.value) }); }
  return out.filter((m) => m.t >= t0 - 600000 && m.t <= t1);
}

// 幅優先でたどる(深さが浅い順・同じ深さでは受け取った量が多い順)
for (let d = 0; d <= DEPTH; d++) {
  const layer = [...addrs.values()].filter((x) => x.depth === d && !x.done).sort((x, y) => (y.big || 0) - (x.big || 0));
  for (const A of layer) {
    if ([...addrs.values()].filter((x) => x.done).length >= MAX) break;
    A.done = true;
    if (A.contract == null) A.contract = d === 0 ? false : await isContract(C.chainid, A.a);
    if (A.contract) continue;   // コントラクト(DEX・ブリッジなど)の中はたどらない
    const ms = await moves(A.a);
    const byHash = new Map();
    for (const m of ms) {
      if (m.from !== A.a && m.to !== A.a) continue;
      if (!seenEv.has(m.id)) { seenEv.add(m.id); events.push({ ...m, kind: 'transfer' }); }
      const side = m.from === A.a ? 'outflow' : 'inflow'; A[side][m.asset] = (A[side][m.asset] || 0) + m.amt;
      const h = byHash.get(m.hash) || { out: [], in: [] }; (m.from === A.a ? h.out : h.in).push(m); byHash.set(m.hash, h);
      if (m.from === A.a && m.amt >= (ASSETS[m.asset] || Infinity) && d < DEPTH) { const B = node(m.to, d + 1, m.t, A.a); B.big = (B.big || 0) + m.amt; }
    }
    for (const [hash, h] of byHash) {   // 同じ取引で出た資産と入った資産が違う = 交換
      const o = h.out.filter((m) => !h.in.some((x) => x.asset === m.asset)), i = h.in.filter((m) => !h.out.some((x) => x.asset === m.asset));
      if (o.length && i.length) events.push({ t: o[0].t, hash, from: A.a, to: A.a, kind: 'swap', in: o.map((m) => [m.asset, m.amt]), out: i.map((m) => [m.asset, m.amt]) });
    }
    if (callCount() % 40 === 0) console.log(`[chain] 調べたアドレス ${[...addrs.values()].filter((x) => x.done).length} / 見つけた ${addrs.size} / API ${callCount()}回`);
  }
}

// 1時間ごとの集計(発生 = 0時間)
const hrs = Math.ceil((t1 - t0) / H), hourly = Array.from({ length: hrs + 1 }, (_, h) => ({ h, newAddr: 0, sends: 0, swaps: 0, toContract: 0, assets: {} }));
const hOf = (t) => Math.max(0, Math.min(hrs, Math.floor((t - t0) / H)));
for (const A of addrs.values()) if (A.depth > 0) { hourly[hOf(A.first)].newAddr++; if (A.contract) hourly[hOf(A.first)].toContract++; }
for (const e of events) { const b = hourly[hOf(e.t)]; if (e.kind === 'swap') b.swaps++; else if (addrs.has(e.from) && e.from !== e.to) { b.sends++; b.assets[e.asset] = (b.assets[e.asset] || 0) + e.amt; } }

// 葉(これ以上たどっていない所)の状態
const leaves = [...addrs.values()].filter((A) => A.depth > 0 && (A.contract || !A.done || A.depth === DEPTH || !Object.keys(A.outflow).length)).map((A) => ({
  a: A.a, depth: A.depth, first: A.first, parent: A.parent, status: A.contract ? 'contract' : !A.done ? 'untracked' : !Object.keys(A.outflow).length ? 'held' : 'depth-limit',
  inflow: A.inflow, outflow: A.outflow, got: A.big || 0,
}));

const out = { v: 1, case: CASE, t0, t1, sb, eb, root: C.root, depth: DEPTH, max: MAX, api: callCount(), addrs: [...addrs.values()].map(({ done, ...x }) => x), events, hourly, leaves };
const dir = path.join(process.cwd(), 'x_out'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `chain-${CASE}.json`), JSON.stringify(out));
const f = (v) => v >= 1000 ? Math.round(v).toLocaleString('en-US') : (+v.toFixed(3)).toString();
const md = [`# ${C.ja}：発生から${HOURS}時間の台帳(第1段)`, '', `- 発生: ${new Date(t0).toISOString()} / 終わり: ${new Date(t1).toISOString()} / ブロック ${sb}〜${eb}`, `- たどったアドレス ${[...addrs.values()].filter((x) => x.done).length} / 見つけたアドレス ${addrs.size} / 送金 ${events.filter((e) => e.kind === 'transfer').length}件 / 交換 ${events.filter((e) => e.kind === 'swap').length}件 / API ${callCount()}回`, '',
  '## 1時間ごと', '| 時間 | 新しい送金先 | 送金 | 交換 | コントラクトへ | 主な資産 |', '|---|---|---|---|---|---|',
  ...hourly.map((b) => `| ${b.h}〜${b.h + 1}h | ${b.newAddr} | ${b.sends} | ${b.swaps} | ${b.toContract} | ${Object.entries(b.assets).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${f(v)}`).join(', ')} |`),
  '', '## 交換(先頭30件)', ...events.filter((e) => e.kind === 'swap').slice(0, 30).map((e) => `- +${((e.t - t0) / H).toFixed(1)}h ${e.from.slice(0, 10)}… ${e.in.map(([a, v]) => f(v) + ' ' + a).join('+')} → ${e.out.map(([a, v]) => f(v) + ' ' + a).join('+')} (${e.hash.slice(0, 12)}…)`),
  '', '## 最初の受取先から直接出た送金(大きい順20件)', ...events.filter((e) => e.kind === 'transfer' && e.from === lc(C.root)).sort((x, y) => y.amt - x.amt).slice(0, 20).map((e) => `- +${((e.t - t0) / H).toFixed(1)}h → ${e.to} ${f(e.amt)} ${e.asset}`),
  '', '## 葉の状態', ...['held', 'contract', 'depth-limit', 'untracked'].map((s) => `- ${s}: ${leaves.filter((l) => l.status === s).length}`)].join('\n');
fs.writeFileSync(path.join(dir, `chain-${CASE}.md`), md + '\n');
// v223: /posts.html に手動投稿の下書きを置く(自動投稿しない)。RX_ADMIN_KEY がある時だけ
if (process.env.RX_ADMIN_KEY) {
  const L = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'xpost-lib.js'))).toString('base64'));
  const sw = events.filter((e) => e.kind === 'swap').sort((x, y) => x.t - y.t)[0];
  const im = { case: CASE, ja: C.ja, en: C.en, confirmed: !!C.confirmed, t0, t1, hours: HOURS, root: C.root,
    totals: { sends: hourly.reduce((s, b) => s + b.sends, 0), swaps: hourly.reduce((s, b) => s + b.swaps, 0), newAddr: hourly.reduce((s, b) => s + b.newAddr, 0), toContract: hourly.reduce((s, b) => s + b.toContract, 0) },
    firstSwap: sw ? { h: Math.round((sw.t - t0) / H * 10) / 10, in: sw.in.map(([a, v]) => `${f(v)} ${a}`).join('+'), out: sw.out.map(([a, v]) => `${f(v)} ${a}`).join('+') } : null,
    hourly: hourly.map(({ h, newAddr, sends, swaps, toContract }) => ({ h, newAddr, sends, swaps, toContract })),
    leaves: { held: leaves.filter((l) => l.status === 'held').length, contract: leaves.filter((l) => l.status === 'contract').length, depthLimit: leaves.filter((l) => l.status === 'depth-limit').length, untracked: leaves.filter((l) => l.status === 'untracked').length } };
  const SITE = (process.env.SITE_URL || 'https://crypto-schedule.signalarchive.workers.dev').replace(/\/+$/, '');
  const r = await fetch(SITE + '/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.RX_ADMIN_KEY }, body: JSON.stringify({ upsert: [{ at: Date.now(), ...L.chainDraft(im, Date.now()) }] }) });
  console.log('[chain] /posts.html に下書きを置きました', r.status);
}
console.log(md.split('\n').slice(0, 12).join('\n'));
