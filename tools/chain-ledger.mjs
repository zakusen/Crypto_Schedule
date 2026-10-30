#!/usr/bin/env node
// v222: 資金の台帳を作る(第1段: 送金・交換。凍結・取引所ラベル・ブリッジは次の段)。
//   最初の受取先から、発生〜発生+hours の間の「出ていく送金」をたどる(大きい順・深さと件数に上限)。
//   同じ取引の中で、あるアドレスから資産Xが出て資産Yが入った時は「交換 X→Y」として記録する(DEX の名前は判定しない)。
//   出力: x_out/chain-<case>.json(台帳・アドレス・1時間ごとの集計)と chain-<case>.md(人が読む要約)。
// 使い方: node tools/chain-ledger.mjs --case bybit2025 --hours 24 [--depth 5] [--max 250]
import fs from 'node:fs';
import path from 'node:path';
import { CASES, TOKENS, ETH_MIN, GAS_MAX, CHAIN, STABLES } from './chain/cases.mjs';
import { blockAt, txlist, txinternal, tokentx, isContract, callCount, contractName, tokenBalance, ethBalance, isFrozen } from './chain/etherscan.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CASE = arg('case', 'bybit2025'), HOURS = +arg('hours', 24), DEPTH = +arg('depth', 5), MAX = +arg('max', 500), DRAFT = arg('draft', '0') === '1';   // v230: draft = /posts.html に下書きを置く(手で動かした時だけ)
const C0 = CASES[CASE]; if (!C0) { console.log('[chain] 事案が無い:', CASE); process.exit(1); }
// v232: --chain = 調べるチェーン(既定 = 事案のチェーン)。--seeds = 起点(カンマ区切り。既定 = 最初の受取先)
const CH = +arg('chain', C0.chainid), CI = CHAIN[CH] || CHAIN[1], NAT = CI.nat;
const SEEDS = String(arg('seeds', '') || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^0x[0-9a-f]{40}$/.test(x));
const C = { ...C0, chainid: CH, root: CH === C0.chainid ? C0.root : (SEEDS[0] || C0.root) };
const ROOTS = [...new Set([C.root, ...SEEDS])];
const KEY2 = CASE + (CH === C0.chainid ? '' : 'c' + CH);   // サイトに置く名前(Ethereum 以外は binance2026c42161 など)
// トークン: Ethereum は TOKENS。ほかのチェーンは USDT・USDC。どちらも「起点に資金を送った相手から受け取ったトークン」を自動で足す(偽トークン・スパムは起点に送ってくる相手が違う)
const TK = CH === 1 ? { ...TOKENS } : Object.fromEntries((STABLES[CH] || []).map((a, i) => a && [a, [i ? 'USDC' : 'USDT', 10000]]).filter(Boolean));
const SRC = new Set(), DYNBIG = {};
// v234: 自動で足したトークンのうち、先までたどるのは大口になりやすいもの(ステーブル・金・ステーキングETH)だけ。ほかは「最初の受取先から出た送金」を記録するだけで追わない(全部たどると数千アドレスに広がるため)
const FOLLOW = /^(RLUSD|USD1|USDS|PYUSD|wBETH|PAXG|XAUt|WLFI)$/;
const H = 3600000, t0 = C.t0, t1 = Math.min(Date.now(), t0 + HOURS * H), lc = (a) => String(a || '').toLowerCase();
const sb = await blockAt(C.chainid, Math.floor(t0 / 1000) - 600, 'before'), eb = await blockAt(C.chainid, Math.floor(t1 / 1000), 'before');
console.log(`[chain] ${CASE} 発生 ${new Date(t0).toISOString()} 〜 ${new Date(t1).toISOString()} / ブロック ${sb}〜${eb}`);

