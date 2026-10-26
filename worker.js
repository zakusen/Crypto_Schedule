import { estimateGarch } from './public/garch-model.mjs';
// CRYPTO SIGNAL ARCHIVE の小さなサーバー部分(Cloudflare Worker)。
//   /api/candles?sym=BTC&tf=1h  … Pacificaのローソク足(公開API・鍵なし)
//   /api/events                 … 日米欧のマクロ指標カレンダー(TradingViewの公開カレンダー。予備: Forex Factory) + 任意の追加イベント(public/events_manual.json)
//   銘柄の予定は、チェーン直読み(BTC半減期・ETHフォーク)・満期の自動計算・BNBバーンの目安・手動登録だけ。出どころ不明の投稿型カレンダーは使わない。
//   /api/ethqueue               … ETHの出口待ち・入口待ち・ステーク量(30分ごとに自前で記録)
//   /api/stake?sym=SOL|BNB      … SOL・BNBのステーク量(30分ごとに自前で記録)
//   /api/liq?sym=BTC&step=3600  … ロング/ショートの清算額(Durable Object LiqHub が Bybit・OKX のストリームを集計)
// 定時実行(Cron Trigger)が30分ごとにマクロ指標を取得してKV(cal)へ保存し、/api/events は保存済みの内容を返す。
// KVが空・古い・未接続のときだけ、その場で取得する(ライブ取得)。必要な設定: wrangler.jsonc の KV と cron(鍵は不要)

// どの版が公開されているかを /api/events で確認できるようにする目印(コードを直したら更新する)
const VERSION = '2026-10-26-v203';
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
  [/interest rate decision|rate decision|federal funds rate|policy rate|main refinancing/i, null, null],      // 国ごとに下で決める
  [/non[- ]?farm payrolls?/i, '雇用統計（非農業部門雇用者数）', '雇用統計'],
  [/adp/i, 'ADP雇用者数', 'ADP'],
  [/jolts|job openings/i, 'JOLTS求人件数', 'JOLTS'],
  [/continuing (jobless )?claims/i, '継続失業保険申請件数', '継続失業保険'],
  [/jobless claims.*(4|four)[- ]?week|(4|four)[- ]?week.*jobless/i, '新規失業保険申請件数（4週平均）', '失業保険4週平均'],
  [/jobless claims/i, '新規失業保険申請件数', '失業保険'],
  [/building permits/i, '建設許可件数', '建設許可'],
  [/housing starts/i, '住宅着工件数', '住宅着工'],
  [/durable goods orders? ex|core durable/i, '耐久財受注（除輸送機器）', '耐久財除輸送'],
  [/durable goods/i, '耐久財受注', '耐久財受注'],
  [/existing home sales/i, '中古住宅販売件数', '中古住宅販売'],
  [/new home sales/i, '新築住宅販売件数', '新築住宅販売'],
  [/pending home sales/i, '中古住宅販売成約指数', '住宅成約指数'],
  [/personal income/i, '個人所得', '個人所得'],
  [/personal spending/i, '個人消費支出', '個人支出'],
  [/factory orders/i, '製造業受注', '製造業受注'],
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
  [/trade balance|balance of trade/i, '貿易収支', '貿易収支'],
  [/consumer (confidence|sentiment)/i, '消費者信頼感', '消費者信頼感'],
  [/business confidence/i, '企業景況感', '企業景況感'],
];
const POLICY = { US: ['FOMC 政策金利発表', 'FOMC'], JP: ['日銀 金融政策決定会合', '日銀'], EU: ['ECB 政策金利発表', 'ECB'] };
// v69: 主体(FOMC・日銀・ECB・FRB議長など)が国で決まる予定。短い名前(s)は集計キーになる。
//   ・「会見」「議事録」だけだと誰のものか分からなかったので、主体を付ける
//   ・同じ時刻に出る同じ発表の別の数値(ECB の預金ファシリティ金利、FOMC の経済見通し)は、政策金利発表と同じキーにまとめる(1回の反応を二重に数えない)
const JA_BY_COUNTRY = [
  [/summary of opinions/i, { JP: ['日銀 主な意見', '日銀主な意見'] }],
  [/minutes|meeting accounts/i, { US: ['FOMC議事録', 'FOMC議事録'], EU: ['ECB 理事会議事要旨', 'ECB議事要旨'], JP: ['日銀 議事要旨', '日銀議事要旨'] }],
  [/press conference/i, { US: ['FOMC 記者会見', 'FOMC会見'], EU: ['ECB 記者会見', 'ECB会見'], JP: ['日銀総裁 記者会見', '日銀会見'] }],
  [/deposit facility rate/i, { EU: ['ECB 預金ファシリティ金利', 'ECB'] }],
  [/economic projections|interest rate projections?|dot plot/i, { US: ['FOMC 経済見通し', 'FOMC'] }],
  [/fed chair\b.*testimony/i, { US: ['FRB議長 議会証言', 'FRB議長証言'] }],
  [/fed chair\b.*(speech|speaks|remarks)/i, { US: ['FRB議長 発言', 'FRB議長発言'] }],
  [/ecb president\b.*(speech|speaks|remarks)/i, { EU: ['ECB総裁 発言', 'ECB総裁発言'] }],
  [/boj gov(ernor)?\b.*(speech|speaks|remarks)/i, { JP: ['日銀総裁 発言', '日銀総裁発言'] }],
];

function jaLabel(country, title) {
  for (const [re, by] of JA_BY_COUNTRY) if (re.test(title) && by[country]) return { t: by[country][0], s: by[country][1] };
  let t = null, s = null, policy = false;
  for (const [re, jt, js] of JA) {
    if (!re.test(title)) continue;
    if (jt === null) { const p = POLICY[country]; if (p) { t = p[0]; s = p[1]; policy = true; } }
    else { t = jt; s = js; }
    break;
  }
  const region = REGION[country] || country;
  // v64: 短い名前(s)は EVENT IMPACT の集計キーにもなる。同じ時刻に出る別の数値(CPIの前年比と前月比など)が同じキーにまとまると、1回の反応が何回分にも数えられるため、前年比/前月比と細目を s にも付けて区別する
  // v66: 対応表に無い指標は、14文字で途中切りせず(「Building Permi」のように切れて、別の指標が同じ名前になっていた)、
  //   前年比/前月比/前期比の語を除いた本体を、30文字を超える時だけ単語の切れ目で短くし、語を後ろに付け直す。
  if (!t) {
    const tok = (/\b(YoY|y\/y)\b/i.exec(title) || /\b(MoM|m\/m)\b/i.exec(title) || /\b(QoQ|q\/q)\b/i.exec(title) || [''])[0];
    let base = title.replace(/\s*\b(YoY|y\/y|MoM|m\/m|QoQ|q\/q)\b/ig, '').replace(/\s+/g, ' ').trim();
    if (base.length > 30) { const cut = base.slice(0, 30), sp = cut.lastIndexOf(' '); base = (sp >= 12 ? cut.slice(0, sp) : cut).trim(); }
    return { t: region + ' ' + title, s: base + (tok ? ' ' + tok : '') };
  }
  // 政策金利・議事録・会見は主体名(FOMC/日銀/ECB)が地域を表すので、地域の接頭辞を付けない
  const noRegion = policy || /議事録|会見/.test(t);
  const q = /\b(YoY|y\/y)\b/i.test(title) ? '前年比' : /\b(MoM|m\/m)\b/i.test(title) ? '前月比' : /\b(QoQ|q\/q)\b/i.test(title) ? '前期比' : '';
  const pre = /\b(prel|flash|advance)\b/i.test(title) ? '速報' : '';
  const note = noRegion ? '' : [q, pre].filter(Boolean).join('・');
  let sub = '';
  if (!noRegion) {
    if (s === 'PPI' && /\bcore\b/i.test(title)) sub = 'コア';
    else if (s === '小売売上') sub = /ex[\s.-]*auto/i.test(title) ? '除自動車' : /control group/i.test(title) ? 'コントロール' : '';
    else if (s === 'PMI') sub = /manufactur/i.test(title) ? '製造' : /service/i.test(title) ? 'サービス' : /composite/i.test(title) ? '総合' : '';
    else if (s === '短観') sub = (/non[- ]?manufactur/i.test(title) ? '非製造業' : /manufactur/i.test(title) ? '製造業' : '') + (/outlook/i.test(title) ? '見通し' : '');
  }
  return { t: (noRegion ? '' : region + ' ') + t + (note ? '（' + note + '）' : ''), s: (noRegion ? '' : region) + s + sub + (noRegion ? '' : q) };
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

// 照合(2026-10-06): TradingView(非公式)が黙って壊れても気づけるように、同じ時期の Forex Factory(今週・来週)と件数を突き合わせる。
//  ・国(US/JP/EU)の件数が TradingView で0なのに FF にはある → FF の予定で補い、警告を出す
//  ・TradingView の件数が FF の4割未満 → 警告だけ出す(補わない)
//  ・前回の保存より件数が半分以下に減った → 警告を出す
// 照合に使う FF が取れない時は、何もせず従来どおり(警告も出さない)。warns は errors と別にして、保存の判断(hadErrors)に混ぜない。
const CROSS_DAYS = 14;
const REGION_JA = { US: '米国', JP: '日本', EU: 'ユーロ圏' };
async function tvChecked(prevCounts) {
  const [tv, ff] = await Promise.all([tvEvents(), ffEvents().catch(() => ({ out: [], errors: [] }))]);
  const res = { out: tv.out, errors: tv.errors, warns: [], counts: null };
  if (!tv.out.length) return res;
  const now = Date.now(), cs = ['US', 'JP', 'EU'];
  const cnt = (list, to) => { const c = { US: 0, JP: 0, EU: 0 }; for (const e of list) { const t = Date.parse(e.at); if (t >= now && t <= to && c[e.c] !== undefined) c[e.c]++; } return c; };
  const sum = (c) => c.US + c.JP + c.EU;
  const to14 = now + CROSS_DAYS * DAY;
  const counts = cnt(tv.out, to14);
  res.counts = { ...counts, at: new Date(now).toISOString() };
  if (ff.out.length) {
    const to = Math.min(to14, Math.max(...ff.out.map((e) => Date.parse(e.at))));    // FF が届く範囲だけで比べる
    const t = cnt(tv.out, to), f = cnt(ff.out, to);
    for (const c of cs) {
      if (t[c] === 0 && f[c] > 0) {
        res.out = res.out.concat(ff.out.filter((e) => e.c === c && Date.parse(e.at) >= now && Date.parse(e.at) <= to));
        res.warns.push('TradingViewの' + REGION_JA[c] + 'の予定が0件のため、Forex Factoryの' + f[c] + '件で補っています');
      }
    }
    if (sum(f) >= 5 && sum(t) < sum(f) * 0.4) res.warns.push('TradingViewの予定(' + sum(t) + '件)が、Forex Factory(' + sum(f) + '件)より大幅に少ないです。取得元の仕様変更の可能性があります');
  }
  if (prevCounts && sum(prevCounts) >= 8 && sum(counts) < sum(prevCounts) * 0.5) res.warns.push('TradingViewの予定が、前回の' + sum(prevCounts) + '件から' + sum(counts) + '件に減っています');
  return res;
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
  // v67: 読めたチェーン(イベントが0件でも)を ok に入れる。mergeChain が「0件で成功」も控えに残せるようにするため
  return { out, errors, ok: ['BTC', 'ETH', 'SOL'].filter((k) => !errors.some((x) => x.includes('(' + k + ')'))) };
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
  const prev0 = await readStore(env);
  const [tv, ch] = await Promise.all([tvChecked(prev0 && prev0.counts), chainEvents()]);
  const prev = prev0;
  const chain = mergeChain(prev && prev.chain, ch);
  if (!tv.out.length) {                       // 指標が空では上書きしない(チェーンの控えだけは更新する)
    if (prev && ch.out.length) await env.CAL.put(KV_KEY, JSON.stringify({ ...prev, chain }));
    return { ok: false, reason: tv.errors.join(' / ') || '取得0件', chain_failed: failedChains(ch.errors) };
  }
  const now = Date.now();
  const merged = mergeStore(prev, tv.out, tv.errors.length > 0, now);
  await env.CAL.put(KV_KEY, JSON.stringify({ generated_at: new Date(now).toISOString(), events: merged, errors: tv.errors, warns: tv.warns, counts: tv.counts || (prev && prev.counts) || null, chain }));
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
  for (const k of ch.ok || []) by[k] = { at: now, out: [] };   // v67: ETH は未来のフォークが無いと0件。0件でも「読めた」控えを残さないと、429のたびに警告になっていた
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
    errors.push(...(stored.warns || []));
  } else {
    const tv = await tvChecked(stored && stored.counts);                       // 保存が無い/古い時だけ、その場で取得
    if (tv.out.length) {
      macro = tv.out; errors.push(...tv.errors, ...tv.warns);
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
    rx: await env.CAL.get(RX_RUN, 'json').then((r) => (r ? { ...r, min_ago: min(Date.parse(r.at)) } : { never_ran: true })).catch(() => null),
    macro: st ? { min_ago: min(Date.parse(st.generated_at)), count: st.events.length, counts: st.counts || null, warns: st.warns || [] } : null,
    events_built_min: await env.CAL.get(EV_KEY).then((t) => { const m = t && t.match(/"built_at":"([^"]+)"/); return m ? min(Date.parse(m[1])) : null; }).catch(() => null),
    chain: st && st.chain ? Object.fromEntries(Object.entries(st.chain.by || {}).map(([k, v]) => [k, { min_ago: min(v.at), count: v.out.length }])) : null,
    ethqueue: eq ? { min_ago: min(lastT(eq.samples)), act_error: eq.act_error || null } : null,
    stake: sk ? Object.fromEntries(['SOL', 'BNB'].map((k) => [k, { min_ago: min(lastT(sk[k] && sk[k].samples ? sk[k].samples : sk[k])) }])) : null,
  });
}


// === v28: Solanaウォレットの署名ログイン(支払いはまだ無し・KV書き込みなし) ===
// nonce は AUTH_SECRET で署名した使い切りでない短命トークン(5分)。保存しないので、連打されてもKVの書き込み枠は減らない。
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58dec(s) {
  let n = 0n;
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) return null; n = n * 58n + BigInt(i); }
  const b = [];
  while (n > 0n) { b.push(Number(n & 255n)); n >>= 8n; }
  for (const c of s) { if (c !== '1') break; b.push(0); }
  return Uint8Array.from(b.reverse());
}
const authEq = (a, b) => a.length === b.length && [...a].reduce((r, c, i) => r | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;
async function authMac(env, text) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)));
  return [...s].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
