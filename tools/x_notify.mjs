#!/usr/bin/env node
// X 投稿の下書きづくり(v79: すべて日本時間 JST 基準)。RX runner のワークフローの最後に1時間ごとに動く。
// 仕様書(crypto_signal_archive_x_spec.md)の4シリーズを作り、サイトの下書き置き場(/api/admin/posts)へ足す。
// あなたは /posts.html を開き、ボタンで投稿する(画像つき)。X の API は使わない。
//   DAILY TIMELINE : 毎日 日本時間7時以降の最初の実行で1本。投稿は9:30の想定なので、9:30より後の予定だけ載せる(今日の残り+明日〜日曜。日曜は来週)
//   (v79: ON THIS DATE は廃止。代わりに DAILY の今日の指標に「前回発表から1時間のBTC変動」を付ける)
//   ARCHIVED       : 対象イベントの発表から65分たった後の最初の実行で1本(48時間を過ぎたら作らない)
//   WEEK IN CRYPTO : 月曜 日本時間7時以降の最初の実行で1本(前の週 月曜0時〜次の月曜0時 JST)
// 数値の決まり(全シリーズ共通・変えない):
//   価格 = Binance 現物 BTCUSDT / ETHUSDT。時刻・日付はすべて日本時間(JST)。
//   BEFORE = 発表時刻を含む5分足の始値。AFTER = 発表から1時間後に閉じる5分足の終値(サイトの EVENT IMPACT「1時間後」と同じ)。
//   週 = 月曜00:00〜次の月曜00:00 JST。開始 = 月曜0時の1時間足の始値、終了 = 日曜23時の1時間足の終値。
//   変化率 = (後 ÷ 前 − 1) × 100、小数2桁で四捨五入。価格は BTC が整数ドル、ETH が小数2桁。
// 必要: RX_ADMIN_KEY。任意: NTFY_TOPIC(新しい下書きができたらスマホに通知)。

const SITE = (process.env.SITE_URL || 'https://crypto-schedule.signalarchive.workers.dev').replace(/\/+$/, '');
const KEY = process.env.RX_ADMIN_KEY || '';
const TOPIC = process.env.NTFY_TOPIC || '';
const NTFY = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
const NOW = Date.now();
const BASES = (process.env.BINANCE_BASES || 'https://data-api.binance.vision,https://api.binance.com,https://api1.binance.com').split(',').map((x) => x.trim()).filter(Boolean);
const M5 = 3e5, H = 36e5, DAY = 24 * H, JST = 9 * H;
const ARCH_WAIT = 65 * 60000, ARCH_MAX = 48 * H;
const REGIONS = ['US', 'JP', 'EU'];
const REGION_EN = { US: 'US', JP: 'Japan', EU: 'Euro area' };

if (!KEY) { console.log('[x] RX_ADMIN_KEY が未設定のため何もしません'); process.exit(0); }