const amt = (v, dec) => Number(BigInt(v || '0')) / 10 ** dec;
const MIN = (asset) => asset === NAT ? (CH === 1 ? ETH_MIN : CI.natMin) : (Object.values(TK).find((x) => x[0] === asset) || [0, Infinity])[1];
const gas = [];   // v225: ガス代の補充(0.01〜5 ETH を新しいアドレスへ)
const addrs = new Map();   // address → {depth, first, parent, contract, inflow{}, outflow{}, done}
const events = [];         // {t, hash, from, to, asset, amt, kind}
const seenEv = new Set();
const node = (a, depth, first, parent) => { a = lc(a); if (!addrs.has(a)) addrs.set(a, { a, depth, first, parent, inflow: {}, outflow: {}, contract: null, done: false }); return addrs.get(a); };
for (const r of ROOTS) node(r, 0, t0, null);

async function moves(a) {   // a に出入りした送金(発生〜終わりの間)
  const [n, i, t] = await Promise.all([txlist(C.chainid, a, sb, eb), txinternal(C.chainid, a, sb, eb), tokentx(C.chainid, a, sb, eb)]);
  const out = [];
  for (const x of n) if (x.isError !== '1' && x.value !== '0') out.push({ t: +x.timeStamp * 1000, hash: x.hash, from: lc(x.from), to: lc(x.to), asset: NAT, amt: amt(x.value, 18), id: x.hash + ':n' });
  for (const x of i) if (x.isError !== '1' && x.value !== '0') out.push({ t: +x.timeStamp * 1000, hash: x.hash, from: lc(x.from), to: lc(x.to), asset: NAT, amt: amt(x.value, 18), id: x.hash + ':i:' + (x.traceId || x.from + x.to + x.value) });
  // v225: トークンは本物の契約アドレスだけ
  // v232: 起点(深さ0)が受け取った送金の送り主を「資金の出どころ」とし、そこから受け取ったトークンは本物とみなして追う(最小の量 = 受け取った量の1%)
  if (ROOTS.includes(lc(a))) {
    for (const x of [...n, ...i]) if (lc(x.to) === lc(a) && x.value !== '0' && amt(x.value, 18) >= MIN(NAT)) SRC.add(lc(x.from));
    for (const x of t) if (lc(x.to) === lc(a) && TK[lc(x.contractAddress)]) SRC.add(lc(x.from));
    const got = new Map(); for (const x of t) if (lc(x.to) === lc(a) && SRC.has(lc(x.from)) && !TK[lc(x.contractAddress)] && x.tokenSymbol && /^[A-Za-z0-9.$-]{1,12}$/.test(x.tokenSymbol)) { const k = lc(x.contractAddress); got.set(k, [x.tokenSymbol, (got.get(k) || [0, 0])[1] + amt(x.value, +x.tokenDecimal)]); }
    for (const [k, [sym, v]] of got) { const s3 = Object.values(TK).some((q) => q[0] === sym) ? sym + '*' : sym; TK[k] = [s3, FOLLOW.test(sym) ? v / 20 : Infinity]; DYNBIG[s3] = v / 20; console.log('[chain] 出どころから受け取ったトークンを追加:', sym, k); }
  }
  for (const x of t) { const tk = TK[lc(x.contractAddress)]; if (!tk) continue; const s = tk[0]; out.push({ t: +x.timeStamp * 1000, hash: x.hash, from: lc(x.from), to: lc(x.to), asset: s, amt: amt(x.value, +x.tokenDecimal), id: x.hash + ':t:' + (x.logIndex || x.from + x.to + x.value) }); }
  return out.filter((m) => m.t >= t0 - 600000 && m.t <= t1);
}

