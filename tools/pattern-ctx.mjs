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
