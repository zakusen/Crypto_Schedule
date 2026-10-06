// CRYPTO SIGNAL ARCHIVE の小さなサーバー部分(Cloudflare Worker)。
//   /api/candles?sym=BTC&tf=1h  … Pacificaのローソク足(公開API・鍵なし)
//   /api/events                 … 日米欧のマクロ指標カレンダー(TradingViewの公開カレンダー。予備: Forex Factory) + 任意の追加イベント(public/events_manual.json)
//   銘柄の予定は、チェーン直読み(BTC半減期・ETHフォーク)・満期の自動計算・BNBバーンの目安・手動登録だけ。出どころ不明の投稿型カレンダーは使わない。
//   /api/ethqueue               … ETHの出口待ち・入口待ち・ステーク量(30分ごとに自前で記録)
//   /api/stake?sym=SOL|BNB      … SOL・BNBのステーク量(30分ごとに自前で記録)
// 定時実行(Cron Trigger)が30分ごとにマクロ指標を取得してKV(cal)へ保存し、/api/events は保存済みの内容を返す。
// KVが空・古い・未接続のときだけ、その場で取得する(ライブ取得)。必要な設定: wrangler.jsonc の KV と cron(鍵は不要)

// どの版が公開されているかを /api/events で確認できるようにする目印(コードを直したら更新する)
const VERSION = '2026-10-06-clean-v27-en';
const PACIFICA = 'https://api.pacifica.fi/api/v1';
const SYMS = ['BTC', 'ETH', 'SOL', 'BNB'];

// tf: 画面の足 / iv: Pacificaに頼む足 / agg: 日足から自前で束ねる種類 / bars: 返す本数 / raw: 取りに行く元の本数 / ttl: キャッシュ秒
const TFS = {
  '5m':  { iv: '5m',  step: 300,    bars: 96,  raw: 96,  ttl: 60 },
  '15m': { iv: '15m', step: 900,    bars: 96,  raw: 96,  ttl: 120 },
  '1h':  { iv: '1h',  step: 3600,   bars: 60,  raw: 60,  ttl: 300 },
  '4h':  { iv: '4h',  step: 14400,  bars: 60,  raw: 60,  ttl: 300 },
  '1d':  { iv: '1d',  step: 86400,  bars: 60,  raw: 60,  ttl: 300 },
  '1w':  { iv: '1d',  step: 86400,  bars: 52,  raw: 371, ttl: 600, agg: 'w' },
  '1M':  { iv: '1d',  step: 86400,  bars: 24,  raw: 775, ttl: 600, agg: 'M' },
};

const DAY = 86400000, WEEK = 7 * DAY;
const PAST_KEEP = 14 * DAY;   // 過去の情報は2週間前まで。イベントの取得・保存・表示と、出口待ち・ステーク量の記録の保存期間に使う(変えるならここだけ)

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
// 取得元は Pacifica が主。断られたら Hyperliquid、さらにダメなら dYdX(どちらも鍵なしの無期限先物DEX)を予備に使う(2026-10-06 v23、ユーザー決定)。
// どの取得元の値段かは保存・画面に必ず出す(予備の時は「価格：Hyperliquid（予備）」)。
const HYPERLIQUID = 'https://api.hyperliquid.xyz/info';
const DYDX = 'https://indexer.dydx.trade/v4';
const SOURCES = ['Pacifica', 'Hyperliquid', 'dYdX'];
const COOL = {}, COOL_MS = 60 * 1000;         // 429で断られた取得元は、この間は聞きに行かない
let BUDGET = Infinity;                        // 1回の定時実行で外部に聞いてよい残り回数(無料プランは1回50まで)
const DYDX_RES = { '5m': '5MINS', '15m': '15MINS', '1h': '1HOUR', '4h': '4HOURS', '1d': '1DAY' };

function srcErr(msg, noRetry) { const e = new Error(msg); e.noRetry = noRetry; return e; }

async function getJson(src, url, opt) {
  if (Date.now() < (COOL[src] || 0)) throw srcErr(src + ' 429（' + Math.ceil((COOL[src] - Date.now()) / 1000) + '秒待機中）', true);
  let lastErr;
  for (let i = 0; i < 2; i++) {            // 通信エラー・タイムアウト・5xxは1回だけやり直す。429・4xxはすぐ諦める
    if (BUDGET <= 0) throw srcErr('この回の問い合わせ上限に到達', true);
    BUDGET--;
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 5000);
    try {
      const r = await fetch(url, { ...opt, headers: { 'User-Agent': 'signal-archive/1.0', Accept: 'application/json', ...((opt && opt.headers) || {}) }, signal: ac.signal });
      if (!r.ok) {
        if (r.status === 429) COOL[src] = Date.now() + COOL_MS;
        throw srcErr(src + ' ' + r.status + (r.status === 429 ? '（取得回数の上限）' : ''), r.status < 500);
      }
      return await r.json();
    } catch (e) {
      if (e && e.name === 'AbortError') { COOL[src] = Date.now() + COOL_MS; lastErr = srcErr(src + ' 5秒で応答なし', true); } else lastErr = e;   // 遅い相手は休ませて次の取得元へ
      if (lastErr.noRetry) break;
      await new Promise((res) => setTimeout(res, 400));
    } finally { clearTimeout(tm); }
  }
  throw lastErr;
}

const clean = (rows) => rows.filter((x) => isFinite(x.t) && isFinite(x.o) && isFinite(x.h) && isFinite(x.l) && isFinite(x.c)).sort((a, b) => a.t - b.t);

async function rowsFrom(src, sym, iv, stepSec, n) {
  const now = Date.now(), start = now - (n + 2) * stepSec * 1000;
  if (src === 'Pacifica') {
    const j = await getJson(src, PACIFICA + '/kline?symbol=' + encodeURIComponent(sym) + '&interval=' + iv + '&start_time=' + start + '&end_time=' + now);
    const rows = Array.isArray(j) ? j : (j && j.data) || [];
    return clean(rows.map((x) => ({ t: +x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v || 0 })));
  }
  if (src === 'Hyperliquid') {
    const j = await getJson(src, HYPERLIQUID, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'candleSnapshot', req: { coin: sym, interval: iv, startTime: start, endTime: now } }) });
    return clean((Array.isArray(j) ? j : []).map((x) => ({ t: +x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v || 0 })));
  }
  if (src === 'dYdX') {
    if (!DYDX_RES[iv]) throw srcErr('dYdX: ' + iv + ' 非対応', true);
    const j = await getJson(src, DYDX + '/candles/perpetualMarkets/' + sym + '-USD?resolution=' + DYDX_RES[iv] + '&limit=' + Math.min(n, 100));
    return clean(((j && j.candles) || []).map((x) => ({ t: Date.parse(x.startedAt), o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.baseTokenVolume || 0 })));
  }
  throw srcErr('unknown source', true);
}

