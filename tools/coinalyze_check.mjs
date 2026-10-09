// 見るだけのスクリプト(何も書き込まない)。Coinalyze の清算履歴が、Bybit・OKX の4銘柄で「5分刻みで何日前まで」取れるかを確かめる。
// 使い方:  COINALYZE_KEY=あなたのキー node tools/coinalyze_check.mjs [日数=14]
//   (キーは環境変数で渡す。ファイルやチャットには書かない)
const KEY = process.env.COINALYZE_KEY;
const DAYS = Number(process.argv[2]) || 14;
const BASE = 'https://api.coinalyze.net/v1';
const COINS = ['BTC', 'ETH', 'SOL', 'BNB'];
if (!KEY) { console.error('COINALYZE_KEY が未設定です'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, params = {}) {
  const url = BASE + path + '?' + new URLSearchParams(params);
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: { api_key: KEY } });
    if (res.status === 429) { const w = Number(res.headers.get('Retry-After')) || 5; console.log(`  (429: ${w}秒待つ)`); await sleep(w * 1000 + 300); continue; }
    if (!res.ok) throw new Error(`${path} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error(path + ': 429が続いた');
}
const jst = (s) => new Date(s * 1000 + 9 * 36e5).toISOString().replace('T', ' ').slice(0, 16) + ' JST';
const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');

const ex = await api('/exchanges');
const want = ex.filter((e) => /^(bybit|okx)$/i.test(e.name));
console.log('取引所:', want.map((e) => `${e.name}=${e.code}`).join(', ') || '(見つからない)', '\n(全体: ' + ex.map((e) => e.name).join(', ') + ')');
if (!want.length) process.exit(1);
const codes = new Set(want.map((e) => e.code));
const nameOf = Object.fromEntries(want.map((e) => [e.code, e.name]));

const mk = await api('/future-markets');
const syms = mk.filter((m) => codes.has(m.exchange) && m.is_perpetual && m.quote_asset === 'USDT' && COINS.includes(m.base_asset));
console.log('\n対象の銘柄:');
for (const m of syms) console.log(`  ${nameOf[m.exchange]}\t${m.base_asset}\t${m.symbol}`);
if (!syms.length) { console.log('(対象なし。future-markets の項目名を確認)'); console.log(JSON.stringify(mk[0])); process.exit(1); }

const to = Math.floor(Date.now() / 1000), from = to - DAYS * 86400;
for (const iv of ['5min', '1hour']) {
  const want_n = iv === '5min' ? DAYS * 288 : DAYS * 24;
  console.log(`\n== interval=${iv}  期間=${DAYS}日  (欠けなければ1銘柄あたり約${want_n}本) ==`);
  const list = syms.map((m) => m.symbol);
  const out = [];
  for (let i = 0; i < list.length; i += 20) {
    out.push(...(await api('/liquidation-history', { symbols: list.slice(i, i + 20).join(','), interval: iv, from, to, convert_to_usd: 'true' })));
  }
  for (const r of out) {
    const h = r.history || [];
    const l = h.reduce((a, x) => a + (x.l || 0), 0), s = h.reduce((a, x) => a + (x.s || 0), 0);
    console.log(`${r.symbol}\t本数=${h.length}\t最古=${h.length ? jst(h[0].t) : '-'}\t最新=${h.length ? jst(h[h.length - 1].t) : '-'}\tロング合計=${usd(l)}\tショート合計=${usd(s)}`);
  }
  await sleep(1500);
}
console.log('\n見方: 5minの「最古」が期間の始まり(今から' + DAYS + '日前)に近ければ、5分刻みで取れている。本数が少なく最古が新しい=そこまでしか遡れない(または1回の件数に上限がある)。');
