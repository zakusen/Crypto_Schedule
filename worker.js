// CRYPTO SIGNAL ARCHIVE の小さなサーバー部分(Cloudflare Worker)。
//   /api/candles?sym=BTC&tf=1h  … Pacificaのローソク足(公開API・鍵なし)
//   /api/events                 … 日米欧のマクロ指標カレンダー(TradingViewの公開カレンダー。予備: Forex Factory) + 任意の追加イベント(public/events_manual.json)
//   銘柄イベントは CoinMarketCal(シークレット CMAL_API_KEY)から6時間ごとに取得し、KV(asset:v2)へ保存する。
// 定時実行(Cron Trigger)が30分ごとにマクロ指標を取得してKV(cal)へ保存し、/api/events は保存済みの内容を返す。
// KVが空・古い・未接続のときだけ、その場で取得する(ライブ取得)。必要な設定: wrangler.jsonc の KV と cron(鍵は不要)

// どの版が公開されているかを /api/events で確認できるようにする目印(コードを直したら更新する)
const VERSION = '2026-10-05-ethq-v7';
const PACIFICA = 'https://api.pacifica.fi/api/v1';
const SYMS = ['BTC', 'ETH', 'SOL', 'SUI', 'BNB'];

// tf: 画面の足 / iv: Pacificaに頼む足 / agg: 日足から自前で束ねる種類 / bars: 返す本数 / raw: 取りに行く元の本数 / ttl: キャッシュ秒
const TFS = {
  '1m':  { iv: '1m',  step: 60,     bars: 90,  raw: 90,  ttl: 30 },
  '5m':  { iv: '5m',  step: 300,    bars: 96,  raw: 96,  ttl: 60 },
  '15m': { iv: '15m', step: 900,    bars: 96,  raw: 96,  ttl: 120 },
  '1h':  { iv: '1h',  step: 3600,   bars: 60,  raw: 60,  ttl: 300 },
  '4h':  { iv: '4h',  step: 14400,  bars: 60,  raw: 60,  ttl: 300 },
  '1d':  { iv: '1d',  step: 86400,  bars: 60,  raw: 60,  ttl: 300 },
  '1w':  { iv: '1d',  step: 86400,  bars: 52,  raw: 371, ttl: 600, agg: 'w' },
  '1M':  { iv: '1d',  step: 86400,  bars: 24,  raw: 775, ttl: 600, agg: 'M' },
};

const DAY = 86400000, WEEK = 7 * DAY;

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

async function cached(ctx, request, ttl, fn) {
  const cache = caches.default;
  const key = new Request(request.url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fn();
  if (res.status !== 200 || res.headers.get('x-nocache')) return res;
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'public, max-age=' + ttl);
  ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

// ---------- 価格 ----------
async function kline(sym, iv, stepSec, n) {
  const now = Date.now();
  const u = PACIFICA + '/kline?symbol=' + encodeURIComponent(sym) + '&interval=' + iv +
    '&start_time=' + (now - (n + 2) * stepSec * 1000) + '&end_time=' + now;
  const r = await fetch(u, { headers: { 'User-Agent': 'signal-archive/1.0' } });
  if (!r.ok) throw new Error('pacifica ' + r.status);
  const j = await r.json();
  const rows = Array.isArray(j) ? j : (j && j.data) || [];
  return rows
    .map((x) => ({ t: +x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v || 0 }))
    .filter((x) => isFinite(x.t) && isFinite(x.o) && isFinite(x.c))
    .sort((a, b) => a.t - b.t);
}

// 区切りはUTC。週はUTCの月曜始まり、月はUTCの1日始まり。
function bucket(tMs, kind) {
  if (kind === 'M') { const d = new Date(tMs); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); }
  return Math.floor((tMs + 3 * DAY) / WEEK) * WEEK - 3 * DAY;
}

function aggregate(rows, kind) {
  const out = [];
  for (const r of rows) {
    const b = bucket(r.t, kind), last = out[out.length - 1];
    if (last && last.t === b) {
      last.h = Math.max(last.h, r.h); last.l = Math.min(last.l, r.l); last.c = r.c; last.v += r.v;
    } else out.push({ t: b, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v });
  }
  return out;
}

