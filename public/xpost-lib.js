// X 投稿の文面づくりの共通部品(v81)。tools/x_notify.mjs(GitHub Actions)と /posts.html(ブラウザ)の両方が使う。
// 同じ文面を2か所で別々に書くと食い違うので、ここに1つだけ置く。外部の読み込みは無し(ブラウザでも Node でもそのまま動く)。
// 時刻・日付はすべて日本時間(JST)。

export const M5 = 3e5, H = 36e5, DAY = 24 * H, JST = 9 * H;
export const REGIONS = ['US', 'JP', 'EU'];
export const REGION_EN = { US: 'US', JP: 'Japan', EU: 'Euro area' };
// 投稿する時刻: 今日・今週の予定 = その日の 9:30 / 発表後の値動き = 発表の65分後 / 先週のまとめ = 月曜 10:00
export const DAILY_AT = 9.5 * H, ARCH_WAIT = 65 * 60000, WEEK_AT = 10 * H;

// ---- 文字の数え方(X: 日本語などは2、URLは23。上限280) ----
// 絵文字は1つで2と数える(異体字セレクタは数えない・国旗は2文字で1つ)
export const xlen = (t) => { let n = 0; t = String(t).replace(/https?:\/\/\S+/g, 'x'.repeat(23)).replace(/[\uFE0F\u200D]/g, '').replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '\u{1F1E6}'); for (const ch of t) { const o = ch.codePointAt(0); n += (o <= 0x10FF || (o >= 0x2000 && o <= 0x200D) || (o >= 0x2010 && o <= 0x201F) || (o >= 0x2032 && o <= 0x2037)) ? 1 : 2; } return n; };

// ---- 日時・数字の書き方(日本時間) ----
const WJ = ['日', '月', '火', '水', '木', '金', '土'], WE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], ME = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');
export const J = (t) => new Date(t + JST);
export const enDay = (t) => { const d = J(t); return `${WE[d.getUTCDay()]} ${ME[d.getUTCMonth()]} ${d.getUTCDate()}`; };        // Wed Oct 7
export const enDate = (t) => { const d = J(t); return `${ME[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };     // Oct 7, 2026
export const hm = (t) => { const d = J(t); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
export const jaDay = (t) => { const d = J(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WJ[d.getUTCDay()]})`; };        // 10/7(水)
export const jaDate = (t) => { const d = J(t); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; };
export const pct = (a, b) => Math.round((b / a - 1) * 1e4) / 100;                                   // 小数2桁
export const pctTxt = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
export const usd = (v, dp = 0) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const dayStart = (t) => Math.floor((t + JST) / DAY) * DAY - JST;                             // 日本時間の0時
export const weekStart = (t) => { const d0 = dayStart(t); return d0 - ((J(d0).getUTCDay() + 6) % 7) * DAY; };   // 日本時間の月曜0時
export const isoDay = (t) => J(t).toISOString().slice(0, 10);                                       // 日本時間の日付 2026-10-07

// ---- 小さなハッシュ(下書きの中身が変わったかを見る) ----
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// ---- 対象のイベント ----
// 重要度「高」の日米欧の指標 + 銘柄イベント(ニュースは除く)
export function pickEvents(cal) {
  return (cal.events || []).map((e) => ({ ...e, ts: Date.parse(e.at) })).filter((e) => isFinite(e.ts) && e.im === 'high'
    && ((e.l === 'macro' && REGIONS.includes(e.c)) || (e.l === 'asset' && !/ニュース/.test(e.s || ''))));
}
// 同じ時刻・同じ地域の発表(CPIの前年比・前月比など)は1つのまとまりにする
export function groups(list) {
  const m = new Map();
  for (const e of list) { const k = e.ts + ':' + (e.c || e.l); const g = m.get(k) || []; g.push(e); m.set(k, g); }
  return [...m.values()].sort((a, b) => a[0].ts - b[0].ts);
}
// 発表後の値動きを出す主要指標: FOMC・日銀・ECB の政策金利、米CPI・雇用統計・PCE
export const MAJOR = (e) => e.l === 'macro' && (/^(FOMC|日銀|ECB)$/.test(e.s || '') || (e.c === 'US' && /CPI|雇用統計|PCE/.test(e.s || '')));
export const archId = (g) => 'arch:' + g[0].ts + ':' + (g[0].c || g[0].l);