async function authNonce(url, env) {
  if (!env.AUTH_SECRET) return json({ error: 'AUTH_SECRET not set' }, 503);
  const addr = url.searchParams.get('addr') || '';
  const pk = b58dec(addr);
  if (!pk || pk.length !== 32) return json({ error: 'bad address' }, 400);
  const exp = Date.now() + 300000, rnd = crypto.randomUUID().replace(/-/g, '');
  const mac = await authMac(env, [exp, rnd, addr, url.host].join('|'));
  const message = ['CRYPTO SIGNAL ARCHIVE', 'Sign in to prove you own this wallet. No funds are moved.',
    'Domain: ' + url.host, 'Address: ' + addr, 'Nonce: ' + exp + '.' + rnd + '.' + mac].join('\n');
  return json({ message });
}
async function authVerify(request, url, env) {
  if (!env.AUTH_SECRET) return json({ error: 'AUTH_SECRET not set' }, 503);
  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const { address, message, signature } = b || {};
  const m = /^CRYPTO SIGNAL ARCHIVE\nSign in [^\n]*\nDomain: ([^\n]+)\nAddress: ([^\n]+)\nNonce: (\d+)\.(\w+)\.(\w+)$/.exec(message || '');
  if (!m || m[1] !== url.host || m[2] !== address) return json({ error: 'bad message' }, 400);
  if (Date.now() > Number(m[3])) return json({ error: 'expired' }, 400);
  if (!authEq(await authMac(env, [m[3], m[4], address, url.host].join('|')), m[5])) return json({ error: 'bad nonce' }, 400);
  const pk = b58dec(address);
  if (!pk || pk.length !== 32) return json({ error: 'bad address' }, 400);
  let sig; try { sig = Uint8Array.from(atob(signature || ''), c => c.charCodeAt(0)); } catch (_) { return json({ error: 'bad signature' }, 400); }
  const msg = new TextEncoder().encode(message);
  let ok = false;
  for (const legacy of [false, true]) {
    try {
      const key = await crypto.subtle.importKey('raw', pk, legacy ? { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' } : { name: 'Ed25519' }, false, ['verify']);
      ok = await crypto.subtle.verify(legacy ? { name: 'NODE-ED25519' } : { name: 'Ed25519' }, key, sig, msg);
      break;
    } catch (_) {}
  }
  let until = 0;
  if (ok && env.CAL) { try { const a = await env.CAL.get('acc:v1:' + address, 'json'); until = (a && a.until) || 0; } catch (_) { return json({ error: 'kv' }, 503); } }   // v57: 読めない時に未払い扱いで返さない
  return json(ok ? { ok: true, address, until, token: await rxToken(env, address) } : { ok: false, error: 'bad signature' }, ok ? 200 : 401);
}

// === v29: 支払いの請求と確認(Solana) ===
// 請求は AUTH_SECRET で署名した短命トークン(保存しない)。照合キー(ref)もそこから決まる。確認は finalized の取引を1回読んで、
// 支払い元・ref・ミント・枚数(ちょうど)を照らす。通ったら acc:v1:<アドレス> に期限を保存する(KV書き込みは支払い1件につき2回)。
const TK = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', TK22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const PAY = {   // amt は最小単位。追加分はSolanaの標準SPLトークン。ミントは公開前に確認済み
  SOL:   { amt: 10000000n },
  USDC:  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', dec: 6, amt: 1000000n, prog: TK },
  USDT:  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', dec: 6, amt: 1000000n, prog: TK },
  RAY:   { mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', dec: 6, amt: 1000000n, prog: TK },
  PUMP:  { mint: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', dec: 6, amt: 100000000n, prog: TK22 },
  JUP:   { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', dec: 6, amt: 3000000n, prog: TK },
  PENGU: { mint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv', dec: 6, amt: 100000000n, prog: TK },
  PYTH:  { mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', dec: 6, amt: 10000000n, prog: TK },
  JTO:   { mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', dec: 9, amt: 2000000000n, prog: TK },
  BONK:  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', dec: 5, amt: 30000000000n, prog: TK },
  WIF:   { mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', dec: 6, amt: 4000000n, prog: TK },
  POPCAT:{ mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', dec: 9, amt: 20000000000n, prog: TK },
};
function b58enc(u8) {
  let n = 0n;
  for (const x of u8) n = n * 256n + BigInt(x);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of u8) { if (x) break; s = '1' + s; }
  return s;
}
async function authRaw(env, text) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)));
}
const payMissing = (env) => !env.AUTH_SECRET ? 'AUTH_SECRET not set' : !env.PAY_TO ? 'PAY_TO not set' : '';
// v45: アドレスのアクセス期限(公開してよい値)。コインを押した直後に、契約済みなら二重に払わせないために見る。署名は不要。
async function payStatus(url, env) {
  const addr = url.searchParams.get('addr') || '', pk = b58dec(addr);
  if (!pk || pk.length !== 32) return json({ error: 'bad request' }, 400);
  let until = 0;
  // v57: KVが一時的に読めない時に until:0(=未払い)を返すと、支払い済みの人に支払い画面が出ていた。読めない時は503を返し、画面は支払いへ進まず再試行を促す
  if (env.CAL) { try { const a = await env.CAL.get('acc:v1:' + addr, 'json'); until = (a && a.until) || 0; } catch (_) { return json({ error: 'kv' }, 503); } }
  return json({ until });
}
// v47: 送金の事前確認。Phantom の公式案内(取引の事前確認の警告への対処)どおり、署名を求める前に sigVerify:false で試運転し、
// 失敗する取引をウォレットに出さない(失敗しそうな取引を出すと「This dApp could be malicious」の警告になる)。署名前の取引(未署名)を受け取り、結果だけ返す。
// 受取アドレスを含まない取引は受け付けない(汎用のRPC中継に使われないように)。通信エラーなどで試運転できない時は ok:null を返し、画面は止めない。
async function paySim(request, env) {
  const miss = payMissing(env); if (miss) return json({ error: miss }, 503);
  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const t = b && b.tx;
  if (typeof t !== 'string' || t.length > 4000 || !/^[A-Za-z0-9+/=]+$/.test(t)) return json({ error: 'bad request' }, 400);
  let raw; try { raw = Uint8Array.from(atob(t), c => c.charCodeAt(0)); } catch (_) { return json({ error: 'bad request' }, 400); }
  const to = b58dec(env.PAY_TO || '');
  let has = false;
  if (to && to.length === 32) for (let i = 0; i + 32 <= raw.length && !has; i++) { let k = 0; while (k < 32 && raw[i + k] === to[k]) k++; has = k === 32; }
  if (!has) return json({ error: 'bad request' }, 400);
  try {
    const j = await rpcAny(solRpcs(env), { jsonrpc: '2.0', id: 1, method: 'simulateTransaction', params: [t, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }] }, 8000);
    const v = (j.result && j.result.value) || {};
    return json({ ok: !v.err, err: v.err || null, logs: (v.logs || []).slice(-6) });
  } catch (e) { return json({ ok: null, note: String((e && e.message) || e).slice(0, 120) }); }
}
async function payInvoice(url, env) {
  const miss = payMissing(env); if (miss) return json({ error: miss }, 503);
  const addr = url.searchParams.get('addr') || '', coin = url.searchParams.get('coin') || '', c = PAY[coin], pk = b58dec(addr);
  if (!c || !pk || pk.length !== 32) return json({ error: 'bad request' }, 400);
  const exp = Date.now() + 900000, rnd = crypto.randomUUID().replace(/-/g, '');
  const mac = await authMac(env, ['inv', exp, rnd, coin, addr, url.host].join('|'));
  const ref = b58enc(await authRaw(env, ['ref', exp, rnd, coin, addr].join('|')));
  let bh;
  try { bh = (await rpcAny(solRpcs(env), { jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] }, 8000)).result.value; }
  catch (e) { return json({ error: 'rpc: ' + String((e && e.message) || e).slice(0, 160) }, 502); }
  return json({ invoice: exp + '.' + rnd + '.' + coin + '.' + mac, coin, to: env.PAY_TO, ref, mint: c.mint || null, dec: c.dec || 9, prog: c.prog || null,
    amount: String(c.amt), blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight });
}
async function payConfirm(request, url, env) {
  const miss = payMissing(env); if (miss) return json({ error: miss }, 503);
  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const { address, invoice, signature } = b || {};
  const p = String(invoice || '').split('.'), c = PAY[p[2]];
  if (p.length !== 4 || !c || !/^\d+$/.test(p[0]) || !/^\w+$/.test(p[1]) || typeof address !== 'string' || typeof signature !== 'string' || signature.length > 100) return json({ error: 'bad request' }, 400);
  if (!authEq(await authMac(env, ['inv', p[0], p[1], p[2], address, url.host].join('|')), p[3])) return json({ error: 'bad invoice' }, 400);
  if (Date.now() > Number(p[0]) + 3600000) return json({ status: 'rejected', reason: 'invoice expired' });
  const ref = b58enc(await authRaw(env, ['ref', p[0], p[1], p[2], address].join('|')));
  const seen = env.CAL ? await env.CAL.get('tx:v1:' + signature, 'json') : null;
  if (seen) return json(seen.address === address ? { status: 'ok', until: seen.until, coin: seen.coin } : { status: 'rejected', reason: 'already used' });
  let t;
  try { t = (await rpcAny(solRpcs(env), { jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [signature, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }] }, 10000)).result; }
  catch (e) { return json({ status: 'pending', note: String((e && e.message) || e).slice(0, 120) }); }
  if (!t) return json({ status: 'pending' });
  if (t.meta && t.meta.err) return json({ status: 'rejected', reason: 'transaction failed' });
  const keys = t.transaction.message.accountKeys.map(k => typeof k === 'string' ? { pubkey: k } : k);
  if (!keys[0] || keys[0].pubkey !== address) return json({ status: 'rejected', reason: 'payer mismatch' });
  if (!keys.some(k => k.pubkey === ref)) return json({ status: 'rejected', reason: 'reference missing' });
  let got = 0n;
  if (!c.mint) { const i = keys.findIndex(k => k.pubkey === env.PAY_TO); if (i >= 0) got = BigInt(t.meta.postBalances[i]) - BigInt(t.meta.preBalances[i]); }
  else {
    const sum = (a) => (a || []).filter(x => x.owner === env.PAY_TO && x.mint === c.mint).reduce((s, x) => s + BigInt(x.uiTokenAmount.amount), 0n);
    got = sum(t.meta.postTokenBalances) - sum(t.meta.preTokenBalances);
  }
  if (got !== c.amt) return json({ status: 'rejected', reason: 'amount mismatch' });
  if (!env.CAL) return json({ status: 'pending', note: 'KV not bound' });
  const now = Date.now(), cur = await env.CAL.get('acc:v1:' + address, 'json');
  const until = Math.max(now, (cur && cur.until) || 0) + 365 * 86400000;
  await env.CAL.put('acc:v1:' + address, JSON.stringify({ until, coin: p[2], t: now }));   // 先にアクセス権(失敗しても払った人が損しない順)
  await env.CAL.put('tx:v1:' + signature, JSON.stringify({ address, until, coin: p[2], t: now }));
  return json({ status: 'ok', until, coin: p[2] });
}

// === v38: 過去の反応(2017年〜)の取り込みと記録 ===
// 指標の発表時刻(TradingViewの過去カレンダー)と、その前後の5分足(Binance現物)から、発表後 5分/15分/1時間/4時間/24時間 の変化を計算して KV に貯める。
// 取り込みは /backfill.html のボタン(または30分ごとの定時実行)が少しずつ進める。1回あたりの外部取得数を絞ってあるので、途中で止まっても続きから再開できる。
// 保存は1つのKV値(rx:v1)。results[イベントid][銘柄] = [発表時価格, 5分, 15分, 1時間, 4時間, 24時間, 1時間内の最大上, 1時間内の最大下](変化は%)。取れなかったものは 0。
// v53: 開始を2017年に。Binanceの上場前は足が無いので、銘柄ごとの上場日より前の発表は取りに行かない(BTC・ETHは2017-08-17、BNBは2017-11-06、SOLは2020-08-11)
const RX_KEY = 'rx:v1', RX_START = Date.UTC(2017, 7, 17), RX_OLD_START = Date.UTC(2021, 0, 1);
const RX_FROM = { BTC: Date.UTC(2017, 7, 17), ETH: Date.UTC(2017, 7, 17), BNB: Date.UTC(2017, 10, 6), SOL: Date.UTC(2020, 7, 11) };
const RX_SYMS = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', BNB: 'BNBUSDT' };
const RX_HZ = [3e5, 9e5, 36e5, 144e5, 864e5];
const RX_BASES = ['https://data-api.binance.vision', 'https://api.binance.com'];
async function rxToken(env, address) {
  const exp = Date.now() + 30 * DAY;   // v57: 24時間→30日。署名は30日に1回でよい(アクセス期限は別に acc:v1 で毎回確認する)
  return address + '.' + exp + '.' + await authMac(env, ['tok', address, exp].join('|'));
}
// v57: 真偽ではなく理由を返す。'ok' / 'none'(トークン無し) / 'token'(期限切れ・不正) / 'unpaid'(アクセス期限切れ) / 'err'(KVの一時エラー)
// 画面は 'token'・'unpaid' の時だけ手元のトークンを捨てて再署名へ進む。'err' では捨てない(一時的な不調で支払い済みの人を戻さない)
async function rxAccess(env, request) {
  const h = request.headers.get('authorization') || '';
  if (!h) return 'none';
  const m = /^Bearer ([1-9A-HJ-NP-Za-km-z]+)\.(\d+)\.(\w+)$/.exec(h);
  if (!m || !env.AUTH_SECRET || !env.CAL || Date.now() > Number(m[2])) return 'token';
  if (!authEq(await authMac(env, ['tok', m[1], m[2]].join('|')), m[3])) return 'token';
  try { const a = await env.CAL.get('acc:v1:' + m[1], 'json'); return a && a.until > Date.now() ? 'ok' : 'unpaid'; } catch (_) { return 'err'; }
}
async function rxLoad(env, ttl) {
  const d = await env.CAL.get(RX_KEY, ttl ? { type: 'json', cacheTtl: ttl } : 'json');
  return d && d.v === 1 ? d : { v: 1, evFrom: RX_START, evTo: RX_START, ev: [], res: {} };
}
function rxAdd(doc, have, list, now) {
  for (const e of list) {
    const ts = Date.parse(e && e.date);
    if (!e || !e.id || !isFinite(ts) || ts > now || !REGION[e.country] || !(e.importance >= 1)) continue;
    if (/holiday/i.test(e.indicator || '')) continue;
    const id = 'tv-' + e.id;
    if (have.has(id)) continue;
    const title = String(e.title || e.indicator || '');
    const ev = { i: id, t: ts, k: jaLabel(e.country, title).s + '|' + e.country, se: title.slice(0, 80) };
    const fc = tvNum(e.forecast, e), pv = tvNum(e.previous, e), ac = tvNum(e.actual, e);
    if (fc) ev.fc = fc; if (pv) ev.pv = pv; if (ac) ev.ac = ac;
    doc.ev.push(ev); have.add(id);
  }
}
async function rxIngest(doc, now, maxChunks) {
  const have = new Set(doc.ev.map(e => e.i)), errors = [];
  let chunks = 0;
  while (doc.evTo < now && chunks < maxChunks) {
    const a = doc.evTo, b = Math.min(a + 50 * DAY, now);
    try { rxAdd(doc, have, await tvChunk(a, b), now); doc.evTo = b; chunks++; }
    catch (err) { errors.push(String((err && err.message) || err)); break; }
  }
  return { chunks, errors };
}
// 過去へ遡る(50日ずつ)。doc.evFrom = ここまで取り込み済み
async function rxIngestBack(doc, now, maxChunks) {
  const have = new Set(doc.ev.map(e => e.i)), errors = [];
  let chunks = 0;
  while (doc.evFrom > RX_START && chunks < maxChunks) {
    const b = doc.evFrom, a = Math.max(RX_START, b - 50 * DAY);
    try { rxAdd(doc, have, await tvChunk(a, b), now); doc.evFrom = a; chunks++; }
    catch (err) { errors.push(String((err && err.message) || err)); break; }
  }
  return { chunks, errors };
}
async function rxBars(sym, start) {
  let last = '';
  for (const base of RX_BASES) {
    try {
      const r = await fetch(base + '/api/v3/klines?symbol=' + sym + '&interval=5m&startTime=' + start + '&limit=300', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) { last = base + ' ' + r.status; continue; }
      const j = await r.json();
      if (Array.isArray(j)) return j;
      last = base + ' 形式が想定と違います';
    } catch (err) { last = base + ' ' + String((err && err.message) || err); }
  }
  throw new Error(last);
}
// v64: 足を「何番目か」ではなく「時刻」で探す(途中で1本欠けても、残りの時間後を出す)。
//   出来高が無く足が作られなかった5分間は、直前の足の終値を使う(最大30分まで。それ以上空いた時は測れないとして null)。
//   1時間内の最大上・最大下は、1時間の12本のうち6本以上が揃っている時だけ出す。発表時刻の足(最初の足)が無い時は 0(測れない)。
const RX_STALE = 6 * 3e5;
function rxCalc(bars, ts) {
  const t0 = Math.floor(ts / 3e5) * 3e5;
  const m = new Map();
  for (const b of bars) if (Array.isArray(b)) m.set(+b[0], b);
  const f = m.get(t0);
  if (!f) return 0;
  const p0 = +f[1];
  if (!(p0 > 0)) return 0;
  const pc = x => Math.round((x / p0 - 1) * 1e5) / 1e3;
  const out = [p0];
  for (const h of RX_HZ) {
    const want = t0 + h - 3e5;                                        // h後に閉じる足の開始時刻
    let b = m.get(want), k = 0;
    while (!b && k < RX_STALE / 3e5) { k++; b = m.get(want - k * 3e5); }   // 欠けた足は直前の終値で代用
    out.push(b && b[0] >= t0 && isFinite(+b[4]) ? pc(+b[4]) : null);
  }
  let up = -Infinity, dn = Infinity, cnt = 0;
  for (let i = 0; i < 12; i++) {
    const b = m.get(t0 + i * 3e5);
    if (!b) continue;
    cnt++; up = Math.max(up, +b[2]); dn = Math.min(dn, +b[3]);
  }
  out.push(cnt >= 6 ? pc(up) : null, cnt >= 6 ? pc(dn) : null);
  // v69: 5分・15分・1時間・4時間・24時間それぞれの窓の中で、上へ最大・下へ最大で何%動いたか(足の半分以上がある時だけ)。
  //   並び: [発表時価格, 終値×5, 1時間の最大上, 1時間の最大下, 最大上×5, 最大下×5](長さ18)。旧形式(長さ8)は画面がそのまま読める
  const ups = [], dns = [];
  for (const h of RX_HZ) {
    const nb = h / 3e5; let u = -Infinity, d = Infinity, c = 0;
    for (let i = 0; i < nb; i++) { const b = m.get(t0 + i * 3e5); if (!b) continue; c++; u = Math.max(u, +b[2]); d = Math.min(d, +b[3]); }
    const ok = c >= Math.ceil(nb / 2) && isFinite(u) && isFinite(d);
    ups.push(ok ? pc(u) : null); dns.push(ok ? pc(d) : null);
  }
  out.push(...ups, ...dns);
  return out;
}
const RX_LEN = 18;   // v69: 新しい計算の長さ。これより短い記録は、rx_runner が計算し直す
function rxPending(doc, now) {
  const pairs = [];
  for (const e of [...doc.ev].sort((a, b) => b.t - a.t)) {        // 新しい発表から先に
    if (e.t + 25 * 36e5 > now) continue;                            // 24時間後までの足が揃うまで待つ
    const r = doc.res[e.i] || {};
    for (const s of Object.keys(RX_SYMS)) if (!(s in r) && e.t >= RX_FROM[s]) pairs.push([e, s]);   // 上場前は足が無いので対象外
  }
  return pairs;
}
async function rxStep(env, o) {
  if (!env.CAL) return { error: 'KV(CAL)が接続されていません' };
  const fetches = (o && o.fetches) || 30, now = Date.now(), doc = await rxLoad(env);
  const out = { errors: [] };
  let dirty = false;
  if (doc.evTo < RX_START) doc.evTo = RX_START;
  if (doc.rv !== 2) {                                               // v64: 旧計算で欠けた時間後(null)がある記録は、新しい計算でもう一度取り直す(1回だけ)
    for (const id of Object.keys(doc.res)) for (const s of Object.keys(doc.res[id])) {
      const v = doc.res[id][s];
      if (Array.isArray(v) && v.slice(1).some(x => x == null)) delete doc.res[id][s];
    }
    doc.rv = 2; dirty = true;
  }
  if (doc.evFrom == null) { doc.evFrom = doc.ev.length ? Math.min(RX_OLD_START, doc.evTo) : RX_START; dirty = true; }   // v52までの記録は2021年から
  if (now - doc.evTo >= 6 * 36e5) {                                 // カレンダーは6時間以上空いたら取り足す(初回は50日ずつ)
    const g = await rxIngest(doc, now, (o && o.chunks) || 6);
    out.chunks = g.chunks; out.errors.push(...g.errors); if (g.chunks) dirty = true;
  }
  if (doc.evFrom > RX_START) {                                      // 2017年まで遡る(カレンダーの取り足しの後、残りの枠で)
    const g = await rxIngestBack(doc, now, (o && o.chunks) || 6);
    out.chunks = (out.chunks || 0) + g.chunks; out.errors.push(...g.errors); if (g.chunks) dirty = true;
  }
  const pairs = rxPending(doc, now), take = pairs.slice(0, fetches);
  for (let i = 0; i < take.length; i += 10) {                       // 10件ずつ並行
    await Promise.all(take.slice(i, i + 10).map(async ([e, s]) => {
      try {
        const bars = await rxBars(RX_SYMS[s], Math.floor(e.t / 3e5) * 3e5);
        (doc.res[e.i] || (doc.res[e.i] = {}))[s] = rxCalc(bars, e.t); dirty = true;
      } catch (err) { out.errors.push(s + ' ' + String((err && err.message) || err)); }
    }));
  }
  if (dirty) await env.CAL.put(RX_KEY, JSON.stringify(doc));
  const left = rxPending(doc, now).length;
  out.events = doc.ev.length; out.recorded = Object.values(doc.res).reduce((n, r) => n + Object.keys(r).length, 0);
  out.pending = left; out.evTo = new Date(doc.evTo).toISOString(); out.evFrom = new Date(doc.evFrom).toISOString();
  out.done = left === 0 && now - doc.evTo < 6 * 36e5 && doc.evFrom <= RX_START;
  out.errors = [...new Set(out.errors)].slice(0, 5);
  out.at = new Date(now).toISOString();
  try { await env.CAL.put('rx:sum', JSON.stringify(out)); } catch (_) {}   // v66: 取り込みの状態を /api/health で見られるように(本体を読まずに済む小さな値)
  return out;
}
async function rxGuard(env, fn) {                                   // v66: 例外(サブリクエスト超過・計算時間超過の手前など)も要約に残す
  try { return await fn(); }
  catch (e) {
    const r = { fatal: String((e && e.message) || e).slice(0, 200), at: new Date().toISOString() };
    try { await env.CAL.put('rx:sum', JSON.stringify(r)); } catch (_) {}
    return r;
  }
}
async function rxAdmin(request, env) {                               // v68: backfill.html が呼ぶ。計算は GitHub Actions に移ったので、最後の実行結果を返すだけ
  if (!adminOk(request, env)) return json({ error: 'unauthorized' }, 401);
  let run = null; try { run = env.CAL ? await env.CAL.get(RX_RUN, 'json') : null; } catch (_) {}
  return json({ note: 'v68: 値動きの計算は GitHub Actions(RX runner)が行います', done: !!(run && run.done), events: 0, recorded: 0, pending: 0, errors: [], ...(run || {}) });
}
async function rxCron(env) {
  if (!env.CAL) return { skipped: 'no KV' };
  try { if (await env.CAL.get('rx:lock')) return { skipped: 'busy' }; } catch (_) {}
  return { skipped: 'v68: GitHub Actions(RX runner)が担当' };
}
// === v68: 過去の反応は GitHub Actions(tools/rx_runner.mjs)が計算し、指標ごとの小さな保存に分けて置く ===
// 以前は全部を1つのKV値(rx:v1)に入れ、毎回まるごと読み書きしていた。記録が増えると無料プランの計算時間(10ms)を超えるため、
//   指標の名前(k)から決まる64個の小さな保存(rx:s:00〜63。各 {v:1, ev:[{i,t,k,se,fc,pv,ac,r}]})に分け、見る時は1個だけ読む。
//   一覧(件数・最終日)は rx:idx、最後の実行結果は rx:run。Worker は保存を置くだけで、計算はしない(計算は rxBucket / rxCalc を GitHub 側が同じコードで使う)。
const RX_IDX = 'rx:idx', RX_RUN = 'rx:run';
function rxBucket(k) { return String(parseInt(hash(String(k)), 36) % 64).padStart(2, '0'); }
const rxShardKey = (k) => 'rx:s:' + rxBucket(k);
function adminOk(request, env) {
  const want = env.RX_ADMIN_KEY || env.AUTH_SECRET;       // RX_ADMIN_KEY が無ければ AUTH_SECRET を使う(設定を増やさずに済むように)
  return !!want && authEq(request.headers.get('x-admin-key') || '', String(want));
}
const RX_NAME = /^(s\d\d|idx|run|xs|xd|xk|xl|cr|vl|pt|pl|b\d{4})$/;   // v192: vl = ボラティリティ(vol:v1)   // v95: xk = 急変動の記録(x:spk) / cr = S&P500 との相関(corr:v1)
//   v72: xs = X投稿のお知らせの送信記録 / v94: xd = 自動投稿の予定(x:due)
const rxNameKey = (n) => n === 'idx' ? RX_IDX : n === 'run' ? RX_RUN : n === 'xs' ? 'x:sent' : n === 'xd' ? 'x:due' : n === 'xk' ? 'x:spk' : n === 'xl' ? 'x:liq' : n === 'cr' ? 'corr:v1' : n === 'vl' ? 'vol:v1' : n === 'pt' ? 'pat:v1' : n === 'pl' ? 'pat:log' : /^b\d{4}$/.test(n) ? 'btc5m:' + n.slice(1) : 'rx:s:' + n.slice(1);

// === v73〜v81: X 投稿の下書き置き場(/posts.html が読む)。tools/x_notify.mjs と画面が作って足し、画面で「済み」を付ける ===
//   保存は1キー(posts:v1 = {v:1, posts:[{id, sr, at, due, en, ja, h, img, done:{en,ja}, upd?}]})。合言葉(x-admin-key)が無いと読めない。
//   upsert: 無ければ足す / 済みの印が無ければ中身を置き換える / 済みの印があれば置き換えず upd に新しい中身を添える(予約後に予定が変わった印)
//   accept: upd を本体にする(予約し直した) / mark: 済みの印を付ける・外す
const POSTS_KEY = 'posts:v1', POSTS_KEEP = 30 * DAY, POSTS_MAX = 400;
async function postsApi(request, env) {
  if (!adminOk(request, env)) return json({ error: 'unauthorized' }, 401);
  if (!env.CAL) return json({ error: 'KV(CAL)が接続されていません' }, 503);
  if (request.method === 'GET') {
    const txt = await env.CAL.get(POSTS_KEY);
    return new Response(txt || '{"v":1,"posts":[]}', { headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const body = await request.text();
  if (!body || body.length > 1000000) return json({ error: 'bad body' }, 400);
  let q; try { q = JSON.parse(body); } catch (_) { return json({ error: 'bad json' }, 400); }
  let doc; try { doc = (await env.CAL.get(POSTS_KEY, { type: 'json' })) || { v: 1, posts: [] }; } catch (_) { return json({ error: 'kv' }, 503); }
  const have = new Map(doc.posts.map((p) => [p.id, p]));
  let added = 0, changed = 0, flagged = 0;
  const clean = (p) => ({ sr: String(p.sr || ''), due: +p.due || 0, en: String(p.en || ''), ja: String(p.ja || ''), h: String(p.h || ''), img: p.img || null, ...(p.man ? { man: 1 } : {}), ...(typeof p.parent === 'string' && p.parent ? { parent: p.parent.slice(0, 80) } : {}), ...(p.dues && typeof p.dues === 'object' ? { dues: { ...(+p.dues.en ? { en: +p.dues.en } : {}), ...(+p.dues.ja ? { ja: +p.dues.ja } : {}) } } : {}), ...(Array.isArray(p.langs) ? { langs: p.langs.filter((l) => l === 'en' || l === 'ja') } : {}) });   // v173: dues = 言語ごとの投稿時刻 / langs = 出す言語   // v101: man = 手で作った下書き(自動投稿しない)
  for (const p of [].concat(Array.isArray(q.add) ? q.add : [], Array.isArray(q.upsert) ? q.upsert : [])) {
    if (!p || typeof p.id !== 'string') continue;
    const o = have.get(p.id), c = clean(p);
    if (!o) { const n = { id: p.id.slice(0, 80), at: +p.at || Date.now(), ...c, done: { en: 0, ja: 0 } }; doc.posts.push(n); have.set(n.id, n); added++; continue; }
    if (!Array.isArray(q.upsert) || !q.upsert.includes(p) || o.h === c.h) continue;   // add は上書きしない
    if (o.done && (o.done.en || o.done.ja)) { if (!o.upd || o.upd.h !== c.h) { o.upd = c; flagged++; } }
    else { Object.assign(o, c); delete o.upd; changed++; }
  }
  let removed = 0;                                                    // v83: remove: 済みの印が無い下書きだけ消す
  if (Array.isArray(q.remove) && q.remove.length) { const rm = new Set(q.remove.filter((id) => { const o = have.get(id); return o && !(o.done && (o.done.en || o.done.ja)); })); if (rm.size) { doc.posts = doc.posts.filter((p) => !rm.has(p.id)); removed = rm.size; } }
  if (q.accept && have.has(q.accept)) { const o = have.get(q.accept); if (o.upd) { Object.assign(o, o.upd); delete o.upd; changed++; } }
  const m = q.mark;                                                   // 印を付ける/外す {id, lang:'en'|'ja', v:true|false}
  if (m && have.has(m.id) && (m.lang === 'en' || m.lang === 'ja')) { const p = have.get(m.id); p.done = p.done || {}; p.done[m.lang] = m.v ? Date.now() : 0; if (m.tw && /^\d{1,25}$/.test(String(m.tw))) { p.tw = { ...(p.tw || {}), [m.lang]: String(m.tw) }; if (m.no) p.no = { ...(p.no || {}), [m.lang]: +m.no || 0 }; } changed++; }   // v202: tw = X の投稿ID(日誌スレッドの返信先)/ no = その日の何本目
  if (!added && !changed && !flagged && !removed) return json({ ok: true, added, changed, flagged, removed });
  const now = Date.now(), keyT = (p) => Math.max(p.due || 0, p.at || 0);
  doc.posts = doc.posts.filter((p) => now - keyT(p) < POSTS_KEEP).sort((a, b) => keyT(b) - keyT(a)).slice(0, POSTS_MAX);
  try { await env.CAL.put(POSTS_KEY, JSON.stringify(doc)); } catch (e) { return json({ error: String((e && e.message) || e) }, 503); }
  return json({ ok: true, added, changed, flagged, removed, total: doc.posts.length });
}

// === v94: X の自動投稿の合図。5分ごとに小さな予定(x:due。tools/x_post.mjs / x_notify.mjs が書く)を見て、
//   投稿時刻を過ぎた(3時間以内の)ものがあれば GitHub Actions「X post」を起こす。同じ合図は20分に1回まで。
//   必要: Cloudflare の Secret GH_DISPATCH_TOKEN(GitHub の細かい権限の鍵。Actions: Read and write)と Secret GH_REPO(例: owner/Crypto_Schedule。デプロイで消えないよう Secret にする)
// v146: 合図は「X post」ワークフローを直接起動する(workflow_dispatch)。鍵の権限は Actions: Read and write だけで足りる
//   (それまでの repository_dispatch は Contents: write が必要で、Actions だけの鍵では断られていた)
async function ghDispatch(env, payload) {
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/x_post.yml/dispatches`, { method: 'POST', headers: { authorization: 'Bearer ' + env.GH_DISPATCH_TOKEN, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'signal-archive-worker', 'content-type': 'application/json' }, body: JSON.stringify({ ref: env.GH_REF || 'main', inputs: { dry: '0' } }) });
  let body = ''; if (r.status !== 204) { try { body = (await r.text()).slice(0, 200); } catch (_) {} }
  try { await env.CAL.put('x:disp:last', JSON.stringify({ at: Date.now(), status: r.status, body, why: payload })); } catch (_) {}   // /api/spike で見られるように
  return r;
}
// === v95 / v98: 急変動の見張り。5分ごとの価格取得のすぐ後に、保存済みの5分足で BTC の直近60分の変動を見る(v98: BTC だけ)。
//   ±3% 以上なら x:spk に記録して「X post」を起こす(下書きは tools/x_notify.mjs が Pacifica の足で作り直し、ETH・SOL・BNB・S&P500 も載せる)。
//   一度出したら6時間は出さない。ふだん(急変動なし)は KV の読み書きをしない。
//   v121: 直近60分に加えて直近6時間でも見る(どちらも ±3%。60分を優先)。win = 1 / 6(時間)
const SPIKE_PCT = 3, SPIKE_COIN = 'BTC', SPIKE_COOL = 6 * 36e5, SPIKE_COOL1 = 36e5, SPIKE_WINS = [1], SPIKE_TH = { 1: 3 }, SPIKE_DAY = 2.3;   // v200: 60分の判定は1時間あける(その日の高値・安値からは6時間)
// v199: 急変動の判定を2本にまとめた。① 直近60分で ±3%(5分足) ② 日本時間のその日の高値から −2.3% / 安値から +2.3%(それぞれ1日1回)。
//   ② の高値・安値 = その日 0:00(日本時間)からの1時間足の高値・安値 + まだ1時間足になっていない5分足。
const JST9 = 9 * 3600;
function dayHiLo(store, lastSec) {
  const d0 = Math.floor((lastSec + JST9) / 86400) * 86400 - JST9, h = store.tfs[SPIKE_COIN]['1h'], f = store.tfs[SPIKE_COIN]['5m'];
  let hi = null, lo = null;
  const add = (b) => { if (b[0] < d0) return; if (!hi || b[2] > hi.p) hi = { p: b[2], t: b[0] }; if (!lo || b[3] < lo.p) lo = { p: b[3], t: b[0] }; };
  for (const b of (h && h.bars) || []) add(b);
  for (const b of (f && f.bars) || []) add(b);
  return { d0, hi, lo, day: new Date((d0 + JST9) * 1000).toISOString().slice(0, 10) };
}
// v145: 今の判定に使う値。spikeCheck と /api/spike(確認用)で共通
function spikeNow(store, now) {
  const e = store && store.tfs && store.tfs[SPIKE_COIN] && store.tfs[SPIKE_COIN]['5m'];
  if (!e || !e.bars || e.bars.length < 13) return { error: '5分足がまだありません' };
  const last = e.bars[e.bars.length - 1], out = { price: last[4], bar: new Date(last[0] * 1000).toISOString(), data_at: new Date(e.at).toISOString(), stale: now - e.at > 10 * 60e3, src: e.src || null, wins: {} };
  const base = e.bars.find((b) => b[0] === last[0] - 3600);
  out.wins['1h'] = base && base[1] > 0 && last[4] > 0 ? { from: new Date(base[0] * 1000).toISOString(), base: base[1], chg: Math.round((last[4] / base[1] - 1) * 1e4) / 100 } : null;
  const d = dayHiLo(store, last[0]);
  out.day = { day: d.day, hi: d.hi && d.hi.p, hi_at: d.hi && new Date(d.hi.t * 1000).toISOString(), lo: d.lo && d.lo.p, lo_at: d.lo && new Date(d.lo.t * 1000).toISOString(),
    from_hi: d.hi ? Math.round((last[4] / d.hi.p - 1) * 1e4) / 100 : null, from_lo: d.lo ? Math.round((last[4] / d.lo.p - 1) * 1e4) / 100 : null };
  return out;
}
async function spikeStatus(env) {
  const now = Date.now(), store = await readPx(env), cur = spikeNow(store, now);
  let doc = null; try { doc = env.CAL ? await env.CAL.get('x:spk', { type: 'json' }) : null; } catch (_) {}
  const last = doc && doc.ev && doc.ev.length ? doc.ev[doc.ev.length - 1] : null;
  const w1 = cur.wins && cur.wins['1h'], dy = cur.day || {};
  const hit = w1 && Math.abs(w1.chg) >= SPIKE_PCT ? '1h' : dy.from_hi != null && dy.from_hi <= -SPIKE_DAY ? 'day_high' : dy.from_lo != null && dy.from_lo >= SPIKE_DAY ? 'day_low' : null;
  let disp = null; try { disp = env.CAL ? await env.CAL.get('x:disp:last', { type: 'json' }) : null; } catch (_) {}
  return json({ now: new Date(now).toISOString(), rules: { '1h_pct': SPIKE_PCT, 'day_pct': SPIKE_DAY }, last_dispatch: disp ? { at: new Date(disp.at).toISOString(), status: disp.status, ok: disp.status === 204, body: disp.body || undefined, why: disp.why } : null, gh_repo: env.GH_REPO || null, gh_token_set: !!env.GH_DISPATCH_TOKEN, ...cur, would_trigger: hit,
    last_spike: last ? { at: new Date(last.t).toISOString(), win: last.win || 1, kind: last.kind || '1h', chg: last.hit && last.hit[SPIKE_COIN] } : null,
    cooling_until: last ? (() => { const c = (last.kind || '1h') === '1h' ? SPIKE_COOL1 : SPIKE_COOL; return now - last.t < c ? new Date(last.t + c).toISOString() : null; })() : null });
}
async function spikeCheck(env) {
  if (!env.CAL) return null;
  const store = await readPx(env), now = Date.now();
  const e = store && store.tfs && store.tfs[SPIKE_COIN] && store.tfs[SPIKE_COIN]['5m'];
  if (!e || !e.bars || e.bars.length < 13 || now - e.at > 10 * 60e3) return null;
  const last = e.bars[e.bars.length - 1];
  let ev = null;
  const b1 = e.bars.find((b) => b[0] === last[0] - 3600);
  if (b1 && b1[1] > 0 && last[4] > 0) { const c = Math.round((last[4] / b1[1] - 1) * 1e4) / 100; if (Math.abs(c) >= SPIKE_PCT) ev = { kind: '1h', win: 1, chg: c }; }
  const d = dayHiLo(store, last[0]);
  if (!ev && d.hi && last[4] <= d.hi.p * (1 - SPIKE_DAY / 100)) ev = { kind: 'dayhi', from: d.hi.t * 1000, chg: Math.round((last[4] / d.hi.p - 1) * 1e4) / 100 };
  if (!ev && d.lo && last[4] >= d.lo.p * (1 + SPIKE_DAY / 100)) ev = { kind: 'daylo', from: d.lo.t * 1000, chg: Math.round((last[4] / d.lo.p - 1) * 1e4) / 100 };
  if (!ev) return null;
  const doc = (await env.CAL.get('x:spk', { type: 'json' })) || {};
  const recent = (doc.ev || []).filter((x) => now - x.t < 48 * 36e5);
  if (ev.kind === '1h') {
    if (recent.some((x) => (x.kind || '1h') === '1h' && now - x.t < SPIKE_COOL1)) return { cooling: ev.chg };   // v200: 60分どうしは1時間あける(次の60分は前と重ならない)
  } else {
    if (recent.some((x) => x.kind !== '1h' && x.kind && now - x.t < SPIKE_COOL)) return { cooling: ev.chg };   // その日の高値・安値からは6時間あける
    if (recent.some((x) => x.kind === ev.kind && x.day === d.day)) return { done_today: ev.kind };   // それぞれ1日1回
    const dir = ev.kind === 'dayhi' ? -1 : 1;   // 同じ日に同じ向きの60分の判定がもう出ていれば出さない(同じ下げを2回出さない)
    if (recent.some((x) => (x.kind || '1h') === '1h' && x.day === d.day && Math.sign((x.hit && x.hit[SPIKE_COIN]) || 0) === dir)) return { covered_by_1h: ev.kind };
  }
  if (ev.kind !== '1h') ev.win = Math.max(1, Math.ceil((now - ev.from) / 36e5));
  const rec = { id: 'spike:' + now, t: now, win: ev.win, kind: ev.kind, ...(ev.from ? { from: ev.from } : {}), day: d.day, hit: { [SPIKE_COIN]: ev.chg } };
  await env.CAL.put('x:spk', JSON.stringify({ ev: [...recent, rec].slice(-10) }));
  if (!env.GH_DISPATCH_TOKEN || !env.GH_REPO) return { ev: rec, dispatched: 'GH の鍵が未設定' };
  const r = await ghDispatch(env, { spike: rec.id });
  return { ev: rec, dispatched: r.status };
}

async function xDispatch(env) {
  if (!env.GH_DISPATCH_TOKEN || !env.GH_REPO || !env.CAL) return null;
  const now = Date.now(), due = await env.CAL.get('x:due', { type: 'json' });
  const hit = ((due && due.items) || []).filter((x) => x.due <= now && now - x.due < (String(x.id).startsWith('spike:') ? 6 : 3) * 3600e3);   // v147: 急変動は6時間まで
  if (!hit.length) return null;
  const last = Number(await env.CAL.get('x:disp')) || 0;
  if (now - last < 20 * 60e3) return { wait: true, n: hit.length };
  await env.CAL.put('x:disp', String(now), { expirationTtl: 86400 });
  const r = await ghDispatch(env, { ids: hit.map((x) => x.id).slice(0, 10) });
  return { dispatched: r.status, ids: hit.map((x) => x.id) };
}

// 画面向け。無料: 件数(total)だけ / 有効期限内のウォレットでログイン済み: 全期間の中身(rows)。
async function rxApi(request, url, env) {
  if (!env.CAL) return json({ error: 'KV(CAL)が接続されていません' }, 503);
  const k = url.searchParams.get('k');
  if (!k) {                                                           // 指標の一覧は計算済みの文字列をそのまま返す(解析しない)
    let txt = null;
    try { txt = await env.CAL.get(RX_IDX); } catch (_) { return json({ error: 'kv' }, 503); }
    return new Response(txt || '{"indicators":[],"evTo":0}', { headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  let sh; try { sh = await env.CAL.get(rxShardKey(k), { type: 'json', cacheTtl: 60 }); } catch (_) { return json({ error: 'kv' }, 503); }   // v57: KVの一時エラーは再試行できる形で返す
  const has = e => e.r && Object.keys(e.r).some(s => e.r[s]);
  const seenT = new Set();                                          // v64: 同じキーで同じ発表時刻の行は1回分にまとめる
  const all = ((sh && sh.ev) || []).filter(e => e.k === k && has(e)).sort((a, b) => b.t - a.t).filter(e => !seenT.has(e.t) && seenT.add(e.t));
  // v52: 無料は件数(total)だけ。変動率の中身(rows)は有料のみ返す
  const auth = await rxAccess(env, request), full = auth === 'ok';
  const rows = (full ? all : []).map(e => {
    const r = {}; for (const s of Object.keys(e.r)) if (e.r[s]) r[s] = e.r[s];
    const o = { t: e.t, r }; if (e.fc) o.fc = e.fc; if (e.pv) o.pv = e.pv; if (e.ac) o.ac = e.ac; return o;
  });
  return json({ k, total: all.length, locked: !full, auth, rows });
}

// GitHub Actions 用(合言葉つき)。GET: 保存を全部まとめて返す(解析しない)。POST ?name=s07|idx|run: 文字列をそのまま保存する。
async function rxGet(request, env) {
  if (!adminOk(request, env)) return json({ error: 'unauthorized' }, 401);
  if (!env.CAL) return json({ error: 'KV(CAL)が接続されていません' }, 503);
  try {
    const names = Array.from({ length: 64 }, (_, i) => 's' + String(i).padStart(2, '0'));
    const parts = await Promise.all(names.map((n) => env.CAL.get(rxNameKey(n))));
    const seed = await env.CAL.get(RX_KEY);                          // v67までの取り込み済みの予定(最初の1回だけ使う)
    const sh = names.map((n, i) => parts[i] ? JSON.stringify(n) + ':' + parts[i] : null).filter(Boolean).join(',');
    return new Response('{"seed":' + (seed || 'null') + ',"shards":{' + sh + '}}', { headers: { 'content-type': 'application/json; charset=utf-8' } });
  } catch (e) { return json({ error: String((e && e.message) || e) }, 503); }
}
async function rxPut(request, url, env) {
  if (!adminOk(request, env)) return json({ error: 'unauthorized' }, 401);
  if (!env.CAL) return json({ error: 'KV(CAL)が接続されていません' }, 503);
  const name = url.searchParams.get('name') || '';
  if (!RX_NAME.test(name)) return json({ error: 'bad name' }, 400);
  if (name.startsWith('s') && Number(name.slice(1)) > 63) return json({ error: 'bad name' }, 400);
  const body = await request.text();
  if (!body || body.length > 3000000 || body[0] !== '{') return json({ error: 'bad body' }, 400);
  try { await env.CAL.put(rxNameKey(name), body); } catch (e) { return json({ error: String((e && e.message) || e) }, 503); }
  return json({ ok: true, name, bytes: body.length });
}

// ---------- 清算額(v150): Durable Object が取引所の清算ストリームを常時受信して5分足に集計 ----------
// ロング清算 = 買いポジションの強制決済(売り注文で約定)。ショート清算はその逆。金額はUSD建て(数量×価格)。
// 取引所: Bybit(allLiquidation)・OKX(liquidation-orders)。合算で、どれかが落ちても他は続く。(v155: Binance は Cloudflare のIPを HTTP 403 で断るため外した)
// 保存: DOのstorageに日ごと('d:BTC:2026-10-09')。5分刻み(0〜287)→[ロング,ショート]。2週間(PAST_KEEP)より古い日は捨てる。
const LIQ_STEP = 300000;
const LIQ_FLUSH = 30000;
// v152: 巨額清算の「事象」の判定(直近1時間の、ロング清算かショート清算の大きい方が、銘柄ごとの閾値以上)。
//   始まり = どれかの銘柄が閾値以上 / 終わり = 全銘柄が閾値の半分を下回った時(または始まりから6時間)。終わった時に総括を1本投稿する。
//   終わった後に再び閾値を超えたら別の事象。1日(日本時間)の投稿は LIQ_DAILY_CAP 本まで。閾値は推定の初期値(実測で見直す)。
const LIQ_TH = { BTC: 30e6, ETH: 25e6, SOL: 8e6, BNB: 3e6 };   // v163: Coinalyze 4社(Binance・Bybit・OKX・Huobi)合算に合わせ v152 の値へ戻した。実測で見直す(tools/liq_th.mjs)   // v155: Binance を外した分(全取引所の規模の約4割と仮定)に合わせて、v152 の値(30/25/8/3M)の0.4倍。実測で見直す(tools/liq_th.mjs)
const LIQ_QUIET = 0.5, LIQ_MAXWAIT = 6 * 36e5, LIQ_DAILY_CAP = 5;
const jstDay = (t) => liqDay(t + 9 * 36e5);
const LIQ_OKX_CT = { BTC: 0.01, ETH: 0.1, SOL: 1, BNB: 0.01 };   // OKXの1枚あたりの数量(取れない時の既定値。起動時に公式の値で上書き)
const liqDay = (t) => new Date(t).toISOString().slice(0, 10);
// v158: 過去分の取り込み(Coinalyze の /liquidation-history。Bybit・OKX の USDT無期限、5分刻み、USD換算)。鍵は env.COINALYZE_KEY(Cloudflare のシークレット)。鍵が無ければ何もしない。
//   起動後の最初の alarm で1回だけ取り込む。失敗したら10分おきに6回、それでも駄目なら6時間おき。BF_VER を変えてデプロイすると、もう一度取り込む。
const CZ_BASE = 'https://api.coinalyze.net/v1';
const BF_VER = 'v163';   // v159: 日足を取れる限り(2017年〜)遡って長期用に保存する

export class LiqHub {
  constructor(state, env) {
    this.state = state; this.env = env;
    this.days = {};          // 'BTC:2026-10-09' -> { slot: [long, short] }
    this.max = {};           // 'BTC' -> [usd, 'long'|'short', ts, src]  直近24時間の最大1件の目安
    this.dirty = new Set();
    this.src = {};           // 取引所ごとの状態 { at: 最後の受信, n: 受信数, err: 直近の失敗理由, ws }
    this.ct = { ...LIQ_OKX_CT };
    this.boot = Date.now(); this.alarms = 0; this.alarmAt = null; this.stale = 0; this.bf = null; this.bfBusy = false;   // v156: 診断用(このインスタンスがいつ起きたか・alarmが動いているか)
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const all = await this.state.storage.list({ prefix: 'd:' });
      for (const [k, v] of all) this.days[k.slice(2)] = v;
      const mx = await this.state.storage.get('max'); if (mx) this.max = mx;
      this.ev = (await this.state.storage.get('ev')) || { open: null, log: [] };
      this.bf = (await this.state.storage.get('bf')) || null;   // v158: 過去分の取り込みの記録
    });
  }

  add(sym, side, usd, ts, src) {
    if (!SYMS.includes(sym) || !(usd > 0) || !(ts > 0)) return;
    if (Date.now() - ts > 600000) { this.stale++; return; }   // v156: 10分より古い記録は入れない(購読直後に古い記録が来たため。再接続のたびの二重計上も防ぐ)
    const key = sym + ':' + liqDay(ts), slot = Math.floor((ts % DAY) / LIQ_STEP);
    const d = this.days[key] || (this.days[key] = {});
    const c = d[slot] || (d[slot] = [0, 0]);
    c[side === 'long' ? 0 : 1] += usd;
    if (!(usd <= (c[2] || 0))) { c[2] = usd; c[3] = side === 'long' ? 1 : 0; }   // この5分の最大1件(総括の「最大の1件」に使う)
    this.dirty.add(key);
    const m = this.max[sym];
    if (!m || Date.now() - m[2] > DAY || usd > m[0]) this.max[sym] = [usd, side, ts, src];
  }

  maxOne(from, to) {   // [from, to) の最大の1件 → {usd, coin, side, ts}
    let best = null;
    for (const c of SYMS) for (let d = Math.floor(from / DAY) * DAY; d < to; d += DAY) {
      const day = this.days[c + ':' + liqDay(d)]; if (!day) continue;
      for (const [slot, v] of Object.entries(day)) { const t = d + Number(slot) * LIQ_STEP; if (t >= from && t < to && v[2] && (!best || v[2] > best.usd)) best = { usd: Math.round(v[2]), coin: c, side: v[3] ? 'long' : 'short', ts: t }; }
    }
    return best;
  }

  sum(sym, from, to) {   // [from, to) のロング・ショート合計(5分刻みの集計から)
    let l = 0, s = 0;
    for (let d = Math.floor(from / DAY) * DAY; d < to; d += DAY) {
      const day = this.days[sym + ':' + liqDay(d)]; if (!day) continue;
      for (const [slot, v] of Object.entries(day)) { const t = d + Number(slot) * LIQ_STEP; if (t >= from && t < to) { l += v[0]; s += v[1]; } }
    }
    return [l, s];
  }

  async detect() {
    const now = Date.now(), ev = this.ev;
    let over = false, quiet = true; const cur = {};
    for (const c of SYMS) {
      const [l, s] = this.sum(c, now - 36e5, now + 1), v = Math.max(l, s);
      cur[c] = [v, l >= s ? 'long' : 'short'];
      if (v >= LIQ_TH[c]) over = true;
      if (v >= LIQ_TH[c] * LIQ_QUIET) quiet = false;
    }
    if (!ev.open && over) {
      ev.open = { id: 'liq:' + now, t0: now, start: Math.floor((now - 36e5) / LIQ_STEP) * LIQ_STEP, peak: {} };
      this.evDirty = true;
    }
    const o = ev.open;
    if (!o) return;
    for (const c of SYMS) { const p = o.peak[c]; if (!p || cur[c][0] > p[0]) { o.peak[c] = [Math.round(cur[c][0]), cur[c][1], now]; this.evDirty = true; } }
    if (!quiet && now - o.t0 < LIQ_MAXWAIT) return;
    // ---- 終わり: 総括を作って記録し、X post を起こす ----
    const end = now, coins = {}, ser = new Map();
    for (const c of SYMS) {
      const [l, s] = this.sum(c, o.start, end);
      coins[c] = { long: Math.round(l), short: Math.round(s), peak: o.peak[c] || null };
      for (let t = o.start; t < end; t += LIQ_STEP) { const [a, b] = this.sum(c, t, t + LIQ_STEP); if (a || b) { const q = ser.get(t) || [0, 0]; q[0] += a; q[1] += b; ser.set(t, q); } }
    }
    const rec = { id: o.id, t0: o.t0, start: o.start, end, capped: !quiet, coins, maxOne: this.maxOne(o.start, end),
      ser: [...ser.entries()].sort((x, y) => x[0] - y[0]).slice(-120).map(([t, v]) => [t, Math.round(v[0]), Math.round(v[1])]), th: LIQ_TH };
    if (this.env.LIQ_POST === 'off') rec.man = 1;                       // 自動投稿を止める設定 = 下書きだけ作る
    const sent = ev.log.filter((e) => e.sent && jstDay(e.end) === jstDay(end)).length;
    if (sent >= LIQ_DAILY_CAP) rec.skipped = 'cap';
    ev.log = [...ev.log, { id: rec.id, end, sent: !rec.skipped }].filter((e) => end - e.end < 2 * DAY).slice(-30);
    ev.open = null; this.evDirty = true;
    if (rec.skipped || !this.env.CAL) return;
    try {
      const old = (await this.env.CAL.get('x:liq', { type: 'json' })) || {};
      await this.env.CAL.put('x:liq', JSON.stringify({ ev: [...(old.ev || []).filter((x) => end - x.end < DAY), rec].slice(-10) }));
      if (this.env.GH_DISPATCH_TOKEN && this.env.GH_REPO) await ghDispatch(this.env, { liq: rec.id });
    } catch (_) {}
  }

  async flush() {
    const cut = Date.now() - PAST_KEEP;
    const put = {};
    for (const k of this.dirty) put['d:' + k] = this.days[k];
    this.dirty.clear();
    put.max = this.max;
    try { await this.state.storage.put(put); } catch (_) {}
    for (const k of Object.keys(this.days)) {
      const t = Date.parse(k.split(':')[1] + 'T00:00:00Z');
      if (t < cut - DAY) { delete this.days[k]; try { await this.state.storage.delete('d:' + k); } catch (_) {} }
    }
  }

  note(name, f) { const s = this.src[name] || (this.src[name] = { n: 0 }); Object.assign(s, f); return s; }

  connect(name, url, onOpen, onMsg, ping) {
    const s = this.note(name, {});
    if (s.ws || s.connecting) return;
    s.connecting = true;
    fetch(url.replace(/^wss:/, 'https:'), { headers: { Upgrade: 'websocket' } }).then((res) => {
      const ws = res.webSocket;
      if (!ws) throw new Error('接続拒否 HTTP ' + res.status);
      ws.accept();
      s.ws = ws; s.connecting = false; s.err = null; s.opened = Date.now();
      ws.addEventListener('message', (ev) => {
        s.at = Date.now(); s.msgs = (s.msgs || 0) + 1;   // v156: pong も含めて、何か届いたら生きている印にする
        try { const j = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); onMsg(j, s); } catch (_) {}
      });
      // v156: 取引所は、しばらく何も送らない接続を切る(OKX は30秒、Bybit は20秒ごとの ping を求める)。20秒ごとに ping を送る。
      const timer = ping ? setInterval(() => { try { ws.send(ping); s.pings = (s.pings || 0) + 1; } catch (_) {} }, 20000) : null;
      const gone = (why) => { if (timer) clearInterval(timer); if (s.ws === ws) { s.ws = null; s.err = why; s.closes = (s.closes || 0) + 1; s.closedAt = Date.now(); } };
      ws.addEventListener('close', () => gone('切断'));
      ws.addEventListener('error', () => gone('通信エラー'));
      try { onOpen(ws); } catch (_) {}
    }).catch((e) => { s.connecting = false; s.ws = null; s.err = String((e && e.message) || e); });
  }

  ensure() {
    const now = Date.now();
    // v156: ping の返事(pong)が20秒ごとに届くはずなので、2分以上なにも届かず、開いてからも2分たつ接続は、静かに死んでいるので閉じて張り直す
    for (const s of Object.values(this.src)) {
      if (s.ws && now - (s.at || 0) > 120000 && now - (s.opened || 0) > 120000) { try { s.ws.close(); } catch (_) {} s.ws = null; }
    }
    this.connect('bybit', 'wss://stream.bybit.com/v5/public/linear', (ws) => {
      ws.send(JSON.stringify({ op: 'subscribe', args: SYMS.map((s) => 'allLiquidation.' + s + 'USDT') }));
    }, (j) => {
      if (!j || !/^allLiquidation\./.test(j.topic || '')) return;
      for (const d of j.data || []) {
        if (!/USDT$/.test(d.s)) continue;
        // S=Buy … ロングポジションが清算された
        this.add(d.s.slice(0, -4), d.S === 'Buy' ? 'long' : 'short', Number(d.v) * Number(d.p), Number(d.T) || Date.now(), 'bybit');
        this.src.bybit.n++;
      }
    }, '{"op":"ping"}');
    this.connect('okx', 'wss://ws.okx.com:8443/ws/v5/public', (ws) => {
      ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'liquidation-orders', instType: 'SWAP' }] }));
      this.okxCt();
    }, (j) => {
      if (!j || !j.arg || j.arg.channel !== 'liquidation-orders') return;
      for (const d of j.data || []) {
        const m = /^([A-Z]+)-USDT-SWAP$/.exec(d.instId || ''); if (!m || !this.ct[m[1]]) continue;
        for (const x of d.details || []) {
          // posSide=long … ロングの清算(netモードでは side=sell がロング清算)
          const long = x.posSide === 'long' || (x.posSide !== 'short' && x.side === 'sell');
          this.add(m[1], long ? 'long' : 'short', Number(x.sz) * this.ct[m[1]] * Number(x.bkPx), Number(x.ts) || Date.now(), 'okx');
          this.src.okx.n++;
        }
      }
    }, 'ping');
  }

  async okxCt() {
    if (this.ctDone && Date.now() - this.ctDone < 6 * 3600000) return;
    this.ctDone = Date.now();
    try {
      for (const s of SYMS) {
        const j = await (await fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=' + s + '-USDT-SWAP')).json();
        const v = Number(j && j.data && j.data[0] && j.data[0].ctVal); if (v > 0) this.ct[s] = v;
      }
    } catch (_) {}
  }

  // ---- v158: 過去分の取り込み(Coinalyze) ----
  bfDue(now) {
    if (!this.env.COINALYZE_KEY || this.bfBusy) return false;
    const b = this.bf;
    if (!b || b.v !== BF_VER) return true;
    if (b.ok) return now - b.at >= 6 * 3600000;   // v163: 6時間ごとに取り直す(Coinalyze準拠の値で上書き)
    return now - b.at >= ((b.tries || 0) < 6 ? 600000 : 6 * 3600000);
  }

  async czGet(path, params) {
    const q = params ? '?' + new URLSearchParams(params) : '';
    for (let i = 0; i < 3; i++) {
      const res = await fetch(CZ_BASE + path + q, { headers: { api_key: this.env.COINALYZE_KEY } });
      if (res.status === 429) { const w = Math.min(60, Number(res.headers.get('Retry-After')) || 5); await new Promise((r) => setTimeout(r, w * 1000 + 300)); continue; }
      if (!res.ok) throw new Error('Coinalyze ' + path + ' HTTP ' + res.status);   // 本文は載せない(鍵が混ざらないように)
      return await res.json();
    }
    throw new Error('Coinalyze ' + path + ' 429が続いた');
  }

  async backfill() {
    this.bfBusy = true;
    const prev = this.bf && this.bf.v === BF_VER ? this.bf : null, tries = (prev ? prev.tries || 0 : 0) + 1;
    try {
      const now = Date.now();
      const cut = Math.floor((now - 36e5) / LIQ_STEP) * LIQ_STEP;          // この時刻より前の枠だけ入れる(直近1時間は入れない = 投稿の判定に触れない)
      const from = Math.ceil((now - PAST_KEEP) / LIQ_STEP) * LIQ_STEP;     // 保存期間(2週間)の始まり
      const ex = await this.czGet('/exchanges');
      const codes = {};
      for (const e of Array.isArray(ex) ? ex : []) { const n = String(e.name || '').toLowerCase(); if (n === 'bybit' || n === 'okx' || n === 'binance' || n === 'huobi') codes[String(e.code)] = n; }
      if (!Object.keys(codes).length) throw new Error('取引所コード(Bybit・OKX)が見つからない');
      const mk = await this.czGet('/future-markets');
      const uniq = new Map();   // 取引所×銘柄で1本だけ(同じ組が複数あっても二重に数えない)
      for (const m of Array.isArray(mk) ? mk : []) {
        if (!codes[String(m.exchange)] || !m.is_perpetual || m.quote_asset !== 'USDT' || !SYMS.includes(m.base_asset)) continue;
        const k = codes[String(m.exchange)] + ':' + m.base_asset; if (!uniq.has(k)) uniq.set(k, m);
      }
      if (!uniq.size) throw new Error('対象の銘柄が見つからない');
      const bySym = new Map([...uniq.values()].map((m) => [m.symbol, m.base_asset]));
      const mid = from + Math.floor((cut - from) / 2 / LIQ_STEP) * LIQ_STEP;   // 2回に分けて取る(1回の件数が多すぎないように)
      const raw = new Map();   // 'シンボル|時刻' -> [ロング, ショート](同じ足が2回来ても1回だけ数える)
      for (const [a, b] of [[from, mid], [mid, cut]]) {
        const res = await this.czGet('/liquidation-history', { symbols: [...bySym.keys()].join(','), interval: '5min', from: Math.floor(a / 1000), to: Math.floor(b / 1000), convert_to_usd: 'true' });
        for (const r of Array.isArray(res) ? res : []) {
          if (!bySym.has(r.symbol)) continue;
          for (const h of r.history || []) {
            const t = Number(h.t) * 1000, l = Number(h.l), sh = Number(h.s);
            if (!Number.isFinite(t) || !(l >= 0) || !(sh >= 0)) continue;
            raw.set(r.symbol + '|' + t, [l, sh]);
          }
        }
      }
      const cz = new Map();    // '銘柄|枠の始まり' -> [ロング, ショート](Bybit と OKX を足す)
      for (const [k, [l, sh]] of raw) {
        const [sym, ts] = k.split('|'), t = Math.floor(Number(ts) / LIQ_STEP) * LIQ_STEP;
        if (t < from || t >= cut) continue;
        const key = bySym.get(sym) + '|' + t, c = cz.get(key) || [0, 0];
        c[0] += l; c[1] += sh; cz.set(key, c);
      }
      // ライブで集めていた分(= 最大の1件の記録 v[2] がある枠)の合計。取り込む前に数える(比較用)
      let liveUsd = 0;
      for (const [k, d] of Object.entries(this.days)) {
        const [c, day] = k.split(':'); if (!SYMS.includes(c)) continue;
        const base = Date.parse(day + 'T00:00:00Z');
        for (const [slot, v] of Object.entries(d)) { const t = base + Number(slot) * LIQ_STEP; if (t >= from && t < cut && v[2] > 0) liveUsd += v[0] + v[1]; }
      }
      let filled = 0, fillUsd = 0, sameUsd = 0;
      for (const [k, [l, sh]] of cz) {
        if (!(l > 0 || sh > 0)) continue;
        const [c, ts] = k.split('|'), t = Number(ts), key = c + ':' + liqDay(t), slot = Math.floor((t % DAY) / LIQ_STEP);
        const d = this.days[key] || (this.days[key] = {});
        if (d[slot] && d[slot][2] > 0) sameUsd += l + sh;   // v163: Coinalyze 準拠。直近1時間より前の枠は Coinalyze で置き換える
        d[slot] = [l, sh]; this.dirty.add(key); filled++; fillUsd += l + sh;
      }
      // v163: 長期保存。日足は2022年8月から(年ごと 'lt:銘柄:年')、1時間は取れる限り(月ごと 'lh:銘柄:年-月')。4社を足す。
      let ltErr = null, ltOld = 0, ltDays = 0;
      const lng = async (iv, from0, bucket, pre, keyOf) => {
        const res = []; const ks = [...bySym.keys()];
        for (let q = 0; q < ks.length; q += 10) res.push(...(await this.czGet('/liquidation-history', { symbols: ks.slice(q, q + 10).join(','), interval: iv, from: from0, to: Math.floor(cut / 1000), convert_to_usd: 'true' })));
        const agg = new Map();
        for (const r of res) { const c = bySym.get(r.symbol); if (!c) continue;
          for (const h of r.history || []) { const t = Math.floor(Number(h.t) * 1000 / bucket) * bucket, l = Number(h.l), sh = Number(h.s); if (!Number.isFinite(t) || !(l >= 0) || !(sh >= 0)) continue;
            const k = c + '|' + t, a = agg.get(k) || [0, 0]; a[0] += l; a[1] += sh; agg.set(k, a); } }
        const grp = new Map();
        for (const [k, [l, sh]] of agg) { const [c, t] = k.split('|'), kk = pre + c + ':' + keyOf(new Date(Number(t))); if (!grp.has(kk)) grp.set(kk, []); grp.get(kk).push([Number(t), Math.round(l), Math.round(sh)]); }
        for (const [kk, arr] of grp) await this.state.storage.put(kk, arr.sort((a, b) => a[0] - b[0]));
        return agg;
      };
      try {
        const ad = await lng('daily', 1659312000, DAY, 'lt:', (d) => d.getUTCFullYear());
        ltDays = ad.size; for (const k of ad.keys()) { const t = Number(k.split('|')[1]); if (!ltOld || t < ltOld) ltOld = t; }
        await lng('1hour', Math.floor((now - 400 * DAY) / 1000), 36e5, 'lh:', (d) => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'));
      } catch (e) { ltErr = String((e && e.message) || e).slice(0, 120); }
      this.ltc = {};
      this.bf = { lt_err: ltErr, lt_from: ltOld || null, lt_days: ltDays, v: BF_VER, ok: true, at: Date.now(), tries, from, cut, syms: [...bySym.keys()], bars: cz.size, filled, fill_usd: Math.round(fillUsd), live_usd: Math.round(liveUsd), cz_same_usd: Math.round(sameUsd) };
      await this.state.storage.put('bf', this.bf);
      await this.flush();
    } catch (e) {
      this.bf = { v: BF_VER, ok: false, at: Date.now(), tries, err: String((e && e.message) || e).slice(0, 160) };
      try { await this.state.storage.put('bf', this.bf); } catch (_) {}
    } finally { this.bfBusy = false; }
  }

  async alarm() {
    await this.ready;
    this.alarms++; this.alarmAt = Date.now();
    this.ensure();
    try { await this.detect(); } catch (_) {}
    if (this.bfDue(Date.now())) await this.backfill();   // v158: 過去分の取り込み(鍵があって、まだ済んでいない時だけ)
    if (this.evDirty) { this.evDirty = false; try { await this.state.storage.put('ev', this.ev); } catch (_) {} }
    await this.flush();
    await this.state.storage.setAlarm(Date.now() + LIQ_FLUSH);
  }

  async fetch(request) {
    await this.ready;
    this.ensure();
    if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + LIQ_FLUSH);
    const url = new URL(request.url);
    const sym = url.searchParams.get('sym');
    if (!SYMS.includes(sym)) return json({ error: 'bad params' }, 400);
    const step = [300, 900, 3600, 14400, 86400].includes(Number(url.searchParams.get('step'))) ? Number(url.searchParams.get('step')) * 1000 : 3600000;
    const now = Date.now(), from = now - PAST_KEEP;
    const agg = new Map();
    let first = 0;
    for (const [k, d] of Object.entries(this.days)) {
      const [s, day] = k.split(':'); if (s !== sym) continue;
      const base = Date.parse(day + 'T00:00:00Z');
      for (const [slot, v] of Object.entries(d)) {
        const t = base + Number(slot) * LIQ_STEP; if (t < from) continue;
        if (!first || t < first) first = t;
        const b = Math.floor(t / step) * step, c = agg.get(b) || [0, 0];
        c[0] += v[0]; c[1] += v[1]; agg.set(b, c);
      }
    }
    if (step === DAY || step === 36e5 || step === 144e5) {   // v163: 2週間より古い分は長期保存から足す(新しい分はこの集計を優先)
      this.ltc = this.ltc || {};
      const pre = step === DAY ? 'lt:' : 'lh:', ck = pre + sym;
      if (!this.ltc[ck]) { const mm = await this.state.storage.list({ prefix: pre + sym + ':' }); this.ltc[ck] = [].concat(...mm.values()); }
      const cutT = Math.floor(from / step) * step;   // v167: 4時間足も1時間の長期保存から束ねる
      for (const [t, l, sh] of this.ltc[ck]) { if (t >= cutT) continue; const b = Math.floor(t / step) * step; if (b >= cutT) continue; const c = agg.get(b) || [0, 0]; c[0] += l; c[1] += sh; agg.set(b, c); if (!first || b < first) first = b; }
    }
    const buckets = [...agg.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => [t, Math.round(v[0]), Math.round(v[1])]);
    let l24 = 0, s24 = 0;
    for (const [k, d] of Object.entries(this.days)) {
      const [s, day] = k.split(':'); if (s !== sym) continue;
      const base = Date.parse(day + 'T00:00:00Z');
      for (const [slot, v] of Object.entries(d)) { if (base + Number(slot) * LIQ_STEP >= now - DAY) { l24 += v[0]; s24 += v[1]; } }
    }
    const m = this.max[sym];
    const sources = {};
    for (const [n, s] of Object.entries(this.src)) sources[n] = { live: !!s.ws, last: s.at || null, n: s.n, err: s.err || null, opened: s.opened || null, msgs: s.msgs || 0, pings: s.pings || 0, closes: s.closes || 0, closed_at: s.closedAt || null };
    return json({ step: step / 1000, buckets, since: first || null, h24: { long: Math.round(l24), short: Math.round(s24) }, max24: m && now - m[2] <= DAY ? { usd: Math.round(m[0]), side: m[1], ts: m[2], src: m[3] } : null, sources, th: LIQ_TH, open: !!(this.ev && this.ev.open), do: { boot: this.boot, alarms: this.alarms, alarm_at: this.alarmAt, stale_skipped: this.stale, bf: this.bf || (this.env.COINALYZE_KEY ? 'pending' : 'no_key') } });
  }
}

async function liqApi(env, url) {
  if (!env.LIQ) return json({ error: 'Durable Object(LIQ)が未接続です。wrangler.jsonc に LiqHub の設定を追加してください', buckets: [] }, 503);
  const sym = url.searchParams.get('sym');
  try {
    const stub = env.LIQ.get(env.LIQ.idFromName('hub'));
    return await stub.fetch('https://liq/data?sym=' + encodeURIComponent(sym || '') + '&step=' + encodeURIComponent(url.searchParams.get('step') || '3600'));
  } catch (e) { return json({ error: String((e && e.message) || e), buckets: [] }, 502); }
}
// v152: 毎朝のまとめ(日本時間 9:00)の合図。9:00〜9:19 の5分ごとの実行のうち最初の1回だけ「X post」を起こす(下書きは tools/x_notify.mjs が作る)
async function liqDayKick(env) {
  if (!env.CAL || !env.GH_DISPATCH_TOKEN || !env.GH_REPO) return null;
  const j = new Date(Date.now() + 9 * 36e5), u = new Date();
  let key = null, day = null;
  if (j.getUTCHours() === 9 && j.getUTCMinutes() < 20) { key = 'x:liqday:kick'; day = j.toISOString().slice(0, 10); }            // 日本語: 9:00 JST
  else if (u.getUTCHours() === 13 && u.getUTCMinutes() < 20) { key = 'x:liqday:kick:en'; day = u.toISOString().slice(0, 10); }   // v173: 英語: 13:00 UTC
  if (!key) return null;
  if ((await env.CAL.get(key)) === day) return null;
  await env.CAL.put(key, day, { expirationTtl: 86400 });
  const r = await ghDispatch(env, { liqday: day, lang: key.endsWith(':en') ? 'en' : 'ja' });
  return { day, key, dispatched: r.status };
}

// ---------- v164: 清算×指標(案B: 平常比) ----------
// 指標の発表日(UTC)の清算額(ロング・ショート別の1日合計) ÷ その直前14日の中央値 を、回ごとに出す。日足(Coinalyze 4社合算)を使うので2022年8月から数えられる。
// 発表の前後ではなく「発表日の1日」の合計。因果は示さない。
async function impHist(env) {
  const key = 'imphist:v1';
  if (env.CAL) { const c = await env.CAL.get(key, 'json'); if (c && Date.now() - c.at < 86400000) return c.ev; }
  const from = Date.UTC(2022, 7, 1), to = Date.now(), step = 50 * DAY, spans = [];
  for (let a = from; a < to; a += step) spans.push([a, Math.min(a + step, to)]);
  const seen = new Map(); let fail = 0;
  await Promise.all(spans.map(async ([a, b]) => {
    try { for (const e of await tvChunk(a, b)) {
      if (!e || !e.id || !e.date || !REGION[e.country] || e.importance < 0 || /holiday/i.test(e.indicator || '')) continue;
      const title = String(e.title || e.indicator || ''), L = jaLabel(e.country, title), ts = Date.parse(e.date);
      if (isFinite(ts) && ts <= to) seen.set(e.id, [ts, L.s, L.t]);
    } } catch (_) { fail++; }
  }));
  const ev = [...seen.values()].sort((x, y) => x[0] - y[0]);
  if (env.CAL && ev.length && fail === 0) await env.CAL.put(key, JSON.stringify({ at: Date.now(), ev }));
  return ev;
}
const med = (a) => { const b = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
async function liqImpactApi(env, url) {
  const sym = url.searchParams.get('sym') || 'BTC', type = url.searchParams.get('type');
  if (!SYMS.includes(sym)) return json({ error: 'bad sym' }, 400);
  if (!env.LIQ) return json({ error: 'LIQ未接続' }, 503);
  const ev = await impHist(env);
  const cnt = {}; for (const [, k] of ev) cnt[k] = (cnt[k] || 0) + 1;
  const types = Object.entries(cnt).filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
  if (!type) return json({ types });
  const r = await env.LIQ.get(env.LIQ.idFromName('hub')).fetch('https://liq/data?sym=' + sym + '&step=86400');
  const d = await r.json(), B = new Map((d.buckets || []).map((b) => [b[0], b]));
  const out = [];
  for (const [ts, k, t] of ev) {
    if (k !== type) continue;
    const day = Math.floor(ts / DAY) * DAY, cur = B.get(day); if (!cur || day > Date.now() - DAY) continue;   // 当日(未完)は除く
    const bl = [], bs = []; for (let i = 1; i <= 14; i++) { const q = B.get(day - i * DAY); if (q) { bl.push(q[1]); bs.push(q[2]); } }
    if (bl.length < 7) continue;
    const ml = med(bl), ms = med(bs);
    out.push({ ts, t, lx: ml > 0 ? +(cur[1] / ml).toFixed(2) : null, sx: ms > 0 ? +(cur[2] / ms).toFixed(2) : null, long: cur[1], short: cur[2] });
  }
  return json({ sym, type, n: out.length, med: { l: med(out.map((o) => o.lx)), s: med(out.map((o) => o.sx)) }, since: d.since || null, events: out.slice(-60), note: '発表日(UTC)の1日合計 ÷ 直前14日の中央値。Coinalyze 4社合算。因果を示すものではありません。' });
}
// v168: 清算×指標の「全回」は有料(トークン確認は /api/rx と同じ rxAccess)。
//   無料 = 直近1回だけ(見本)。指標の一覧(type 無し)は無料のまま。中央値は全回が要るので無料では出さない。
//   計算本体は今までどおり10分キャッシュ(全員共通)。切り分けはキャッシュの外でやるので、無料の人に全回が渡ることはない。
async function liqImpactGated(ctx, request, env, url) {
  const full = await cached(ctx, request, 600, () => liqImpactApi(env, url));
  if (!url.searchParams.get('type') || full.status !== 200) return new Response(full.body, full);
  const acc = await rxAccess(env, request);
  if (acc === 'err') return json({ error: 'アクセス確認に失敗しました。少し待ってから再読み込みしてください' }, 503);
  const d = await full.clone().json();
  d.access = acc;
  if (acc !== 'ok') {
    d.locked = true;
    d.shown = Math.min(1, (d.events || []).length);
    d.events = (d.events || []).slice(-1);
    d.med = { l: null, s: null };
  }
  return json(d);
}
async function liqPing(env) {   // 定時実行から呼び、DOが眠っていたら起こす(接続の張り直し)
  if (!env.LIQ) return null;
  try { const r = await env.LIQ.get(env.LIQ.idFromName('hub')).fetch('https://liq/data?sym=BTC&step=86400'); const j = await r.json(); return j.sources || j; } catch (e) { return { error: String((e && e.message) || e) }; }
}

// ---- v192: BTC ボラティリティ・モニター。30日の「普段の幅」とGARCHは x_notify が1時間ごとに保存(vol:v1)。
//   「今の倍率」と直近の価格は、保存済みの1時間足(5分ごとに更新)で計算し直して新しくする。
async function volApi(env) {
  let v = null; try { v = env.CAL ? await env.CAL.get('vol:v1', 'json') : null; } catch (_) {}
  if (!v || !v.typ) return json({ available: false });
  try {
    const store = await readPx(env), bars = store && store.tfs && store.tfs.BTC && store.tfs.BTC['1h'] && store.tfs.BTC['1h'].bars, now = Date.now();
    if (Array.isArray(bars) && bars.length > 30) {
      const b = bars.map((x) => [x[0] * 1000, +x[1], +x[2], +x[3], +x[4]]).filter((x) => x[0] + 36e5 <= now && x[4] > 0), end = b[b.length - 1][0] + 36e5;
      if (end > v.end) {
        const m = new Map(b.map((x) => [x[0], x[4]])), r = [];
        for (const x of b) if (x[0] >= end - 864e5) { const s0 = m.get(x[0] - 36e5); if (s0) r.push(100 * Math.log(x[4] / s0)); }
        if (r.length >= 20) { const now1 = Math.sqrt(r.reduce((s, x) => s + x * x, 0) / r.length), last = b.filter((x) => x[0] >= end - 864e5), hi = Math.max(...last.map((x) => x[2])), lo = Math.min(...last.map((x) => x[3]));
          v = { ...v, end, now1, ratio: Math.round(now1 / v.typ[1] * 10) / 10, range24: { hi, lo, pct: Math.round((hi / lo - 1) * 1e4) / 100 }, px: [...(v.px || []).filter((p) => p[0] < b[0][0]), ...b.map((x) => [x[0], x[4]])].filter((p) => p[0] >= end - 2 * 864e5), live: 1 }; }
      }
    }
  } catch (_) {}
  const { hist, ...out } = v;
  return json({ available: true, ...out });
}

// ---- v201: 似ている過去の値動きの記録(pat:log)。無料 = 件数と最新1件 / 有料(rxAccess が ok)= 全件 ----
async function patLogApi(env, request) {
  let d = null; try { d = env.CAL ? await env.CAL.get('pat:log', 'json') : null; } catch (_) {}
  const ev = ((d && d.ev) || []).slice().sort((a, b) => b.q.t1 - a.q.t1), acc = await rxAccess(env, request);
  if (acc === 'err') return json({ error: 'アクセス確認に失敗しました' }, 503);
  const done = ev.filter((x) => x.a24 != null && x.after), inR = done.filter((x) => x.a24 >= x.after.min && x.a24 <= x.after.max).length;
  const stat = { total: ev.length, checked: done.length, inRange: inR };
  if (acc !== 'ok') return json({ access: acc, locked: true, ...stat, rows: ev.slice(0, 1), hidden: ev.slice(1).map((x) => ({ t1: x.q.t1, chg: x.q.chg })) });
  return json({ access: 'ok', locked: false, ...stat, rows: ev });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/garch') {
      const store = await readPx(env);
      const entry = store?.tfs?.BTC?.['5m'];
      return json({ sym: 'BTC', source: entry?.src || null, ...estimateGarch(entry?.bars) });
    }
    if (url.pathname === '/api/patlog') { const r = await patLogApi(env, request); r.headers.set('cache-control', 'private, no-store'); return r; }   // v201: 似ている過去の記録(全件は有料)
    if (url.pathname === '/api/pat') { let t = null; try { t = env.CAL ? await env.CAL.get('pat:v1') : null; } catch (_) {} const r = new Response(t || '{}', { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120' } }); return r; }   // v196: 似ている過去の値動き
    if (url.pathname === '/api/vol') { const r = await volApi(env); r.headers.set('cache-control', 'public, max-age=120'); return r; }   // v192
    if (url.pathname === '/api/candles') {
      return cached(ctx, request, 60, () => candles(url, env, ctx));
    }
    // 2026-10-06: 広告ブロッカーが「/api/events」をアクセス解析の送信先とみなして止めることがある(画面だけ0件になっていた)。
    //   画面は /api/cal を使う。/api/events は確認用に残す。
    if (url.pathname === '/api/events' || url.pathname === '/api/cal') return cached(ctx, request, 300, () => events(request, env, ctx));
    if (url.pathname === '/api/stake') return cached(ctx, request, 120, () => stakeApi(env, url.searchParams.get('sym')));
    if (url.pathname === '/api/liqimpact') { const r = await liqImpactGated(ctx, request, env, url); r.headers.set('cache-control', 'private, no-store'); return r; }   // v164: 清算×指標(平常比) / v168: 全回は有料
    if (url.pathname === '/api/liq') return cached(ctx, request, 20, () => liqApi(env, url));   // v150: ロング/ショート清算額
    if (url.pathname === '/api/ethqueue') return cached(ctx, request, 120, () => ethQueueApi(env, ctx));
    if (url.pathname === '/api/spike') { const r = await spikeStatus(env); r.headers.set('cache-control', 'no-store'); return r; }   // v145: 急変動の判定の今の値(見るだけ。投稿はしない)
    if (url.pathname === '/api/corr') return cached(ctx, request, 300, async () => { const t = env.CAL ? await env.CAL.get('corr:v1') : null; return new Response(t || '{}', { headers: { 'content-type': 'application/json; charset=utf-8' } }); });   // v95: S&P500 との相関(保存を返すだけ)
    if (url.pathname === '/api/px-run') { const r = await pxRun(env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/health') { const r = await health(env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/admin/rx' && request.method === 'POST') { const r = await rxAdmin(request, env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/admin/rx-get' && request.method === 'GET') { const r = await rxGet(request, env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/admin/rx-one' && request.method === 'GET') {   // v72: 合言葉つき。1つの保存をそのまま返す(今は xs だけで使う)
      if (!adminOk(request, env)) return json({ error: 'unauthorized' }, 401);
      const name = url.searchParams.get('name') || '';
      if (!RX_NAME.test(name) || !env.CAL) return json({ error: 'bad name' }, 400);
      const txt = await env.CAL.get(rxNameKey(name));
      return new Response(txt || '{}', { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/api/admin/rx-put' && request.method === 'POST') { const r = await rxPut(request, url, env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/admin/liqimpact' && request.method === 'GET') {   // v171: 合言葉つき。X の「清算の反応」用に、next.html と同じ集計を無料の絞り込みなしで返す
      if (!adminOk(request, env)) return json({ error: 'unauthorized' }, 401);
      const r = await liqImpactApi(env, url); r.headers.set('cache-control', 'no-store'); return r;
    }
    if (url.pathname === '/api/admin/posts') { const r = await postsApi(request, env); r.headers.set('cache-control', 'no-store'); return r; }   // v73
    if (url.pathname === '/api/rx') { const r = await rxApi(request, url, env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/auth/nonce') { const r = await authNonce(url, env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/auth/verify' && request.method === 'POST') { const r = await authVerify(request, url, env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/pay/status') { const r = await payStatus(url, env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/pay/sim' && request.method === 'POST') { const r = await paySim(request, env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/pay/info') { const r = json({ to: env.PAY_TO || null }); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/pay/invoice') { const r = await payInvoice(url, env); r.headers.set('cache-control', 'no-store'); return r; }
    if (url.pathname === '/api/pay/confirm' && request.method === 'POST') { const r = await payConfirm(request, url, env); r.headers.set('cache-control', 'no-store'); return r; }
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
      try { const r = await liqPing(env); if (r) console.log('liq', JSON.stringify(r)); } catch (e) { console.log('liq FAILED', String((e && e.message) || e)); }
      try { const r = await liqDayKick(env); if (r) console.log('liqday', JSON.stringify(r)); } catch (e) { console.log('liqday FAILED', String((e && e.message) || e)); }
      try { const r = await spikeCheck(env); if (r) console.log('spike', JSON.stringify(r)); } catch (e) { console.log('spike FAILED', String((e && e.message) || e)); }
      try { const r = await xDispatch(env); if (r) console.log('x dispatch', JSON.stringify(r)); } catch (e) { console.log('x dispatch FAILED', String((e && e.message) || e)); }
      return;
    }
    const log = (name) => (r) => console.log(name, JSON.stringify(r));
    await Promise.allSettled([
      refreshStore(env).then(log('macro refresh')).catch(() => {}).then(() => storeEvents(env)).then(log('events store')),
      refreshEthQ(env).then(log('ethq refresh')),
      refreshStake(env).then(log('stake refresh')),
      NEWS_ENABLED ? refreshNews(env).then(log('news refresh')) : null,
      rxCron(env).then(log('rx step')).catch(e => console.log('rx step FAILED', String((e && e.message) || e))),
    ]);
  },
};
