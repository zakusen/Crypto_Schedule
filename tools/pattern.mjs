#!/usr/bin/env node
// v196: 似ている過去の値動き(BTC 5分足・DTW)。
//   今の急変動(既定: 2時間)の形と下げ幅(上げ幅)が近い過去の同じ長さの値動きを、2017年8月以降の Binance 現物 5分足から探す。
//   結果はサイトに保存(pat:v1。トップのカード用)し、X 用の下書き(sr: pat)を作れる。
//   「同じ時間帯」= 同時に起きた事実(指標の発表・清算)。原因は示さない。未来の方向も示さない。
// 単独で動かす: node tools/pattern.mjs [--auto] [--end 2026-10-22T11:45+09:00] [--win 2] [--post]
//   --auto(既定): 直近12時間で ±2% 以上動いた2時間のうち一番大きいもの。--post: 下書きを作って自動投稿の対象にする。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const M5 = 300000, H = 3600000, DAY = 86400000;
const VISION = 'https://data.binance.vision/data/spot';
const API = (process.env.BINANCE_BASES || 'https://data-api.binance.vision,https://api.binance.com').split(',').map((x) => x.trim());
const CACHE = path.join(os.tmpdir(), 'csa-btc5m');

async function get(url, ms = 60000) {
  for (let k = 0; k < 3; k++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); if (r.ok) return r; if (r.status === 404) return null; } catch (_) {} await new Promise((r) => setTimeout(r, 1500 * (k + 1))); }
  return null;
}
// 1つの zip(CSV 1本)→ [[開始ms, 終値]]。2025年以降の Binance 現物はマイクロ秒なので直す
async function zipRows(url) {
  const r = await get(url); if (!r) return [];
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, path.basename(url)); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  const csv = execFileSync('unzip', ['-p', f], { maxBuffer: 256 * 1024 * 1024 }).toString();
  const out = []; for (const line of csv.split('\n')) { const a = line.split(','); let t = +a[0]; if (!(t > 0)) continue; if (t > 1e14) t = Math.floor(t / 1000); out.push([t, +a[4]]); }
  return out;
}
// 2017-08 〜 今までの BTC 5分足の終値。月ごと(先月まで)+日ごと(今月)+ API(今日〜今)
export async function loadBtc5m(now = Date.now()) {
  const rows = new Map(), d = new Date(now), y1 = d.getUTCFullYear(), m1 = d.getUTCMonth();
  const months = []; for (let y = 2017, m = 7; y * 12 + m < y1 * 12 + m1; m++) { if (m > 11) { m = 0; y++; } if (y * 12 + m < y1 * 12 + m1) months.push(`${y}-${String(m + 1).padStart(2, '0')}`); }
  for (let i = 0; i < months.length; i += 8) {   // 8本ずつ並べて取る
    const part = await Promise.all(months.slice(i, i + 8).map((ym) => zipRows(`${VISION}/monthly/klines/BTCUSDT/5m/BTCUSDT-5m-${ym}.zip`)));
    for (const a of part) for (const [t, c] of a) rows.set(t, c);
  }
  for (let day = Date.UTC(y1, m1, 1); day < Math.floor(now / DAY) * DAY; day += DAY) {
    const ds = new Date(day).toISOString().slice(0, 10);
    for (const [t, c] of await zipRows(`${VISION}/daily/klines/BTCUSDT/5m/BTCUSDT-5m-${ds}.zip`)) rows.set(t, c);
  }
  // 足りない直近分は API(1回1000本)
  let from = Math.max(...rows.keys(), Date.UTC(y1, m1, 1)) + M5;
  while (from < now - M5) {
    let j = null; for (const b of API) { const r = await get(`${b}/api/v3/klines?symbol=BTCUSDT&interval=5m&startTime=${from}&limit=1000`, 20000); if (r) { j = await r.json(); break; } }
    if (!Array.isArray(j) || !j.length) break;
    for (const k of j) rows.set(+k[0], +k[4]);
    from = +j[j.length - 1][0] + M5;
  }
  const t = [...rows.keys()].filter((x) => x + M5 <= now).sort((a, b) => a - b);
  return { t, c: t.map((x) => rows.get(x)) };
}

// 帯つき DTW(Sakoe-Chiba)。a, b = 始まりを 0 とした % の道のり。返り値 = 道のり1歩あたりの平均のずれ(%)
function dtw(a, b, r) {
  const n = a.length, INF = 1e18; let prev = new Float64Array(n + 1).fill(INF), cur = new Float64Array(n + 1).fill(INF), len = new Float64Array(n + 1), plen = new Float64Array(n + 1);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur.fill(INF); len.fill(0);
    for (let j = Math.max(1, i - r); j <= Math.min(n, i + r); j++) {
      const c = Math.abs(a[i - 1] - b[j - 1]); let m = prev[j - 1], l = plen[j - 1];
      if (prev[j] < m) { m = prev[j]; l = plen[j]; } if (cur[j - 1] < m) { m = cur[j - 1]; l = len[j - 1]; }
      cur[j] = c + m; len[j] = l + 1;
    }
    [prev, cur] = [cur, prev]; [plen, len] = [len, plen];
  }
  return prev[n] / (plen[n] || n);
}