// ---- 名前・タグ ----
export const enName = (e) => e.te || e.se || e.s || e.t;
export const jaName = (e) => /^(FOMC|日銀|ECB)$/.test(e.s || '') ? (e.t || e.s) : (e.s || e.t);
export function groupLine(g, lang) {           // 名前は重ならないものを2つまで
  const names = [];
  for (const e of g) { const n = lang === 'en' ? enName(e) : jaName(e); if (!names.includes(n)) names.push(n); }
  if (lang === 'en' && names.length > 1) {      // 2つ目以降は地域名を省く(US CPI YoY / CPI MoM)
    const pre = REGION_EN[g[0].c] ? REGION_EN[g[0].c] + ' ' : '';
    for (let i = 1; i < names.length; i++) if (pre && names[i].startsWith(pre)) names[i] = names[i].slice(pre.length);
  }
  const more = names.length - 2;
  return names.slice(0, 2).join(' / ') + (more > 0 ? (lang === 'en' ? ` +${more}` : ` ほか${more}`) : '');
}
export function tags(name) {
  const T = [[/CPI/, '#CPI', '#CPI'], [/PPI/, '#PPI', '#PPI'], [/PCE/, '#PCE', '#PCE'], [/雇用統計|失業率|Nonfarm|Non Farm|Payroll|Unemployment/i, '#雇用統計', '#NFP'], [/FOMC/, '#FOMC', '#FOMC'],
    [/FRB|Fed\b/, '#FRB', '#Fed'], [/日銀|BoJ|BOJ/, '#日銀', '#BOJ'], [/ECB/, '#ECB', '#ECB'], [/GDP/, '#GDP', '#GDP'], [/ISM/, '#ISM', '#ISM'], [/小売|Retail/, '#小売売上高', '#RetailSales'],
    [/満期|Expiry|expiry/, '#オプション満期', '#OptionsExpiry'], [/ETH|Ethereum/, '#イーサリアム', '#Ethereum']];
  const hit = T.find(([re]) => re.test(name));
  return { ja: [hit ? hit[1] : '#経済指標', '#ビットコイン', '#仮想通貨'].join(' '), en: [hit ? hit[2] : '#Macro', '#Bitcoin', '#Crypto'].join(' ') };
}
export const siteLine = (site) => ({ en: `ETH / SOL / BNB and 5m–24h moves: ${site}`, ja: `ETH・SOL・BNBや5分〜24時間の値動きはサイトで\n${site}` });

