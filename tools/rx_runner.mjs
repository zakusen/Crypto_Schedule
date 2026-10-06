#!/usr/bin/env node
// 過去の反応(EVENT IMPACT)の計算係。GitHub Actions(.github/workflows/rx_runner.yml)が1時間ごとに動かす。
//  1. サイトから 取り込み済みの記録(保存)・旧い予定(seed)・直近の予定(/api/cal) を読む
//  2. 重要度「高」の指標のうち、発表から25時間以上たち、まだ計算していないもの(指標×銘柄)を、Binanceの5分足で計算する
//  3. 指標ごとの小さな保存(rx:s:00〜63)・一覧(rx:idx)・実行結果(rx:run)をサイトへ書き戻す
// 指標名(jaLabel)・保存先(rxBucket)・計算(rxCalc)は、Worker(worker.js)と同じコードをそのまま使う(食い違いを防ぐため)。
// 必要: 環境変数 RX_ADMIN_KEY(Worker の RX_ADMIN_KEY。無ければ AUTH_SECRET と同じ値)。SITE_URL は省略可。
// 確認用: RX_DRY=1 で計算だけして書き戻さない / BINANCE_BASES=URLをカンマ区切りで差し替え。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = (process.env.SITE_URL || 'https://crypto-schedule.signalarchive.workers.dev').replace(/\/+$/, '');
const KEY = process.env.RX_ADMIN_KEY || '';
const DRY = !!process.env.RX_DRY;
const BASES = (process.env.BINANCE_BASES || 'https://data-api.binance.vision,https://api.binance.com,https://api1.binance.com,https://api-gcp.binance.com').split(',').map((x) => x.trim()).filter(Boolean);
const MAX_MS = Number(process.env.RX_MAX_MIN || 25) * 60000, CONC = Number(process.env.RX_CONC || 6);
const UA = 'signal-archive-rx-runner/1.0';
const RX_SYMS = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', BNB: 'BNBUSDT' };
const RX_FROM = { BTC: Date.UTC(2017, 7, 17), ETH: Date.UTC(2017, 7, 17), BNB: Date.UTC(2017, 10, 6), SOL: Date.UTC(2020, 7, 11) };   // 上場前の発表は対象外(worker.js と同じ)
const REGIONS = ['US', 'JP', 'EU'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
if (!KEY) { console.error('RX_ADMIN_KEY が未設定です(GitHub の Secrets に入れてください)'); process.exit(2); }

// worker.js の関数をそのまま借りる(末尾に export を足した写しを作って読み込む)
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rx-')), 'worker.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(here, '..', 'worker.js'), 'utf8') + '\nexport { jaLabel, rxCalc, rxBucket };\n');
const { jaLabel, rxCalc, rxBucket } = await import(pathToFileURL(tmp).href);

