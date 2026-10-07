// X 投稿の文面づくりの共通部品(v81)。tools/x_notify.mjs(GitHub Actions)と /posts.html(ブラウザ)の両方が使う。
// 同じ文面を2か所で別々に書くと食い違うので、ここに1つだけ置く。外部の読み込みは無し(ブラウザでも Node でもそのまま動く)。
// 時刻・日付はすべて日本時間(JST)。

export const M5 = 3e5, H = 36e5, DAY = 24 * H, JST = 9 * H;
export const REGIONS = ['US', 'JP', 'EU'];
export const REGION_EN = { US: 'US', JP: 'Japan', EU: 'Euro area' };
// 投稿する時刻: 今日・今週の予定 = その日の 9:30 / 発表後の値動き = 発表の65分後 / 先週のまとめ = 月曜 10:00
export const DAILY_AT = 9.5 * H, ARCH_WAIT = 65 * 60000, WEEK_AT = 10 * H;

// ---- 文字の数え方(X: 日本語などは2、URLは23。上限280) ----
export const xlen = (t) => { let n = 0; t = String(t).replace(/https?:\/\/\S+/g, 'x'.repeat(23)); for (const ch of t) { const o = ch.codePointAt(0); n += (o <= 0x10FF || (o >= 0x2000 && o <= 0x200D) || (o >= 0x2010 && o <= 0x201F) || (o >= 0x2032 && o <= 0x2037)) ? 1 : 2; } return n; };

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

// ---- 発表後の値動き ----
// 数値の決まり: Binance 現物 BTCUSDT。前 = 発表時刻を含む5分足の始値、後 = 発表から1時間後に閉じる5分足の終値。
// bars = 発表の1時間前から25本の5分足 [開始, 始, 高, 安, 終]。そろっていなければ null
export function beforeAfter(bars, ts) {
  const t0 = Math.floor(ts / M5) * M5, m = new Map(bars.map((b) => [+b[0], b.map(Number)]));
  const f = m.get(t0), l = m.get(t0 + 11 * M5);
  if (!f || !l) return null;
  const before = f[1], after = l[4];
  const spark = []; for (let i = -12; i <= 12; i++) { const b = m.get(t0 + i * M5); spark.push(b ? b[4] : null); }
  return { before, after, chg: pct(before, after), spark, t0 };
}
export const klinesUrl = (base, sym, interval, startTime, limit) => `${base}/api/v3/klines?symbol=${sym}&interval=${interval}&startTime=${startTime}&limit=${limit}`;
export function archPost(g, ba, site) {
  const ts = g[0].ts, nE = groupLine(g, 'en'), nJ = groupLine(g, 'ja'), tg = tags(nE + ' ' + nJ), sl = siteLine(site);
  const en = ['ARCHIVED', '', nE, `${enDate(ts)} · ${hm(ts)} JST`, '', 'BEFORE', `BTC: ${usd(ba.before)}`, '', 'AFTER (+1h)', `BTC: ${usd(ba.after)}`, '', 'CHANGE', pctTxt(ba.chg), '', sl.en, tg.en].join('\n');
  const ja = ['アーカイブ', '', nJ, `${jaDate(ts)} ${hm(ts)}(日本時間)`, '', 'イベント前', `BTC: ${usd(ba.before)}`, '', 'イベント後(1時間後)', `BTC: ${usd(ba.after)}`, '', '変動', pctTxt(ba.chg), '', sl.ja, tg.ja].join('\n');
  return { id: archId(g), sr: 'arch', due: ts + ARCH_WAIT, en, ja, h: hashStr(en + ja), img: { t: ts, en: nE, ja: nJ, ...ba } };
}