// ---- 発表後の値動き(v91: 4銘柄・1時間後。v102: 2行目に発表日時) ----
// 数値の決まり: Binance 現物。基準 = 発表時刻を含む5分足の始値。+5分/+15分/+1時間 = それぞれの時刻に閉じる5分足の終値。変化率は小数2桁。
export const COINS = [['BTC', 'BTCUSDT', '₿'], ['ETH', 'ETHUSDT', '◆'], ['SOL', 'SOLUSDT', '◎'], ['BNB', 'BNBUSDT', '◇']];
export const barsStart = (ts) => Math.floor(ts / M5) * M5 - 12 * M5;      // 発表の1時間前から25本
// bars = 5分足 [開始, 始, 高, 安, 終]。基準と1時間後がそろっていなければ null
export function moves(bars, ts) {
  const t0 = Math.floor(ts / M5) * M5, m = new Map(bars.map((b) => [+b[0], b.map(Number)]));
  const f = m.get(t0), l = m.get(t0 + 11 * M5);
  if (!f || !l) return null;
  const before = f[1], at = (i) => { const b = m.get(t0 + i * M5); return b ? pct(before, b[4]) : null; };
  const spark = []; for (let i = -12; i <= 12; i++) { const b = m.get(t0 + i * M5); spark.push(b ? b[4] : null); }
  return { before, after: l[4], chg: pct(before, l[4]), c5: at(0), c15: at(2), c60: at(11), spark, t0 };
}
export const beforeAfter = moves;   // 古い呼び名
export const klinesUrl = (base, sym, interval, startTime, limit) => `${base}/api/v3/klines?symbol=${sym}&interval=${interval}&startTime=${startTime}&limit=${limit}`;
// 指標の種類ごとの印と短い名前
export function kindOf(g) {
  const s = g.map((e) => (e.s || '') + ' ' + (e.te || '')).join(' ');
  const cb = /FOMC|日銀|ECB|BoJ|Fed\b/.test(s);
  const short = /FOMC/.test(s) ? ['FOMC', 'FOMC'] : /日銀|BoJ/.test(s) ? ['BOJ', '日銀'] : /ECB/.test(s) ? ['ECB', 'ECB'] : /PCE/.test(s) ? ['PCE', 'PCE'] : /CPI/.test(s) ? ['CPI', 'CPI'] : /雇用統計|Payroll|Non Farm/i.test(s) ? ['NFP', '雇用統計'] : ['', ''];
  return { icon: cb ? '🏛️' : g[0].c === 'US' ? '🇺🇸' : g[0].c === 'JP' ? '🇯🇵' : g[0].c === 'EU' ? '🇪🇺' : '📅', short };
}
const arrow = (v) => v > 0 ? '🟢 ▲ +' + v.toFixed(2) + '%' : v < 0 ? '🔴 ▼ −' + Math.abs(v).toFixed(2) + '%' : '⚪ ± 0.00%';
// mv = {BTC: moves|null, ETH: …}。BTC は必須
export function archPost(g, mv, site) {
  if (mv && mv.before != null) mv = { BTC: mv };                       // 古い呼び方(BTCだけ)
  const ts = g[0].ts, nE = groupLine(g, 'en'), nJ = groupLine(g, 'ja'), k = kindOf(g), tg = tags(nE + ' ' + nJ);
  const tagE = tg.en.split(' ').slice(0, 1).concat('#Bitcoin').join(' '), tagJ = tg.ja.split(' ').slice(0, 1).concat('#ビットコイン').join(' ');
  const rows = COINS.filter(([c]) => mv[c]).map(([c, , sym]) => `${sym} ${c}  ${arrow(mv[c].c60)}`);
  const build = (lang, opt) => {
    const en = lang === 'en';
    const L = [`${k.icon} ${en ? nE : nJ}`, en ? `${enDay(ts)} · ${hm(ts)} JST` : `${jaDay(ts)} ${hm(ts)} 発表(日本時間)`, ...(opt.norule ? [] : ['━━━━━━━━━━━━━━']), en ? '📊 +1H RECORD (vs release)' : '📊 発表1時間後の記録(発表時点比)', '', ...rows];
    if (opt.marks) L.push('', en ? '⏱️ +5M ✓  ⏱️ +15M ✓  ⏱️ +1H ✓' : '⏱️ +5分 ✓  ⏱️ +15分 ✓  ⏱️ +1時間 ✓');
    L.push('', en ? `🗂️ Historical ${k.short[0] ? k.short[0] + ' ' : ''}records: link in bio` : `🗂️ 過去の${k.short[1] || 'この指標'}の記録はプロフィールのリンクから`);   // v94: URLなし(URL付きは X API で1本 $0.20)
    if (opt.tags) L.push(en ? (opt.tags > 1 ? tagE : '#Bitcoin') : (opt.tags > 1 ? tagJ : '#ビットコイン'));
    return L.join('\n');
  };
  const fitText = (lang) => { for (const o of [{ marks: 1, tags: 2 }, { marks: 1, tags: 1 }, { marks: 0, tags: 2 }, { marks: 0, tags: 1 }, { marks: 0, tags: 0 }, { marks: 0, tags: 0, norule: 1 }]) { const t = build(lang, o); if (xlen(t.replace(/️/g, '')) <= 280) return t; } return build(lang, { marks: 0, tags: 0, norule: 1 }); };
  const en = fitText('en'), ja = fitText('ja');
  const coins = {}; for (const [c] of COINS) if (mv[c]) coins[c] = { c5: mv[c].c5, c15: mv[c].c15, c60: mv[c].c60, before: mv[c].before, after: mv[c].after };
  const b = mv.BTC;
  return { id: archId(g), sr: 'arch', due: ts + ARCH_WAIT, en, ja, h: hashStr(en + ja), img: { v: 2, t: ts, en: nE, ja: nJ, icon: k.icon, coins, spark: b.spark, before: b.before, after: b.after, chg: b.chg, t0: b.t0 } };
}