// ---- 読み込み ----
async function site(p, opt = {}) {
  const r = await fetch(SITE + p, { ...opt, headers: { 'User-Agent': 'signal-archive-x-posts/1.0', 'x-admin-key': KEY, ...(opt.headers || {}) }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(p.split('?')[0] + ' HTTP ' + r.status);
  return r;
}
// Binance の足 [開始, 始, 高, 安, 終, ...]。取れなければ null
async function klines(sym, interval, startTime, limit) {
  for (const base of BASES) {
    try {
      const r = await fetch(`${base}/api/v3/klines?symbol=${sym}&interval=${interval}&startTime=${startTime}&limit=${limit}`, { signal: AbortSignal.timeout(15000) });
      if (r.ok) return (await r.json()).map((b) => [+b[0], +b[1], +b[2], +b[3], +b[4]]);
    } catch (_) {}
  }
  return null;
}

// ---- 文字の数え方(X: 日本語などは2、URLは23。上限280) ----
const xlen = (t) => { let n = 0; for (const ch of t) { const o = ch.codePointAt(0); n += (o <= 0x10FF || (o >= 0x2000 && o <= 0x200D) || (o >= 0x2010 && o <= 0x201F) || (o >= 0x2032 && o <= 0x2037)) ? 1 : 2; } return n; };

// ---- 日時・数字の書き方 ----
const WJ = ['日', '月', '火', '水', '木', '金', '土'], WE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], ME = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');
const J = (t) => new Date(t + JST), U = J;                                                     // 英語も日本時間で書く
const enDay = (t) => { const d = U(t); return `${WE[d.getUTCDay()]} ${ME[d.getUTCMonth()]} ${d.getUTCDate()}`; };          // Wed Oct 7
const enDate = (t) => { const d = U(t); return `${ME[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };       // Oct 7, 2026
const enHM = (t) => { const d = U(t); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
const jaDay = (t) => { const d = J(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WJ[d.getUTCDay()]})`; };          // 10/7(水)
const jaDate = (t) => { const d = J(t); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; };
const jaHM = (t) => { const d = J(t); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
const pct = (a, b) => Math.round((b / a - 1) * 1e4) / 100;                                     // 小数2桁
const pctTxt = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
const usd = (v, dp = 0) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const dayStart = (t) => Math.floor((t + JST) / DAY) * DAY - JST;                               // 日本時間の0時
const weekStart = (t) => { const d0 = dayStart(t); return d0 - ((J(d0).getUTCDay() + 6) % 7) * DAY; };   // 日本時間の月曜0時

// ---- イベントの名前 ----
const enName = (e) => e.te || e.se || e.s || e.t;
const jaName = (e) => /^(FOMC|日銀|ECB)$/.test(e.s || '') ? (e.t || e.s) : (e.s || e.t);
// 同じ時刻・同じ地域の発表(CPIの前年比・前月比など)は1行にまとめる。名前は重ならないものを2つまで
function groupLine(g, lang) {
  const names = [];
  for (const e of g) { const n = lang === 'en' ? enName(e) : jaName(e); if (!names.includes(n)) names.push(n); }
  if (lang === 'en' && names.length > 1) {                                                    // 2つ目以降は地域名を省く(US CPI YoY / CPI MoM)
    const pre = REGION_EN[g[0].c] ? REGION_EN[g[0].c] + ' ' : '';
    for (let i = 1; i < names.length; i++) if (pre && names[i].startsWith(pre)) names[i] = names[i].slice(pre.length);
  }
  const more = names.length - 2;
  return names.slice(0, 2).join(' / ') + (more > 0 ? (lang === 'en' ? ` +${more}` : ` ほか${more}`) : '');
}

// ---- タグ(指標 + 銘柄 + 仮想通貨) ----
function tags(name) {
  const T = [[/CPI/, '#CPI', '#CPI'], [/PPI/, '#PPI', '#PPI'], [/PCE/, '#PCE', '#PCE'], [/雇用統計|失業率|Nonfarm|Payroll|Unemployment/i, '#雇用統計', '#NFP'], [/FOMC/, '#FOMC', '#FOMC'],
    [/FRB|Fed\b/, '#FRB', '#Fed'], [/日銀|BoJ|BOJ/, '#日銀', '#BOJ'], [/ECB/, '#ECB', '#ECB'], [/GDP/, '#GDP', '#GDP'], [/ISM/, '#ISM', '#ISM'], [/小売|Retail/, '#小売売上高', '#RetailSales'],
    [/満期|Expiry|expiry/, '#オプション満期', '#OptionsExpiry'], [/ETH|Ethereum/, '#イーサリアム', '#Ethereum']];
  const hit = T.find(([re]) => re.test(name));
  return { ja: [hit ? hit[1] : '#経済指標', '#ビットコイン', '#仮想通貨'].join(' '), en: [hit ? hit[2] : '#Macro', '#Bitcoin', '#Crypto'].join(' ') };
}

// 行を入るだけ入れる(280を超える分は「+N more」にまとめる)。fixed は必ず入れる行(見出しやタグ)
function fit(build, items, lang) {
  for (let n = items.length; n >= 0; n--) {
    const rest = items.length - n;
    const t = build(items.slice(0, n), rest ? (lang === 'en' ? `+${rest} more` : `ほか${rest}件`) : null);
    if (xlen(t) <= 280) return t;
  }
  return build([], null);
}

// ---- 対象のイベント ----
const cal = await (await site('/api/cal')).json();
const events = (cal.events || []).map((e) => ({ ...e, ts: Date.parse(e.at) })).filter((e) => isFinite(e.ts) && e.im === 'high'
  && ((e.l === 'macro' && REGIONS.includes(e.c)) || (e.l === 'asset' && !/ニュース/.test(e.s || ''))));
function groups(list) {                                                                         // 時刻+地域ごと
  const m = new Map();
  for (const e of list) { const k = e.ts + ':' + (e.c || e.l); const g = m.get(k) || []; g.push(e); m.set(k, g); }
  return [...m.values()].sort((a, b) => a[0].ts - b[0].ts);
}
const between = (a, b) => groups(events.filter((e) => e.ts >= a && e.ts < b));

const store = await (await site('/api/admin/posts')).json();
const have = new Set((store.posts || []).map((p) => p.id));
const out = [];
const add = (p) => { if (!have.has(p.id)) { have.add(p.id); out.push({ at: NOW, ...p }); } };
const today = dayStart(NOW), isoDay = (t) => U(t).toISOString().slice(0, 10);
const hourJ = J(NOW).getUTCHours(), dailyTime = hourJ >= 7;                                // v76: 日本時間7時以降、その日の分がまだ無ければ作る(朝の実行を逃しても後から作られる)
const POST_AT = today + 9.5 * H;                                                                 // DAILY を投稿する想定の時刻(日本時間 9:30。posts.html と同じ)

// ---- 1) DAILY TIMELINE ----
if (dailyTime && !have.has('daily:' + isoDay(today))) {
  const tg = between(Math.max(NOW, POST_AT), today + DAY);                                     // 投稿時点でまだ先の予定だけ(済んだ指標は載せない)
  let wa = today + DAY, wb = weekStart(today) + 7 * DAY, next = false;
  if (wb - wa <= 0) { wb = wa + 7 * DAY; next = true; }                                       // 日曜は来週を出す
  const wk = between(wa, wb);
  // 今日の指標には「前回の発表から1時間のBTC変動」を付ける(EVENT IMPACT の記録から。同時刻の発表は記録が一番新しいもの)
  const dump = tg.length ? await (await site('/api/admin/rx-get')).json() : { shards: {} };
  const recs = new Map();
  for (const doc of Object.values(dump.shards || {})) for (const r of (doc && doc.ev) || []) {
    const a = r.r && r.r.BTC; if (!Array.isArray(a) || a[3] == null) continue;
    const l = recs.get(r.k) || []; l.push({ t: r.t, chg: a[3] }); recs.set(r.k, l);
  }
  const prevOf = (g) => {
    let best = null;
    for (const e of g) if (e.l === 'macro') for (const r of recs.get((e.s || e.t) + '|' + e.c) || []) if (r.t < g[0].ts - H && (!best || r.t > best.t)) best = r;
    return best;
  };
  const prev = tg.map(prevOf);
  const pv = (i, lang) => prev[i] ? (lang === 'en' ? ` (prev 1h: ${pctTxt(prev[i].chg)})` : `(前回1h: ${pctTxt(prev[i].chg)})`) : '';
  const todayL = { en: tg.map((g, i) => enHM(g[0].ts) + ' — ' + groupLine(g, 'en') + pv(i, 'en')), ja: tg.map((g, i) => jaHM(g[0].ts) + ' — ' + groupLine(g, 'ja') + pv(i, 'ja')) };
  const weekL = { en: wk.map((g) => `${enDay(g[0].ts)} ${enHM(g[0].ts)} — ` + groupLine(g, 'en')), ja: wk.map((g) => `${jaDay(g[0].ts)} ${jaHM(g[0].ts)} — ` + groupLine(g, 'ja')) };
  const daily = (lang) => {
    const en = lang === 'en';
    const head = en ? [`TODAY · ${enDate(today)}`, '', "UPCOMING TODAY (JST)"] : [`今日のイベント ${jaDay(today)}`, '(このあとの予定・日本時間)'];
    const wTitle = en ? (next ? 'NEXT WEEK' : 'THIS WEEK') : (next ? '来週のイベント' : '今週のイベント');
    const none = en ? 'No scheduled events' : '予定なし', tag = en ? tags('Macro').en : tags('経済指標').ja;
    const more = (r) => r > 0 ? (en ? `+${r} more` : `ほか${r}件`) : null;
    const T = todayL[lang], W = weekL[lang];
    const mk = (tn, wn) => [...head, ...(T.length ? T.slice(0, tn) : [none]), ...(more(T.length - tn) ? [more(T.length - tn)] : []), '', wTitle,
      ...(W.length ? W.slice(0, wn) : [none]), ...(more(W.length - wn) ? [more(W.length - wn)] : []), '', tag].join('\n');
    let tn = T.length, wn = 0;                                                                 // 今日を優先し、残りに今週を入るだけ
    while (tn > 0 && xlen(mk(tn, 0)) > 280) tn--;
    while (wn < W.length && xlen(mk(tn, wn + 1)) <= 280) wn++;
    return mk(tn, wn);
  };
  add({
    id: 'daily:' + isoDay(today), sr: 'daily',
    en: daily('en'), ja: daily('ja'),
    img: { day: today, next, today: tg.map((g, i) => ({ t: g[0].ts, en: groupLine(g, 'en'), ja: groupLine(g, 'ja'), pv: prev[i] ? prev[i].chg : null, pt: prev[i] ? prev[i].t : null })), week: wk.map((g) => ({ t: g[0].ts, en: groupLine(g, 'en'), ja: groupLine(g, 'ja') })) },
  });
}

// BEFORE / AFTER(共通の決まり)と、画像用の前後1時間の5分足の終値
async function beforeAfter(ts) {
  const t0 = Math.floor(ts / M5) * M5;
  const bars = await klines('BTCUSDT', '5m', t0 - 12 * M5, 25);
  if (!bars) return null;
  const m = new Map(bars.map((b) => [b[0], b]));
  const f = m.get(t0), l = m.get(t0 + 11 * M5);
  if (!f || !l) return null;
  const before = f[1], after = l[4];
  const spark = []; for (let i = -12; i <= 12; i++) { const b = m.get(t0 + i * M5); spark.push(b ? b[4] : null); }
  return { before, after, chg: pct(before, after), spark, t0 };
}

// ---- 2) ARCHIVED ----
for (const g of groups(events.filter((e) => NOW - e.ts >= ARCH_WAIT && NOW - e.ts < ARCH_MAX && !/halving/.test(e.id || '')))) {
  const e = g[0], id = 'arch:' + e.ts + ':' + (e.c || e.l);
  if (have.has(id)) continue;
  const ba = await beforeAfter(e.ts);
  if (!ba) { console.log('[x] 価格が取れないので次回:', id); continue; }
  const nE = groupLine(g, 'en'), nJ = groupLine(g, 'ja'), tg = tags(nE + ' ' + nJ);
  add({
    id, sr: 'arch',
    en: ['ARCHIVED', '', nE, `${enDate(e.ts)} · ${enHM(e.ts)} JST`, '', 'BEFORE', `BTC: ${usd(ba.before)}`, '', 'AFTER (+1h)', `BTC: ${usd(ba.after)}`, '', 'CHANGE', pctTxt(ba.chg), '', tg.en].join('\n'),
    ja: ['アーカイブ', '', nJ, `${jaDate(e.ts)} ${jaHM(e.ts)}(日本時間)`, '', 'イベント前', `BTC: ${usd(ba.before)}`, '', 'イベント後(1時間後)', `BTC: ${usd(ba.after)}`, '', '変動', pctTxt(ba.chg), '', tg.ja].join('\n'),
    img: { t: e.ts, en: nE, ja: nJ, ...ba },
  });
}

// ---- 4) WEEK IN CRYPTO ----
if (dailyTime && J(NOW).getUTCDay() === 1) {
  const we = weekStart(NOW), ws = we - 7 * DAY, id = 'week:' + isoDay(ws);
  if (!have.has(id)) {
    const [b, e] = await Promise.all([klines('BTCUSDT', '1h', ws, 168), klines('ETHUSDT', '1h', ws, 168)]);   // 日本時間の週は日足と区切りがずれるので1時間足で
    const ok = (k) => k && k.length === 168 && k[0][0] === ws && k[167][0] === we - H;
    if (ok(b) && ok(e)) {
      const S = (k, dp) => ({ s: k[0][1], e: k[167][4], chg: pct(k[0][1], k[167][4]), dp, spark: [k[0][1], ...[23, 47, 71, 95, 119, 143, 167].map((i) => k[i][4])] });
      const btc = S(b, 0), eth = S(e, 2), wk = between(ws, we);
      const lines = (lang) => wk.map((g) => (lang === 'en' ? enDay(g[0].ts) : jaDay(g[0].ts)) + ' — ' + groupLine(g, lang));
      const px = (o) => `${usd(o.s, o.dp)} → ${usd(o.e, o.dp)}`;
      const tgE = '#Bitcoin #Ethereum #Crypto', tgJ = '#ビットコイン #イーサリアム #仮想通貨';
      add({
        id, sr: 'week',
        en: fit((a, more) => ['WEEK IN CRYPTO', '', `${enDay(ws)} — ${enDay(we - DAY)}, ${J(ws).getUTCFullYear()} (JST)`, '', 'EVENTS', ...(a.length ? a : wk.length ? [] : ['None']), ...(more ? [more] : []), '', 'BTC', px(btc), 'CHANGE ' + pctTxt(btc.chg), '', 'ETH', px(eth), 'CHANGE ' + pctTxt(eth.chg), '', tgE].join('\n'), lines('en'), 'en'),
        ja: fit((a, more) => ['今週のCrypto', '', `${jaDay(ws)}〜${jaDay(we - DAY)}`, '', 'イベント', ...(a.length ? a : wk.length ? [] : ['なし']), ...(more ? [more] : []), '', 'BTC', px(btc), '変動 ' + pctTxt(btc.chg), '', 'ETH', px(eth), '変動 ' + pctTxt(eth.chg), '', tgJ].join('\n'), lines('ja'), 'ja'),
        img: { ws, we, btc, eth, ev: wk.map((g) => ({ t: g[0].ts, en: groupLine(g, 'en'), ja: groupLine(g, 'ja') })) },
      });
    } else console.log('[x] WEEK: 1時間足が揃わないので次回');
  }
}

// ---- 保存・通知 ----
for (const p of out) for (const lg of ['en', 'ja']) if (xlen(p[lg]) > 280) console.log(`[x] 注意: ${p.id} ${lg} が280を超えています(${xlen(p[lg])})`);
if (out.length) {
  await site('/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ add: out }) });
  if (TOPIC) {
    const label = { daily: 'DAILY', arch: 'ARCHIVED', week: 'WEEK' };
    const r = await fetch(NTFY, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ topic: TOPIC, title: `投稿の下書き ${out.length}件`, message: out.map((p) => label[p.sr] + ' ' + p.en.split('\n')[p.sr === 'arch' ? 2 : 0]).join('\n'), tags: ['bird'], click: SITE + '/posts.html' }) });
    if (!r.ok) console.log('[x] ntfy HTTP ' + r.status);
  }
}
console.log(`[x] 新しい下書き ${out.length}件 (${out.map((p) => p.id).join(', ') || 'なし'})`);
