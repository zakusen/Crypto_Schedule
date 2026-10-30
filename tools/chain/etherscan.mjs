// v222: Etherscan API(V2・無料キー)。1秒に4回までに抑える。キーは GitHub Secrets の ETHERSCAN_API_KEY
const BASE = 'https://api.etherscan.io/v2/api';
const KEY = process.env.ETHERSCAN_API_KEY || '';
let last = 0, calls = 0;
export const callCount = () => calls;
async function get(params, tries = 4) {
  if (!KEY) throw new Error('ETHERSCAN_API_KEY が未設定');
  for (let k = 0; k < tries; k++) {
    const wait = last + 260 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now(); calls++;
    const u = new URL(BASE); for (const [a, b] of Object.entries({ ...params, apikey: KEY })) u.searchParams.set(a, String(b));
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); const j = await r.json();
      if (j.status === '1' || (j.message === 'No transactions found') || j.result === '' || (Array.isArray(j.result) && !j.result.length)) return j.result || [];
      if (typeof j.result === 'string' && /rate limit|Max calls/i.test(j.result)) { await new Promise((r) => setTimeout(r, 1500 * (k + 1))); continue; }
      if (j.jsonrpc) return j.result;
      if (j.status === '0' && /No (transactions|records)/i.test(j.message || '')) return [];
      throw new Error((j.message || '') + ' ' + JSON.stringify(j.result).slice(0, 200));
    } catch (e) { if (k === tries - 1) throw e; await new Promise((r) => setTimeout(r, 1500 * (k + 1))); }
  }
  return [];
}
export async function blockAt(chainid, tSec, closest = 'before') {
  return +(await get({ chainid, module: 'block', action: 'getblocknobytime', timestamp: tSec, closest }));
}
// 送金の一覧(通常・内部・トークン)。1000件ずつ最大10ページ
async function pages(params) {
  const out = []; for (let page = 1; page <= 10; page++) { const a = await get({ ...params, page, offset: 1000, sort: 'asc' }); out.push(...a); if (a.length < 1000) break; }
  return out;
}
export const txlist = (chainid, address, sb, eb) => pages({ chainid, module: 'account', action: 'txlist', address, startblock: sb, endblock: eb });
export const txinternal = (chainid, address, sb, eb) => pages({ chainid, module: 'account', action: 'txlistinternal', address, startblock: sb, endblock: eb });
export const tokentx = (chainid, address, sb, eb) => pages({ chainid, module: 'account', action: 'tokentx', address, startblock: sb, endblock: eb });
export async function isContract(chainid, address) {
  const c = await get({ chainid, module: 'proxy', action: 'eth_getCode', address, tag: 'latest' }); return typeof c === 'string' && c.length > 2;
}