// ---- 週間記録(v92: 土曜 10:00 投稿。期間 = 前の土曜0時〜金曜24時 JST) ----
// wk = {ws, we, coins:{BTC:{s,e,chg,spark}, …}, ev:[{t, icon, sen, sja, btc}]}  ev は重要度順(主要指標 → 過去のBTC +1hの変動幅が大きい順)。btc = BTC +1h(%)。null は「—」
export function weekPost(wk, site) {
  const d = (t) => { const x = J(t); return `${x.getUTCMonth() + 1}/${x.getUTCDate()}`; };
  const range = `${d(wk.ws)} — ${d(wk.we - DAY)} (JST)`;
  const rows = COINS.filter(([c]) => wk.coins[c]).map(([c, , sym]) => `${sym} ${c}  ${arrow(wk.coins[c].chg)}`);
  const ev = (lang) => wk.ev.map((e) => `${d(e.t)} ${e.icon} ${lang === 'en' ? e.sen : e.sja}  ${e.btc == null ? '—' : (e.btc > 0 ? '🟢 +' : e.btc < 0 ? '🔴 −' : '⚪ ±') + Math.abs(e.btc).toFixed(2) + '%'}`);
  const build = (lang, n, tag) => {
    const en = lang === 'en', E = ev(lang), more = E.length - n;
    return [en ? '🗓️ WEEKLY RECORD' : '🗓️ 週間記録', '━━━━━━━━━━', range, '', ...rows, '',
      en ? '📌 Releases (BTC +1h)' : '📌 今週の指標(BTC +1h)', ...(E.length ? E.slice(0, n) : [en ? 'None' : 'なし']), ...(more > 0 ? [en ? `+${more} more` : `ほか${more}件`] : []),
      '', en ? '🗂️ Archive: link in bio' : '🗂️ アーカイブはプロフィールのリンクから', ...(tag ? [en ? '#Bitcoin' : '#ビットコイン'] : [])].join('\n');
  };
  const fitW = (lang) => { const N = wk.ev.length; for (const tag of [1, 0]) for (let n = N; n >= 0; n--) { const t = build(lang, n, tag); if (xlen(t) <= 280) return t; } return build(lang, 0, 0); };
  const en = fitW('en'), ja = fitW('ja');
  return { id: 'week:' + isoDay(wk.ws), sr: 'week', due: wk.we + WEEK_AT, en, ja, h: hashStr(en + ja), img: { v: 2, ws: wk.ws, we: wk.we, coins: wk.coins, ev: wk.ev } };
}