async function candles(url) {
  const sym = (url.searchParams.get('sym') || '').toUpperCase();
  const tf = url.searchParams.get('tf') || '';
  const cfg = TFS[tf];
  if (!SYMS.includes(sym) || !cfg) return json({ error: 'bad params' }, 400);
  try {
    let rows = await kline(sym, cfg.iv, cfg.step, cfg.raw);
    if (cfg.agg) {
      // 取得窓の途中から始まる最初の1本は、始値・高安が不完全になるので捨てる。
      // ただし窓より前のデータが無い(上場直後など)場合は、その足が本当の最初なので残す。
      const winStart = Date.now() - (cfg.raw + 2) * cfg.step * 1000;
      const cutByWindow = rows.length > 0 && rows[0].t <= winStart + cfg.step * 1000;
      rows = aggregate(rows, cfg.agg);
      if (cutByWindow && rows.length > 1) rows.shift();
    }
    rows = rows.slice(-cfg.bars);
    if (!rows.length) return json({ error: 'no data' }, 502);
    return json({ sym, tf, source: 'Pacifica', bars: rows.map((r) => [Math.floor(r.t / 1000), r.o, r.h, r.l, r.c, r.v]) });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}

// ---------- イベント(マクロ: 日米欧) ----------
// 主: TradingViewの公開カレンダー(鍵なし・非公式)。予備: Forex Factoryの週次JSON(今週・来週のみ)。
const TV_CAL = 'https://economic-calendar.tradingview.com/events';
const FF_URLS = ['https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'];
const REGION = { US: '米', JP: '日', EU: '欧' };
const UA = 'Mozilla/5.0 (compatible; signal-archive/1.0)';

// 英語の指標名 → [日本語名, 画面の縦線ラベル]。上から順に最初に合ったものを使う(Coreを先に置く)。
const JA = [
  [/minutes/i, 'FOMC議事録', '議事録'],
  [/interest rate decision|rate decision|federal funds rate|policy rate|main refinancing/i, null, null],      // 国ごとに下で決める
  [/non[- ]?farm payrolls?/i, '雇用統計（非農業部門雇用者数）', '雇用統計'],
  [/adp/i, 'ADP雇用者数', 'ADP'],
  [/jolts|job openings/i, 'JOLTS求人件数', 'JOLTS'],
  [/jobless claims/i, '新規失業保険申請件数', '失業保険'],
  [/unemployment rate/i, '失業率', '失業率'],
  [/core (pce|price index)/i, 'コアPCE', 'コアPCE'],
  [/\bpce\b/i, 'PCE物価指数', 'PCE'],
  [/core (inflation|cpi|consumer)/i, 'コアCPI', 'コアCPI'],
  [/inflation rate|consumer price|\bcpi\b|\bhicp\b/i, 'CPI 消費者物価指数', 'CPI'],
  [/producer price|\bppi\b/i, 'PPI 生産者物価指数', 'PPI'],
  [/\bgdp\b/i, 'GDP', 'GDP'],
  [/retail sales/i, '小売売上高', '小売売上'],
  [/ism (services|non[- ]?manufacturing)/i, 'ISM非製造業景況指数', 'ISM非製造'],
  [/ism manufacturing/i, 'ISM製造業景況指数', 'ISM製造'],
  [/pmi/i, 'PMI 購買担当者景気指数', 'PMI'],
  [/tankan/i, '日銀短観', '短観'],
  [/industrial production/i, '鉱工業生産', '鉱工業'],
  [/trade balance/i, '貿易収支', '貿易収支'],
  [/consumer (confidence|sentiment)/i, '消費者信頼感', '消費者信頼感'],
  [/press conference/i, '記者会見', '会見'],
];
const POLICY = { US: ['FOMC 政策金利発表', 'FOMC'], JP: ['日銀 金融政策決定会合', '日銀'], EU: ['ECB 政策金利発表', 'ECB'] };

function jaLabel(country, title) {
  let t = null, s = null, policy = false;
  for (const [re, jt, js] of JA) {
    if (!re.test(title)) continue;
    if (jt === null) { const p = POLICY[country]; if (p) { t = p[0]; s = p[1]; policy = true; } }
    else { t = jt; s = js; }
    break;
  }
  const region = REGION[country] || country;
  if (!t) return { t: region + ' ' + title, s: title.length > 14 ? title.slice(0, 14) : title };
  // 政策金利・議事録・会見は主体名(FOMC/日銀/ECB)が地域を表すので、地域の接頭辞を付けない
  const noRegion = policy || /議事録|会見/.test(t);
  const q = /\b(YoY|y\/y)\b/i.test(title) ? '前年比' : /\b(MoM|m\/m)\b/i.test(title) ? '前月比' : /\b(QoQ|q\/q)\b/i.test(title) ? '前期比' : '';
  const pre = /\b(prel|flash|advance)\b/i.test(title) ? '速報' : '';
  const note = noRegion ? '' : [q, pre].filter(Boolean).join('・');
  return { t: (noRegion ? '' : region + ' ') + t + (note ? '（' + note + '）' : ''), s: (noRegion ? '' : region) + s };
}

async function tvChunk(from, to) {
  const u = TV_CAL + '?from=' + encodeURIComponent(new Date(from).toISOString()) +
    '&to=' + encodeURIComponent(new Date(to).toISOString()) + '&countries=US,JP,EU';
  const r = await fetch(u, { headers: { Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/', 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error('TradingView ' + r.status);
  const j = await r.json();
  if (!j || j.status !== 'ok' || !Array.isArray(j.result)) throw new Error('TradingView 形式が想定と違います');
  return j.result;
}

async function tvEvents() {
  const now = Date.now();
  const from = now - 60 * DAY, to = now + 90 * DAY, step = 50 * DAY;   // 範囲の上限が不明なので50日ずつに分けて取る
  const spans = [];
  for (let a = from; a < to; a += step) spans.push([a, Math.min(a + step, to)]);
  const errors = [], seen = new Map();
  await Promise.all(spans.map(async ([a, b]) => {
    try {
      for (const e of await tvChunk(a, b)) {
        if (!e || !e.id || !e.date || !REGION[e.country] || e.importance < 0) continue;     // 低重要度と祝日は除く
        if (/holiday/i.test(e.indicator || '')) continue;
        const L = jaLabel(e.country, String(e.title || e.indicator || ''));
        seen.set(e.id, { id: 'tv-' + e.id, l: 'macro', t: L.t, s: L.s, src: e.source || 'TradingView', at: new Date(e.date).toISOString(), im: e.importance >= 1 ? 'high' : 'mid', c: e.country });
      }
    } catch (err) { errors.push('マクロ(TradingView): ' + (err.message || err)); }
  }));
  return { out: [...seen.values()], errors: [...new Set(errors)] };
}

async function ffEvents() {
  const out = [], errors = [], CC = { USD: 'US', JPY: 'JP', EUR: 'EU' };
  await Promise.all(FF_URLS.map(async (u) => {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!r.ok) throw new Error('ForexFactory ' + r.status);
      const j = await r.json();
      for (const e of Array.isArray(j) ? j : []) {
        const c = CC[e.country], ts = Date.parse(e.date);
        if (!c || !isFinite(ts) || !['High', 'Medium'].includes(e.impact)) continue;
        const L = jaLabel(c, String(e.title || ''));
        out.push({ id: 'ff-' + c + '-' + ts + '-' + String(e.title).replace(/[^A-Za-z0-9]/g, '').slice(0, 24), l: 'macro', t: L.t, s: L.s, src: 'Forex Factory（予備）', at: new Date(ts).toISOString(), im: e.impact === 'High' ? 'high' : 'mid', c });
      }
    } catch (err) { errors.push('予備(Forex Factory): ' + (err.message || err)); }
  }));
  return { out, errors: [...new Set(errors)] };
}

async function manualEvents(request, env) {
  try {
    const r = await env.ASSETS.fetch(new Request(new URL('/events_manual.json', request.url)));
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j.filter((e) => e && e.id && e.at && e.t && ['macro', 'market', 'asset'].includes(e.l)) : [];
  } catch (_) { return []; }
}

// ---------- イベント(銘柄: CoinMarketCal API v2) ----------
// 鍵は Cloudflare のシークレット CMAL_API_KEY(ヘッダー x-api-key)。接続先は https://api.coinmarketcal.com/v2 (旧 developers.coinmarketcal.com/v1 は廃止)。
// 無料プランは「今日から7日先まで」しか返らない(過去・説明・カテゴリ・影響度は無し)。範囲はプラン任せにし、from/to は付けない。
// 回数制限に配慮し、取得は6時間ごと(cronの該当回のみ)。取れた分はKVに積み上げ、過去の分は消さない。
const CMAL = 'https://api.coinmarketcal.com/v2';
const ASSET_KEY = 'asset:v2';
const ASSET_EVERY_H = 6;                    // 何時間ごとに取り直すか
const ASSET_STALE_MS = 24 * 3600 * 1000;    // 保存がこれより古ければ画面に警告を出す
const MAX_PAGES = 4, PAGE_MAX = 100;

async function cmalGet(path, env) {
  const r = await fetch(CMAL + path, { headers: { 'x-api-key': env.CMAL_API_KEY, Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
  if (r.status === 401 || r.status === 403) {
    let b = ''; try { b = (await r.text()).slice(0, 160); } catch (_) {}
    throw new Error('CoinMarketCal: 認証/権限エラー ' + r.status + '(キーを確認。プランで使えない条件の可能性もあります)' + (b ? ' 応答: ' + b : ''));
  }
  if (r.status === 429) throw new Error('CoinMarketCal: 回数制限に達しました');
  if (!r.ok) {
    let body = '';
    try { body = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160); } catch (_) {}
    throw new Error('CoinMarketCal ' + r.status + (body ? ' 応答: ' + body : ''));      // 向こうの返事の冒頭も出す(原因の手がかり)
  }
  return r.json();
}
const dataOf = (j) => (Array.isArray(j) ? j : (j && j.data) || []);

// 銘柄記号(BTCなど) → CoinMarketCal上のコインslug。記号は重複するので、一覧から記号が一致するものの中で順位が最上位のものを使う。
async function cmalCoinSlugs(env) {
  const out = {};
  for (const sym of SYMS) {
    const list = dataOf(await cmalGet('/coins?q=' + encodeURIComponent(sym) + '&limit=50', env));
    const hits = list.filter((c) => c && c.slug && String(c.symbol || '').toUpperCase() === sym);
    hits.sort((a, b) => (+a.rank || 1e9) - (+b.rank || 1e9));
    if (hits[0]) out[sym] = String(hits[0].slug);
  }
  return out;
}

function cmalEvent(e, slugToSym) {
  const ts = Date.parse(e && e.date);
  if (!e || e.id == null || !isFinite(ts)) return null;
  const title = String(e.title || '').trim();
  if (!title) return null;
  const syms = (Array.isArray(e.coins) ? e.coins : []).map((c) => slugToSym[String(c.slug)] || String(c.symbol || '').toUpperCase()).filter((x) => SYMS.includes(x));
  if (!syms.length) return null;
  const hi = e.impact === 'High' || e.impact === 'Critical' || (typeof e.impact === 'number' && e.impact >= 7.5);
  // 日付が「期限」や「期間」の予定(isEstimated)は、縦線の位置が目安なので、表示用の日付を見出しに添える
  const est = e.isEstimated === true && e.displayedDate ? '（' + e.displayedDate + '）' : '';
  const ev = { id: 'cmal-' + e.id, l: 'asset', t: syms.join('/') + ' ' + title + est, s: syms[0] + ' ' + (title.length > 10 ? title.slice(0, 10) : title), src: 'CoinMarketCal', at: new Date(ts).toISOString(), im: hi ? 'high' : 'mid', a: [...new Set(syms)] };
  if (/^https?:\/\//.test(e.sourceUrl || '')) ev.u = e.sourceUrl;
  return ev;
}

async function cmalEvents(env, coinMap) {
  const slugs = Object.values(coinMap);
  const slugToSym = Object.fromEntries(Object.entries(coinMap).map(([k, v]) => [v, k]));
  const out = new Map();
  let cursor = '';
  for (let page = 1; page <= MAX_PAGES; page++) {
    const q = '/events?coins=' + encodeURIComponent(slugs.join(',')) + '&limit=' + PAGE_MAX + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const j = await cmalGet(q, env);
    for (const e of dataOf(j)) { const v = cmalEvent(e, slugToSym); if (v) out.set(v.id, v); }
    cursor = j && j.meta && j.meta.cursor ? String(j.meta.cursor) : '';
    if (!cursor) break;
  }
  return [...out.values()];
}

async function readAssets(env) {
  if (!env.CAL) return null;
  try { const j = await env.CAL.get(ASSET_KEY, 'json'); return j && Array.isArray(j.events) && j.generated_at ? j : null; } catch (_) { return null; }
}

// 取得に失敗した理由を保存しておき、/api/events の errors に出す(原因が画面で分かるように)。
async function failAssets(env, reason) {
  try { await env.CAL.put('asset:err', JSON.stringify({ at: new Date().toISOString(), reason })); } catch (_) {}
  return { ok: false, reason };
}

async function refreshAssets(env) {
  if (!env.CAL) return { ok: false, reason: 'KV未接続' };
  if (!env.CMAL_API_KEY) return { ok: false, reason: 'CMAL_API_KEY未設定' };
  const prev = await readAssets(env);
  try {
    const coins = prev && prev.coins && Object.keys(prev.coins).length === SYMS.length ? prev.coins : await cmalCoinSlugs(env);
    if (!Object.keys(coins).length) return await failAssets(env, 'コイン一覧から対象銘柄が見つかりません');
    const fresh = await cmalEvents(env, coins);
    const now = Date.now(), today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
    const byId = new Map();
    for (const e of (prev ? prev.events : [])) { const ts = Date.parse(e.at); if (isFinite(ts) && ts < today && ts > now - KEEP_MS) byId.set(e.id, e); }   // 過去分は残す。今日以降は取得結果で置き換える(日程変更・取消の反映)
    for (const e of fresh) byId.set(e.id, e);
    const merged = [...byId.values()].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
    await env.CAL.put(ASSET_KEY, JSON.stringify({ generated_at: new Date(now).toISOString(), coins, events: merged }));
    try { await env.CAL.delete('asset:err'); } catch (_) {}
    return { ok: true, count: merged.length, fetched: fresh.length };
  } catch (e) { return await failAssets(env, String(e.message || e)); }
}

// ---------- イベント(銘柄: Coindar API v2) ----------
// 無料のアクセストークン(https://coindar.org/en/api/tokens で登録)を Cloudflare のシークレット COINDAR_TOKEN に入れる。
// 未来の日付範囲を指定でき、銘柄で絞れる。無料枠の回数制限は公式に記載が無いので、6時間ごとに最大数回だけ取る。
// 応答の形(公式例): [{caption, source, source_reliable, important, date_public, date_start, date_end, coin_id, tags}]。日付は "2026-10-9 17:23" のようにゼロ埋めなし。時刻帯の記載が無いのでUTCとして扱う。
const COINDAR = 'https://coindar.org/api/v2';
const COINDAR_KEY = 'coindar:v1', COINDAR_ERR = 'coindar:err';
const COINDAR_AHEAD = 180 * DAY;
const COINDAR_NAMES = { BTC: ['bitcoin'], ETH: ['ethereum'], SOL: ['solana'], SUI: ['sui'], BNB: ['bnb', 'binance coin', 'bnb chain', 'binancecoin'] };

async function coindarGet(path, env) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(COINDAR + path + sep + 'access_token=' + encodeURIComponent(env.COINDAR_TOKEN), { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    let body = ''; try { body = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160); } catch (_) {}
    throw new Error('Coindar ' + r.status + (body ? ' 応答: ' + body : ''));
  }
  return r.json();
}
function coindarDate(str) {
  const m = String(str || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : NaN;
}
async function coindarCoinIds(env) {
  const list = await coindarGet('/coins', env);
  const out = {};
  if (!Array.isArray(list)) return out;
  for (const sym of SYMS) {
    const hits = list.filter((c) => c && String(c.symbol || '').toUpperCase() === sym);
    const named = hits.find((c) => COINDAR_NAMES[sym].includes(String(c.name || '').toLowerCase()));
    const pick = named || (hits.length === 1 ? hits[0] : null);      // 名前が合わず記号が複数ある時は、取り違え防止のため使わない
    if (pick) out[sym] = String(pick.id);
  }
  return out;
}
async function coindarFetch(env, ids) {
  const idToSym = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
  const from = new Date(Date.now() - 1 * DAY).toISOString().slice(0, 10), to = new Date(Date.now() + COINDAR_AHEAD).toISOString().slice(0, 10);
  const out = new Map();
  for (let page = 1; page <= 3; page++) {
    const q = '/events?filter_coins=' + Object.values(ids).join(',') + '&filter_date_start=' + from + '&filter_date_end=' + to + '&page=' + page + '&page_size=100&sort_by=date_start';
    const rows = await coindarGet(q, env);
    if (!Array.isArray(rows)) throw new Error('Coindar 形式が想定と違います');
    for (const e of rows) {
      const ts = coindarDate(e && e.date_start), sym = idToSym[String(e && e.coin_id)], title = String((e && e.caption) || '').trim();
      if (!isFinite(ts) || !sym || !title) continue;
      const id = 'cdr-' + hash(sym + '|' + String(e.date_start) + '|' + title);
      const ev = { id, l: 'asset', t: sym + ' ' + title, s: sym + ' ' + (title.length > 10 ? title.slice(0, 10) : title), src: 'Coindar', at: new Date(ts).toISOString(), im: String(e.important) === 'true' ? 'high' : 'mid', a: [sym] };
      if (/^https?:\/\//.test(e.source || '')) ev.u = e.source;
      out.set(id, ev);
    }
    if (rows.length < 100) break;
  }
  return [...out.values()];
}
async function readCoindar(env) {
  if (!env.CAL) return null;
  try { const j = await env.CAL.get(COINDAR_KEY, 'json'); return j && Array.isArray(j.events) && j.generated_at ? j : null; } catch (_) { return null; }
}
async function refreshCoindar(env) {
  if (!env.CAL) return { ok: false, reason: 'KV未接続' };
  if (!env.COINDAR_TOKEN) return { ok: false, reason: 'COINDAR_TOKEN未設定' };
  try {
    const prev = await readCoindar(env);
    const ids = prev && prev.ids && Object.keys(prev.ids).length === SYMS.length ? prev.ids : await coindarCoinIds(env);
    if (!Object.keys(ids).length) throw new Error('コイン一覧から対象銘柄が見つかりません');
    const fresh = await coindarFetch(env, ids), now = Date.now();
    await env.CAL.put(COINDAR_KEY, JSON.stringify({ generated_at: new Date(now).toISOString(), ids, events: fresh, missing: SYMS.filter((x) => !ids[x]) }));
    try { await env.CAL.delete(COINDAR_ERR); } catch (_) {}
    return { ok: true, count: fresh.length };
  } catch (e) {
    const reason = String(e.message || e);
    try { await env.CAL.put(COINDAR_ERR, JSON.stringify({ at: new Date().toISOString(), reason })); } catch (_) {}
    return { ok: false, reason };
  }
}

// ---------- イベント(銘柄: チェーンから直接読む予定) ----------
// 出どころが「チェーンそのもの」なので、見出しの出典に確度を明記する。鍵・申請は不要(公開API)。
//  ・BTC: 半減期。次のブロック高(210,000の倍数)と現在のブロック高から、10分/ブロックで逆算(推定)。
//  ・ETH: コンセンサス層の fork_schedule に載った未来のフォーク(エポック→時刻はジェネシス時刻から計算)。載っていなければ何も出さない。
const BTC_HEIGHT_URL = 'https://mempool.space/api/blocks/tip/height';
const ETH_BEACON = 'https://ethereum-beacon-api.publicnode.com/eth/v1';
const FAR_EPOCH = '18446744073709551615';

async function chainEvents() {
  const out = [], errors = [], now = Date.now();
  const get = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r; };
  await Promise.all([
    (async () => {
      try {
        const h = parseInt(await (await get(BTC_HEIGHT_URL)).text(), 10);
        if (!isFinite(h) || h <= 0) throw new Error('ブロック高が読めません');
        const next = (Math.floor(h / 210000) + 1) * 210000, ts = now + (next - h) * 600000;
        out.push({ id: 'btc-halving-' + next, l: 'asset', a: ['BTC'], im: 'high', t: 'BTC 半減期（ブロック ' + next.toLocaleString('en-US') + '・日付は推定）', s: 'BTC半減期(推定)', src: 'チェーン由来・推定（現在のブロック高 ' + h.toLocaleString('en-US') + ' から10分/ブロックで逆算）', at: new Date(ts).toISOString() });
      } catch (e) { errors.push('チェーン読み取り(BTC): ' + (e.message || e)); }
    })(),
    (async () => {
      try {
        const [fs, gs] = await Promise.all([get(ETH_BEACON + '/config/fork_schedule').then((r) => r.json()), get(ETH_BEACON + '/beacon/genesis').then((r) => r.json())]);
        const g = +gs.data.genesis_time * 1000;
        if (!isFinite(g) || !Array.isArray(fs.data)) throw new Error('形式が想定と違います');
        for (const f of fs.data) {
          if (String(f.epoch) === FAR_EPOCH) continue;
          const ts = g + Number(f.epoch) * 32 * 12000;
          if (ts <= now) continue;                                     // 過去のフォークは出さない
          out.push({ id: 'eth-fork-' + f.current_version, l: 'asset', a: ['ETH'], im: 'high', t: 'ETH ネットワークアップグレード（エポック ' + f.epoch + '・version ' + f.current_version + '）', s: 'ETHフォーク', src: 'チェーン確定（コンセンサス層の fork_schedule）', at: new Date(ts).toISOString() });
        }
      } catch (e) { errors.push('チェーン読み取り(ETH): ' + (e.message || e)); }
    })(),
  ]);
  return { out, errors };
}

// ---------- ETHの出口待ち(時系列を自前で貯める) ----------
// ビーコンチェーンの公開API(鍵なし)から、出口待ちのバリデータ(active_exiting)を読み、
//   件数 と 待ち日数(最後の exit_epoch − 現在のエポック、1エポック=6.4分) を30分ごとにKVへ記録する。
// 履歴を返す公開APIは使わないので、記録は導入した日から貯まる。保存は120日分。
const ETHQ_KEY = 'ethq:v1', ETHQ_KEEP = 120 * DAY, ETHQ_STALE = 90 * 60 * 1000;

async function ethQueueSample() {
  const j = async (u, ms) => { const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const head = await j(ETH_BEACON + '/beacon/headers/head', 8000);
  const slot = +head.data.header.message.slot;
  const list = await j(ETH_BEACON + '/beacon/states/head/validators?status=active_exiting', 25000);
  if (!isFinite(slot) || !Array.isArray(list.data)) throw new Error('形式が想定と違います');
  const epoch = Math.floor(slot / 32);
  let maxExit = epoch;
  for (const v of list.data) { const x = +(v.validator && v.validator.exit_epoch); if (isFinite(x) && x < 1e15 && x > maxExit) maxExit = x; }
  const days = Math.round(((maxExit - epoch) * 384 / 86400) * 10) / 10;
  return [Math.floor(Date.now() / 1000), list.data.length, days];
}

async function readEthQ(env) {
  if (!env.CAL) return null;
  try { const j = await env.CAL.get(ETHQ_KEY, 'json'); return j && Array.isArray(j.samples) ? j : null; } catch (_) { return null; }
}

async function refreshEthQ(env) {
  if (!env.CAL) return { ok: false, reason: 'KV未接続' };
  try {
    const sample = await ethQueueSample();
    const prev = await readEthQ(env), cutoff = Date.now() / 1000 - ETHQ_KEEP / 1000;
    const samples = (prev ? prev.samples : []).filter((x) => x[0] > cutoff && x[0] < sample[0]);
    samples.push(sample);
    await env.CAL.put(ETHQ_KEY, JSON.stringify({ samples }));
    return { ok: true, sample, count: samples.length };
  } catch (e) { return { ok: false, reason: String(e.message || e) }; }
}

async function ethQueueApi(env, ctx) {
  if (!env.CAL) return json({ error: 'KV未接続', samples: [] }, 503);
  let st = await readEthQ(env);
  const last = st && st.samples.length ? st.samples[st.samples.length - 1][0] * 1000 : 0;
  if (!st || Date.now() - last > ETHQ_STALE) {                       // 記録が無い・古い時は、その場で1回取る(cronが止まっていても動く)
    const rr = await refreshEthQ(env);
    st = await readEthQ(env);
    if (!st) return json({ error: rr.reason || '取得できません', samples: [] }, 502);
  }
  return json({ samples: st.samples, source: 'ビーコンチェーン公開API(自前で記録)' });
}

// ---------- イベント(銘柄: 満期日の自動計算) ----------
// Deribitの規則(公式): 全て08:00 UTC。月次=月末の最終金曜、四半期=各四半期(3・6・9・12月)の最終金曜。
// BTC/ETH/SOL にオプション・先物がある。取得元が無く、規則だけで未来の日付が確実に出せる。
const EXPIRY_SYMS = ['BTC', 'ETH', 'SOL'];
function lastFriday(y, m) {
  const d = new Date(Date.UTC(y, m + 1, 0, 8, 0, 0));          // その月の末日 08:00 UTC
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.getTime();
}
function expiryEvents(now) {
  const out = [], base = new Date(now);
  for (let k = -1; k <= 6; k++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + k, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), ts = lastFriday(y, m), q = (m + 1) % 3 === 0;
    out.push({
      id: 'exp-' + y + '-' + (m + 1), l: 'asset', a: EXPIRY_SYMS, im: q ? 'high' : 'mid',
      t: 'Deribit ' + (q ? '四半期' : '月次') + 'オプション・先物の満期（' + EXPIRY_SYMS.join('/') + '）',
      s: q ? '四半期満期' : '月次満期', src: 'Deribit満期規則（自動計算）', at: new Date(ts).toISOString(),
    });
  }
  return out;
}

// BNBの四半期オートバーン: 公式発表では「四半期ごと」で、第36回は2026-07-15に実施。次回は10月中旬の見込み。
// 正確な日付は直前の告知まで分からないので、各四半期(1・4・7・10月)の15日を「目安」として出す(時刻は12:00 UTCの仮置き)。
function bnbBurnEvents(now) {
  const out = [], base = new Date(now);
  for (let k = -1; k <= 9; k++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + k, 15, 12, 0, 0));
    if (d.getUTCMonth() % 3 !== 0) continue;
    out.push({ id: 'bnbburn-' + d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1), l: 'asset', a: ['BNB'], im: 'mid', t: 'BNB 四半期オートバーン（日付は目安・中旬ごろ）', s: 'BNBバーン(目安)', src: 'BNB Chain公式の四半期方針（目安）', at: d.toISOString() });
  }
  return out;
}

// ---------- イベント(銘柄ニュース: 暗号資産メディアのRSS) ----------
// 現在は無効(NEWS_ENABLED=false)。未来の予定だけを出す方針。再び使うときは true にする。
const NEWS_ENABLED = false;
// 鍵なし・回数制限なし。見出し・日時・リンクだけを使う(本文は取らない)。30分ごと(cron)に取得してKV(news:v1)へ保存。
// 各フィードは [URL, 媒体名, 銘柄の決め打ち(タグ専用フィードのみ)]。取れないフィードがあっても、他は使う。
const NEWS_FEEDS = [
  ['https://cointelegraph.com/rss/tag/bitcoin', 'Cointelegraph', 'BTC'],
  ['https://cointelegraph.com/rss/tag/ethereum', 'Cointelegraph', 'ETH'],
  ['https://cointelegraph.com/rss', 'Cointelegraph', null],
  ['https://www.coindesk.com/arc/outboundfeeds/rss', 'CoinDesk', null],
  ['https://decrypt.co/feed', 'Decrypt', null],
];
const NEWS_KEY = 'news:v1', NEWS_KEEP = 90 * DAY;
// タイトルから銘柄を判定する言葉(大文字小文字は区別しない)
const KEYWORDS = {
  BTC: /\b(bitcoin|btc)\b/i,
  ETH: /\b(ethereum|ether|eth)\b/i,
  SOL: /\b(solana|sol)\b/i,
  SUI: /\bsui\b/i,
  BNB: /\b(bnb|binance coin|bnb chain)\b/i,
};

function xmlText(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
}
function xmlTag(block, name) {
  const m = block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i'));
  return m ? xmlText(m[1]) : '';
}
function rssItems(xml) {
  const out = [];
  for (const b of String(xml).match(/<item[\s>][\s\S]*?<\/item>/gi) || []) {
    const title = xmlTag(b, 'title'), link = xmlTag(b, 'link'), at = Date.parse(xmlTag(b, 'pubDate') || xmlTag(b, 'dc:date'));
    if (title && link && isFinite(at)) out.push({ title, link, at });
  }
  return out;
}
function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36); }