// 取得元を順に試す。最後の足が古すぎる(上場廃止・止まっている等)ものは失敗とみなす。返り値 { rows, src, errs }
async function rowsAny(sym, iv, stepSec, n) {
  const errs = [];
  for (const src of SOURCES) {
    try {
      const rows = await rowsFrom(src, sym, iv, stepSec, n);
      if (!rows.length) throw srcErr(src + ': 0本', true);
      if (Date.now() - rows[rows.length - 1].t > 3 * stepSec * 1000 + 600000) throw srcErr(src + ': 最新の足が古い', true);
      return { rows, src, errs };
    } catch (e) { errs.push(String((e && e.message) || e).slice(0, 60)); }
  }
  const e = new Error(errs.join(' / ')); e.errs = errs; throw e;
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

// ---------- 価格の保存と配信(2026-10-06 v22: 5分ごとの定時取得に一本化) ----------
// 画面が開くたびに Pacifica へ取りに行く作りをやめた。定時実行が5分ごとに全銘柄・全足を取り、KVの1キーにまとめて保存する。
// /api/candles は保存分を返すだけ(Pacifica には行かない)。何人が開いても Pacifica への問い合わせは5分に最大20回。
// Pacifica の429は Cloudflare の出口IPを他のWorkerと共有しているために起きる(こちらの回数が少なくても起きる)。
//   断られた回は前回の保存を残し、画面には「約○分前」と出す。次の5分後にまた取りに行く。
// KVの書き込みは1日1000回まで(無料)なので、4銘柄をまとめて1キー・5分に1回(1日288回)にしている。
const PX_CRON = '*/5 * * * *';
const PX2_KEY = 'px:v2';
const LIVE_TFS = ['5m', '15m', '1h', '4h'];       // 1本ずつ取る足(日足・週足・月足は日足1回からまとめて作る)
const STALE_AFTER = 12 * 60 * 1000;               // これより古い保存は stale(定時取得が2回続けて失敗)として印を付ける
const MEM = new Map();                            // 同じWorker内での短い使い回し(KVの読み込みを減らす)
const MEM_TTL = 60 * 1000;

async function buildBars(sym, tf) {
  const cfg = TFS[tf];
  const got = await rowsAny(sym, cfg.iv, cfg.step, cfg.raw);
  const rows = got.rows.slice(-cfg.bars);
  return { at: Date.now(), src: got.src, bars: rows.map((r) => [Math.floor(r.t / 1000), r.o, r.h, r.l, r.c, r.v]), errs: got.errs };
}

const DAILY_TFS = ['1d', '1w', '1M'];
function barsFromDaily(rows, tf, at, src) {
  const cfg = TFS[tf];
  let r = rows;
  if (cfg.agg) {
    const winStart = at - (cfg.raw + 2) * cfg.step * 1000;
    r = r.filter((x) => x.t >= winStart);
    const cutByWindow = r.length > 0 && r[0].t <= winStart + cfg.step * 1000;
    r = aggregate(r, cfg.agg);
    if (cutByWindow && r.length > 1) r.shift();
  }
  r = r.slice(-cfg.bars);
  if (!r.length) throw new Error('no data');
  return { at, src, bars: r.map((x) => [Math.floor(x.t / 1000), x.o, x.h, x.l, x.c, x.v]) };
}

async function readPx(env) {
  const m = MEM.get(PX2_KEY);
  if (m && Date.now() - m.t < MEM_TTL) return m.v;
  let v = null;
  try { v = env.CAL ? await env.CAL.get(PX2_KEY, 'json') : null; } catch (_) {}
  if (v) MEM.set(PX2_KEY, { t: Date.now(), v });
  return v;
}

// 定時実行(5分ごと)。1銘柄 5本(5m/15m/1h/4h/日足) × 4銘柄 = 20本。各本は Pacifica → Hyperliquid → dYdX の順に試す。
//   断られた取得元は60秒休ませるので、Pacifica が429なら残りは最初から Hyperliquid に聞く。1回の外部問い合わせは45回まで。
async function refreshPrices(env) {
  if (!env.CAL) return { skipped: 'KVが未接続' };
  let store = null;
  try { store = await env.CAL.get(PX2_KEY, 'json'); } catch (_) {}
  if (!store || !store.tfs) store = { tfs: {} };
  const oldest = (sym) => Math.min(...Object.keys(TFS).map((tf) => (store.tfs[sym] && store.tfs[sym][tf] && store.tfs[sym][tf].at) || 0));
  const order = SYMS.slice().sort((a, b) => oldest(a) - oldest(b));   // 保存が古い銘柄から
  const bySrc = {}, ng = [], t0 = Date.now();
  let ok = 0;
  const wAge = (sym) => (store.tfs[sym] && store.tfs[sym]['1w'] && store.tfs[sym]['1w'].at) || 0;
  const cand = SYMS.slice().sort((a, b) => wAge(a) - wAge(b))[0];
  const heavySym = Date.now() - wAge(cand) > 60 * 60 * 1000 ? cand : null;   // 週足・月足を作り直す銘柄(無ければ null)
  BUDGET = 45;
  try {
    for (const sym of order) {
      store.tfs[sym] = store.tfs[sym] || {};
      const jobs = LIVE_TFS.map((tf) => [tf, async () => { const o = await buildBars(sym, tf); return { src: o.src, out: { [tf]: { at: o.at, src: o.src, bars: o.bars } } }; }]);
      // 日足は毎回(直近60本だけ)。週足・月足は日足775本が要って重いので、1回の実行につき1銘柄・60分に1回だけ作り直す
      //   (2026-10-06: 毎回4銘柄分を作ると無料プランの計算時間10msを超えて、保存の前に打ち切られていた疑い)
      const heavy = sym === heavySym;
      jobs.push([heavy ? '1d/1w/1M' : '1d', async () => {
        const raw = heavy ? Math.max(...DAILY_TFS.map((tf) => TFS[tf].raw)) : TFS['1d'].raw;
        const got = await rowsAny(sym, '1d', 86400, raw), at = Date.now(), out = {};
        // dYdX は1回100本までなので、週足・月足は作らない(前回の保存を残す)
        for (const tf of (heavy && got.src !== 'dYdX' ? DAILY_TFS : ['1d'])) out[tf] = barsFromDaily(got.rows, tf, at, got.src);
        return { src: got.src, out };
      }]);
      // 1銘柄の足は同時に取る(順番に待つと遅い相手で時間を使い切る)
      const res = await Promise.allSettled(jobs.map(([, run]) => run()));
      res.forEach((r, i) => {
        if (r.status === 'fulfilled') { for (const [tf, o] of Object.entries(r.value.out)) { store.tfs[sym][tf] = o; ok++; } bySrc[r.value.src] = (bySrc[r.value.src] || 0) + 1; }
        else ng.push(sym + ' ' + jobs[i][0] + ': ' + String((r.reason && r.reason.message) || r.reason).slice(0, 120));
      });
    }
  } finally { BUDGET = Infinity; }
  store.last = { at: Date.now(), ok, by_src: bySrc, ng: ng.slice(0, 4), heavy: heavySym, ms: Date.now() - t0 };
  console.log('price fetched', JSON.stringify(store.last));      // 保存の前にログを出す(途中で止まった時にどこまで来たか分かるように)
  await env.CAL.put(PX2_KEY, JSON.stringify(store));
  MEM.set(PX2_KEY, { t: Date.now(), v: store });
  return { order: order.join('>'), ok, by_src: bySrc, heavy: heavySym, ng };
}

// 同じWorker内で取得が重ならないようにする
let PX_RUNNING = null;
function runPrices(env) {
  if (!PX_RUNNING) PX_RUNNING = refreshPrices(env).finally(() => { PX_RUNNING = null; });
  return PX_RUNNING;
}
const PX_MIN_GAP = 4 * 60 * 1000, PX_HEAL_AFTER = 15 * 60 * 1000;

// 確認用: /api/px-run を開くとその場で1回取得して結果を返す。直前の取得から4分以内なら実行せず前回の結果を返す(連打しても取得元に迷惑をかけない)
async function pxRun(env) {
  let store = null;
  try { store = env.CAL ? await env.CAL.get(PX2_KEY, 'json') : null; } catch (_) {}
  const last = store && store.last;
  if (last && Date.now() - last.at < PX_MIN_GAP) return json({ ran: false, reason: '直前の取得から4分以内', last });
  try { const r = await runPrices(env); return json({ ran: true, result: r }); }
  catch (e) { return json({ ran: true, error: String((e && e.stack) || e) }, 500); }
}

async function candles(url, env, ctx) {
  const sym = (url.searchParams.get('sym') || '').toUpperCase();
  const tf = url.searchParams.get('tf') || '';
  if (!SYMS.includes(sym) || !TFS[tf]) return json({ error: 'bad params' }, 400);
  const store = await readPx(env);
  // 保険: 定時取得が止まっていても、保存が15分以上古ければ裏で1回取りに行く
  if (ctx && env.CAL && (!store || !store.last || Date.now() - store.last.at > PX_HEAL_AFTER)) ctx.waitUntil(runPrices(env).catch(() => {}));
  let e = store && store.tfs && store.tfs[sym] && store.tfs[sym][tf];
  if (!e && env.CAL) { try { const o = await env.CAL.get('px:v1:' + sym, 'json'); e = o && o.tfs && o.tfs[tf]; } catch (_) {} }   // v21以前の控え(切り替え直後だけ)
  if (!e) return json({ error: 'まだ保存がありません(5分ごとの定時取得を待っています)' }, 503);
  const age = Date.now() - e.at;
  const out = { sym, tf, source: e.src || 'Pacifica', at: e.at, age_s: Math.round(age / 1000), bars: e.bars };
  if (age > STALE_AFTER) { out.stale = true; out.reason = (store && store.last && store.last.ng && store.last.ng[0]) || '定時取得に失敗'; }
  return json(out);
}

// ---------- イベント(マクロ: 日米欧) ----------
// 主: TradingViewの公開カレンダー(鍵なし・非公式)。予備: Forex Factoryの週次JSON(今週・来週のみ)。
const TV_CAL = 'https://economic-calendar.tradingview.com/events';
const FF_URLS = ['https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'];
const REGION = { US: '米', JP: '日', EU: '欧' };
const REGION_EN = { US: 'US', JP: 'Japan', EU: 'Euro area' };   // 英語表示用(te)
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

// TradingView の数値(例: 3.1, unit '%', scale 'K')を表示用の文字列にする。無ければ null
function tvNum(v, e) {
  if (v == null || v === '' || !isFinite(+v)) return null;
  const n = +v, sc = e.scale ? String(e.scale) : '', u = e.unit ? String(e.unit) : '';
  return (Math.abs(n) >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(Math.round(n * 1000) / 1000)) + sc + u;
}

async function tvEvents() {
  const now = Date.now();
  const from = now - PAST_KEEP, to = now + 90 * DAY, step = 50 * DAY;   // 範囲の上限が不明なので50日ずつに分けて取る
  const spans = [];
  for (let a = from; a < to; a += step) spans.push([a, Math.min(a + step, to)]);
  const errors = [], seen = new Map();
  await Promise.all(spans.map(async ([a, b]) => {
    try {
      for (const e of await tvChunk(a, b)) {
        if (!e || !e.id || !e.date || !REGION[e.country] || e.importance < 0) continue;     // 低重要度と祝日は除く
        if (/holiday/i.test(e.indicator || '')) continue;
        const L = jaLabel(e.country, String(e.title || e.indicator || ''));
        const title = String(e.title || e.indicator || '');
        const ev = { id: 'tv-' + e.id, l: 'macro', t: L.t, s: L.s, te: REGION_EN[e.country] + ' ' + title, se: title, src: e.source || 'TradingView', at: new Date(e.date).toISOString(), im: e.importance >= 1 ? 'high' : 'mid', c: e.country };
        // 予想・前回・結果(元データにある時だけ)。EVENT DATA と一覧に出す。指標名(英語)は将来の EVENT IMPACT の集計に使う
        const fc = tvNum(e.forecast, e), pv = tvNum(e.previous, e), ac = tvNum(e.actual, e);
        if (fc) ev.fc = fc; if (pv) ev.pv = pv; if (ac) ev.ac = ac;
        if (e.indicator) ev.ind = String(e.indicator).slice(0, 80);
        seen.set(e.id, ev);
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
        const ev = { id: 'ff-' + c + '-' + ts + '-' + String(e.title).replace(/[^A-Za-z0-9]/g, '').slice(0, 24), l: 'macro', t: L.t, s: L.s, src: 'Forex Factory（予備）', srce: 'Forex Factory (backup)', te: REGION_EN[c] + ' ' + String(e.title || ''), se: String(e.title || ''), at: new Date(ts).toISOString(), im: e.impact === 'High' ? 'high' : 'mid', c };
        if (e.forecast) ev.fc = String(e.forecast).slice(0, 20); if (e.previous) ev.pv = String(e.previous).slice(0, 20);
        out.push(ev);
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

// ---------- イベント(銘柄: チェーンから直接読む予定) ----------
// 出どころが「チェーンそのもの」なので、見出しの出典に確度を明記する。鍵・申請は不要(公開API)。
//  ・BTC: 半減期。次のブロック高(210,000の倍数)と現在のブロック高から、10分/ブロックで逆算(推定)。
//  ・SOL: 次のエポック境界(getEpochInfo。残りスロット×約0.4秒で換算・推定)。機能の有効化は境界で起きる。ただし「どの機能が」は公開RPCから一覧できないので出さない。
//  ・ETH: コンセンサス層の fork_schedule に載った未来のフォーク(エポック→時刻はジェネシス時刻から計算)。載っていなければ何も出さない。
const BTC_HEIGHT_URL = 'https://mempool.space/api/blocks/tip/height';
const ETH_BEACON = 'https://ethereum-beacon-api.publicnode.com/eth/v1';
const FAR_EPOCH = '18446744073709551615';
// 2026-10-05: 公式の公開RPC(api.mainnet-beta)は Cloudflare の出口IPを403で断るため、publicnode を先に使い、だめなら次へ。
//   v17: 重い問い合わせ(getVoteAccounts・getSupply)は publicnode に断られたため、dRPC の公開窓口も候補に足す。
//   確実にするなら Cloudflare のシークレット SOL_RPC_URL に鍵つきのRPC(Helius の無料枠など)を入れる(あれば最優先で使う)。
const SOL_RPCS = ['https://solana-rpc.publicnode.com', 'https://solana.drpc.org', 'https://api.mainnet-beta.solana.com'], SOL_SLOT_MS = 400;
const solRpcs = (env) => (env && env.SOL_RPC_URL ? [env.SOL_RPC_URL] : []).concat(SOL_RPCS);

async function chainEvents() {
  const out = [], errors = [], now = Date.now();
  const get = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r; };
  await Promise.all([
    (async () => {
      try {
        const h = parseInt(await (await get(BTC_HEIGHT_URL)).text(), 10);
        if (!isFinite(h) || h <= 0) throw new Error('ブロック高が読めません');
        const next = (Math.floor(h / 210000) + 1) * 210000, ts = now + (next - h) * 600000;
        out.push({ id: 'btc-halving-' + next, l: 'asset', a: ['BTC'], im: 'high', t: 'BTC 半減期（ブロック ' + next.toLocaleString('en-US') + '・日付は推定）', s: 'BTC半減期(推定)', te: 'BTC halving (block ' + next.toLocaleString('en-US') + ', date estimated)', se: 'BTC halving (est.)', src: 'チェーン由来・推定（現在のブロック高 ' + h.toLocaleString('en-US') + ' から10分/ブロックで逆算）', srce: 'On-chain estimate (block height ' + h.toLocaleString('en-US') + ' at 10 min/block)', at: new Date(ts).toISOString() });
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
          out.push({ id: 'eth-fork-' + f.current_version, l: 'asset', a: ['ETH'], im: 'high', t: 'ETH ネットワークアップグレード（エポック ' + f.epoch + '・version ' + f.current_version + '）', s: 'ETHフォーク', te: 'ETH network upgrade (epoch ' + f.epoch + ', version ' + f.current_version + ')', se: 'ETH upgrade', src: 'チェーン確定（コンセンサス層の fork_schedule）', srce: 'On-chain (consensus layer fork_schedule)', at: new Date(ts).toISOString() });
        }
      } catch (e) { errors.push('チェーン読み取り(ETH): ' + (e.message || e)); }
    })(),
    (async () => {
      try {
        const e = (await rpcAny(SOL_RPCS, { jsonrpc: '2.0', id: 1, method: 'getEpochInfo' }, 6000)).result;
        const left = e && +e.slotsInEpoch - +e.slotIndex;
        if (!e || !isFinite(left) || left <= 0) throw new Error('形式が想定と違います');
        const next = +e.epoch + 1, ts = now + left * SOL_SLOT_MS;
        out.push({ id: 'sol-epoch-' + next, l: 'asset', a: ['SOL'], im: 'low', t: 'SOL エポック ' + next + ' 開始（機能の有効化・ステーク変更の反映はこの境界）', s: 'SOLエポック境界(推定)', te: 'SOL epoch ' + next + ' begins (feature activations and stake changes take effect)', se: 'SOL epoch (est.)', src: 'チェーン由来・推定（getEpochInfo の残りスロット ' + left.toLocaleString('en-US') + ' を約0.4秒/スロットで換算。誤差は数十分）', srce: 'On-chain estimate (' + left.toLocaleString('en-US') + ' slots left × ~0.4s; error of tens of minutes)', at: new Date(ts).toISOString() });
      } catch (e) { errors.push('チェーン読み取り(SOL): ' + (e.message || e)); }
    })(),
  ]);
  return { out, errors };
}

// ---------- ETHの出口待ち(時系列を自前で貯める) ----------
// ビーコンチェーンの公開API(鍵なし)から、出口待ちのバリデータ(active_exiting)を読み、
//   件数 と 待ち日数(最後の exit_epoch − 現在のエポック、1エポック=6.4分) を30分ごとにKVへ記録する。
//   記録の形: [時刻, 出口件数, 出口日数, 入口件数, 入口日数(概算), 稼働バリデータ数]。古い記録(3・5要素)もそのまま読める。
// 履歴を返す公開APIは使わないので、記録は導入した日から貯まる。保存は120日分。
const ENTRY_CHURN_ETH = 256;   // 入金の処理上限(1エポックあたりのETH)。仕様上の上限値で、概算に使う
const ETHQ_KEY = 'ethq:v1', ETHQ_KEEP = PAST_KEEP, ETHQ_STALE = 90 * 60 * 1000;

async function ethQueueSample(env) {
  const j = async (u, ms) => { const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const head = await j(ETH_BEACON + '/beacon/headers/head', 8000);
  const slot = +head.data.header.message.slot;
  const list = await j(ETH_BEACON + '/beacon/states/head/validators?status=active_exiting', 25000);
  if (!isFinite(slot) || !Array.isArray(list.data)) throw new Error('形式が想定と違います');
  const epoch = Math.floor(slot / 32);
  let maxExit = epoch;
  for (const v of list.data) { const x = +(v.validator && v.validator.exit_epoch); if (isFinite(x) && x < 1e15 && x > maxExit) maxExit = x; }
  const days = Math.round(((maxExit - epoch) * 384 / 86400) * 10) / 10;
  // 入口待ち: Electra以降の pending_deposits(入金の順番待ち)を合計し、1エポックの処理上限(256 ETH)で割った概算日数。
  //   読めない場合(未対応のノード等)は null を入れ、出口待ちの記録は止めない。
  let entryN = null, entryDays = null;
  try {
    const pd = await j(ETH_BEACON + '/beacon/states/head/pending_deposits', 25000);
    if (Array.isArray(pd.data)) {
      let gwei = 0;
      for (const d of pd.data) { const a = +d.amount; if (isFinite(a)) gwei += a; }
      entryN = pd.data.length;
      entryDays = Math.round((gwei / 1e9 / ENTRY_CHURN_ETH * 384 / 86400) * 10) / 10;
    }
  } catch (_) { /* 入口待ちだけ欠測 */ }
  // ステーク量: validator_count(ステータス別の件数)から稼働中のバリデータ数を読む。全件を取らないので軽い。
  //   画面側で ×32 ETH の概算にする(0x02の大口は32超なので、実際はやや多い)。読めなければ null。
  let act = null;
  try {
    const vc = await j(ETH_BEACON + '/beacon/states/head/validator_count', 10000);
    const d = vc && vc.data;
    if (d && typeof d === 'object') {
      const n = (+d.active_ongoing || 0) + (+d.active_exiting || 0) + (+d.active_slashed || 0);
      if (isFinite(n) && n > 0) act = n;
    }
  } catch (_) { /* 下の予備へ */ }
  // 2026-10-05: publicnode は validator_count に答えない(記録が全部 null)ため、beaconcha.in の公開APIを予備に使う。
  //   v17: 鍵なしでも断られたので、Cloudflare のシークレット BEACONCHAIN_API_KEY(beaconcha.in の無料の鍵)があれば付ける。
  let actErr = null;
  if (act === null) {
    try {
      const k = env && env.BEACONCHAIN_API_KEY ? String(env.BEACONCHAIN_API_KEY).trim() : '';
      // 鍵はURL(apikey=)とヘッダー(apikey / Authorization: Bearer)の両方で渡す(beaconcha.in の新旧どちらの鍵でも通るように)
      const h = { 'User-Agent': UA, Accept: 'application/json' };
      if (k) { h.apikey = k; h.Authorization = 'Bearer ' + k; }
      const br = await fetch('https://beaconcha.in/api/v1/epoch/latest' + (k ? '?apikey=' + encodeURIComponent(k) : ''), { headers: h, signal: AbortSignal.timeout(10000) });
      if (!br.ok) throw new Error('HTTP ' + br.status + (k ? '' : '（鍵が未設定）'));
      const bc = await br.json();
      const n = +(bc && bc.data && (bc.data.validatorscount ?? bc.data.validatorsCount));
      if (isFinite(n) && n > 0) act = n; else actErr = 'beaconcha.in: 形式が想定と違います';
    } catch (e) { actErr = 'publicnode: validator_count 非対応 / beaconcha.in: ' + (e.message || e); }
  }
  return { sample: [Math.floor(Date.now() / 1000), list.data.length, days, entryN, entryDays, act], actErr };
}

async function readEthQ(env) {
  if (!env.CAL) return null;
  try { const j = await env.CAL.get(ETHQ_KEY, 'json'); return j && Array.isArray(j.samples) ? j : null; } catch (_) { return null; }
}

async function refreshEthQ(env) {
  if (!env.CAL) return { ok: false, reason: 'KV未接続' };
  try {
    const { sample, actErr } = await ethQueueSample(env);
    const prev = await readEthQ(env), cutoff = Date.now() / 1000 - ETHQ_KEEP / 1000;
    const samples = (prev ? prev.samples : []).filter((x) => x[0] > cutoff && x[0] < sample[0]);
    samples.push(sample);
    await env.CAL.put(ETHQ_KEY, JSON.stringify(actErr ? { samples, act_error: actErr } : { samples }));
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
  return json({ samples: st.samples, source: 'ビーコンチェーン公開API(自前で記録)', ...(st.act_error ? { act_error: st.act_error } : {}) });
}

// ---------- SOL・BNBのステーク量(時系列を自前で貯める) ----------
//  ・SOL: Solana公開RPCの getVoteAccounts(各バリデータの委任量)の合計と、getSupply の総供給。契約は使わない。
//  ・BNB: BNB Chain のステーキングはシステム契約(StakeHub)が持つ。契約以外に総量を返す窓口が見つからなかったため、
//         eth_call で getValidators → 各バリデータのクレジット契約の totalPooledBNB() を合計する(登録済み全バリデータ・概算)。
// 記録の形: SOL = [時刻, ステークSOL, 総供給SOL]、BNB = [時刻, ステークBNB]。30分ごとにKVへ、120日分。
const STAKE_KEY = 'stake:v1', STAKE_STALE = 90 * 60 * 1000;
const BSC_RPCS = ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com'], STAKEHUB = '0x0000000000000000000000000000000000002002';
// Multicall3(多くのチェーンで同じ番地に置かれている共用の契約)。各バリデータへの問い合わせを1回の eth_call にまとめる。
//   2026-10-05: 公開RPCがバッチ要求に答えず(0/56)、1件ずつだと無料プランの外部問い合わせ上限(1回の実行で50回)を超えるため。
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';

async function rpcPost(url, body, ms) {
  const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// 2026-10-05: 公開RPCは Cloudflare の出口IPを断ることがあるので、候補を順に試す。全部だめなら最後の理由を返す。
//   JSON-RPC のエラー(result が無く error がある)も「この窓口はだめ」として次へ。
const hostOf = (u) => { try { return new URL(u).host.replace(/\.(helius-rpc|alchemy)\.com.*$/, '.$1.com'); } catch (_) { return '?'; } };   // 鍵入りURLでも鍵を出さない
async function rpcAny(urls, body, ms) {
  const errs = [];
  for (const u of urls) {
    try {
      const j = await rpcPost(u, body, ms);
      if (j && !Array.isArray(j) && j.error && j.result === undefined) throw new Error('RPC ' + (j.error.message || JSON.stringify(j.error)).slice(0, 80));
      return j;
    } catch (e) { errs.push(hostOf(u) + ': ' + (e.message || e)); }   // v17: どの窓口が何で断ったかを全部残す
  }
  throw new Error(errs.join(' / '));
}

async function solStakeSample(env) {
  const urls = solRpcs(env);
  const [va, sp] = await Promise.allSettled([
    rpcAny(urls, { jsonrpc: '2.0', id: 1, method: 'getVoteAccounts', params: [{ commitment: 'finalized' }] }, 25000),
    rpcAny(urls, { jsonrpc: '2.0', id: 2, method: 'getSupply', params: [{ excludeNonCirculatingAccountsList: true }] }, 15000),
  ]);
  if (va.status !== 'fulfilled') throw new Error('getVoteAccounts: ' + ((va.reason && va.reason.message) || va.reason));
  const res = va.value.result, cur = res && res.current, del = (res && res.delinquent) || [];
  if (!Array.isArray(cur)) throw new Error('形式が想定と違います');
  let sol = 0;
  for (const v of cur.concat(del)) { const a = +v.activatedStake; if (isFinite(a)) sol += a / 1e9; }
  if (!(sol > 0)) throw new Error('値が読めません');
  // v17: 総供給は無くても記録する(割合だけ出なくなる)。getSupply は公開RPCで断られやすい
  const t = sp.status === 'fulfilled' && sp.value.result && sp.value.result.value ? +sp.value.result.value.total / 1e9 : NaN;
  return [Math.floor(Date.now() / 1000), Math.round(sol), t > 0 ? Math.round(t) : null];
}

async function bnbStakeSample() {
  const word = (n) => BigInt(n).toString(16).padStart(64, '0');
  const credits = [];
  let total = 0;
  for (let off = 0, guard = 0; guard < 6; guard++) {                // 1回100件。通常は50件前後で1回で終わる
    const r = await rpcAny(BSC_RPCS, { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: STAKEHUB, data: '0xbff02e20' + word(off) + word(100) }, 'latest'] }, 15000);
    if (!r.result || r.result.length < 2 + 64 * 3) throw new Error('getValidators が読めません');
    const h = r.result.slice(2), w = (i) => h.slice(i * 64, i * 64 + 64);
    total = parseInt(w(2), 16);
    const base = parseInt(w(1), 16) * 2, n = parseInt(h.slice(base, base + 64), 16);
    for (let i = 0; i < n; i++) credits.push('0x' + h.slice(base + 64 + i * 64 + 24, base + 64 + i * 64 + 64));
    off += 100;
    if (credits.length >= total || n === 0) break;
  }
  if (!credits.length) throw new Error('バリデータが0件です');
  const res = await rpcAny(BSC_RPCS, { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: MULTICALL3, data: encodeAggregate3(credits, '0x15d1f898') }, 'latest'] }, 20000);
  if (!res || typeof res.result !== 'string' || res.result.length < 2 + 64 * 2) throw new Error('Multicall3 の応答が読めません');
  let wei = 0n, ok = 0;
  for (const x of decodeAggregate3(res.result)) { if (x.success && x.data.length === 64) { wei += BigInt('0x' + x.data); ok++; } }
  if (ok < credits.length * 0.8) throw new Error('クレジット契約の読み取りが足りません(' + ok + '/' + credits.length + ')');
  return [Math.floor(Date.now() / 1000), Math.round(Number(wei / 10n ** 15n) / 1000)];
}

// aggregate3((address target, bool allowFailure, bytes callData)[]) の入力を作る(同じ callData を各番地へ)。
function encodeAggregate3(targets, callData) {
  const w = (n) => BigInt(n).toString(16).padStart(64, '0');
  const cd = callData.replace(/^0x/, ''), cdLen = cd.length / 2, cdPad = cd.padEnd(Math.ceil(cdLen / 32) * 64, '0');
  const tuple = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0') + w(1) + w(96) + w(cdLen) + cdPad;
  const tuples = targets.map(tuple), n = targets.length;
  let heads = '', off = n * 32;
  for (const t of tuples) { heads += w(off); off += t.length / 2; }
  return '0x82ad56cb' + w(32) + w(n) + heads + tuples.join('');
}

// aggregate3 の戻り値 (bool success, bytes returnData)[] を読む。data は 0x なしの16進。
function decodeAggregate3(hex) {
  const h = hex.replace(/^0x/, ''), word = (i) => h.slice(i * 2, i * 2 + 64), num = (i) => parseInt(word(i), 16);
  const arr = num(0), n = num(arr), out = [];
  for (let k = 0; k < n; k++) {
    const t = arr + 32 + num(arr + 32 + k * 32);
    const success = num(t) === 1, dOff = t + num(t + 32), len = num(dOff);
    out.push({ success, data: h.slice((dOff + 32) * 2, (dOff + 32 + len) * 2) });
  }
  return out;
}

async function readStake(env) {
  if (!env.CAL) return null;
  try { const j = await env.CAL.get(STAKE_KEY, 'json'); return j && typeof j === 'object' ? j : null; } catch (_) { return null; }
}

async function refreshStake(env) {
  if (!env.CAL) return { ok: false, reason: 'KV未接続' };
  const [sol, bnb] = await Promise.allSettled([solStakeSample(env), bnbStakeSample()]);
  const prev = (await readStake(env)) || {}, cutoff = Date.now() / 1000 - ETHQ_KEEP / 1000, out = { ...prev }, report = {};
  for (const [k, r] of [['SOL', sol], ['BNB', bnb]]) {
    if (r.status === 'fulfilled') {
      const old = (prev[k] && prev[k].samples) || [];
      out[k] = { samples: old.filter((x) => x[0] > cutoff && x[0] < r.value[0]).concat([r.value]) };
      report[k] = 'ok';
    } else report[k] = String((r.reason && r.reason.message) || r.reason);
  }
  try { await env.CAL.put(STAKE_KEY, JSON.stringify(out)); } catch (e) { return { ok: false, reason: String(e.message || e), report }; }
  return { ok: true, report };
}

async function stakeApi(env, sym) {
  if (sym !== 'SOL' && sym !== 'BNB') return json({ error: 'bad params' }, 400);
  if (!env.CAL) return json({ error: 'KV未接続', samples: [] }, 503);
  let st = await readStake(env);
  const smp = st && st[sym] && st[sym].samples || [];
  const last = smp.length ? smp[smp.length - 1][0] * 1000 : 0;
  if (Date.now() - last > STAKE_STALE) {                            // 記録が無い・古い時は、その場で1回取る
    const rr = await refreshStake(env);
    st = await readStake(env);
    if (!(st && st[sym] && st[sym].samples.length)) return json({ error: (rr.report && rr.report[sym]) || rr.reason || '取得できません', samples: [] }, 502);
  }
  return json({ samples: st[sym].samples, source: sym === 'SOL' ? 'Solana公開RPC(自前で記録)' : 'BNB Chain StakeHub契約(自前で記録)' });
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
      te: 'Deribit ' + (q ? 'quarterly' : 'monthly') + ' options & futures expiry (' + EXPIRY_SYMS.join('/') + ')', se: q ? 'Quarterly expiry' : 'Monthly expiry', srce: 'Deribit expiry rule (computed)',
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
    out.push({ id: 'bnbburn-' + d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1), l: 'asset', a: ['BNB'], im: 'mid', t: 'BNB 四半期オートバーン（日付は目安・中旬ごろ）', s: 'BNBバーン(目安)', te: 'BNB quarterly auto-burn (approx. mid-month)', se: 'BNB burn (approx.)', src: 'BNB Chain公式の四半期方針（目安）', srce: 'BNB Chain quarterly policy (approx.)', at: d.toISOString() });
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
const NEWS_KEY = 'news:v1', NEWS_KEEP = PAST_KEEP;
// タイトルから銘柄を判定する言葉(大文字小文字は区別しない)
const KEYWORDS = {
  BTC: /\b(bitcoin|btc)\b/i,
  ETH: /\b(ethereum|ether|eth)\b/i,
  SOL: /\b(solana|sol)\b/i,
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
const KEEP_MS = PAST_KEEP;               // 過去のイベントは2週間分だけ残す
const WIN_PAST = PAST_KEEP;              // tvEvents() が取りに行く過去側の範囲と合わせる

async function readStore(env) {
  if (!env.CAL) return null;
  try {
    const j = await env.CAL.get(KV_KEY, 'json');
    return j && Array.isArray(j.events) && j.generated_at ? j : null;
  } catch (_) { return null; }
}

// 取得結果を、保存済みの内容とまとめる。
//  ・取得範囲(過去2週間〜先)は、取得できた内容で置き換える(日程の変更・取消が反映される)
//  ・2週間より古い過去分は捨てる
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
  const [tv, ch] = await Promise.all([tvEvents(), chainEvents()]);
  const prev = await readStore(env);
  const chain = mergeChain(prev && prev.chain, ch);
  if (!tv.out.length) {                       // 指標が空では上書きしない(チェーンの控えだけは更新する)
    if (prev && ch.out.length) await env.CAL.put(KV_KEY, JSON.stringify({ ...prev, chain }));
    return { ok: false, reason: tv.errors.join(' / ') || '取得0件', chain_failed: failedChains(ch.errors) };
  }
  const now = Date.now();
  const merged = mergeStore(prev, tv.out, tv.errors.length > 0, now);
  await env.CAL.put(KV_KEY, JSON.stringify({ generated_at: new Date(now).toISOString(), events: merged, errors: tv.errors, chain }));
  return { ok: true, count: merged.length, chain_failed: failedChains(ch.errors) };
}

// チェーン読み取りの控え(2026-10-06): 公開ノードも共用IPで429になるため、最後に成功した結果を指標と同じKVに入れておく。
//   読めなかったチェーンは控えを使い、警告(errors)ではなく注記(notes)に出す。控えも無い時だけ警告にする。
const CHAIN_KEEP = 2 * DAY;
const failedChains = (errs) => (errs || []).map((x) => (String(x).match(/チェーン読み取り\((\w+)\)/) || [])[1]).filter(Boolean);
const chainOf = (e) => (Array.isArray(e.a) && e.a[0]) || '';
function mergeChain(prev, ch) {
  const failed = failedChains(ch.errors), now = Date.now(), by = {};
  for (const [sym, v] of Object.entries((prev && prev.by) || {})) if (failed.includes(sym)) by[sym] = v;
  for (const e of ch.out) { const k = chainOf(e); if (!failed.includes(k)) (by[k] = by[k] && by[k].at === now ? by[k] : { at: now, out: [] }).out.push(e); }
  return { by };
}
function chainWithFallback(ch, stored) {
  const out = ch.out.slice(), errors = [], notes = [], by = (stored && stored.by) || {};
  for (const err of ch.errors) {
    const sym = failedChains([err])[0], keep = sym && by[sym];
    if (keep && Date.now() - keep.at < CHAIN_KEEP) {
      out.push(...keep.out);
      notes.push(err + ' → ' + Math.max(1, Math.round((Date.now() - keep.at) / 60000)) + '分前の控えを表示');
    } else errors.push(err);
  }
  return { out, errors, notes };
}

async function buildEvents(request, env, ctx) {
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
  const chain = chainWithFallback(await chainEvents(), stored && stored.chain);
  errors.push(...chain.errors);
  const manual = await manualEvents(request, env);
  const all = macro.concat(chain.out, expiryEvents(Date.now()), bnbBurnEvents(Date.now()), news, manual).filter((e) => Date.parse(e.at) >= Date.now() - PAST_KEEP).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { generated_at: gen, built_at: new Date().toISOString(), version: VERSION, events: all, errors, notes: chain.notes };
}

// 完成品の保存(2026-10-06): 画面が開いた瞬間にイベント一覧を組み立てると、無料プランの計算時間の上限に当たって
//   時々失敗し、画面が空になっていた。定時実行(30分ごと)で完成品を作ってKVに文字列のまま置き、/api/events はそれを返すだけにする。
const EV_KEY = 'events:v1', EV_FRESH = 45 * 60 * 1000;
async function storeEvents(env) {
  if (!env.CAL) return { ok: false, reason: 'KV未接続' };
  const p = await buildEvents(new Request('https://assets.local/'), env, null);
  if (!p.events.length) return { ok: false, reason: '0件のため保存しない' };
  await env.CAL.put(EV_KEY, JSON.stringify(p));
  return { ok: true, count: p.events.length };
}

async function events(request, env, ctx) {
  let txt = null;
  try { txt = env.CAL ? await env.CAL.get(EV_KEY) : null; } catch (_) {}
  if (txt) {
    const m = txt.match(/"built_at":"([^"]+)"/), age = m ? Date.now() - Date.parse(m[1]) : Infinity;
    if (age > EV_FRESH && ctx) ctx.waitUntil(storeEvents(env).catch(() => {}));   // 古ければ裏で作り直す(今回は保存分を返す)
    return new Response(txt, { headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  const p = await buildEvents(request, env, ctx);                                 // 保存が無い時(初回)だけ、その場で組み立てる
  if (ctx && env.CAL && p.events.length) ctx.waitUntil(env.CAL.put(EV_KEY, JSON.stringify(p)).catch(() => {}));
  const res = json(p);
  if (!p.events.length) res.headers.set('x-nocache', '1');
  return res;
}

// 状態の確認(2026-10-06): 控えが何分前か・直近の取得結果。check_site.py が読む。キャッシュしない。
async function health(env) {
  if (!env.CAL) return json({ error: 'KV未接続' }, 503);
  const now = Date.now(), min = (t) => (t ? Math.round((now - t) / 60000) : null);
  const px = {};
  let store = null;
  try { store = await env.CAL.get(PX2_KEY, 'json'); } catch (_) {}
  for (const sym of SYMS) {
    const t = (store && store.tfs && store.tfs[sym]) || {};
    px[sym] = { age_min: Object.fromEntries(Object.keys(TFS).map((tf) => [tf, t[tf] ? min(t[tf].at) : null])), src: Object.fromEntries(Object.keys(TFS).map((tf) => [tf, t[tf] ? (t[tf].src || 'Pacifica') : null])) };
  }
  const lastCron = store && store.last ? { min_ago: min(store.last.at), ok: store.last.ok, by_src: store.last.by_src || null, heavy: store.last.heavy || null, ms: store.last.ms, ng: store.last.ng } : null;
  const st = await readStore(env);
  const eq = await readEthQ(env);
  let sk = null;
  try { sk = await env.CAL.get(STAKE_KEY, 'json'); } catch (_) {}
  const lastT = (a) => (a && a.length ? a[a.length - 1][0] * 1000 : 0);
  return json({
    version: VERSION, now: new Date(now).toISOString(),
    prices: px,
    price_cron: lastCron,
    macro: st ? { min_ago: min(Date.parse(st.generated_at)), count: st.events.length } : null,
    events_built_min: await env.CAL.get(EV_KEY).then((t) => { const m = t && t.match(/"built_at":"([^"]+)"/); return m ? min(Date.parse(m[1])) : null; }).catch(() => null),
    chain: st && st.chain ? Object.fromEntries(Object.entries(st.chain.by || {}).map(([k, v]) => [k, { min_ago: min(v.at), count: v.out.length }])) : null,
    ethqueue: eq ? { min_ago: min(lastT(eq.samples)), act_error: eq.act_error || null } : null,
    stake: sk ? Object.fromEntries(['SOL', 'BNB'].map((k) => [k, { min_ago: min(lastT(sk[k] && sk[k].samples ? sk[k].samples : sk[k])) }])) : null,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/candles') {
      return cached(ctx, request, 60, () => candles(url, env, ctx));
    }
    // 2026-10-06: 広告ブロッカーが「/api/events」をアクセス解析の送信先とみなして止めることがある(画面だけ0件になっていた)。
    //   画面は /api/cal を使う。/api/events は確認用に残す。
    if (url.pathname === '/api/events' || url.pathname === '/api/cal') return cached(ctx, request, 300, () => events(request, env, ctx));
    if (url.pathname === '/api/stake') return cached(ctx, request, 120, () => stakeApi(env, url.searchParams.get('sym')));
    if (url.pathname === '/api/ethqueue') return cached(ctx, request, 120, () => ethQueueApi(env, ctx));
    if (url.pathname === '/api/px-run') { const r = await pxRun(env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/health') { const r = await health(env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
  // 定時実行(wrangler.jsonc の triggers.crons)。結果はログ(Cloudflareの「ログ」)で確認できる。
  async scheduled(event, env, ctx) {
    // 2026-10-06: ctx.waitUntil だけだと、処理の終了後およそ30秒で打ち切られる(5分ごとの価格取得が保存前に止まっていた)。
    //   定時実行は本体で await すれば最大15分まで動けるので、終わるまで待つ。
    if (event.cron === PX_CRON) {
      try { console.log('price refresh', JSON.stringify(await runPrices(env))); }
      catch (e) { console.log('price refresh FAILED', String((e && e.stack) || e)); }
      return;
    }
    const log = (name) => (r) => console.log(name, JSON.stringify(r));
    await Promise.allSettled([
      refreshStore(env).then(log('macro refresh')).catch(() => {}).then(() => storeEvents(env)).then(log('events store')),
      refreshEthQ(env).then(log('ethq refresh')),
      refreshStake(env).then(log('stake refresh')),
      NEWS_ENABLED ? refreshNews(env).then(log('news refresh')) : null,
    ]);
  },
};