// 幅優先でたどる(深さが浅い順・同じ深さでは受け取った量が多い順)
for (let d = 0; d <= DEPTH; d++) {
  const layer = [...addrs.values()].filter((x) => x.depth === d && !x.done).sort((x, y) => (y.big || 0) - (x.big || 0));
  for (const A of layer) {
    if ([...addrs.values()].filter((x) => x.done).length >= MAX) break;
    A.done = true;
    if (A.contract == null) A.contract = d === 0 ? false : await isContract(C.chainid, A.a);
    if (A.contract) { A.cname = await contractName(C.chainid, A.a); continue; }   // コントラクト(DEX・ブリッジなど)の中はたどらない。v225: 名前(検証済みなら)
    const ms = await moves(A.a);
    const byHash = new Map();
    for (const m of ms) {
      if (m.from !== A.a && m.to !== A.a) continue;
      if (!seenEv.has(m.id)) { seenEv.add(m.id); events.push({ ...m, kind: 'transfer' }); }
      const fromTracked = addrs.has(m.from) && !(addrs.get(m.from).contract);   // v225: 追跡しているアドレスから来た分だけを inflow に数える
      if (m.from === A.a) A.outflow[m.asset] = (A.outflow[m.asset] || 0) + m.amt; else if (fromTracked || d === 0) A.inflow[m.asset] = (A.inflow[m.asset] || 0) + m.amt;
      const h = byHash.get(m.hash) || { out: [], in: [] }; (m.from === A.a ? h.out : h.in).push(m); byHash.set(m.hash, h);
      if (m.from === A.a && m.asset === NAT && m.amt >= (CH === 1 ? 0.01 : CI.gas[0]) && m.amt < (CH === 1 ? GAS_MAX : CI.gas[1]) && !addrs.has(m.to)) gas.push({ t: m.t, from: A.a, to: m.to, amt: m.amt, hash: m.hash });   // ガス代の補充(追わない)
      if (m.from === A.a && m.amt >= MIN(m.asset) && d < DEPTH) { const B = node(m.to, d + 1, m.t, A.a); B.big = (B.big || 0) + m.amt; }
    }
    for (const [hash, h] of byHash) {   // 同じ取引で出た資産と入った資産が違う = 交換
      const o = h.out.filter((m) => !h.in.some((x) => x.asset === m.asset)), i = h.in.filter((m) => !h.out.some((x) => x.asset === m.asset));
      if (o.length && i.length) { events.push({ t: o[0].t, hash, from: A.a, to: A.a, kind: 'swap', in: o.map((m) => [m.asset, m.amt]), out: i.map((m) => [m.asset, m.amt]) }); for (const m of i) if (!(addrs.has(m.from) && !addrs.get(m.from).contract)) A.inflow[m.asset] = (A.inflow[m.asset] || 0) + m.amt; }   // v225: 交換で受け取った分も追跡している資金に数える
    }
    if (callCount() % 40 === 0) console.log(`[chain] 調べたアドレス ${[...addrs.values()].filter((x) => x.done).length} / 見つけた ${addrs.size} / API ${callCount()}回`);
  }
}

