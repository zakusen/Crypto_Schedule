// v196: 似ている過去の値動きに添える「同じ時間帯」の事実の読み込み(tools/pattern.mjs と x_notify.mjs で共通)
const H = 3600000;
// 指標の記録(rx の dump)→ [{t, s(短い名前), c(地域)}]
export async function recsFrom(site) {
  const dump = await (await site('/api/admin/rx-get')).json(), out = [];
  for (const doc of Object.values(dump.shards || {})) for (const r of (doc && doc.ev) || []) { const [s, c] = String(r.k || '').split('|'); if (r.t) out.push({ t: r.t, s, c }); }
  return out.sort((a, b) => a.t - b.t);
}
// 清算(1時間ごと・4銘柄)→ {BTC: Map(t → [t, long, short]), …}。取れなければ null
export async function liqFrom(SITE) {
  try {
    const out = {};
    for (const c of ['BTC', 'ETH', 'SOL', 'BNB']) { const r = await fetch(SITE + '/api/liq?sym=' + c + '&step=3600', { signal: AbortSignal.timeout(30000) }); if (!r.ok) return null; out[c] = new Map(((await r.json()).buckets || []).map((b) => [b[0], b])); }
    return out;
  } catch (_) { return null; }
}

// v201: 記録(pat:log)に1件足す(同じ値動きは置き換え)。最大500件
export async function appendLog(site, res) {
  let d = {}; try { d = (await (await site('/api/admin/rx-one?name=pl')).json()) || {}; } catch (_) {}
  const ev = (d.ev || []).filter((x) => x.q && x.q.t1 !== res.q.t1);
  const { path, ...q } = res.q;   // v202: 記録は軽く(道のりは残さない)
  ev.push({ q, kind: res.kind || 'move', win: res.win, n: res.n, after: res.after, top: res.top.map(({ path: _, ...m }) => m), at: res.at });
  await site('/api/admin/rx-put?name=pl', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ v: 1, ev: ev.slice(-500) }) });
}
// v201: 答え合わせ。記録した値動きの「その後24時間」(実際)を、24時間たったものから埋める。B = BTC 1時間足 [[開始ms, …, 終]]
export async function fillLog(site, B, now) {
  let d = {}; try { d = (await (await site('/api/admin/rx-one?name=pl')).json()) || {}; } catch (_) { return 0; }
  const m = new Map((B || []).map((b) => [b[0], b[4]])); let k = 0;
  for (const x of d.ev || []) if (x.a24 == null && x.q && x.q.t1 + 24 * H + H <= now) { const c = m.get(Math.floor((x.q.t1 + 24 * H) / H) * H - H); if (c) { x.a24 = Math.round((c / x.q.p1 - 1) * 1e4) / 100; k++; } }
  if (k) await site('/api/admin/rx-put?name=pl', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(d) });
  return k;
}