// 今の値動き(end = 終わりの時刻、win = 時間)に似た過去を探す
export function findSimilar(S, end, win = 2, opt = {}) {
  const N = win * 12, idx = new Map(S.t.map((t, i) => [t, i])), ie = idx.get(Math.floor(end / M5) * M5 - M5);
  if (ie == null || ie < N) return null;
  const is = ie - N, base = S.c[is], q = []; for (let i = is; i <= ie; i++) q.push((S.c[i] / base - 1) * 100);
  const qc = q[N], sign = Math.sign(qc), lo = Math.abs(qc) * 0.6, hi = Math.abs(qc) * 1.6, R = Math.max(2, Math.round(N / 8));
  const cand = [], stop = ie - 3 * 288, AFTER = 288;   // 直近3日は除く。その後24時間が取れるものだけ
  for (let s = 0; s + N + AFTER < S.t.length && s + N < stop; s += 3) {
    const e = s + N; if (S.t[e] - S.t[s] !== N * M5) continue;   // 途中に欠けがあるものは使わない
    const tot = (S.c[e] / S.c[s] - 1) * 100; if (Math.sign(tot) !== sign || Math.abs(tot) < lo || Math.abs(tot) > hi) continue;
    const p = []; for (let i = s; i <= e; i++) p.push((S.c[i] / S.c[s] - 1) * 100);
    cand.push({ s, d: dtw(q, p, R) });
  }
  cand.sort((a, b) => a.d - b.d);
  const pick = []; for (const c of cand) { if (pick.every((p) => Math.abs(S.t[p.s] - S.t[c.s]) >= DAY)) pick.push(c); if (pick.length >= (opt.max || 20)) break; }
  const one = (c) => {
    const s = c.s, e = s + N, path = []; for (let i = s; i <= e + N && i < S.c.length; i++) path.push(Math.round((S.c[i] / S.c[s] - 1) * 1e4) / 100);
    const a24 = S.c[e + AFTER] ? Math.round((S.c[e + AFTER] / S.c[e] - 1) * 1e4) / 100 : null;
    return { t0: S.t[s], t1: S.t[e] + M5, p0: S.c[s], p1: S.c[e], chg: Math.round((S.c[e] / S.c[s] - 1) * 1e4) / 100, d: Math.round(c.d * 1000) / 1000, path, after24: a24 };
  };
  const all = pick.map(one), af = all.map((m) => m.after24).filter((x) => x != null).sort((a, b) => a - b);
  return { at: Date.now(), win, src: 'Binance BTCUSDT 5m', since: S.t[0],
    q: { t0: S.t[is], t1: S.t[ie] + M5, p0: base, p1: S.c[ie], chg: Math.round(qc * 100) / 100, path: q.map((x) => Math.round(x * 100) / 100) },
    top: all.slice(0, 3), n: all.length, after: af.length ? { min: af[0], max: af[af.length - 1], med: af[af.length >> 1], up: af.filter((x) => x > 0).length } : null };
}
// 直近12時間で、win 時間の変化が一番大きい終わりの時刻(±th% 以上)
export function autoEnd(S, now, win = 2, th = 2) {
  const N = win * 12; let best = null;
  for (let i = S.t.length - 1; i >= N && S.t[i] > now - 12 * H; i--) { const v = Math.abs(S.c[i] / S.c[i - N] - 1) * 100; if (v >= th && (!best || v > best.v)) best = { v, end: S.t[i] + M5 }; }
  return best && best.end;
}
// 似た過去の「同じ時間帯」の事実を足す: 指標の記録(rx の dump)と清算(/api/liq の1時間ごと)
export function addContext(res, recs, liq) {
  for (const m of res.top) {
    m.ev = (recs || []).filter((r) => r.t >= m.t0 - 2 * H && r.t <= m.t1 + 30 * 60000).slice(0, 3).map((r) => ({ t: r.t, s: r.s, c: r.c }));
    if (liq) { let l = 0, s = 0, got = 0; for (let t = Math.floor(m.t0 / H) * H; t < m.t1; t += H) for (const c of Object.keys(liq)) { const b = liq[c].get(t); if (b) { l += b[1]; s += b[2]; got++; } } m.liq = got ? { l, s } : null; }
  }
  return res;
}

// ---- 単独で動かす時 ----
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const L = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(here, '..', 'public', 'xpost-lib.js'))).toString('base64'));
  const SITE = (process.env.SITE_URL || 'https://crypto-schedule.signalarchive.workers.dev').replace(/\/+$/, ''), KEY = process.env.RX_ADMIN_KEY || '';
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const win = +(arg('--win') || 2), now = Date.now();
  const site = async (p, o = {}) => { const r = await fetch(SITE + p, { ...o, headers: { 'x-admin-key': KEY, ...(o.headers || {}) }, signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(p + ' HTTP ' + r.status); return r; };
  console.log('[pat] 5分足を読み込みます…'); const t0 = Date.now();
  const S = await loadBtc5m(now); console.log(`[pat] ${S.t.length}本 (${new Date(S.t[0]).toISOString().slice(0, 10)}〜) ${Math.round((Date.now() - t0) / 1000)}秒`);
  const end = arg('--end') ? Date.parse(arg('--end')) : autoEnd(S, now, win, L.SPIKE_TH ? L.SPIKE_TH[win] || 2 : 2);
  if (!end) { console.log('[pat] 直近12時間に対象の値動きがありません'); process.exit(0); }
  const res = findSimilar(S, end, win); if (!res) { console.log('[pat] 今の値動きが取れません'); process.exit(0); }
  const { recsFrom, liqFrom } = await import('./pattern-ctx.mjs');
  addContext(res, KEY ? await recsFrom(site) : [], await liqFrom(SITE));
  console.log('[pat] 今:', JSON.stringify(res.q.chg), '似た過去:', res.top.map((m) => new Date(m.t0).toISOString() + ' ' + m.d).join(' / '));
  if (KEY) {
    await site('/api/admin/rx-put?name=pt', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(res) });
    if (process.argv.includes('--post')) { const p = { at: now, ...L.patPost(res, null) }; await site('/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ add: [p] }) }); console.log('[pat] 下書きを作りました', p.id); }
  }
}