// 1時間ごとの集計(発生 = 0時間)
const hrs = Math.ceil((t1 - t0) / H), hourly = Array.from({ length: hrs + 1 }, (_, h) => ({ h, newAddr: 0, sends: 0, swaps: 0, toContract: 0, assets: {} }));
const hOf = (t) => Math.max(0, Math.min(hrs, Math.floor((t - t0) / H)));
for (const A of addrs.values()) if (A.depth > 0) { hourly[hOf(A.first)].newAddr++; if (A.contract) hourly[hOf(A.first)].toContract++; }
for (const e of events) { const b = hourly[hOf(e.t)]; if (e.kind === 'swap') b.swaps++; else if (addrs.has(e.from) && !addrs.get(e.from).contract && e.from !== e.to && e.amt >= MIN(e.asset)) { b.sends++; b.assets[e.asset] = (b.assets[e.asset] || 0) + e.amt; } }   // v225: 追跡しているアドレスからの送金だけ
for (const x of gas) { hourly[hOf(x.t)].gas = (hourly[hOf(x.t)].gas || 0) + 1; }
// v225: 今時点の残高と凍結の状態(最初の受取先と、ステーブルコインを受け取ったアドレス)
const [USDT, USDC] = CH === 1 ? ['0xdac17f958d2ee523a2206206994597c13d831ec7', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'] : (STABLES[CH] || [null, null]), SDEC = CH === 56 ? 18 : 6, now = Date.now(), status = [];
const active = (A) => events.some((e) => e.from === A.a || e.to === A.a);   // v232: 動きのあった起点だけ
for (const A of [...addrs.values()].filter((x) => !x.contract && ((x.depth === 0 && active(x)) || x.inflow.USDT || x.inflow.USDC)).slice(0, 40)) {
  const row = { a: A.a, depth: A.depth, at: now };
  for (const [tk, s2, dec] of [[USDT, 'USDT', SDEC], [USDC, 'USDC', SDEC]]) { if (!tk || (A.depth && !A.inflow[s2])) continue; const b = await tokenBalance(C.chainid, tk, A.a); row[s2] = b == null ? null : amt(b, dec); row[s2 + 'Frozen'] = await isFrozen(C.chainid, tk, A.a); }
  if (A.depth === 0) { const b = await ethBalance(C.chainid, A.a); row.ETH = b == null ? null : amt(b, 18); }
  status.push(row);
}
// v230: ETH を受け取って出していないアドレス(保有)の、今の ETH 残高
for (const A of [...addrs.values()].filter((x) => x.depth > 0 && !x.contract && x.done && !Object.keys(x.outflow).length && (x.inflow[NAT] || 0) >= MIN(NAT) * 200).slice(0, 20)) {
  const b = await ethBalance(C.chainid, A.a); let row = status.find((r) => r.a === A.a); if (!row) { row = { a: A.a, depth: A.depth, at: now }; status.push(row); } row.ETH = b == null ? null : amt(b, 18);
}

// 葉(これ以上たどっていない所)の状態
const leaves = [...addrs.values()].filter((A) => A.depth > 0 && (A.contract || !A.done || A.depth === DEPTH || !Object.keys(A.outflow).length)).map((A) => ({
  a: A.a, depth: A.depth, first: A.first, parent: A.parent, status: A.contract ? 'contract' : !A.done ? 'untracked' : !Object.keys(A.outflow).length ? 'held' : 'depth-limit',
  inflow: A.inflow, outflow: A.outflow, got: A.big || 0,
}));

const out = { v: 2, case: CASE, t0, t1, sb, eb, root: C.root, depth: DEPTH, max: MAX, api: callCount(), addrs: [...addrs.values()].map(({ done, ...x }) => x), events, hourly, leaves, gas, status };
const dir = path.join(process.cwd(), 'x_out'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `chain-${KEY2}.json`), JSON.stringify(out));
const f = (v) => v >= 1000 ? Math.round(v).toLocaleString('en-US') : (+v.toFixed(3)).toString();
const md = [`# ${C.ja}（${CI.name}）：発生から${HOURS}時間の台帳(第1段)`, '', `- 発生: ${new Date(t0).toISOString()} / 終わり: ${new Date(t1).toISOString()} / ブロック ${sb}〜${eb}`, `- たどったアドレス ${[...addrs.values()].filter((x) => x.done).length} / 見つけたアドレス ${addrs.size} / 送金 ${events.filter((e) => e.kind === 'transfer').length}件 / 交換 ${events.filter((e) => e.kind === 'swap').length}件 / API ${callCount()}回`, '',
  '## 1時間ごと', '| 時間 | 新しい送金先 | 送金 | 交換 | コントラクトへ | ガス代の補充 | 主な資産 |', '|---|---|---|---|---|---|---|',
  ...hourly.map((b) => `| ${b.h}〜${b.h + 1}h | ${b.newAddr} | ${b.sends} | ${b.swaps} | ${b.toContract} | ${b.gas || 0} | ${Object.entries(b.assets).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${f(v)}`).join(', ')} |`),
  '', '## 交換(先頭30件)', ...events.filter((e) => e.kind === 'swap').slice(0, 30).map((e) => `- +${((e.t - t0) / H).toFixed(1)}h ${e.from.slice(0, 10)}… ${e.in.map(([a, v]) => f(v) + ' ' + a).join('+')} → ${e.out.map(([a, v]) => f(v) + ' ' + a).join('+')} (${e.hash.slice(0, 12)}…)`),
  '', '## 最初の受取先から直接出た送金(大きい順20件)', ...events.filter((e) => e.kind === 'transfer' && e.from === lc(C.root)).sort((x, y) => y.amt - x.amt).slice(0, 20).map((e) => `- +${((e.t - t0) / H).toFixed(1)}h → ${e.to} ${f(e.amt)} ${e.asset}`),
  '', '## 葉の状態', ...['held', 'contract', 'depth-limit', 'untracked'].map((s) => `- ${s}: ${leaves.filter((l) => l.status === s).length}`),
  '', '## コントラクト(受け取った量が多い順・名前は Etherscan で検証済みのもの)', ...[...addrs.values()].filter((A) => A.contract).map((A) => ({ A, got: events.filter((e) => e.kind === 'transfer' && e.to === A.a && addrs.has(e.from) && !addrs.get(e.from).contract).reduce((o, e) => { o[e.asset] = (o[e.asset] || 0) + e.amt; return o; }, {}) })).filter((x) => Object.keys(x.got).length).sort((x, y) => Math.max(...Object.values(y.got)) - Math.max(...Object.values(x.got))).slice(0, 25).map(({ A, got }) => `- ${A.a} ${A.cname || '(名前なし)'} ← ${Object.entries(got).map(([k, v]) => f(v) + ' ' + k).join(', ')}`),
  '', `## 今時点の残高と凍結(${new Date(now).toISOString()})`, ...status.map((r) => `- ${r.a}${r.depth === 0 ? '(最初の受取先)' : ''}: ${['ETH', 'USDT', 'USDC'].filter((k) => r[k] != null).map((k) => `${k} ${f(r[k])}${r[k + 'Frozen'] === true ? '(凍結中)' : r[k + 'Frozen'] === false ? '' : ''}`).join(' / ')}`),
  '', `## ガス代の補充(0.01〜${GAS_MAX} ETH・追跡はしない): ${gas.length}件`].join('\n');
