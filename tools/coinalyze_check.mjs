// 見るだけ(何も書き込まない)。v162: Coinalyze に取引所が何社あり、4銘柄の無期限先物がどれだけ取れて、足ごとに何年前まで遡れるかを調べる。
// 使い方:  COINALYZE_KEY=あなたのキー node tools/coinalyze_check.mjs   (引数は使わない。Actionsの days 入力は無視される)
const KEY = process.env.COINALYZE_KEY;
const BASE = 'https://api.coinalyze.net/v1';
const COINS = ['BTC', 'ETH', 'SOL', 'BNB'];
if (!KEY) { console.error('COINALYZE_KEY が未設定です'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, params = {}) {
  const url = BASE + path + '?' + new URLSearchParams(params);
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: { api_key: KEY } });
    if (res.status === 429) { const w = Number(res.headers.get('Retry-After')) || 5; console.log(`  (429: ${w}秒待つ)`); await sleep(w * 1000 + 300); continue; }
    if (!res.ok) throw new Error(`${path} HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    return res.json();
  }
  throw new Error(path + ': 429が続いた');
}
const day = (s) => new Date(s * 1000).toISOString().slice(0, 10);
const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');

const ex = await api('/exchanges');
const nameOf = Object.fromEntries(ex.map((e) => [e.code, e.name]));
console.log(`取引所: ${ex.length}社\n  ` + ex.map((e) => `${e.name}(${e.code})`).join(', '));

const mk = await api('/future-markets');
const perp = mk.filter((m) => m.is_perpetual && COINS.includes(m.base_asset));
console.log('\n== 4銘柄の無期限先物(取引所×銘柄×建て) ==');
const tally = {};
for (const m of perp) { const k = `${nameOf[m.exchange] || m.exchange}\t${m.base_asset}\tquote=${m.quote_asset}\tmargined=${m.margined ?? '?'}`; tally[k] = (tally[k] || 0) + 1; }
for (const k of Object.keys(tally).sort()) console.log(`${k}\t×${tally[k]}`);
console.log('\n(参考) 1件目の生データ:', JSON.stringify(perp[0]));

// USDT/USD安定建て(STABLE)だけを対象に、取引所×銘柄で1本にする
const stable = perp.filter((m) => /^(USDT|USD|USDC)$/.test(m.quote_asset) && (m.margined == null || /STABLE/i.test(String(m.margined)) || m.quote_asset !== 'USD'));
const uniq = new Map(); for (const m of stable) { const k = m.exchange + ':' + m.base_asset; if (!uniq.has(k)) uniq.set(k, m); }
const list = [...uniq.values()];
console.log(`\n対象(安定建て無期限・取引所×銘柄で1本): ${list.length}本 / 取引所 ${new Set(list.map((m) => m.exchange)).size}社`);

// 足ごとの深さ。BTCだけで、取引所ごとの最古日・本数・合計を見る(重くしないため)
const btc = list.filter((m) => m.base_asset === 'BTC');
const to = Math.floor(Date.now() / 1000), from17 = 1483228800;
for (const iv of ['daily', '1hour', '5min']) {
  console.log(`\n== interval=${iv} (BTC, 2017年から要求) ==`);
  const out = [];
  for (let i = 0; i < btc.length; i += 10) {
    try { out.push(...(await api('/liquidation-history', { symbols: btc.slice(i, i + 10).map((m) => m.symbol).join(','), interval: iv, from: from17, to, convert_to_usd: 'true' }))); }
    catch (e) { console.log('  失敗:', e.message); }
    await sleep(1500);
  }
  const bySym = Object.fromEntries(btc.map((m) => [m.symbol, nameOf[m.exchange] || m.exchange]));
  let oldest = Infinity;
  for (const r of out) {
    const h = r.history || []; if (h.length) oldest = Math.min(oldest, h[0].t);
    const l = h.reduce((a, x) => a + (x.l || 0), 0), s = h.reduce((a, x) => a + (x.s || 0), 0);
    console.log(`${bySym[r.symbol] || r.symbol}\t本数=${h.length}\t最古=${h.length ? day(h[0].t) : '-'}\t最新=${h.length ? day(h[h.length - 1].t) : '-'}\tロング計=${usd(l)}\tショート計=${usd(s)}`);
  }
  console.log(`→ ${iv} の全体の最古: ${Number.isFinite(oldest) ? day(oldest) : '-'}`);
}
console.log('\n見方: 最古が2017年に近ければ、その足は長く遡れる。本数が少なく最古が新しい=そこまでしか持っていない(または1回の件数に上限)。');
