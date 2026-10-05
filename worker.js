// CRYPTO SIGNAL ARCHIVE の小さなサーバー部分(Cloudflare Worker)。
//   /api/candles?sym=BTC&tf=1h  … Pacificaのローソク足(公開API・鍵なし)
//   /api/events                 … マクロの発表日(FRED) + 手動イベント(public/events_manual.json)
// 必要な設定: シークレット FRED_API_KEY(無料。無い場合はマクロ層だけ空になる)

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
  if (res.status !== 200) return res;
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
    if (cfg.agg) rows = aggregate(rows, cfg.agg);
    rows = rows.slice(-cfg.bars);
    if (!rows.length) return json({ error: 'no data' }, 502);
    return json({ sym, tf, source: 'Pacifica', bars: rows.map((r) => [Math.floor(r.t / 1000), r.o, r.h, r.l, r.c, r.v]) });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}

// ---------- イベント ----------
const FRED = 'https://api.stlouisfed.org/fred/release/dates';
// FREDのrelease_id。時刻は米東部時間(指定が無ければ8:30)
const RELEASES = [
  { id: 10,  t: '米消費者物価指数（CPI）',        s: 'CPI',        im: 'high' },
  { id: 50,  t: '米雇用統計',                     s: '雇用統計',   im: 'high' },
  { id: 54,  t: '米PCE（個人消費支出）',          s: 'PCE',        im: 'mid' },
  { id: 46,  t: '米PPI（生産者物価指数）',        s: 'PPI',        im: 'mid' },
  { id: 53,  t: '米GDP',                          s: 'GDP',        im: 'mid' },
  { id: 9,   t: '米小売売上高',                   s: '小売売上',   im: 'mid' },
  { id: 97,  t: '米新築住宅販売件数',             s: '新築住宅',   im: 'low', h: 10, m: 0 },
  { id: 194, t: '米ADP雇用者数',                  s: 'ADP',        im: 'low', h: 8, m: 15, wed: true },  // 週次が同居するので水曜だけ
];

function nthSunday(year, month, n) {
  const first = 1 + ((7 - new Date(Date.UTC(year, month - 1, 1)).getUTCDay()) % 7);
  return first + (n - 1) * 7;
}
// 米国の夏時間(3月第2日曜〜11月第1日曜)なら -4、そうでなければ -5
function etOffset(y, mo, d) {
  const v = Date.UTC(y, mo - 1, d);
  return v >= Date.UTC(y, 2, nthSunday(y, 3, 2)) && v < Date.UTC(y, 10, nthSunday(y, 11, 1)) ? -4 : -5;
}
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

async function fredEvents(key) {
  const now = Date.now();
  const from = ymd(now - 60 * DAY), to = ymd(now + 90 * DAY);
  const out = [], errors = [];
  await Promise.all(RELEASES.map(async (rel) => {
    const u = FRED + '?release_id=' + rel.id + '&api_key=' + encodeURIComponent(key) + '&file_type=json' +
      '&realtime_start=' + from + '&realtime_end=' + to + '&include_release_dates_with_no_data=true';
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'signal-archive/1.0' } });
      if (!r.ok) throw new Error('FRED ' + r.status);
      const j = await r.json();
      const dates = [...new Set((j.release_dates || []).map((x) => x.date).filter(Boolean))];
      for (const ds of dates) {
        const [y, mo, d] = ds.split('-').map(Number);
        if (rel.wed && new Date(Date.UTC(y, mo - 1, d)).getUTCDay() !== 3) continue;
        const at = Date.UTC(y, mo - 1, d, (rel.h ?? 8) - etOffset(y, mo, d), rel.m ?? 30);
        out.push({ id: 'fred-' + rel.id + '-' + ds, l: 'macro', t: rel.t, s: rel.s, src: 'FRED（セントルイス連銀）', at: new Date(at).toISOString(), im: rel.im });
      }
    } catch (e) { errors.push(rel.s + ': ' + (e.message || e)); }
  }));
  return { out, errors };
}

async function manualEvents(request, env) {
  try {
    const r = await env.ASSETS.fetch(new Request(new URL('/events_manual.json', request.url)));
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j.filter((e) => e && e.id && e.at && e.t && ['macro', 'market', 'asset'].includes(e.l)) : [];
  } catch (_) { return []; }
}

async function events(request, env) {
  const errors = [];
  let macro = [];
  if (env.FRED_API_KEY) {
    const r = await fredEvents(env.FRED_API_KEY);
    macro = r.out; errors.push(...r.errors);
  } else errors.push('FRED_API_KEYが未設定のため、マクロの自動取得は動いていません');
  const manual = await manualEvents(request, env);
  const all = macro.concat(manual).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return json({ generated_at: new Date().toISOString(), events: all, errors });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/candles') {
      const cfg = TFS[url.searchParams.get('tf') || ''];
      return cached(ctx, request, cfg ? cfg.ttl : 60, () => candles(url));
    }
    if (url.pathname === '/api/events') return cached(ctx, request, 1800, () => events(request, env));
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