fs.writeFileSync(path.join(dir, `chain-${KEY2}.md`), md + '\n');
// v230: サイトの /track.html 用のまとめ(1時間ごとの集計・大きな動き・今の残高と凍結)を置く。RX_ADMIN_KEY がある時だけ
const BIG = { ETH: 1000, WETH: 1000, stETH: 1000, wstETH: 1000, mETH: 1000, cmETH: 1000, rETH: 1000, USDT: 5e6, USDC: 5e6, DAI: 5e6, USDe: 5e6, FDUSD: 5e6, WBTC: 50, cbBTC: 50 };
const tracked = (a) => addrs.has(a) && !addrs.get(a).contract;
const BG = (k) => BIG[k] || DYNBIG[k] || (k === NAT ? MIN(NAT) * 200 : 0);   // v232: 追加のトークン・ほかのチェーンの通貨の「大きな動き」の目安
const mv = new Map(), sw2 = new Map();
for (const e of events) {
  const hb = Math.floor((e.t - t0) / H);
  if (e.kind === 'swap') { const k = hb + '|' + e.from; const o = sw2.get(k) || { t: e.t, kind: 'swap', a: e.from, n: 0, in: {}, out: {} }; o.n++; for (const [a, v] of e.in) o.in[a] = (o.in[a] || 0) + v; for (const [a, v] of e.out) o.out[a] = (o.out[a] || 0) + v; sw2.set(k, o); continue; }
  if (!tracked(e.from) || e.from === e.to || !BG(e.asset)) continue;
  const k = hb + '|' + e.from + '|' + e.to + '|' + e.asset; const o = mv.get(k) || { t: e.t, kind: 'move', from: e.from, to: e.to, asset: e.asset, amt: 0, n: 0 }; o.amt += e.amt; o.n++; mv.set(k, o);
}
const bigEv = [...[...mv.values()].filter((o) => o.amt >= BG(o.asset)), ...[...sw2.values()].filter((o) => Object.entries(o.in).some(([a, v]) => BG(a) && v >= BG(a) / 5) || o.n >= 20)].sort((x, y) => x.t - y.t).slice(-80);
// v231: サイトの動的な図のための送金のつながり(追跡しているアドレスから出た分を、送り元・送り先・資産ごとに合計)と、アドレスごとの交換の合計
const eg = new Map(), swn = new Map();
for (const e of events) {
  if (e.kind === 'swap') { const o = swn.get(e.from) || { n: 0, in: {}, out: {}, t: e.t }; o.n++; for (const [k, v] of e.in) o.in[k] = (o.in[k] || 0) + v; for (const [k, v] of e.out) o.out[k] = (o.out[k] || 0) + v; swn.set(e.from, o); continue; }
  if (!tracked(e.from) || e.from === e.to || !BG(e.asset) || e.amt < BG(e.asset) / 50) continue;
  const k = e.from + '|' + e.to + '|' + e.asset; const o = eg.get(k) || { f: e.from, to: e.to, asset: e.asset, amt: 0, n: 0, t: e.t }; o.amt += e.amt; o.n++; eg.set(k, o);
}
const edges = [...eg.values()].filter((o) => o.amt >= BG(o.asset) / 5).sort((x, y) => x.t - y.t).slice(0, 200);
const leafSt = new Map(leaves.map((l) => [l.a, l.status]));
const nodes = [...new Set(edges.flatMap((o) => [o.f, o.to]).concat(CH === C0.chainid ? [C.root] : []))].map((a) => { const A = addrs.get(a); return { a, c: !!(A && A.contract), st: ROOTS.includes(a) ? 'root' : leafSt.get(a) || (A && A.done ? 'moved' : 'untracked'), sw: swn.get(a) || null }; });
const track = { v: 3, case: KEY2, chain: CH, chainName: CI.name, nat: NAT, roots: ROOTS.filter((r) => events.some((e) => e.from === r || e.to === r)), t0, t1, asof: now, root: C.root, nodes, edges, hourly: hourly.map(({ h, newAddr, sends, swaps }) => ({ h, newAddr, sends, swaps })), events: bigEv, status, held: leaves.filter((l) => l.status === 'held').map((l) => ({ a: l.a, got: l.inflow })) };
if (process.env.RX_ADMIN_KEY) {
  const SITE0 = (process.env.SITE_URL || 'https://crypto-schedule.signalarchive.workers.dev').replace(/\/+$/, '');
  const r = await fetch(SITE0 + '/api/admin/track', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.RX_ADMIN_KEY }, body: JSON.stringify(track) });   // case = KEY2
  console.log('[chain] /track.html 用のまとめを置きました', r.status, '大きな動き', bigEv.length, '件');
}
fs.writeFileSync(path.join(dir, `track-${KEY2}.json`), JSON.stringify(track));
// v232: ほかのチェーンを探す起点(ガス代の補充の送り先・最初の受取先・事案の seeds)
if (CH === C0.chainid) fs.writeFileSync(path.join(dir, `seeds-${CASE}.txt`), [...new Set([C.root, ...(C0.seeds || []), ...gas.map((g) => g.to)])].join(','));

// v223: /posts.html に手動投稿の下書きを置く(自動投稿しない)。RX_ADMIN_KEY があって --draft 1 の時だけ(v230)
if (process.env.RX_ADMIN_KEY && DRAFT) {
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