async function site(p, opt = {}) {
  const r = await fetch(SITE + p, { ...opt, headers: { 'User-Agent': UA, 'x-admin-key': KEY, ...(opt.headers || {}) }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(p.split('?')[0] + ' HTTP ' + r.status);
  return r;
}

// ---- 1) 読み込み ----
const dump = await (await site('/api/admin/rx-get')).json();
const cal = await (await site('/api/cal')).json();
const now = Date.now(), ev = new Map();
const kOf = (c, se) => jaLabel(c, se).s + '|' + c;                    // 指標の名前(画面の選択と同じ作り方)
const mk = (o, c) => {
  const cc = c || String(o.k || '').split('|').pop(), se = String(o.se || '').slice(0, 80);
  const e = { i: o.i, t: o.t, k: REGIONS.includes(cc) && se ? kOf(cc, se) : o.k, se, r: o.r || {} };   // 名前の対応表が変わっていても、今の表で作り直す
  for (const f of ['fc', 'pv', 'ac']) if (o[f]) e[f] = o[f];
  return e;
};
const origShards = {};
for (const [name, doc] of Object.entries(dump.shards || {})) { origShards[name] = JSON.stringify(doc); for (const e of (doc && doc.ev) || []) ev.set(e.i, mk(e)); }
const seed = dump.seed || {};
for (const e of seed.ev || []) if (!ev.has(e.i)) ev.set(e.i, mk({ ...e, r: (seed.res && seed.res[e.i]) || {} }));   // v67までに取り込んだ予定(2017年〜)
let fromCal = 0;
for (const e of cal.events || []) {                                  // 直近の予定。予想・前回・結果は最新のものに更新する(発表直後は結果が空のことがあるため)
  const t = Date.parse(e.at);
  if (e.l !== 'macro' || !String(e.id).startsWith('tv-') || e.im !== 'high' || !REGIONS.includes(e.c) || !isFinite(t) || t > now) continue;
  let cur = ev.get(e.id);
  if (!cur) { cur = mk({ i: e.id, t, se: e.se }, e.c); ev.set(e.id, cur); fromCal++; }
  for (const f of ['fc', 'pv', 'ac']) if (e[f]) cur[f] = e[f];
}

// ---- 2) 計算(Binanceの5分足) ----
const pending = [];
for (const e of [...ev.values()].sort((a, b) => b.t - a.t)) {         // 新しい発表から先に
  if (e.t + 25 * 36e5 > now) continue;                                // 24時間後までの足が揃うまで待つ
  for (const s of Object.keys(RX_SYMS)) if (!(s in e.r) && e.t >= RX_FROM[s]) pending.push([e, s]);
}
const dead = new Set();                                               // 403/451(地域・IPで断られた入口)は、この実行では使わない
async function bars(sym, start) {
  let last = '(入口なし)';
  const live = BASES.filter((b) => !dead.has(b)), list = live.length ? live : BASES;
  for (const base of list) {
    for (let att = 0; att < 3; att++) {
      try {
        const r = await fetch(`${base}/api/v3/klines?symbol=${sym}&interval=5m&startTime=${start}&limit=300`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
        if (r.status === 429 || r.status === 418) { last = `${new URL(base).host} ${r.status}`; await sleep(Math.min(Number(r.headers.get('retry-after')) || 5, 30) * 1000); continue; }
        if (!r.ok) { last = `${new URL(base).host} ${r.status}`; if (r.status === 403 || r.status === 451) dead.add(base); break; }
        const j = await r.json();
        if (Array.isArray(j)) return j;
        last = `${new URL(base).host} 形式が想定と違います`; break;
      } catch (err) { last = `${new URL(base).host} ${(err && err.message) || err}`; await sleep(500); }
    }
  }
  throw new Error(last);
}

let next = 0, computed = 0, failed = 0, lastSave = Date.now();
const errs = new Map();
let saving = null;
const maybeSave = () => (saving ||= save().finally(() => { saving = null; }));
async function pool() {
  while (Date.now() - t0 < MAX_MS) {
    const i = next++;
    if (i >= pending.length) return;
    const [e, s] = pending[i];
    try { e.r[s] = rxCalc(await bars(RX_SYMS[s], Math.floor(e.t / 3e5) * 3e5), e.t); computed++; }
    catch (err) { failed++; const m = String((err && err.message) || err).slice(0, 80); errs.set(m, (errs.get(m) || 0) + 1); }
    if (Date.now() - lastSave > 10 * 60000) { lastSave = Date.now(); await maybeSave(); }   // 長引く時だけ途中で保存(KVの書き込み回数を節約)
  }
}

// ---- 3) 保存(指標ごとに64個へ分けて、変わったものだけ書く) ----
const hasR = (e) => e.r && Object.keys(e.r).some((s) => e.r[s]);
async function put(name, text) {
  if (DRY) return;
  await site('/api/admin/rx-put?name=' + name, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: text });
}
async function save() {
  const groups = {};
  for (const e of [...ev.values()].sort((a, b) => a.t - b.t || (a.i < b.i ? -1 : 1))) {
    const o = { i: e.i, t: e.t, k: e.k, se: e.se };
    for (const f of ['fc', 'pv', 'ac']) if (e[f]) o[f] = e[f];
    o.r = e.r;
    (groups['s' + rxBucket(e.k)] ||= []).push(o);
  }
  let wrote = 0;
  for (const name of new Set([...Object.keys(groups), ...Object.keys(origShards)])) {
    const text = JSON.stringify({ v: 1, ev: groups[name] || [] });
    if (origShards[name] === text) continue;
    await put(name, text); origShards[name] = text; wrote++;
  }
  const by = new Map();
  for (const e of ev.values()) if (hasR(e)) { const g = by.get(e.k) || { k: e.k, ts: new Set(), last: 0 }; g.ts.add(e.t); g.last = Math.max(g.last, e.t); by.set(e.k, g); }
  const indicators = [...by.values()].map((g) => ({ k: g.k, n: g.ts.size, last: g.last })).sort((a, b) => b.last - a.last);
  await put('idx', JSON.stringify({ indicators, evTo: now }));
  return { wrote, indicators: indicators.length };
}

console.log(`予定 ${ev.size}件(直近の予定から追加 ${fromCal}件) / 計算待ち ${pending.length}件(指標×銘柄) / 入口 ${BASES.map((b) => new URL(b).host).join(', ')}${DRY ? ' / DRY(書き戻さない)' : ''}`);
await Promise.all(Array.from({ length: CONC }, pool));
const left = pending.length - computed;                               // 計算できなかった・時間切れの残り
await saving;
const sv = await save();
const recorded = [...ev.values()].reduce((n, e) => n + Object.values(e.r).filter(Boolean).length, 0);
const errors = [...errs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m, n]) => `${m} ×${n}`);
const run = { at: new Date().toISOString(), events: ev.size, recorded, computed, failed, pending: left, indicators: sv.indicators, shards_written: sv.wrote, done: left === 0, errors, ms: Date.now() - t0 };
await put('run', JSON.stringify(run));
console.log(JSON.stringify(run));
if (failed && !computed && pending.length) { console.error('1件も計算できませんでした。errors を確認してください'); process.exit(1); }