// ---- S&P500 との相関・急変動(v95) ----
// 価格は Pacifica の無期限先物(SP500 = S&P 500 の先物。BTC・ETH・SOL・BNB も Pacifica)。
// 相関 = 1時間足の終値の変化率(対数)どうしのピアソン相関係数。直近30日・7日。24時間すべての足で計算(米国市場の時間外も含む)。
// 急変動(v98) = BTC が直近60分で ±3% 以上(5分足の終値どうし。時計の区切りには合わせない)。投稿には同じ1時間の ETH・SOL・BNB・S&P500 も載せる。
// v98: 急変動の投稿だけサイトの URL を付ける(X API は URL付き 1本 $0.20)。直近30日で SPIKE_LINK_MAX 回まで、超えたら URL なし。
export const SPIKE_PCT = 3, SPIKE_COIN = 'BTC', SPIKE_LINK_MAX = 10;
export const CORR_DAYS = [30, 7];
export function pearson(x, y) {
  const n = x.length; if (n < 3) return null;
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
// B = {SP500:[[開始ms, 始, 高, 安, 終], …], BTC:[…], …}(1時間足)。閉じた足だけ使う。足が8割未満しか揃わない期間は null
export function corrCalc(B, now) {
  const closed = (a) => (a || []).filter((b) => b[0] + H <= now);
  const spB = closed(B.SP500); if (!spB.length) return null;
  const sp = new Map(spB.map((b) => [b[0], b[4]])), end = spB[spB.length - 1][0];
  const out = { at: now, end: end + H, src: 'Pacifica', iv: '1h', w: {} };
  for (const d of CORR_DAYS) {
    out.w[d] = {};
    for (const [c] of COINS) {
      const m = new Map(closed(B[c]).map((b) => [b[0], b[4]])), x = [], y = [];
      for (let t = end - d * DAY + H; t <= end; t += H) { const a0 = m.get(t - H), a1 = m.get(t), s0 = sp.get(t - H), s1 = sp.get(t); if (a0 > 0 && a1 > 0 && s0 > 0 && s1 > 0) { x.push(Math.log(a1 / a0)); y.push(Math.log(s1 / s0)); } }
      const r = x.length >= d * 24 * 0.8 ? pearson(x, y) : null;
      out.w[d][c] = { r: r == null ? null : Math.round(r * 100) / 100, n: x.length };
    }
  }
  return out;
}
// 米国株の通常の取引時間(月〜金 9:30〜16:00 ニューヨーク時間。祝日は見ていない)
const NYF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function usOpen(t) {
  const p = Object.fromEntries(NYF.formatToParts(new Date(t)).map((x) => [x.type, x.value])), m = +p.hour * 60 + +p.minute;
  return !['Sat', 'Sun'].includes(p.weekday) && m >= 570 && m < 960;
}
// 急変動の1時間の値動き。B = 5分足(Pacifica)。T = Worker が見つけた時刻。
// T の前後(T−10分〜T+5分)に閉じた5分足のうち、きっかけの銘柄の1時間の変動が一番大きい足を終わりにする。±3% に届かなければ null
export function spikeMoves(B, T, now) {
  const hit = [SPIKE_COIN];
  const map = {}; for (const k of Object.keys(B)) map[k] = new Map((B[k] || []).map((b) => [b[0], b[4]]));
  const ch = (k, e) => { const a = map[k] && map[k].get(e - 12 * M5), b = map[k] && map[k].get(e); return a > 0 && b > 0 ? pct(a, b) : null; };
  let best = null;
  for (let e = Math.floor((T - 10 * 60000) / M5) * M5 - M5; e <= T + 5 * 60000; e += M5) {
    if (e + M5 > now || e + M5 < T - 10 * 60000) continue;
    const v = Math.max(...hit.map((c) => Math.abs(ch(c, e) ?? 0)));
    if (!best || v > best.v) best = { e, v };
  }
  if (!best || best.v < SPIKE_PCT) return null;
  const coins = {}; for (const [c] of COINS) { const v = ch(c, best.e); if (v != null) coins[c] = v; }
  const t1 = best.e + M5, t0 = t1 - H;
  return { t0, t1, coins, spx: ch('SP500', best.e), open: usOpen(t0) || usOpen(t1) || usOpen(t0 + H / 2), hit };
}
// v96: 相関係数は「0.65」の形(逆向きだけ −)。強さの目安を言葉で添える(よく使う区分: 0.7以上 強い / 0.4〜 中程度 / 0.2〜 弱い / 0.2未満 ほぼ無関係)
export const rTxt = (v) => v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
export function corrLabel(v, lang) {
  if (v == null) return '';
  const a = Math.abs(v), en = lang === 'en', inv = v < 0;
  if (a < 0.2) return en ? 'little link' : 'ほぼ無関係';
  const k = a >= 0.7 ? 0 : a >= 0.4 ? 1 : 2;
  return en ? ['strong', 'moderate', 'weak'][k] + (inv ? ' inverse' : '') : ['強い', '中程度の', '弱い'][k] + (inv ? '逆連動' : '連動');
}
// sp = spikeMoves の結果 + id + corr(corrCalc の結果)
export function spikePost(sp, corr, link) {   // link = サイトの URL(付けない時は null)
  const d = J(sp.t1), md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, btc = sp.coins[SPIKE_COIN];
  const rv = (d0, c) => corr && corr.w && corr.w[d0] && corr.w[d0][c] ? corr.w[d0][c].r : null;
  const cr = (c, lang, lab) => { const v = rv(30, c); return v == null ? '—' : rTxt(v) + (lab ? ' ' + corrLabel(v, lang) : ''); };
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
  const mv = (v, dot) => v == null ? '—' : (dot ? (v > 0 ? '🟢 ' : v < 0 ? '🔴 ' : '⚪ ') : '') + sg(v);
  // 1行 = 銘柄・同じ1時間の変化・S&P500 との相関(30日。7日は画像とサイト)。URL は必ず残す。
  // 入らない時は 区切り線 → 色の丸 → タグ → 時間外の注記 → 時刻の行(画像にはある) → 相関の目安の言葉 の順に外す
  const build = (lang, o) => {
    const en = lang === 'en';
    return [en ? `⚡ BTC ${sg(btc)} IN 1H` : `⚡ BTC 1時間で ${sg(btc)}`, ...(o.rule ? ['━━━━━━━━━━━━━━'] : []), ...(o.nodate ? [] : [en ? `${ME[d.getUTCMonth()]} ${d.getUTCDate()} · ${hm(sp.t0)}→${hm(sp.t1)} JST` : `${md} ${hm(sp.t0)}→${hm(sp.t1)}(日本時間)`]), '',
      en ? '1H change | corr w/ S&P500 (30D)' : '1時間の変化 | S&P500との相関(30日)',
      ...COINS.filter(([c]) => sp.coins[c] != null).map(([c, , s]) => `${s} ${c} ${mv(sp.coins[c], o.dot)} | ${cr(c, lang, !o.nolab)}`),
      `📈 S&P500 ${mv(sp.spx, o.dot)}${sp.open || o.noclosed ? '' : en ? ' (US market closed)' : '(米国市場の時間外)'}`,
      ...(link ? ['', '🔗 ' + link] : []),
      ...(o.tag ? [(link ? '' : '\n') + (en ? '#Bitcoin #SP500' : '#ビットコイン #SP500')] : [])].join('\n');
  };
  const LV = [{ rule: 1, dot: 1, tag: 1 }, { dot: 1, tag: 1 }, { dot: 1 }, { dot: 1, noclosed: 1 }, { noclosed: 1 }, { noclosed: 1, nodate: 1 }, { noclosed: 1, nodate: 1, nolab: 1 }];
  const fitS = (lang) => { for (const o of LV) { const t = build(lang, o); if (xlen(t) <= 280) return t; } return build(lang, LV[LV.length - 1]); };
  const en = fitS('en'), ja = fitS('ja');
  return { id: sp.id, sr: 'spike', due: sp.due, en, ja, h: hashStr(en + ja), img: { v: 1, t0: sp.t0, t1: sp.t1, coins: sp.coins, spx: sp.spx, open: sp.open, hit: sp.hit, link: !!link, corr: corr ? { 30: corr.w[30], 7: corr.w[7], end: corr.end } : null } };
}

// ---- 自動投稿(v94) ----
// 自動で投稿する種類: 発表後の値動き・週間記録はいつも、毎朝の予定は AUTO_DAILY_FROM 以降(それまでは X で手で予約済み)
export const AUTO_DAILY_FROM = '2026-11-02';
export const AUTO_WINDOW = 3 * H;   // 投稿時刻からこの時間を過ぎたものは自動で出さない(古い投稿を急に出さない)
// v101: man = /posts.html の「過去の発表から作る」で手で作った下書き(自動投稿しない)
export const isAuto = (p) => !p.man && (p.sr === 'arch' || p.sr === 'week' || p.sr === 'spike' || (p.sr === 'daily' && isoDay(p.due || 0) >= AUTO_DAILY_FROM));
// Worker が見張る「自動投稿の予定」(小さく保つ): 未投稿の自動投稿 + これからの主要指標の発表65分後
export function dueList(posts, events, now) {
  const items = [], seen = new Set();
  for (const p of posts || []) { seen.add(p.id); if (isAuto(p) && p.due && !(p.done && p.done.en && p.done.ja) && p.due > now - AUTO_WINDOW && p.due < now + 8 * DAY) items.push({ id: p.id, due: p.due }); }
  for (const g of groups((events || []).filter(MAJOR))) { const id = archId(g), due = g[0].ts + ARCH_WAIT; if (!seen.has(id) && due > now - AUTO_WINDOW && due < now + 8 * DAY) items.push({ id, due }); }
  return { at: now, items: items.sort((a, b) => a.due - b.due) };
}
