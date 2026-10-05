// CRYPTO SIGNAL ARCHIVE の小さなサーバー部分(Cloudflare Worker)。
//   /api/candles?sym=BTC&tf=1h  … Pacificaのローソク足(公開API・鍵なし)
//   /api/events                 … 日米欧のマクロ指標カレンダー(TradingViewの公開カレンダー。予備: Forex Factory) + 任意の追加イベント(public/events_manual.json)
// 定時実行(Cron Trigger)が30分ごとにマクロ指標を取得してKV(cal)へ保存し、/api/events は保存済みの内容を返す。
// KVが空・古い・未接続のときだけ、その場で取得する(ライブ取得)。必要な設定: wrangler.jsonc の KV と cron(鍵は不要)

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
  const manual = await manualEvents(request, env);
  const all = macro.concat(manual).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const res = json({ generated_at: gen, events: all, errors });
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
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
  // 定時実行(wrangler.jsonc の triggers.crons)。結果はログ(Cloudflareの「ログ」)で確認できる。
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshStore(env).then((r) => console.log('macro refresh', JSON.stringify(r))));
  },
};