async function newsEvents() {
  const out = new Map(), errors = [];
  await Promise.all(NEWS_FEEDS.map(async ([url, name, fixed]) => {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const items = rssItems(await r.text());
      if (!items.length) throw new Error('記事が読み取れません');
      for (const it of items) {
        const syms = SYMS.filter((x) => (fixed === x) || KEYWORDS[x].test(it.title));
        if (!syms.length || it.at > Date.now() + 3600000) continue;
        const id = 'news-' + hash(it.link.replace(/[?#].*$/, ''));
        const prev = out.get(id);
        if (prev) { prev.a = [...new Set(prev.a.concat(syms))]; continue; }      // 同じ記事は1件にまとめる
        out.set(id, { id, l: 'asset', t: it.title, s: syms[0] + ' ニュース', src: name, at: new Date(it.at).toISOString(), im: 'mid', a: syms, u: it.link });
      }
    } catch (e) { errors.push('ニュース(' + name + (fixed ? ' ' + fixed : '') + '): ' + (e.message || e)); }
  }));
  return { out: [...out.values()], errors };
}

async function readNews(env) {
  if (!env.CAL) return null;
  try { const j = await env.CAL.get(NEWS_KEY, 'json'); return j && Array.isArray(j.events) && j.generated_at ? j : null; } catch (_) { return null; }
}

async function refreshNews(env) {
  if (!env.CAL) return { ok: false, reason: 'KV未接続' };
  const fresh = await newsEvents();
  const prev = await readNews(env), now = Date.now();
  if (!fresh.out.length && !prev) {
    try { await env.CAL.put('news:err', JSON.stringify({ at: new Date(now).toISOString(), reason: fresh.errors.join(' / ') || '該当記事0件' })); } catch (_) {}
    return { ok: false, reason: fresh.errors.join(' / ') || '該当記事0件' };
  }
  const byId = new Map();
  for (const e of (prev ? prev.events : [])) { const ts = Date.parse(e.at); if (isFinite(ts) && ts > now - NEWS_KEEP) byId.set(e.id, e); }   // 記事は過去分を消さずに積み上げる
  for (const e of fresh.out) byId.set(e.id, e);
  const merged = [...byId.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  await env.CAL.put(NEWS_KEY, JSON.stringify({ generated_at: new Date(now).toISOString(), events: merged, errors: fresh.errors }));
  try { await env.CAL.delete('news:err'); } catch (_) {}
  return { ok: true, count: merged.length, fetched: fresh.out.length, errors: fresh.errors };
}

// ---------- 保存(KV) ----------
const KV_KEY = 'macro:v1';
const FRESH_MS = 3 * 3600 * 1000;        // 保存から3時間以内なら新しいとみなす(定時実行は30分ごと)
const KEEP_MS = 365 * DAY;               // 取得範囲より古い過去のイベントは1年分まで残す
const WIN_PAST = 60 * DAY;               // tvEvents() が取りに行く過去側の範囲と合わせる

async function readStore(env) {
  if (!env.CAL) return null;
  try {
    const j = await env.CAL.get(KV_KEY, 'json');
    return j && Array.isArray(j.events) && j.generated_at ? j : null;
  } catch (_) { return null; }
}

// 取得結果を、保存済みの内容とまとめる。
//  ・取得範囲(過去60日〜先)は、取得できた内容で置き換える(日程の変更・取消が反映される)
//  ・取得範囲より古い過去分は、保存済みのものを1年分まで残す(履歴が積み上がる)
//  ・一部の取得に失敗した時は、消えないよう保存済みの分も残す
function mergeStore(prev, fresh, hadErrors, now) {
  const winStart = now - WIN_PAST;
  const byId = new Map();
  for (const e of (prev ? prev.events : [])) {
    const ts = Date.parse(e.at);
    if (!isFinite(ts) || ts < now - KEEP_MS) continue;
    if (ts < winStart || hadErrors) byId.set(e.id, e);
  }
  for (const e of fresh) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

async function refreshStore(env) {
  if (!env.CAL) return { ok: false, reason: 'KV未接続' };
  const tv = await tvEvents();
  if (!tv.out.length) return { ok: false, reason: tv.errors.join(' / ') || '取得0件' };   // 空では上書きしない
  const prev = await readStore(env);
  const now = Date.now();
  const merged = mergeStore(prev, tv.out, tv.errors.length > 0, now);
  await env.CAL.put(KV_KEY, JSON.stringify({ generated_at: new Date(now).toISOString(), events: merged, errors: tv.errors }));
  return { ok: true, count: merged.length };
}

async function events(request, env, ctx) {
  const errors = [];
  let macro = [], gen = new Date().toISOString();
  const stored = await readStore(env);
  const age = stored ? Date.now() - Date.parse(stored.generated_at) : Infinity;
  if (stored && age < FRESH_MS) {
    macro = stored.events; gen = stored.generated_at;
  } else {
    const tv = await tvEvents();                       // 保存が無い/古い時だけ、その場で取得
    if (tv.out.length) {
      macro = tv.out; errors.push(...tv.errors);
      if (env.CAL && ctx) ctx.waitUntil(refreshStore(env).catch(() => {}));      // 初回はここで保存を始める
    } else if (stored) {
      macro = stored.events; gen = stored.generated_at;
      errors.push('最新の取得に失敗したため、' + Math.round(age / 3600000) + '時間前に保存した内容を表示しています');
    } else {
      errors.push(...tv.errors);
      const ff = await ffEvents();
      macro = ff.out; errors.push(...ff.errors);
      if (macro.length) errors.push('TradingViewから取得できないため、予備(Forex Factory)の今週・来週分のみ表示しています');
    }
  }
  let news = [];
  if (NEWS_ENABLED && env.CAL) {
    const ns = await readNews(env);
    if (ns) {
      news = ns.events; errors.push(...(ns.errors || []));
      if (Date.now() - Date.parse(ns.generated_at) > FRESH_MS && ctx) ctx.waitUntil(refreshNews(env).catch(() => {}));
    } else if (ctx) {
      let er = null;
      try { er = await env.CAL.get('news:err', 'json'); } catch (_) {}
      if (er && er.reason) errors.push('銘柄ニュースを取得できませんでした: ' + er.reason);
      if (!er || Date.now() - Date.parse(er.at) > 10 * 60 * 1000) {
        const rr = await refreshNews(env).catch((e) => ({ ok: false, reason: String(e.message || e) }));      // 保存が無い時だけ、取得を待ってから返す
        const ns2 = rr && rr.ok ? await readNews(env) : null;
        if (ns2) { news = ns2.events; errors.push(...(ns2.errors || [])); }
        else if (rr && rr.reason && !er) errors.push('銘柄ニュースを取得できませんでした: ' + rr.reason);
      }
    }
  }
  let asset = [];
  if (env.CMAL_API_KEY) {
    const st = await readAssets(env);
    if (st) {
      asset = st.events;
      if (Date.now() - Date.parse(st.generated_at) > ASSET_STALE_MS) errors.push('銘柄イベント(CoinMarketCal)の取得が24時間以上止まっています');
    } else if (env.CAL && ctx) {
      let er = null;
      try { er = await env.CAL.get('asset:err', 'json'); } catch (_) {}
      if (er && er.reason && Date.now() - Date.parse(er.at) <= 10 * 60 * 1000) {
        errors.push('銘柄イベント(CoinMarketCal)を取得できませんでした: ' + er.reason);          // 直近の失敗は、10分間は再試行しない
      } else {
        const rr = await refreshAssets(env).catch((e) => ({ ok: false, reason: String(e.message || e) }));      // 保存が無い時は、取得を待ってから返す
        const st2 = rr && rr.ok ? await readAssets(env) : null;
        if (st2) asset = st2.events;
        else errors.push('銘柄イベント(CoinMarketCal)を取得できませんでした: ' + ((rr && rr.reason) || '不明'));
      }
    }
  }
  let coindar = [];
  if (env.COINDAR_TOKEN && env.CAL) {
    let st = await readCoindar(env);
    if (!st) {
      let er = null; try { er = await env.CAL.get(COINDAR_ERR, 'json'); } catch (_) {}
      if (er && er.reason && Date.now() - Date.parse(er.at) <= 10 * 60 * 1000) errors.push('銘柄イベント(Coindar)を取得できませんでした: ' + er.reason);
      else {
        const rr = await refreshCoindar(env);
        st = rr.ok ? await readCoindar(env) : null;
        if (!st) errors.push('銘柄イベント(Coindar)を取得できませんでした: ' + (rr.reason || '不明'));
      }
    }
    if (st) {
      coindar = st.events;
      if (st.missing && st.missing.length) errors.push('Coindarで銘柄を特定できませんでした: ' + st.missing.join('/'));
      if (Date.now() - Date.parse(st.generated_at) > ASSET_STALE_MS) errors.push('銘柄イベント(Coindar)の取得が24時間以上止まっています');
    }
  }
  const chain = await chainEvents();
  errors.push(...chain.errors);
  const manual = await manualEvents(request, env);
  const all = macro.concat(asset, coindar, chain.out, expiryEvents(Date.now()), bnbBurnEvents(Date.now()), news, manual).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const res = json({ generated_at: gen, version: VERSION, events: all, errors });
  if (!all.length) res.headers.set('x-nocache', '1');      // 空の結果をキャッシュしない
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/candles') {
      const cfg = TFS[url.searchParams.get('tf') || ''];
      return cached(ctx, request, cfg ? cfg.ttl : 60, () => candles(url));
    }
    if (url.pathname === '/api/events') return cached(ctx, request, 300, () => events(request, env, ctx));
    if (url.pathname === '/api/ethqueue') return cached(ctx, request, 120, () => ethQueueApi(env, ctx));
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
  // 定時実行(wrangler.jsonc の triggers.crons)。結果はログ(Cloudflareの「ログ」)で確認できる。
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshStore(env).then((r) => console.log('macro refresh', JSON.stringify(r))));
    ctx.waitUntil(refreshEthQ(env).then((r) => console.log('ethq refresh', JSON.stringify(r))));
    if (NEWS_ENABLED) ctx.waitUntil(refreshNews(env).then((r) => console.log('news refresh', JSON.stringify(r))));
    const t = new Date(event.scheduledTime || Date.now());
    if (t.getUTCHours() % ASSET_EVERY_H === 0 && t.getUTCMinutes() < 30) {       // 6時間ごとの最初の回だけ
      ctx.waitUntil(refreshAssets(env).then((r) => console.log('asset refresh', JSON.stringify(r))));
      ctx.waitUntil(refreshCoindar(env).then((r) => console.log('coindar refresh', JSON.stringify(r))));
    }
  },
};
