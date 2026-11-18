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
// v103: 英語は UTC(日本語は日本時間)
const U = (t) => new Date(t);
export const uDay = (t) => { const d = U(t); return `${WE[d.getUTCDay()]} ${ME[d.getUTCMonth()]} ${d.getUTCDate()}`; };   // Wed Oct 7(UTC)
export const uMD = (t) => { const d = U(t); return `${ME[d.getUTCMonth()]} ${d.getUTCDate()}`; };                      // Oct 7(UTC)
export const uhm = (t) => { const d = U(t); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };            // 12:30(UTC)
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
export const MAJOR = (e) => e.l === 'macro' && (/^(FOMC|日銀|ECB)$/.test(e.s || '') || (e.c === 'US' && /CPI|雇用統計|PCE/.test(e.s || '')) || (e.c === 'JP' && e.s === '短観'));   // v179: 日銀短観を追加
// v185: 予告と発表後の値動きを出す対象 = 毎朝の予定に載る指標すべて(日米欧・重要度「高」)+ 主要指標
export const AUTOEV = (e) => e.l === 'macro' && REGIONS.includes(e.c) && (MAJOR(e) || e.im === 'high');
export const isFomcAny = (e) => e.l === 'macro' && e.c === 'US' && /FOMC|Fed Chair|Powell|パウエル|FRB議長/i.test([e.s, e.t, e.se, e.te].filter(Boolean).join(' '));   // v212: FOMC の声明・会見など名前が違うものも
export const AUTOPOST = (e) => AUTOEV(e) && !isFomcAny(e) && !bigOf(e);
// v215: 大型指標(FOMC・米CPI・米雇用統計・米PCE)は親子ポストで出す。同じ時刻のほかの指標もまとめて外す
export const bigOf = (e) => { if (!(e.l === 'macro' && e.c === 'US')) return null; if (e.s === 'FOMC') return 'fomc'; const s = [e.s, e.t, e.se, e.te].filter(Boolean).join(' '); return /PCE/.test(s) ? 'pce' : /CPI/.test(s) && !/PPI/.test(s) ? 'cpi' : /雇用統計|Non ?farm|Payroll/i.test(s) && !/ADP/i.test(s) ? 'nfp' : null; };
export const bigOfG = (g) => (g.some((e) => e.s === 'FOMC') ? 'fomc' : g.map(bigOf).find(Boolean)) || null;
export const bigGroups = (events) => groups((events || []).filter((e) => bigOf(e))).map((g) => ({ g, k: bigOfG(g) })).filter((x) => x.k);
export const autoGroups = (events) => { const big = new Set(bigGroups(events).map((x) => x.g[0].ts)); return groups((events || []).filter(AUTOEV)).filter((g) => !big.has(g[0].ts) && !g.some(isFomcAny)); };   // v211: 発表前の予告・発表後の値動きを出す指標(FOMC は親子ポストで出すので外す)
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
// ---- v108: 投稿本文の共通の形(毎朝の予定と同じ見た目: ブランド行・🟢見出し・━線・🟡項目) ----
export const BRAND = { en: '🔹 CRYPTO SIGNAL ARCHIVE', ja: '🔹 暗号資産シグナル・アーカイブ' };
const ME3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], WJ3 = ['日', '月', '火', '水', '木', '金', '土'];
export const dEnU = (t, year = true) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, '0')} ${ME3[d.getUTCMonth()]}${year ? ' ' + d.getUTCFullYear() : ''}`; };   // 09 OCT 2026(UTC)
export const dJaL = (t) => { const d = J(t); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WJ3[d.getUTCDay()]}）`; };                                          // 10月9日（金）(日本時間)
const sgn = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
const dot = (v) => v == null ? '⚪' : v > 0 ? '🟢' : v < 0 ? '🔴' : '⚪';
const coinRow = (c, s, v, o = {}) => `${s} ${c} ${o.dot === false ? '' : dot(v) + ' '}${sgn(v)}`;
const icon2 = (g) => kindOf(g).icon === '🏛️' ? '🏦' : kindOf(g).icon;   // 本文は金融政策 = 🏦(毎朝の予定と同じ)
// 入る形を探す: opts を順に試し、280 以内の最初を返す
const fit280 = (build, opts) => { for (const o of opts) { const t = build(o); if (xlen(t) <= 280) return t; } return build(opts[opts.length - 1]); };
const arrow = (v) => v > 0 ? '🟢 ▲ +' + v.toFixed(2) + '%' : v < 0 ? '🔴 ▼ −' + Math.abs(v).toFixed(2) + '%' : '⚪ ± 0.00%';
// mv = {BTC: moves|null, ETH: …}。BTC は必須
export function archPost(g, mv, site) {
  if (mv && mv.before != null) mv = { BTC: mv };                       // 古い呼び方(BTCだけ)
  const ts = g[0].ts, nE = groupLine(g, 'en'), nJ = groupLine(g, 'ja'), k = kindOf(g), tg = tags(nE + ' ' + nJ);
  const tagE = tg.en.split(' ').slice(0, 1).concat('#Bitcoin').join(' '), tagJ = tg.ja.split(' ').slice(0, 1).concat('#ビットコイン').join(' ');
  // v184: 発表前の予告と同じ形(見出し → 一文 → BTC の数字1つ → 他の3銘柄)
  const others = (lang) => COINS.filter(([c]) => c !== 'BTC' && mv[c]).map(([c]) => `${c} ${sgn(mv[c].c60)}`).join(' · ');
  const en = [`${flagOf(g)} ${headName(g, 'en')} · ${uhm(ts)} UTC`, '', '1 hour after the release,', 'BTC moved:', '', big(mv.BTC.c60), ...(others('en') ? ['', others('en')] : [])].join('\n');
  const ja = [`${flagOf(g)} ${headName(g, 'ja')} · ${jaDay(ts)} ${hm(ts)}発表`, '', '発表から1時間、', 'BTCはこう動きました。', '', big(mv.BTC.c60), ...(others('ja') ? ['', others('ja')] : [])].join('\n');
  const coins = {}; for (const [c] of COINS) if (mv[c]) coins[c] = { c5: mv[c].c5, c15: mv[c].c15, c60: mv[c].c60, before: mv[c].before, after: mv[c].after, sp: mv[c].spark };   // v109: sp = 5分足の終値(発表1時間前〜1時間後)
  const b = mv.BTC;
  return { id: archId(g), sr: 'arch', due: ts + ARCH_WAIT, en, ja, h: hashStr(en + ja), img: { v: 3, t: ts, en: nE, ja: nJ, icon: k.icon, coins, spark: b.spark, before: b.before, after: b.after, chg: b.chg, t0: b.t0 } };
}

// ---- 週間記録(v92: 土曜 10:00 投稿。期間 = 前の土曜0時〜金曜24時 JST) ----
// wk = {ws, we, coins:{BTC:{s,e,chg,spark}, …}, ev:[{t, icon, sen, sja, btc}]}  ev は重要度順(主要指標 → 過去のBTC +1hの変動幅が大きい順)。btc = BTC +1h(%)。null は「—」
export function weekPost(wk, site) {
  // v108: 毎朝の予定と同じ形。指標をできるだけ多く載せる(入らない時は 線を短く → ブランド行 → 案内の行 → タグ の順に外し、それでも入らなければ件数を減らす)
  const d = (t) => { const x = J(t); return `${x.getUTCMonth() + 1}/${x.getUTCDate()}`; };
  const rows = (nd) => { const cs = COINS.filter(([c]) => wk.coins[c]).map(([c, , s]) => `${s} ${c} ${nd ? '' : dot(wk.coins[c].chg) + ' '}${sgn(wk.coins[c].chg)}`); return [cs.slice(0, 2).join('  '), cs.slice(2).join('  ')].filter(Boolean); };   // 4銘柄を2行に(指標を多く載せるため)
  const ev = (lang) => wk.ev.map((e) => `${lang === 'en' ? dEnU(e.t, false) : d(e.t)} ${lang === 'en' ? e.sen : e.sja} ${sgn(e.btc)}`);
  const build = (lang) => (o) => {
    const en = lang === 'en', E = ev(lang), more = E.length - o.n, rule = '━'.repeat(o.rule);
    return [...(o.brand ? [BRAND[lang], ''] : []),
      en ? `🟢 WEEK · ${dEnU(wk.ws, false)} ${uhm(wk.ws)} → ${dEnU(wk.we, false)} ${uhm(wk.we)} UTC` : `🟢 週間記録 · ${d(wk.ws)}〜${d(wk.we - DAY)} · 日本時間`, rule,
      ...rows(o.nodot), rule,
      en ? '🟡 RELEASES · BTC +1H' : '🟡 指標 · BTC +1時間', ...(E.length ? E.slice(0, o.n) : [en ? 'None' : 'なし']), ...(more > 0 ? [en ? `+${more} more` : `ほか${more}件`] : []),
      ...(o.cta ? ['', en ? '🗂️ Archive: link in bio' : '🗂️ アーカイブはプロフィールのリンクから'] : []),
      ...(o.tag ? [en ? '#Bitcoin' : '#ビットコイン'] : [])].join('\n');
  };
  const fitW = (lang) => {
    const N = wk.ev.length, B = [{ brand: 1, rule: 18, cta: 1, tag: 1 }, { brand: 1, rule: 10, cta: 1, tag: 1 }, { rule: 10, cta: 1, tag: 1 }, { rule: 10, tag: 1 }, { rule: 10 }, { rule: 10, nodot: 1 }];
    for (let n = N; n >= 0; n--) for (const o of B) { const t = build(lang)({ ...o, n }); if (xlen(t) <= 280) return t; }
    return build(lang)({ rule: 10, n: 0 });
  };
  const en = fitW('en'), ja = fitW('ja');
  const wdues = isoDay(wk.we) >= SPLIT_FROM ? { ja: wk.we + WEEK_AT, en: wk.we + 9 * H + EN_WEEK_AT } : null;   // v173: we = 土曜0時(日本時間) = 金曜15時(UTC)。+9時間 = 土曜0時(UTC)
  return { id: 'week:' + isoDay(wk.ws), sr: 'week', due: wk.we + WEEK_AT, ...(wdues ? { dues: wdues } : {}), en, ja, h: hashStr(en + ja + (wdues ? JSON.stringify(wdues) : '')), img: { v: 3, ws: wk.ws, we: wk.we, coins: wk.coins, ev: wk.ev, btc: wk.btc || null } };   // v109: btc = 1時間足の終値(週の168本)
}

// ---- S&P500 との相関・急変動(v95) ----
// 価格は Pacifica の無期限先物(SP500 = S&P 500 の先物。BTC・ETH・SOL・BNB も Pacifica)。
// 相関 = 1時間足の終値の変化率(対数)どうしのピアソン相関係数。直近30日・7日。24時間すべての足で計算(米国市場の時間外も含む)。
// 急変動(v98) = BTC が直近60分で ±3% 以上(5分足の終値どうし。時計の区切りには合わせない)。投稿には同じ1時間の ETH・SOL・BNB・S&P500 も載せる。
// v98: 急変動の投稿だけサイトの URL を付ける(X API は URL付き 1本 $0.20)。直近30日で SPIKE_LINK_MAX 回まで、超えたら URL なし。
export const SPIKE_PCT = 3, SPIKE_COIN = 'BTC', SPIKE_LINK_MAX = 10;
export const SPIKE_TH = { 1: 3 }, SPIKE_DAY = 2.3;   // v199: ① 60分で ±3% ② 日本時間のその日の高値から −2.3% / 安値から +2.3%(Worker と同じ)
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
  // v180: WTI原油(Pacifica CL)との相関。取れない時は入れない(S&P500 側はそのまま)
  const clB = closed(B.CL);
  if (clB.length) {
    const cl = new Map(clB.map((b) => [b[0], b[4]])), ce = clB[clB.length - 1][0];
    out.cl = {};
    for (const d of CORR_DAYS) {
      out.cl[d] = {};
      for (const [c] of COINS) {
        const m = new Map(closed(B[c]).map((b) => [b[0], b[4]])), x = [], y = [];
        for (let t = ce - d * DAY + H; t <= ce; t += H) { const a0 = m.get(t - H), a1 = m.get(t), s0 = cl.get(t - H), s1 = cl.get(t); if (a0 > 0 && a1 > 0 && s0 > 0 && s1 > 0) { x.push(Math.log(a1 / a0)); y.push(Math.log(s1 / s0)); } }
        const r = x.length >= d * 24 * 0.5 ? pearson(x, y) : null;   // 原油は休場があるので5割で可
        out.cl[d][c] = { r: r == null ? null : Math.round(r * 100) / 100, n: x.length };
      }
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
export function spikeMoves(B, T, now, win = 1, opt = {}) {   // v121: win = 1 / 6(時間)。v199: opt = {from(その日の高値・安値の時刻), th}
  const hit = [SPIKE_COIN], F = opt.from ? Math.floor(opt.from / M5) * M5 : null; let K = 12 * win;
  const map = {}; for (const k of Object.keys(B)) map[k] = new Map((B[k] || []).map((b) => [b[0], b[4]]));
  const ch = (k, e) => { const a = map[k] && map[k].get(F != null ? F : e - K * M5), b = map[k] && map[k].get(e); return a > 0 && b > 0 ? pct(a, b) : null; };
  let best = null;
  for (let e = Math.floor((T - 10 * 60000) / M5) * M5 - M5; e <= T + 5 * 60000; e += M5) {
    if (e + M5 > now || e + M5 < T - 10 * 60000) continue;
    const v = Math.max(...hit.map((c) => Math.abs(ch(c, e) ?? 0)));
    if (!best || v > best.v) best = { e, v };
  }
  if (!best || best.v < (opt.th || SPIKE_TH[win] || SPIKE_PCT)) return null;
  if (F != null) { K = Math.round((best.e - F) / M5); win = Math.max(1, Math.round(K / 12)); }   // その日の高値・安値から今まで
  const coins = {}; for (const [c] of COINS) { const v = ch(c, best.e); if (v != null) coins[c] = v; }
  const t1 = best.e + M5, t0 = F != null ? F : t1 - win * H, span = win > 6 ? 576 : win > 1 ? 144 : 72, step = win > 6 ? 6 : 1;   // 画像: 1時間 = 直近6時間 / 6時間 = 直近12時間 / 24時間 = 直近48時間(30分おき)
  const ser = (k) => { const a = []; for (let e = best.e - span * M5; e <= best.e; e += step * M5) { const v = map[k] && map[k].get(e); a.push(v > 0 ? v : null); } return a; };   // v109: 直近6時間の5分足の終値(画像用)
  return { win, t0, t1, coins, ser: { btc: ser('BTC'), spx: ser('SP500'), step }, spx: ch('SP500', best.e), open: usOpen(t0) || usOpen(t1) || usOpen((t0 + t1) / 2), hit };
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
// v187: 清算の金額(日本語)
export const jaUsd = (v) => { v = Math.abs(+v || 0); return v >= 1e8 ? (v / 1e8).toFixed(2).replace(/\.?0+$/, '') + '億ドル' : v >= 1e4 ? Math.round(v / 1e4).toLocaleString('en-US') + '万ドル' : Math.round(v) + 'ドル'; };
// liq = {l, s, mult} | null(v187: 返信で内訳を出す時、親の最後に1行)
export function spikePost(sp, corr, link, liq) {   // link = サイトの URL(付けない時は null)
  const W = sp.win || 1, d = J(sp.t0), md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, btc = sp.coins[SPIKE_COIN];
  const rv = (d0, c) => corr && corr.w && corr.w[d0] && corr.w[d0][c] ? corr.w[d0][c].r : null;
  const cr = (c, lang, lab) => { const v = rv(30, c); return v == null ? '—' : rTxt(v) + (lab ? ' ' + corrLabel(v, lang) : ''); };
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
  const mv = (v, dot) => v == null ? '—' : (dot ? (v > 0 ? '🟢 ' : v < 0 ? '🔴 ' : '⚪ ') : '') + sg(v);
  // 1行 = 銘柄・同じ1時間の変化・S&P500 との相関(30日。7日は画像とサイト)。URL は必ず残す。
  // 入らない時は 区切り線 → 色の丸 → タグ → 時間外の注記 → 時刻の行(画像にはある) → 相関の目安の言葉 の順に外す
  // v108: 毎朝の予定と同じ形
  const build = (lang, o) => {
    const en = lang === 'en', rule = '━'.repeat(o.rule || 10);
    return [...(o.brand ? [BRAND[lang], ''] : []),
      en ? `⚡ BTC ${sg(btc)} IN ${W}H` : `⚡ BTC ${W}時間で ${sg(btc)}`, ...(o.nodate ? [] : [en ? (dEnU(sp.t0) === dEnU(sp.t1) ? `${dEnU(sp.t0)} · ${uhm(sp.t0)}→${uhm(sp.t1)} UTC` : `${dEnU(sp.t0, false)} ${uhm(sp.t0)} → ${dEnU(sp.t1, false)} ${uhm(sp.t1)} UTC`) : (dJaL(sp.t0) === dJaL(sp.t1) ? `${dJaL(sp.t0)} · ${hm(sp.t0)}→${hm(sp.t1)} · 日本時間` : `${md} ${hm(sp.t0)} → ${J(sp.t1).getUTCMonth() + 1}/${J(sp.t1).getUTCDate()} ${hm(sp.t1)} · 日本時間`)]), rule,
      ...COINS.filter(([c]) => sp.coins[c] != null).map(([c, , s]) => `${s} ${c} ${mv(sp.coins[c], o.dot)}`),
      `📈 S&P500 ${mv(sp.spx, o.dot)}${sp.open || o.noclosed ? '' : en ? ' (US market closed)' : '(米国市場の時間外)'}`,
      ...(rv(30, 'BTC') != null ? [en ? `BTC–S&P500 corr (30D): ${cr('BTC', lang, !o.nolab)}` : `BTCとS&P500の相関(30日): ${cr('BTC', lang, !o.nolab)}`] : []), rule,
      ...(liq ? [en ? `${usdS(liq.l + liq.s)} liquidated${liq.mult != null ? ` — ${fxs(liq.mult)}x a normal ${W === 1 ? 'hour' : W + 'h'}` : ''} ↓` : `清算${jaUsd(liq.l + liq.s)}${liq.mult != null ? `、普段の${fxs(liq.mult)}倍` : ''} ↓`] : []),
      ...(link ? ['🔗 ' + link] : []),
      ...(o.tag ? [en ? '#Bitcoin #SP500' : '#ビットコイン #SP500'] : [])].join('\n');
  };
  const LV = [{ brand: 1, rule: 18, dot: 1, tag: 1 }, { brand: 1, dot: 1, tag: 1 }, { dot: 1, tag: 1 }, { dot: 1 }, {}, { noclosed: 1 }, { noclosed: 1, nodate: 1 }, { noclosed: 1, nodate: 1, nolab: 1 }];   // 相関の目安の言葉は最後まで残す(時刻は画像にもある・投稿はすぐ出る)
  const fitS = (lang) => { for (const o of LV) { const t = build(lang, o); if (xlen(t) <= 280) return t; } return build(lang, LV[LV.length - 1]); };
  const en = fitS('en'), ja = fitS('ja');
  return { id: sp.id, sr: 'spike', due: sp.due, en, ja, h: hashStr(en + ja), img: { v: 2, win: W, t0: sp.t0, t1: sp.t1, coins: sp.coins, ...(liq ? { liq: { l: liq.l, s: liq.s, mult: liq.mult != null ? liq.mult : null } } : {}), spx: sp.spx, open: sp.open, hit: sp.hit, link: !!link, ser: sp.ser || null, corr: corr ? { 30: corr.w[30], 7: corr.w[7], end: corr.end } : null } };
}
// v187: 急変動の返信(清算の内訳)。親(spike)を出した直後に、その返信として出す
export function spikeLiqPost(sp, liq) {
  const W = sp.win || 1, tot = liq.l + liq.s, sh = tot > 0 ? Math.round(Math.max(liq.l, liq.s) / tot * 100) : null, big = liq.l >= liq.s;
  const en = [`Liquidations in that ${W === 1 ? 'hour' : W + 'h'} (BTC/ETH/SOL/BNB):`, '', `🔴 Longs  ${usdS(liq.l)}`, `🟢 Shorts ${usdS(liq.s)}`, ...(sh != null ? ['', `${sh}% were ${big ? 'longs' : 'shorts'}.`] : [])].join('\n');
  const ja = [`その${W}時間の清算（BTC・ETH・SOL・BNB）`, '', `🔴 ロング  ${jaUsd(liq.l)}`, `🟢 ショート ${jaUsd(liq.s)}`, ...(sh != null ? ['', `清算の${sh}%が${big ? 'ロング' : 'ショート'}でした。`] : [])].join('\n');
  return { id: sp.id + ':liq', sr: 'spikeliq', parent: sp.id, due: sp.due, en, ja, h: hashStr(en + ja) };
}


// ---- v152: 清算(ロング清算 = 買いポジションの強制決済。Bybit・OKX の合算) ----
//   liq    = 巨額清算の総括(収まった時に1本。Worker の LiqHub が事象を記録 → x:liq)
//   liqday = 毎朝のまとめ(日本時間 9:00 に、直近24時間)
export const LIQ_DAY_AT = 9 * H;
export const usdS = (v) => { v = Math.abs(+v || 0); return v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e7 ? '$' + Math.round(v / 1e6) + 'M' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v); };
const liqRows = (coins) => COINS.filter(([c]) => coins[c] && (coins[c].long || coins[c].short)).map(([c, , s]) => `${s} ${c} 🔴${usdS(coins[c].long)} 🟢${usdS(coins[c].short)}`);   // 🔴 = ロング清算 / 🟢 = ショート清算(合計の行で説明)
const liqTot = (coins) => { let l = 0, sh = 0; for (const c of Object.keys(coins || {})) { l += coins[c].long || 0; sh += coins[c].short || 0; } return { l, s: sh, share: l + sh > 0 ? Math.round(l / (l + sh) * 100) : null }; };
const rangeTxt = (a, b, lang) => lang === 'en'
  ? (dEnU(a) === dEnU(b) ? `${dEnU(a)} · ${uhm(a)}→${uhm(b)} UTC` : `${dEnU(a, false)} ${uhm(a)} → ${dEnU(b, false)} ${uhm(b)} UTC`)
  : (dJaL(a) === dJaL(b) ? `${dJaL(a)} · ${hm(a)}→${hm(b)} · 日本時間` : `${dJaL(a)} ${hm(a)} → ${dJaL(b)} ${hm(b)} · 日本時間`);
// ev = Worker が記録した事象 {id, start, end, capped, coins:{BTC:{long,short,peak}}, maxOne:{usd,coin,side,ts}, ser:[[t,long,short]], man?}
export function liqPost(ev) {
  const tot = liqTot(ev.coins), mo = ev.maxOne;
  const build = (lang, o) => {
    const en = lang === 'en', rule = '━'.repeat(o.rule || 10);
    return [...(o.brand ? [BRAND[lang], ''] : []),
      ...(ev.man && ev.hrs ? [en ? `🔥 LIQUIDATIONS · LAST ${ev.hrs}H` : `🔥 清算 · 直近${ev.hrs}時間`] : [en ? '🔥 LIQUIDATION WAVE' : '🔥 巨額清算']), ...(o.nodate ? [] : [rangeTxt(ev.start, ev.end, lang)]), rule,   // v277: 手で作った時は「直近◯時間」
      ...liqRows(ev.coins), rule,
      en ? `🔴 Long ${usdS(tot.l)} · 🟢 Short ${usdS(tot.s)}` : `🔴 ロング ${usdS(tot.l)} · 🟢 ショート ${usdS(tot.s)}`,
      ...(mo && !o.nomax ? [en ? `💥 Largest: ${usdS(mo.usd)} ${mo.coin} ${mo.side}` : `💥 最大の1件: ${usdS(mo.usd)} ${mo.coin}の${mo.side === 'long' ? 'ロング' : 'ショート'}`] : []),
      ...(o.src ? [ev.hrs ? (en ? 'Binance+Bybit+OKX+Huobi' : 'Binance・Bybit・OKX・Huobi合算') : (en ? 'Bybit + OKX' : 'Bybit・OKX合算')] : []),
      ...(o.tag ? [en ? '#Crypto #Liquidations' : '#仮想通貨 #清算'] : [])].join('\n');
  };
  const LV = [{ brand: 1, rule: 18, src: 1, tag: 1 }, { brand: 1, src: 1, tag: 1 }, { brand: 1, tag: 1 }, { tag: 1 }, {}, { nomax: 1 }, { nomax: 1, nodate: 1 }];
  const fitL = (lang) => { for (const o of LV) { const t = build(lang, o); if (xlen(t) <= 280) return t; } return build(lang, LV[LV.length - 1]); };
  const en = fitL('en'), ja = fitL('ja');
  return { id: ev.id, sr: 'liq', due: ev.end, en, ja, h: hashStr(en + ja), ...(ev.man ? { man: 1 } : {}),
    img: { v: 1, kind: 'wave', ...(ev.hrs ? { hrs: ev.hrs } : {}), ...(ev.px ? { px: ev.px } : {}), start: ev.start, end: ev.end, capped: !!ev.capped, coins: ev.coins, maxOne: mo || null, ser: ev.ser || [] } };
}
// 毎朝のまとめ: day = 日本時間の0時(ms)。直近24時間 = (day+9h-24h) 〜 (day+9h)。coins = {BTC:{long,short}}, hours = [[t,long,short]](24本まで)、from = 記録の始まり(24時間に満たない時)
export function liqDayPost(day, coins, hours, from, mult, opt = {}) {   // v171: mult = {l, s, n, coins:{BTC:{l,s}}, live} 平常日比(next.html の案Bと同じ定義) / v173: opt = {end, id, langs}
  const end = opt.end || day + LIQ_DAY_AT, start = end - DAY, tot = liqTot(coins);
  let pk = null; for (const h of hours || []) if (!pk || h[1] + h[2] > pk[1] + pk[2]) pk = h;
  const part = from && from > start + 36e5;
  const build = (lang, o) => {
    const en = lang === 'en', rule = '━'.repeat(o.rule || 10);
    return [...(o.brand ? [BRAND[lang], ''] : []),
      en ? '📊 LIQUIDATIONS · LAST 24H' : '📊 清算額 · 直近24時間',
      ...(o.nodate ? [] : [en ? `to ${dEnU(end)} · ${uhm(end)} UTC${part ? ' (partial)' : ''}` : `${dJaL(end)} ${hm(end)} まで${part ? '（記録は途中から）' : ''}`]), rule,
      ...liqRows(coins), rule,
      en ? `🔴 Long ${usdS(tot.l)} · 🟢 Short ${usdS(tot.s)}${tot.share != null ? ` (${tot.share}% long)` : ''}` : `🔴 ロング ${usdS(tot.l)} · 🟢 ショート ${usdS(tot.s)}${tot.share != null ? `（ロング${tot.share}%）` : ''}`,
      ...(mult && !o.nomult ? [en ? `📏 vs normal day: Long ×${fxs(mult.l)} · Short ×${fxs(mult.s)}` : `📏 平常日比: ロング ×${fxs(mult.l)} · ショート ×${fxs(mult.s)}`] : []),
      ...(pk && !o.nopeak ? [en ? `⏱ Peak hour ${uhm(pk[0])} UTC · ${usdS(pk[1] + pk[2])}` : `⏱ ピーク ${hm(pk[0])} · ${usdS(pk[1] + pk[2])}`] : []),
      ...(o.src ? [en ? 'Binance+Bybit+OKX+Huobi' : 'Binance・Bybit・OKX・Huobi合算'] : []),   // v171: 毎朝のまとめは /api/liq の集計(Coinalyze 4社)。巨額清算の総括(ライブ受信)は Bybit・OKX のまま
      ...(o.tag ? [en ? '#Crypto #Liquidations' : '#仮想通貨 #清算'] : [])].join('\n');
  };
  const LV = [{ brand: 1, rule: 18, src: 1, tag: 1 }, { brand: 1, src: 1, tag: 1 }, { brand: 1, tag: 1 }, { tag: 1 }, {}, { nopeak: 1 }, { nopeak: 1, nodate: 1 }, { nopeak: 1, nodate: 1, nomult: 1 }];
  const fitL = (lang) => { for (const o of LV) { const t = build(lang, o); if (xlen(t) <= 280) return t; } return build(lang, LV[LV.length - 1]); };
  const en = fitL('en'), ja = fitL('ja');
  return { id: opt.id || 'liqday:' + isoDay(day), sr: 'liqday', due: end, ...(opt.langs ? { langs: opt.langs } : {}), en, ja, h: hashStr(en + ja),
    img: { v: 2, kind: 'day', start, end, coins, hours: hours || [], partial: !!part, mult: mult || null, ...(opt.px ? { px: opt.px } : {}) } };   // v278: px = BTC の価格 [[t, 終値]](新しい清算の画像)
}

// ---- v171: 清算 × 経済指標(/next.html と同じ定義。X の画像・本文もここに揃える) ----
//   平常日比(案B) = 1日(UTC)の合計 ÷ 直前14日の中央値(ロング・ショート別)。毎朝のまとめ(日本時間 9:00 = UTC 0:00)の「直近24時間」はちょうど前日(UTC)なので、そのまま同じ定義が使える。
//   発表基準の推移(案A) = 発表を含む1時間を 0 として ±6時間。各回は「直前14日の1時間あたり中央値」を 1× にそろえた倍率。
export const fxs = (v) => v == null || !isFinite(v) ? '—' : v >= 10 ? v.toFixed(0) : v.toFixed(1);
export const medOf = (a) => { const b = (a || []).filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
export const LIQ_BASE_DAYS = 14, LIQ_IMP_WIN = 6, LIQ_IMP_NW = 3;   // NW = 発表を含む1時間から数える本数(0, +1, +2 の3時間)
// daily = /api/liq?step=86400 の buckets [[t,long,short]]。day0 = UTC の日の始まり(ms)。足りない(7日未満)時は null
export function liqDayMult1(daily, day0) {
  const m = new Map((daily || []).map((b) => [b[0], b])), cur = m.get(day0); if (!cur) return null;
  const bl = [], bs = [];
  for (let i = 1; i <= LIQ_BASE_DAYS; i++) { const q = m.get(day0 - i * DAY); if (q) { bl.push(q[1]); bs.push(q[2]); } }
  if (bl.length < 7) return null;
  const ml = medOf(bl), ms = medOf(bs);
  return { cl: cur[1], cs: cur[2], ml, ms, l: ml > 0 ? cur[1] / ml : null, s: ms > 0 ? cur[2] / ms : null, n: bl.length };
}
// byCoin = {BTC: daily buckets, ETH: …}。全銘柄の合計 ÷ 各銘柄の「平常日」の合計(ロング・ショート別)
export function liqDayMult(byCoin, day0) {
  let cl = 0, cs = 0, ml = 0, ms = 0, n = 0; const coins = {};
  for (const c of Object.keys(byCoin || {})) {
    const r = liqDayMult1(byCoin[c], day0); if (!r) return null;   // 1つでも足りなければ出さない(合計の分母がずれるため)
    cl += r.cl; cs += r.cs; ml += r.ml; ms += r.ms; n = n ? Math.min(n, r.n) : r.n; coins[c] = { l: r.l, s: r.s };
  }
  if (!(ml > 0) || !(ms > 0)) return null;
  return { l: cl / ml, s: cs / ms, n, coins };
}
// 1時間足 → 発表を含む1時間を 0 とした ±win 時間の倍率。buckets = /api/liq?step=3600、since = 記録の始まり(ms)。足りなければ null
export const liqHourMap = (buckets) => new Map((buckets || []).map((b) => [b[0], b]));
export function liqAlign(hm_, since, ts, win = LIQ_IMP_WIN, now = Date.now()) {
  const tb = Math.floor(ts / H) * H;
  if (since && tb - LIQ_BASE_DAYS * DAY < since) return null;
  const bl = [], bs = [];
  for (let i = 1; i <= LIQ_BASE_DAYS * 24; i++) { const b = hm_.get(tb - i * H); bl.push(b ? b[1] : 0); bs.push(b ? b[2] : 0); }
  const base = (a) => { const m = medOf(a); if (m > 0) return m; const avg = a.reduce((x, y) => x + y, 0) / a.length; return avg > 0 ? avg : null; };
  const ml = base(bl), ms = base(bs); if (ml == null || ms == null) return null;
  const k = [], l = [], s = [];
  for (let j = -win; j <= win; j++) { const t = tb + j * H; k.push(j); if (t > now - H) { l.push(null); s.push(null); continue; } const b = hm_.get(t); l.push((b ? b[1] : 0) / ml); s.push((b ? b[2] : 0) / ms); }
  return { k, l, s };
}
// 発表を含む1時間から3本(0, +1, +2)の倍率の平均 = 発表後3時間の「平常の1時間の何倍で推移したか」
export const winMean = (arr, win = LIQ_IMP_WIN) => { const v = arr.slice(win, win + LIQ_IMP_NW); return v.length === LIQ_IMP_NW && v.every((x) => x != null) ? v.reduce((x, y) => x + y, 0) / LIQ_IMP_NW : null; };
// 投稿の時刻: 3本が終わってから、Coinalyze 4社の確定値(6時間ごとの取り直し)に置き換わるのを待つ
export const LIQ_IMP_WAIT = 7.5 * H;
export const liqImpId = (g) => 'liqimp:' + g[0].ts + ':' + (g[0].c || g[0].l);
export const liqImpWinEnd = (ts) => Math.floor(ts / H) * H + LIQ_IMP_NW * H;
export const liqImpDue = (ts) => liqImpWinEnd(ts) + LIQ_IMP_WAIT;
const r2 = (v) => v == null ? null : Math.round(v * 100) / 100;
const r2a = (a) => (a || []).map(r2);
// imp = {sym, win, cur:{k,l,s}, med:{l,s}, past:[{ts,l,s}], n, cw:{BTC:{l,s}}, mw:{l,s}}。BTC の線 + 4銘柄の発表後3時間の倍率
export function liqImpPost(g, imp) {
  const ts = g[0].ts, nE = groupLine(g, 'en'), nJ = groupLine(g, 'ja'), k = kindOf(g);
  const tg = tags(nE + ' ' + nJ), tagE = tg.en.split(' ').slice(0, 1).concat('#Liquidations').join(' '), tagJ = tg.ja.split(' ').slice(0, 1).concat('#清算').join(' ');
  const rows = (o) => COINS.filter(([c]) => imp.cw[c] && imp.cw[c].l != null).slice(0, o.coins || 4).map(([c, , sy]) => `${sy} ${c} 🔴×${fxs(imp.cw[c].l)} 🟢×${fxs(imp.cw[c].s)}`);
  const build = (lang) => (o) => {
    const en = lang === 'en', rule = '━'.repeat(o.rule);
    return [...(o.brand ? [BRAND[lang], ''] : []),
      en ? `🟢 LIQUIDATIONS × MACRO · ${dEnU(ts, false)} · ${uhm(ts)} UTC` : `🟢 清算 × 経済指標 · ${dJaL(ts)} · ${hm(ts)}発表`, rule,
      `🟡 ${icon2(g)} ${en ? nE.toUpperCase() : nJ}`, '',
      ...rows(o), rule,
      ...(imp.mw && imp.mw.l != null ? [en ? `${imp.sym} past ${imp.n} median: 🔴×${fxs(imp.mw.l)} 🟢×${fxs(imp.mw.s)}` : `${imp.sym} 過去${imp.n}回の中央値: 🔴×${fxs(imp.mw.l)} 🟢×${fxs(imp.mw.s)}`] : []),
      ...(o.note ? [en ? '3h from the release hour vs a normal hour (🔴 long · 🟢 short)' : '発表を含む3時間の、平常の1時間比(🔴ロング・🟢ショート)'] : []),
      ...(o.tag ? [en ? tagE : tagJ] : [])].join('\n');
  };
  const OPT = [{ brand: 1, rule: 18, note: 1, tag: 1 }, { brand: 1, rule: 10, note: 1, tag: 1 }, { rule: 10, note: 1, tag: 1 }, { rule: 10, note: 1 }, { rule: 10 }, { rule: 10, coins: 2 }];
  const en = fit280(build('en'), OPT), ja = fit280(build('ja'), OPT);
  const cw = {}; for (const [c] of COINS) if (imp.cw[c]) cw[c] = { l: r2(imp.cw[c].l), s: r2(imp.cw[c].s) };
  return { id: liqImpId(g), sr: 'liqimp', due: imp.due || liqImpDue(ts), en, ja, h: hashStr(en + ja),
    img: { v: 1, kind: 'imp', t: ts, en: nE, ja: nJ, icon: k.icon, sym: imp.sym, win: imp.win, n: imp.n,
      cur: { k: imp.cur.k, l: r2a(imp.cur.l), s: r2a(imp.cur.s) }, med: { l: r2a(imp.med.l), s: r2a(imp.med.s) },
      past: (imp.past || []).slice(-12).map((p) => ({ ts: p.ts, l: r2a(p.l), s: r2a(p.s) })), cw, mw: imp.mw ? { l: r2(imp.mw.l), s: r2(imp.mw.s) } : null } };
}

// ---- 自動投稿(v94) ----
// 自動で投稿する種類: 発表後の値動き・週間記録はいつも、毎朝の予定は AUTO_DAILY_FROM 以降(それまでは X で手で予約済み)
export const AUTO_DAILY_FROM = '2026-10-09';   // v104: 10/9 から自動(X の手の予約は消してもらう)
// v173: 言語ごとの投稿時刻。dues = {en, ja}(無ければ due)。langs = 出す言語(無ければ英日両方)
export const SPLIT_FROM = '2026-10-11';                       // この日(日本時間)の分から英日の時刻を分ける
export const EN_DAILY_AT = 11.5 * H, EN_WEEK_AT = 14 * H, EN_LIQDAY_AT = 13 * H;   // 英語: 毎朝の予定 11:30 UTC / 週間記録 土曜 14:00 UTC / 清算のまとめ 13:00 UTC
// v282: 英語版を出さない種類(英語でビュー・反応が無かったもの)。英語に残す = daily・fomc系・spike・liq・liqday・hack系・histm/histw・midterm など
export const EN_OFF = new Set(['week', 'sum', 'pat', 'vol', 'shockbn', 'shockcmp', 'corrts']);
export const langsOf = (p) => (p && Array.isArray(p.langs) && p.langs.length ? p.langs : ['en', 'ja']).filter((lg) => !(lg === 'en' && p && EN_OFF.has(p.sr)));
export const dueOf = (p, lg) => (p && p.dues && p.dues[lg]) || (p && p.due) || 0;
export const AUTO_WINDOW = 3 * H;   // 投稿時刻からこの時間を過ぎたものは自動で出さない(古い投稿を急に出さない)
export const SPIKE_WINDOW = 6 * H;  // v147: 急変動は見つけてから6時間まで
export const PRE_AHEAD = 15 * 60000, PRE_WINDOW = 14 * 60000;   // v183: 発表前の予告 = 発表の15分前に予定。本文は「何時に発表」なので遅れても出せる。発表1分前まで(発表後には出さない)
export const preId = (g) => 'pre:' + g[0].ts + ':' + (g[0].c || g[0].l);
export const winOf = (p) => (p && (p.sr === 'pre' || String(p.id || '').startsWith('pre:'))) ? PRE_WINDOW : (p && (p.sr === 'spike' || p.sr === 'liq' || String(p.id || '').startsWith('spike:'))) ? SPIKE_WINDOW : AUTO_WINDOW;   // v152: 巨額清算の総括も6時間まで
// v101: man = /posts.html の「過去の発表から作る」で手で作った下書き(自動投稿しない)
export const fomcOld = (p) => (p.sr === 'pre' || p.sr === 'arch') && /^(pre|arch):\d+:US$/.test(String(p.id)) && ((p.img && /FOMC|Powell|議長/.test((p.img.ja || '') + ' ' + (p.img.en || ''))) || /FOMC|Powell|議長/.test((p.ja || '') + (p.en || '')));   // v211: FOMC の古い形の予告・値動き
// v280: pre(発表前の予告)と arch(発表後の値動き)は自動投稿をやめた(ビューが少ないため。下書きは他の機能の材料として作り続ける。FOMC などの予告は fomc で別)
// v298: 夜のまとめ(sum)・値動きの大きさ(vol)・BTC実況(pat)・ハッキング追跡(hack・bnstatus・bnreply)の自動投稿をやめた(ビューがほぼ無いため。下書きは作り続ける)
export const isAuto = (p) => !p.man && !fomcOld(p) && !((p.sr === 'fomc' || p.sr === 'fomcc') && p.img && FOMC_OFF.has(p.img.n)) && (p.sr === 'liqshock' || p.sr === 'histw' || p.sr === 'histm' || p.sr === 'midterm' || p.sr === 'corrts' || p.sr === 'shockbn' || p.sr === 'shockcmp' || p.sr === 'spkcmp' || p.sr === 'fomc' || p.sr === 'fomcc' || p.sr === 'fomcres' || p.sr === 'week' || p.sr === 'spike' || p.sr === 'spikeliq' || p.sr === 'liq' || p.sr === 'liqday' || p.sr === 'liqimp' || (p.sr === 'daily' && isoDay(p.due || 0) >= AUTO_DAILY_FROM));
// Worker が見張る「自動投稿の予定」(小さく保つ): 未投稿の自動投稿 + これからの主要指標の発表65分後
export function dueList(posts, events, now) {
  const items = [], seen = new Set();
  for (const p of posts || []) { seen.add(p.id); if (!isAuto(p) || !p.due) continue; for (const lg of langsOf(p)) { const d = dueOf(p, lg); if (!(p.done && p.done[lg]) && d > now - winOf(p) && d < now + 8 * DAY) items.push({ id: p.id, due: d }); } }   // v173: 言語ごと
  for (const g of autoGroups(events)) { const id = archId(g), due = g[0].ts + ARCH_WAIT; if (!seen.has(id) && due > now - AUTO_WINDOW && due < now + 8 * DAY) items.push({ id, due }); }
  for (const g of groups((events || []).filter(MAJOR))) { const id = liqImpId(g), due = liqImpDue(g[0].ts); if (!seen.has(id) && due > now - AUTO_WINDOW && due < now + 8 * DAY) items.push({ id, due }); }   // v171: 清算の反応(下書きは x_notify が、データが揃ってから作る)
  for (const k of [0, 1]) { for (const [id, due] of sumDues(now + k * DAY)) if (!seen.has(id) && due > now - AUTO_WINDOW && due < now + 2 * DAY) items.push({ id, due }); }   // v202: 夜のまとめ
  for (const { g, k } of bigGroups(events)) for (let n = 1; n <= FOMC_SLOTS.length; n++) { const id = fomcId(g[0].ts, n, k), due = g[0].ts - FOMC_SLOTS[n - 1]; if (!seen.has(id) && due > now - AUTO_WINDOW && due < now + 8 * DAY) items.push({ id, due }); }   // v208: FOMC の臨時予告
  for (const { g, k } of bigGroups(events)) { const id = fomcId(g[0].ts, 'res', k), due = g[0].ts + FOMC_RES; if (!seen.has(id) && due > now - AUTO_WINDOW && due < now + 8 * DAY) items.push({ id, due }); }
  for (const g of autoGroups(events)) { const id = preId(g), due = g[0].ts - PRE_AHEAD; if (!seen.has(id) && due > now - PRE_WINDOW && due < now + 8 * DAY) items.push({ id, due }); }   // v181: 発表前の予告
  return { at: now, items: items.sort((a, b) => a.due - b.due) };
}

// ---- v174: 返信用の短い文(大きいアカウントの投稿への返信に使う。手で投稿する。数字だけ・意見なし) ----
export function replyText(p, lg) {
  if (!p || !p.img) return '';
  const en = lg === 'en', im = p.img, C4 = ['BTC', 'ETH', 'SOL', 'BNB'];
  const sg = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
  if (p.sr === 'liqday' || p.sr === 'liq') {
    const t = liqTot(im.coins); let pk = null;
    for (const h of im.hours || im.ser || []) if (!pk || h[1] + h[2] > pk[1] + pk[2]) pk = h;
    const head = p.sr === 'liqday' ? (en ? 'Liquidations, last 24h (BTC/ETH/SOL/BNB)' : '直近24時間の清算額（BTC・ETH・SOL・BNB）') : (en ? `Liquidations ${uhm(im.start)}–${uhm(im.end)} UTC (BTC/ETH/SOL/BNB)` : `清算額 ${hm(im.start)}〜${hm(im.end)}（BTC・ETH・SOL・BNB）`);
    const mo = im.maxOne;
    return [head, '', en ? `Long ${usdS(t.l)} / Short ${usdS(t.s)}${t.share != null ? ` (${t.share}% long)` : ''}` : `ロング ${usdS(t.l)} ／ ショート ${usdS(t.s)}${t.share != null ? `（ロング${t.share}%）` : ''}`,
      ...(pk && p.sr === 'liqday' ? [en ? `Peak hour ${uhm(pk[0])} UTC (${usdS(pk[1] + pk[2])})` : `ピークは ${hm(pk[0])}台（${usdS(pk[1] + pk[2])}）`] : []),
      ...(mo && mo.usd ? [en ? `Largest single: ${mo.coin} ${mo.side === 'long' ? 'long' : 'short'} ${usdS(mo.usd)}` : `最大の1件: ${mo.coin} ${mo.side === 'long' ? 'ロング' : 'ショート'} ${usdS(mo.usd)}`] : []),
      '', en ? 'Just the record.' : '記録だけ置いておきます。'].join('\n');
  }
  if (p.sr === 'spike') {
    const W = im.win || 1, r = (c) => im.corr && im.corr[30] && im.corr[30][c] ? im.corr[30][c].r : null, rb = r('BTC');
    return [en ? `Same ${W}h, side by side:` : `同じ${W}時間の比較です。`, '',
      ...C4.filter((c) => im.coins && im.coins[c] != null).map((c) => `${c} ${sg(im.coins[c])}`),
      `S&P500 ${sg(im.spx)}${im.open ? '' : en ? ' (US market closed)' : '（米国市場の時間外）'}`,
      ...(rb != null ? [en ? `BTC–S&P500 30D corr: ${rTxt(rb)} (${corrLabel(rb, 'en')})` : `BTC と S&P500 の30日相関: ${rTxt(rb)}（${corrLabel(rb, 'ja')}）`] : []),
      '', en ? 'Facts only.' : '事実だけ。'].join('\n');
  }
  if (p.sr === 'arch' && im.coins) {
    const nm = en ? im.en : im.ja;
    return [en ? `${nm} — 1h after release (${uDay(im.t)} ${uhm(im.t)} UTC):` : `${nm} 発表から1時間（${jaDay(im.t)} ${hm(im.t)}）`, '',
      ...C4.filter((c) => im.coins[c]).map((c) => `${c} ${sg(im.coins[c].c60)}`),
      '', en ? 'Just the record.' : '記録だけ置いておきます。'].join('\n');
  }
  if (p.sr === 'week' && im.coins) {
    const top = (im.ev || []).slice(0, 3).map((e) => `${en ? e.sen || e.en : e.sja || e.ja} ${e.btc == null ? '—' : sg(e.btc)}`);
    return [en ? 'This week (BTC change / BTC 1h after each release):' : '今週の記録（BTC の週の変化／指標ごとの発表1時間後）', '',
      ...C4.filter((c) => im.coins[c]).map((c) => `${c} ${sg(im.coins[c].chg)}`), ...(top.length ? ['', ...top] : []), '', en ? 'Just the record.' : '記録だけ置いておきます。'].join('\n');
  }
  return '';
}

// ---- v181: 発表前の予告(v182: 発表の15分前。主要指標だけ) ----
// g = 発表のまとまり / prev = {chg(BTC +1h %), t(前回の発表時刻)} | null / corr = corr:v1 | null
// v184: 文章で読ませる形(見出し → 前回の事実 → 数字1つ → 次の予告)。市場予想・相関は本文に入れない
const REG_JA = { US: '米', JP: '日本', EU: 'ユーロ圏' }, FLAG = { US: '🇺🇸', JP: '🇯🇵', EU: '🇪🇺' };
export function headName(g, lang) {   // 見出しの短い名前: US CPI / 米CPI / FOMC / 日銀
  if (g.some((e) => e.s === '短観')) return lang === 'en' ? 'BOJ Tankan' : '日銀短観';
  const k = kindOf(g), c = g[0].c, cb = /FOMC|BOJ|ECB/.test(k.short[0] || '');
  if (lang === 'en') return k.short[0] ? (cb ? k.short[0] : `${REGION_EN[c] || ''} ${k.short[0]}`.trim()) : groupLine(g, 'en');
  return k.short[1] ? (cb || /^日銀|ECB|FOMC/.test(k.short[1]) ? k.short[1] : (REG_JA[c] || '') + k.short[1]) : groupLine(g, 'ja');
}
const flagOf = (g) => FLAG[g[0].c] || '📅';
const big = (v) => `${v > 0 ? '🟢' : v < 0 ? '🔴' : '⚪'} ${sgn(v)}`;
const whenJa = (ts, now) => { const d = isoDay(ts) === isoDay(now) ? (J(ts).getUTCHours() >= 17 ? '今夜' : '今日') : isoDay(ts) === isoDay(now + DAY) ? '明日' : jaDay(ts); return d; };
export function prePost(g, prev, corr, prevImg, now = g[0].ts - PRE_AHEAD) {
  const ts = g[0].ts, fx = g.filter((e) => e.fc || e.pv).slice(0, 2);
  const rb = corr && corr.w && corr.w[30] && corr.w[30].BTC ? corr.w[30].BTC.r : null;
  const en = [`${flagOf(g)} ${headName(g, 'en')} · ${uhm(ts)} UTC`, '',
    ...(prev ? ['Last time, BTC moved this much', 'in the first hour after the release:', '', big(prev.chg), ''] : []),
    `This time? We'll post the numbers 1 hour after. ⏳`].join('\n');
  const ja = [`${flagOf(g)} ${headName(g, 'ja')} · ${whenJa(ts, now)}${hm(ts)}発表`, '',
    ...(prev ? ['前回の発表から1時間、', 'BTCはこう動きました。', '', big(prev.chg), ''] : []),
    '今回はどうなるか。1時間後に記録を出します。⏳'].join('\n');
  const img = prevImg ? { ...prevImg, pre: { t: ts, fx: fx.map((e) => ({ en: e.se || enName(e), ja: e.t || jaName(e), fc: e.fc || null, pv: e.pv || null })), corr: rb } } : null;   // 市場予想・相関は画像用に添える
  return { id: preId(g), sr: 'pre', due: ts - PRE_AHEAD, en, ja, h: hashStr(en + ja + (prevImg ? prevImg.t : '')), img };
}

// ---- v192: BTC ボラティリティ・モニター(トップページのカードと X 投稿で共通) ----
// B = BTC 1時間足 [[開始ms, 始, 高, 安, 終], …](閉じた足だけ使う)。typ = 過去30日の k時間の対数リターンの二乗平均平方根(%)= 「普段の幅」(事実)。
// ratio = 直近24時間の1時間リターンの二乗平均平方根 ÷ 過去30日の同じ値。
export const VOL_DAYS = 30, VOL_HZ = [1, 6, 24], VOL_ALERT = 2;
const rms = (a) => a.length ? Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length) : null;
export function volStats(B, now) {
  const b = (B || []).filter((x) => x[0] + H <= now && x[4] > 0).sort((x, y) => x[0] - y[0]);
  if (b.length < 24 * 7) return null;
  const end = b[b.length - 1][0] + H, from = end - VOL_DAYS * DAY, m = new Map(b.map((x) => [x[0], x[4]]));
  const typ = {};
  for (const k of VOL_HZ) { const r = []; for (const x of b) if (x[0] >= from) { const s0 = m.get(x[0] - k * H); if (s0) r.push(100 * Math.log(x[4] / s0)); } typ[k] = rms(r); }
  const r1 = []; for (const x of b) if (x[0] >= end - DAY) { const s0 = m.get(x[0] - H); if (s0) r1.push(100 * Math.log(x[4] / s0)); }
  const now1 = rms(r1), last = b.filter((x) => x[0] >= end - DAY);
  const hi = Math.max(...last.map((x) => x[2])), lo = Math.min(...last.map((x) => x[3]));
  return { at: now, end, typ, now1, ratio: typ[1] > 0 && now1 != null ? Math.round(now1 / typ[1] * 10) / 10 : null,
    range24: { hi, lo, pct: lo > 0 ? Math.round((hi / lo - 1) * 1e4) / 100 : null }, px: b.filter((x) => x[0] >= end - 2 * DAY).map((x) => [x[0], x[4]]) };
}
export function volPost(v, link) {
  const r = v.ratio, f = (x) => '±' + x.toFixed(2) + '%', id = 'vol:' + new Date(v.end).toISOString().slice(0, 13);
  const en = [`📊 BTC volatility is ${r}x normal right now.`, ...(v.vm != null ? [`(${v.vm}x this morning)`] : []), '', `Last 24h, avg 1h move: ${f(v.now1)}`, `30-day normal: ${f(v.typ[1])}`, '', `24h range: ${v.range24.pct}% (${usd(v.range24.lo)}–${usd(v.range24.hi)})`].join('\n');
  const ja = [`📊 BTCの値動きが普段の${r}倍に`, ...(v.vm != null ? [`（朝は普段の${v.vm}倍）`] : []), '', `直近24時間の1時間ごとの変動: ${f(v.now1)}`, `過去30日の平均: ${f(v.typ[1])}`, '', `24時間の値幅: ${v.range24.pct}%（${usd(v.range24.lo)}〜${usd(v.range24.hi)}）`].join('\n');
  return { id, sr: 'vol', due: v.at, en, ja, h: hashStr(en + ja), img: { v: 1, ratio: r, now1: v.now1, typ: v.typ, px: v.px, end: v.end, range24: v.range24 } };
}

// ---- v196: 似ている過去の値動き(tools/pattern.mjs の結果)。parent = 急変動の親(返信で出す時) ----
const EVN = { CPI: ['CPI', 'CPI'], 雇用統計: ['NFP', '雇用統計'], PCE: ['PCE', 'PCE'], FOMC: ['FOMC', 'FOMC'], 日銀: ['BOJ', '日銀'], ECB: ['ECB', 'ECB'], 短観: ['Tankan', '日銀短観'], ADP: ['ADP', 'ADP雇用'], GDP: ['GDP', 'GDP'], PPI: ['PPI', 'PPI'] };
export function evName(e, lang) {
  const k = Object.keys(EVN).find((x) => (e.s || '').includes(x)), cb = /FOMC|日銀|ECB|短観/.test(e.s || '');
  if (lang === 'en') return k ? (cb ? EVN[k][0] : `${REGION_EN[e.c] || ''} ${EVN[k][0]}`.trim()) : `${REGION_EN[e.c] || ''} data release`.trim();
  return k ? (cb ? EVN[k][1] : (({ US: '米', JP: '日本', EU: 'ユーロ圏' })[e.c] || '') + EVN[k][1]) : (({ US: '米', JP: '日本', EU: 'ユーロ圏' })[e.c] || '') + (e.s || '指標');
}
export function patPost(r, parent) {
  const m = r.top[0], q = r.q, up = q.chg > 0, h = r.win, sg = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
  const evs = (lang) => m.ev && m.ev.length ? [...new Set(m.ev.map((e) => evName(e, lang)))].slice(0, 2).join(lang === 'en' ? ', ' : '・') + (lang === 'en' ? ' release' : 'の発表') : (lang === 'en' ? 'no scheduled release' : '指標の発表なし');
  const jd = (t) => { const d = J(t); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${hm(t)}`; };
  const ed = (t) => { const d = new Date(t); return `${ME3U[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${uhm(t)} UTC`; };
  const en = [...(parent ? [] : [`${up ? '📈' : '📉'} BTC ${sg(q.chg)} in ${h}h (${usd(q.p0)}→${usd(q.p1)})`, '']),
    `The closest match to this ${up ? 'move' : 'drop'} since 2017 (5m data):`, ed(m.t0), '',
    `Same window back then: ${evs('en')}`, `24h after: ${sg(m.after24)}`,
    ...(r.after && r.n > 1 ? ['', `All ${r.n} similar cases, 24h after: ${sg(r.after.min)} to ${sg(r.after.max)}`] : [])].join('\n');
  const ja = [...(parent ? [] : [`${up ? '📈' : '📉'} BTC ${h}時間で ${sg(q.chg)}（${usd(q.p0)}→${usd(q.p1)}）`, '']),
    `この${up ? '値動き' : '下げ方'}に一番似ているのは（2017年以降の5分足）`, jd(m.t0), '',
    `その時の同じ時間帯: ${evs('ja')}`, `その後24時間: ${sg(m.after24)}`,
    ...(r.after && r.n > 1 ? ['', `似た過去${r.n}件のその後24時間: ${sg(r.after.min)}〜${sg(r.after.max)}`] : [])].join('\n');
  return { id: (parent ? parent + ':pat' : 'pat:' + q.t1), sr: 'pat', ...(parent ? { parent } : {}), due: parent ? undefined : r.at, en, ja, h: hashStr(en + ja),
    img: { v: 1, win: h, q, top: r.top.map((x) => ({ t0: x.t0, chg: x.chg, d: x.d, path: x.path, after24: x.after24 })) } };
}
const ME3U = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---- v202: 似ている過去の結果を画像用に小さくする(道のりを間引く。今と過去で同じ間隔) ----
export function patImg(r, max = 120) {
  const N = r.q.path.length - 1, st = Math.max(1, Math.ceil(N / max)), pick = (a) => a.filter((_, i) => i % st === 0 || i === a.length - 1);
  const q = { ...r.q, path: r.q.path.filter((_, i) => i % st === 0 && i <= N).concat(N % st ? [r.q.path[N]] : []) };
  return { v: 1, win: r.win, q, top: r.top.slice(0, 3).map((x) => ({ t0: x.t0, chg: x.chg, d: x.d, after24: x.after24, path: x.path.filter((_, i) => i % st === 0) })) };
}
export const patDateJa = (t) => { const d = J(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hm(t)}`; };
export const patDateEn = (t) => { const d = new Date(t); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };

// ---- v202: 夜のまとめ(日誌スレッドの最後)。lang ごとに別の下書き(日本語 = 日本時間の今日 0:00〜22:00 / 英語 = UTC の今日 0:00〜23:30) ----
// c = {lang, day(区切りの始まり), p0, p1, hi, lo, vm(朝の倍率), vn(今の倍率), ev:[{t, name, c60}], spikes, pat:{t0}|null, vol(画像用), marks}
export function sumPost(c, id, due) {
  const en = c.lang === 'en', sg = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%', ch = c.p0 > 0 ? pct(c.p0, c.p1) : null;
  const build = (o) => [en ? `🌙 BTC TODAY · ${dEnU(c.day)} · UTC` : `🌙 今日のBTC · ${dJaL(c.day)}`, '',
    `${usd(c.p0)} → ${usd(c.p1)} (${sg(ch)})`, en ? `High ${usd(c.hi)} · Low ${usd(c.lo)}` : `高値 ${usd(c.hi)} · 安値 ${usd(c.lo)}`,
    ...(c.vn != null ? ['', en ? `📊 Volatility: ${c.vm != null ? `${c.vm}x this morning → ` : ''}${c.vn}x normal now` : `📊 値動き: ${c.vm != null ? `朝 普段の${c.vm}倍 → ` : ''}今 普段の${c.vn}倍`] : []),
    ...c.ev.slice(0, o.ev).map((e) => `${e.flag || '📅'} ${e.name} ${en ? uhm(e.t) : hm(e.t)} → ${en ? '1h ' : '1時間で '}${sg(e.c60)}`),
    ...(c.ev.length > o.ev ? [en ? `+${c.ev.length - o.ev} more releases` : `ほか${c.ev.length - o.ev}件の指標`] : []),
    ...(c.spikes ? [en ? `⚡ Sharp moves: ${c.spikes}` : `⚡ 急変動 ${c.spikes}回`] : []),
    ...(c.pat && o.pat ? [en ? `🔁 Last 24h most resembles ${patDateEn(c.pat.t0)}` : `🔁 今の24時間に一番似ているのは ${patDateJa(c.pat.t0)}`] : [])].join('\n');
  let text = null; for (let n = c.ev.length; n >= 0 && !text; n--) for (const pat of [1, 0]) { const t = build({ ev: n, pat }); if (xlen(t) <= 260) { text = t; break; } }
  text = text || build({ ev: 0, pat: 0 });
  return { id, sr: 'sum', due, langs: [c.lang], dues: { [c.lang]: due }, en: en ? text : '', ja: en ? '' : text, h: hashStr(text), img: c.vol ? { vol: c.vol, marks: c.marks || [] } : null };
}

// v202: 夜のまとめの id と投稿時刻(日本語 22:00 JST / 英語 23:30 UTC)
export const SUM_JA = 22 * H, SUM_EN = 23.5 * H;
export function sumDues(t) { const dj = dayStart(t), du = Math.floor(t / DAY) * DAY; return [['sum:ja:' + isoDay(dj), dj + SUM_JA], ['sum:en:' + new Date(du).toISOString().slice(0, 10), du + SUM_EN]]; }


// ---- v208: FOMC の臨時予告(親子ポスト。日誌スレッドには入れない)。中身 = 事実の数字だけ ----
//   発表の 14時間半前・9時間前・4時間前・1時間前に、親(一番似ていた過去のFOMC 1回)+ 子(返信。TOP3 の比較)。
//   発表の65分後に、1時間前の子への返信で結果(今回の発表後1時間と TOP3 を並べる)。
//   下書きは x_notify が中身なしで作り、本文と画像は x_post が投稿する時に計算して入れる(fomcText)。
export const FOMC_OFF = new Set([1, 2, 3]);   // v281→v283: 14時間半前(1)・9時間前(2)・4時間前(3)はやめた。1時間前・結果だけ残す
export const FOMC_SLOTS = [14.5 * H, 9 * H, 4 * H, 1 * H], FOMC_RES = 65 * 60000;
export const isFomc = (e) => e.l === 'macro' && e.c === 'US' && e.s === 'FOMC';
export const fomcId = (ts, n, k = 'fomc') => k + ':' + ts + ':' + n;   // v215: k = fomc / cpi / nfp / pce
export const BIG_NAME = { fomc: { ja: 'FOMC', en: 'FOMC', tag: { ja: '#FOMC #BTC', en: '#FOMC #BTC' } }, cpi: { ja: '米CPI', en: 'US CPI', tag: { ja: '#CPI #BTC', en: '#CPI #BTC' } }, nfp: { ja: '米雇用統計', en: 'US jobs report', tag: { ja: '#雇用統計 #BTC', en: '#NFP #BTC' } }, pce: { ja: '米PCE', en: 'US PCE', tag: { ja: '#PCE #BTC', en: '#PCE #BTC' } } };
export function fomcDrafts(ts, k = 'fomc') {
  const out = [], ph = { ja: '（投稿する時に、その時点の計算で本文と画像を作ります）', en: '(Text and image are made at posting time.)' };
  FOMC_SLOTS.forEach((sl, i) => { const n = i + 1, id = fomcId(ts, n, k), due = ts - sl, img = { t: ts, n, k }; if (FOMC_OFF.has(n)) return;   // v281
    out.push({ id, sr: 'fomc', due, ...ph, h: 'fomc' + n, img });
    out.push({ id: id + ':c', sr: 'fomcc', parent: id, due, ...ph, h: 'fomcc' + n, img }); });
  // v214: 結果は単独の新しい投稿(返信だと分かりづらいため)。チャートで今回の発表後の動きを見せる
  out.push({ id: fomcId(ts, 'res', k), sr: 'fomcres', due: ts + FOMC_RES, ...ph, h: 'fomcres', img: { t: ts, n: 'res', k } });
  return out;
}
// lv = weekmatch の fomcMatch の結果。kind = 'fomc'(親)/ 'fomcc'(子)/ 'fomcres'(結果)
export function fomcText(kind, lv, lg, now) {
  const B = BIG_NAME[lv.k || 'fomc'] || BIG_NAME.fomc, NM = B[lg === 'en' ? 'en' : 'ja'], TG = B.tag[lg === 'en' ? 'en' : 'ja'];
  const en = lg === 'en', sg = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
  const dt = (t) => { const d = new Date(t - 4 * H); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };   // 日付は米国の発表日(米東部時間)
  const left = Math.max(0, lv.E - now), hh = Math.round(left / H * 2) / 2, leftJa = hh >= 1 ? (Number.isInteger(hh) ? `${hh}時間` : `${Math.floor(hh)}時間半`) : `${Math.max(1, Math.round(left / 60000))}分`;
  const leftEn = hh >= 1 ? `${hh}h` : `${Math.max(1, Math.round(left / 60000))} min`, t = lv.top, m = ['①', '②', '③'];
  if (kind === 'fomc') return en
    ? [`${NM} in ${leftEn}.`, `Closest past run-up: ${NM} on ${dt(t[0].fomc)}.`, `BTC 1h after that release: ${sg(t[0].a1)}`, 'Cyan = now, dotted = what came next.', 'Did the other 2 move the same way?', 'Top 3 in the reply ↓', '*Match = shape, not probability', TG].join('\n')
    : [`${NM}まで、あと${leftJa}。`, `発表前の値動きが今回に最も似ていたのは${dt(t[0].fomc)}の${NM}。`, `その回のBTCは発表後1時間で${sg(t[0].a1)}。`, '水色が今回、点線が過去のその後。', 'ほかの2回は同じ方向だったのか？', 'TOP3の比較は返信へ↓', '※一致率は上昇確率ではありません', TG].join('\n');
  if (kind === 'fomcc') return en
    ? [`BTC 1h after the 3 closest past ${NM} releases`, ...t.map((x, i) => `${m[i]} ${dt(x.fomc)}: ${sg(x.a1)}`), 'Compared: 24h before release to the same time left. Post-release moves not used.', 'Similar shape ≠ same outcome.', "Result: a new post 1h after the release."].join('\n')
    : ['似ていた過去3回の、発表後1時間のBTC', ...t.map((x, i) => `${m[i]}${dt(x.fomc)}：${sg(x.a1)}`), '比較は「発表24時間前〜今と同じ残り時間」まで。発表後の動きは選定に使っていません。', '似た形でも、その後が同じとは限りません。', '結果は発表1時間後に新しい投稿で出します。'].join('\n');
  const same = lv.a1 == null ? null : t.filter((x) => x.a1 != null && Math.sign(x.a1) === Math.sign(lv.a1)).length;
  return en
    ? [`${lv.k === 'fomc' || !lv.k ? '🏦' : '🇺🇸'} ${NM} result: BTC ${sg(lv.a1)} in the first hour`, '', `The 3 past ${NM} releases whose run-up looked most like this one:`, ...t.map((x, i) => `${m[i]} ${dt(x.fomc)}: ${sg(x.a1)}`), ...(same != null ? [`Same direction: ${same} of 3`] : []), 'Cyan = this time, dotted = what came next back then.', TG].join('\n')
    : [`${lv.k === 'fomc' || !lv.k ? '🏦' : '🇺🇸'} ${NM} 発表後1時間、BTCは${sg(lv.a1)}`, '', '発表前の動きが似ていた過去3回は', ...t.map((x, i) => `${m[i]}${dt(x.fomc)}：${sg(x.a1)}`), ...(same != null ? [`今回と同じ方向だったのは3回中${same}回`] : []), '水色が今回、点線が過去のその後。', TG].join('\n');
}


// ---- v217: 急変動の「過去の急変動との比較」(急変動とは別の単独の投稿。急変動の20分後)。本文と画像は x_post が投稿時に作る ----
export const spkcmpDraft = (sp, now) => ({ id: 'spkcmp:' + sp.id, sr: 'spkcmp', due: Math.max((sp.due || now) + 20 * 60000, now - 60000), ja: '（投稿する時に、その時点の計算で本文と画像を作ります）', en: '(Text and image are made at posting time.)', h: 'spkcmp', img: { ...(sp.img || {}) } });
export const durTxt = (ms, lg) => { if (ms == null) return null; const m = ms / 60000; return lg === 'en' ? (m < 60 ? `${Math.round(m)} min` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)} days`) : (m < 60 ? `${Math.round(m)}分` : m < 48 * 60 ? `${Math.round(m / 60)}時間` : `${Math.round(m / 1440)}日`); };
export function spkText(lv, lg) {   // v220: 「戻ったのか？」に過去の記録で答える(予測ではない)
  const en = lg === 'en', sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%', dn = lv.dir < 0, st = lv.stats || {}, th = Math.round(lv.th * 10) / 10;
  const dt = (t) => { const d = new Date(t + (en ? 0 : 9 * H)); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }, t0 = lv.top[0];
  const r0 = t0 ? (t0.rec != null ? (en ? `back in ${durTxt(t0.rec, lg)}` : `${durTxt(t0.rec, lg)}で回復`) : (en ? 'not back within 30 days' : '30日以内に戻らず')) : null;
  const mk = (cl) => (en
    ? [`⚡ BTC ${sg(lv.mv)} in the last ${lv.hrs}h. Does it come back?`, `Since 2017, ${st.n} similar ${dn ? 'drops' : 'jumps'} (${dn ? '−' : '+'}${th}%+ in ${lv.hrs}h).`, `Back to the pre-${dn ? 'drop' : 'jump'} price:`, `· within 3h: ${st.r3}%`, `· within 24h: ${st.r24}%`, `· within 7 days: ${st.r7}%`, ...(st.med != null ? [`Median time: ${durTxt(st.med, lg)}`] : []), ...(t0 && cl ? [`Closest (${dt(t0.day)}): ${r0}`] : []), '*Past record, not a forecast', '#Bitcoin #BTC'].join('\n')
    : [`⚡ BTC 直近${lv.hrs}時間で${sg(lv.mv)}。戻るのか？`, `2017年以降の似た${dn ? '急落' : '急騰'}${st.n}回（${lv.hrs}時間で${dn ? '−' : '+'}${th}%以上）`, `${dn ? '下げる' : '上げる'}前の価格に戻ったのは`, `・3時間以内：${st.r3}%`, `・24時間以内：${st.r24}%`, `・7日以内：${st.r7}%`, ...(st.med != null ? [`戻るまで（中央値）：${durTxt(st.med, lg)}`] : []), ...(t0 && cl ? [`一番似た回（${dt(t0.day)}）は${r0}`] : []), '※過去の記録。予測ではありません', '#ビットコイン #BTC'].join('\n'));
  const t1 = mk(1); return xlen(t1) <= 280 ? t1 : mk(0);
}


// ---- v221: 大型ハッキングの後のBTC(過去の大型ハッキングと発生の時刻でそろえて重ねる)。本文と画像は x_post が投稿時に作る ----
export function hackText(hv, lg) {
  const en = lg === 'en', sg = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%', ev = hv.ev;
  const ym = (t) => { const d = new Date(t + (en ? 0 : 9 * H)); return `${String(d.getUTCFullYear()).slice(2)}/${d.getUTCMonth() + 1}`; };
  const hrs = Math.round((hv.end - ev.t) / H * 10) / 10;
  const mk = (n) => (en
    ? [`⚡ Big outflow from ${ev.en} (suspected hack, unconfirmed)`, 'BTC 24h after past exchange hacks:', ...hv.past.slice(-n).map((h) => `${h.en} ${ym(h.t)}: ${sg(h.a24)}`), `Now (${hrs}h in): ${sg(hv.nowChg)}`, '*Past record, not a forecast', '#Bitcoin #Binance']
    : [`⚡ ${ev.ja}から大量流出（ハッキングの疑い・未確認）`, '過去の大型ハッキング、発生から24時間のBTC', ...hv.past.slice(-n).map((h) => `${h.ja} ${ym(h.t)}：${sg(h.a24)}`), `今回（${hrs}時間後）：${sg(hv.nowChg)}`, '※過去の記録。予測ではありません', '#ビットコイン #Binance']).join('\n');
  for (let n = hv.past.length; n >= 1; n--) { const t = mk(n); if (xlen(t) <= 280) return t; }
  return mk(1);
}
export const hackDraft = (ev, now) => ({ id: 'hack:' + ev.id, sr: 'hack', due: now - 60000, ja: '（投稿する時に、その時点の計算で本文と画像を作ります）', en: '(Text and image are made at posting time.)', h: 'hack', img: { hack: ev.id } });


// ---- v223: 資金の追跡(オンチェーン)。自動投稿しない(man: 1)。/posts.html から手で投稿する ----
// im = {case, ja, en, confirmed, t0, t1, hours, totals:{sends, swaps, newAddr, toContract}, firstSwap:{h, in, out}|null, hourly:[{h, newAddr, sends, swaps, toContract}], leaves:{held, contract, depthLimit, untracked}, root}
export function chainText(im, lg) {
  const en = lg === 'en', T = im.totals || {}, fs = im.firstSwap, hrs = Math.round((im.t1 - im.t0) / H);
  const name = en ? (im.confirmed ? `${im.en} hack` : `Large outflow from ${im.en} (suspected hack, unconfirmed)`) : (im.confirmed ? `${im.ja}のハッキング` : `${im.ja}からの大量流出（ハッキングの疑い・未確認）`);
  const sw = fs ? (en ? `First swap: +${fs.h}h, ${fs.in} → ${fs.out}` : `最初の交換：${fs.h}時間後（${fs.in} → ${fs.out}）`) : (en ? 'No swap seen yet' : '交換はまだ確認できず');
  return en
    ? [`🔗 Where did the funds go? ${name}`, `First ${hrs}h on-chain (tracked from the first recipient):`, `· Sends: ${T.sends} · New recipients: ${T.newAddr}`, `· Swaps: ${T.swaps} · Into contracts (DEX/bridge etc.): ${T.toContract}`, `· ${sw}`, 'Exchange deposits ≠ proof of sale.', '#Bitcoin #Ethereum'].join('\n')
    : [`🔗 資金は、どこへ？ ${name}`, `発生から${hrs}時間のオンチェーン（最初の受取先から追跡）`, `・送金 ${T.sends}件／新しい送金先 ${T.newAddr}`, `・交換 ${T.swaps}件／コントラクトへ ${T.toContract}件（DEX・ブリッジなど）`, `・${sw}`, '※取引所への入金は売却の証拠ではありません', '#ビットコイン #イーサリアム'].join('\n');
}
export function chainDraft(im, now) {
  const id = 'chain:' + im.case + ':' + Math.floor(im.t1 / H);
  const ja = chainText(im, 'ja'), en = chainText(im, 'en');
  return { id, sr: 'chain', man: 1, due: now, ja, en, h: hashStr(ja + en), img: im };
}


// ---- v226: 過去最大の流出(Bybit) vs 今回(Binance)、発生から12時間の比較。自動投稿しない(man: 1)。/posts.html から手で投稿する ----
// 数字は chain-ledger の台帳(Bybit は v224 の実行・Binance は v225 の実行)から。新しい台帳が出たら、ここを書き換えて id の末尾を上げる
export const CHAINCMP = {
  id: 'chaincmp:binance2026:v3', hours: 12,
  past: { ja: 'Bybit', en: 'Bybit', yja: '2025｜確定', yen: '2025 · confirmed', bars: [62, 113, 47, 15, 10, 9, 5, 5, 3, 0, 1, 1],
    ev: [[0, 1, 'stETH・mETH→ETHに交換', 'stETH, mETH → ETH'], [1, 3, '1万ETHずつ約40アドレスへ分散', '10k ETH each to ~40 addresses']] },
  cur: { ja: 'Binance', en: 'Binance', yja: '2026｜未確認', yen: '2026 · unconfirmed', bars: [20, 3, 4, 3, 1, 0, 1, 0], end: 7.8,
    ev: [[0, 1, 'USDT 7億・ETH 19.7万を移動', 'Moved 700M USDT + 197k ETH'], [1, 2, 'ETH 12.2万を別アドレスへ', '122k ETH to new address'], [2, 7.8, 'WBTC・USDe・DAIを小分けにETHへ交換', 'WBTC, USDe, DAI → ETH, small swaps']] },
  nowJa: '13:11 JST', nowEn: '04:11 UTC',
  stat: [['凍結 21.7億ドル', 'Frozen $2.17B', 'fz'], ['ETHのまま 約34万', 'Still in ETH ~340k', 'eth']],
};
export function chaincmpText(c, lg) {
  return lg === 'en'
    ? ['⚖️ Biggest past outflow vs now: the first hours', 'Bybit 2025: stETH/mETH → ETH within 1h, then 10k ETH each to ~40 addresses by 3h', `Binance (suspected hack, unconfirmed), ${c.cur.end}h in: 325M USDT → ETH, $2.17B USDT/USDC frozen`, 'On-chain records, Ethereum', '#Binance #Bybit #crypto #Bitcoin'].join('\n')
    : ['⚖️ 過去最大の流出 vs 今回、発生から数時間の比較', 'Bybit（2025）：1時間以内にstETH等をETHへ、3時間で約40アドレスへ分散', `Binance（疑い・未確認）${c.cur.end}時間時点：USDT 3.25億をETHへ、21.7億ドル分が凍結`, 'オンチェーンの記録より', '#Binance #バイナンス #仮想通貨 #ビットコイン'].join('\n');
}
export function chaincmpDraft(now) {
  const c = CHAINCMP, ja = chaincmpText(c, 'ja'), en = chaincmpText(c, 'en');
  return { id: c.id, sr: 'chaincmp', man: 1, due: now, ja, en, h: hashStr(ja + en), img: { chaincmp: c } };
}


// ---- v227: 今回の流出(Binance)の資金の行き先と時系列。自動投稿しない(man: 1)。/posts.html から手で投稿する ----
// 時刻は 10/30 0:00 JST からの分(英語版は UTC に直して表示)。数字は chain-ledger の台帳(v225)と残高の確認(02:03 UTC)から
export const CHAINFLOW = {
  id: 'chainflow:binance2026:v2', t0: 324, now: 791,
  root: { usdt: ['11.75億', '1,175M'], usdc: ['8.23億', '823M'], eth: ['1.73万 ETH', '17,263 ETH'] },
  a: { t: 330, amt: ['USDT 5億', '500M USDT'], sw: 345, swl: ['3.25億USDT → ETH', '325M USDT → ETH'], end: 407, endv: ['12.2万 ETH', '122,310 ETH'], fz: 368, fzv: ['1.75億', '175M USDT'] },
  b: { t: 333, amt: ['USDT 2億', '200M USDT'], end: 361, endl: ['コントラクトへ', 'into contracts'], endv: ['1.9億 USDT', '190M USDT'] },
  c: { t: 338, amt: ['ETH 19.5万', '195,460 ETH'], hold: ['送り先に残ったまま', 'held at the next address'], add: 614, addv: ['+2,000ETH', '+2,000 ETH'] },
  d: { t: 461, t2: 476, amt: ['WBTC 167・USDe 971万', '167 WBTC + 9.7M USDe'], sw: 485, end: 498, endv: ['5,700 ETH', '5,700 ETH'] },
};
export function chainflowText(c, lg) {
  return lg === 'en'
    ? ['🧊 Binance outflow: where is the money now? (suspected hack, unconfirmed)', 'On-chain, 7.8h after the first transfer:', '• $2.17B in USDT/USDC frozen', '• 325M USDT swapped to 122k ETH', '• 195k ETH held at the next address', '#Binance #crypto #Bitcoin #ETH'].join('\n')
    : ['🧊 Binanceから流出した資金、今どこに？（ハッキングの疑い・未確認）', '発生から7.8時間のオンチェーン記録', '・USDT・USDC 21.7億ドル分が凍結', '・USDT 3.25億はETH 12.2万へ交換', '・ETH 19.5万は送り先に残ったまま', '#Binance #バイナンス #仮想通貨 #ビットコイン'].join('\n');
}
export function chainflowDraft(now) {
  const c = CHAINFLOW, ja = chainflowText(c, 'ja'), en = chainflowText(c, 'en');
  return { id: c.id, sr: 'chainflow', man: 1, due: now, ja, en, h: hashStr(ja + en), img: { chainflow: c } };
}



// ---- v237: Binance流出の「資金の現況」投稿(sr: bnstatus)。毎時の追跡のまとめ(/api/track)から、きっかけがあった時だけ下書きを作り自動投稿する ----
// 数字は全部オンチェーンの記録から。予測・持ち主の断定・「動かせる」は書かない
export const BN = { case: 'binance2026', maxPerDay: 3,
  // v239: 定期投稿の間隔。10/31 5:00 JST(10/30 20:00 UTC)までは2時間おき、そのあとは4時間おき。最後は7日目で止める
  every: () => 2 * 36e5,   // v242: 動きがあった時だけ。連続しないよう最短2時間あける
  until: Date.UTC(2026, 10, 5, 20, 24), dEth: 1e4, dFz: 1e7, dBtc: 10,
  // 凍結されている分が今の場所に届いた時刻と量(台帳から。最初の受取先が受け取った分は出どころが追跡の外なので固定)
  fzSteps: [[Date.UTC(2026, 9, 29, 20, 24), 18.75e8], [Date.UTC(2026, 9, 29, 20, 30), -5e8], [Date.UTC(2026, 9, 29, 20, 33), -2e8], [Date.UTC(2026, 9, 29, 20, 41), 8.23e8], [Date.UTC(2026, 9, 29, 21, 8), 1.75e8]],
  aaveAt: Date.UTC(2026, 9, 29, 20, 58),
  // 主な出来事(時刻 UTC・日本語・英語・色の種類)。新しい変化は投稿の時に後ろへ足す
  tl: [[Date.UTC(2026, 9, 29, 20, 20), 'BTC 1.8万を分散', 'BTC 18k split', 'b'], [Date.UTC(2026, 9, 29, 20, 24), 'Ethereumで流出', 'Outflow on Ethereum', 'r'], [Date.UTC(2026, 9, 29, 20, 30), 'USDTを送金・交換', 'USDT sent / swapped', 'g'], [Date.UTC(2026, 9, 29, 20, 58), 'Aaveに6,000万', '60M to Aave', 'a'], [Date.UTC(2026, 9, 29, 21, 47), 'ETH 12.2万を受取', '122k ETH received', 'e'], [Date.UTC(2026, 9, 30, 5, 14), 'ETH 1.7万を受取', '17k ETH received', 'e']] };
export function bnSnapshot(main, btc) {
  if (!main || !main.asof) return null;
  const st = main.status || [], H = 36e5;
  const holders = st.filter((r) => r.depth > 0 && (r.ETH || 0) >= 100).sort((a, b) => b.ETH - a.ETH);
  const hs = new Set(holders.map((r) => r.a)), root = st.find((r) => r.depth === 0) || {};
  const steps = (main.events || []).filter((e) => e.kind === 'move' && /^W?ETH$/.test(e.asset) && hs.has(e.to)).sort((a, b) => a.t - b.t).map((e) => [e.t, Math.round(e.amt)]);
  const fz = st.flatMap((r) => ['USDT', 'USDC'].filter((k) => r[k + 'Frozen'] && r[k] > 1).map((k) => r[k]));
  const aave = (main.edges || []).filter((e) => e.to && e.to.startsWith('0x23878914') && /USD/.test(e.asset)).reduce((a, e) => a + e.amt, 0);
  const sold = (main.events || []).filter((e) => e.kind === 'swap').reduce((a, e) => a + ((e.in || {}).ETH || 0) + ((e.in || {}).WETH || 0), 0);
  let b = null;
  if (btc && btc.asof) { const ws = (btc.status || []).filter((r) => r.depth > 0 && r.ETH >= 1).map((r) => [r.a, +r.ETH.toFixed(1)]).sort((x, y) => y[1] - x[1]); const outs = new Set((btc.edges || []).map((e) => e.f)); b = { held: +(btc.heldBtc || 0).toFixed(1), ws, moved: ws.filter(([a]) => outs.has(a)).length, t: (btc.edges || []).reduce((m, e) => Math.min(m, e.t), Infinity) }; }
  if (b) { const late = (btc.edges || []).filter((e) => e.f === (btc.roots || [])[0] && e.t > b.t + 6e5).reduce((a, e) => a + e.amt, 0), lt2 = (btc.edges || []).filter((e) => e.f === (btc.roots || [])[0] && e.t > b.t + 6e5).reduce((m, e) => Math.min(m, e.t), Infinity); b.steps = late ? [[b.t, +(b.held - late).toFixed(1)], [lt2, +late.toFixed(1)]] : [[b.t, b.held]]; }
  return { t0: main.t0, asof: main.asof, eth: Math.round(holders.reduce((a, r) => a + r.ETH, 0) + (root.ETH || 0)), holders: holders.slice(0, 5).map((r) => [r.a, Math.round(r.ETH)]), steps, swaps: (main.hourly || []).map((x) => x.swaps), fz: Math.round(fz.reduce((a, v) => a + v, 0)), aave: Math.round(aave), sold: Math.round(sold), btc: b, hrs: Math.round((main.asof - main.t0) / H * 10) / 10 };
}
// きっかけ: 凍結の増減・保有ETHの増減・BTCの出金/残高の変化。何も変わっていなければ null
export function bnChange(cur, prev) {
  if (!cur) return null;
  if (!prev) return { kind: 'first' };
  const ch = [];
  if (Math.abs(cur.fz - prev.fz) >= BN.dFz) ch.push(['fz', cur.fz - prev.fz]);
  if (Math.abs(cur.eth - prev.eth) >= BN.dEth) ch.push(['eth', cur.eth - prev.eth]);
  if (cur.btc && prev.btc && (cur.btc.moved !== prev.btc.moved || Math.abs(cur.btc.held - prev.btc.held) >= BN.dBtc)) ch.push(['btc', cur.btc.held - prev.btc.held]);
  if (cur.sold - (prev.sold || 0) >= 100) ch.push(['sold', cur.sold - (prev.sold || 0)]);
  return ch.length ? { kind: 'change', ch } : null;
}
const jaN2 = (v) => { const a = Math.abs(v); return (v < 0 ? '-' : '') + (a >= 1e8 ? (+(a / 1e8).toFixed(2)) + '億' : a >= 1e4 ? (+(a / 1e4).toFixed(a >= 1e6 ? 0 : 1)) + '万' : Math.round(a).toLocaleString('en-US')); };
const enN2 = (v) => { const a = Math.abs(v); return (v < 0 ? '-' : '') + (a >= 1e9 ? (+(a / 1e9).toFixed(2)) + 'B' : a >= 1e6 ? (+(a / 1e6).toFixed(1)) + 'M' : a >= 1e4 ? Math.round(a / 1e3) + 'k' : Math.round(a).toLocaleString('en-US')); };
export function bnHead(s, c, lg) {   // 画像と本文の一番上に出す「何が変わったか」
  const en = lg === 'en', sg = (v) => (v > 0 ? '+' : '');
  if (!c || c.kind === 'first' || c.kind === 'same') return en ? (c && c.kind === 'same' ? 'No change since last check' : 'Where the funds are now') : (c && c.kind === 'same' ? '前回から変化なし' : '資金の現況');
  return c.ch.map(([k, v]) => k === 'fz' ? (en ? `Frozen ${sg(v)}$${enN2(v)}` : `凍結 ${sg(v)}${jaN2(v)}ドル`) : k === 'eth' ? (en ? `Unfrozen ETH ${sg(v)}${enN2(v)}` : `未凍結のETH ${sg(v)}${jaN2(v)}`) : k === 'btc' ? (s.btc && s.btc.moved ? (en ? `BTC: ${s.btc.moved} wallets sent out` : `BTC：${s.btc.moved}つのウォレットから出金`) : (en ? `BTC ${sg(v)}${enN2(v)}` : `BTC ${sg(v)}${jaN2(v)}`)) : (en ? `ETH sold in swaps: ${enN2(v)}` : `ETHを売る交換：${jaN2(v)} ETH`)).join(en ? ' / ' : '／');
}
// v241: 冒頭の1行に一番強い事実を置く。ハッシュタグは2つ。最後に次の更新の目安
export function bnLead(s, c, lg) {
  const en = lg === 'en', b = s.btc, h = s.hrs;
  if (c && c.kind === 'close') return en ? `Binance outflow, ${h}h in. Wrapping up regular updates here.` : `Binance流出から${h}時間。定期の更新は、ここでいったん区切ります。`;
  if (c && c.kind === 'change') return en ? `Binance outflow, ${h}h in. Changed since last check: ${bnHead(s, c, 'en')}` : `Binance流出から${h}時間。前回から動きあり：${bnHead(s, c, 'ja')}`;
  const still = !s.sold && (!b || !b.moved);
  return en
    ? `Binance outflow, ${h}h in. ~${enN2(s.eth)} unfrozen ETH${b ? ` and ${enN2(b.held)} BTC` : ''} ${still ? '— no swaps selling ETH, no BTC withdrawals' : 'remain at the receiving addresses'}.`
    : `Binance流出から${h}時間。未凍結のETH 約${jaN2(s.eth)}${b ? `・BTC ${jaN2(b.held)}` : ''}は${still ? '、ETHを売る交換0件・BTCの出金0回のまま' : '、送り先に残ったまま'}。`;
}
export function bnText(s, c, lg, next) {
  const en = lg === 'en', b = s.btc, nx = Math.round((next || 2 * 36e5) / 36e5);
  const L2 = en
    ? [bnLead(s, c, 'en'), '', `• Frozen USDT/USDC: $${enN2(s.fz)}`, s.sold ? `• ETH sold in swaps: ${enN2(s.sold)}` : '• Swaps selling ETH: 0', b ? `• BTC withdrawals: ${b.moved ? b.moved + ' wallets' : '0'} (${b.ws.length} wallets)` : '', '', c && c.kind === 'close' ? 'Next post: only when the funds move on-chain.' : 'Will update when the funds move. On-chain records.', '#Binance #Bitcoin']
    : [bnLead(s, c, 'ja'), '', `・凍結 USDT・USDC：${jaN2(s.fz)}ドル`, s.sold ? `・ETHを売る交換：${jaN2(s.sold)} ETH` : '・ETHを売る交換：0件', b ? `・BTCの出金：${b.moved ? b.moved + 'ウォレット' : '0回'}（${b.ws.length}ウォレット）` : '', '', c && c.kind === 'close' ? '次は、オンチェーンで資金が動いたときにお知らせします' : '動きがあれば、また更新します（オンチェーンの記録）', '#Binance #ビットコイン'];
  return L2.filter((x, i, a) => x || (a[i - 1] && a[i + 1] !== undefined)).join('\n');
}
// v240: 返信欄の詳細(親の投稿にぶら下げる)。保有アドレス・Aave・サイトの詳細ページ
export function bnReply(s, lg) {
  const en = lg === 'en', sh = (a) => a.slice(0, 6) + '…' + a.slice(-4), url = 'https://crypto-schedule.signalarchive.workers.dev/track.html';
  const hold = s.holders.slice(0, 3).map(([a, v]) => `${sh(a)} ${en ? enN2(v) : jaN2(v)}`).join(en ? ', ' : '／');
  return (en
    ? ['Details (on-chain):', `• ETH held: ${hold}`, s.aave ? `• ${enN2(s.aave)} USDT was deposited to Aave from a separate address (not part of the frozen total)` : '', '• Exchange deposits ≠ proof of sale', `All addresses & timeline: ${url}`]
    : ['詳細（オンチェーンの記録）', `・ETHの保有：${hold}`, s.aave ? `・Aaveに預けたUSDT ${jaN2(s.aave)}は別のアドレスから（凍結額に含まない）` : '', '・取引所への入金は売却の証拠ではありません', `全アドレスと時系列：${url}`]).filter(Boolean).join('\n');
}
export function bnDraft(s, c, now, prev) {
  s = { ...s, checks: [...((prev && prev.checks) || []), s.asof].slice(-8) };
  const nx = BN.every(now), id = 'bnstatus:' + Math.floor(s.asof / 36e5) + (c && c.kind === 'close' ? ':close' : ''), ja = bnText(s, c, 'ja', nx), en = bnText(s, c, 'en', nx), dues = { ja: now, en: now + 30 * 60000 };   // v241: 英語は30分ずらす
  const rj = bnReply(s, 'ja'), re = bnReply(s, 'en');
  return [{ id, sr: 'bnstatus', due: now, dues, ja, en, h: hashStr(ja + en), img: { bn: s, ch: c } }, { id: id + ':r', sr: 'bnreply', parent: id, due: now, dues, ja: rj, en: re, h: hashStr(rj + re) }];
}


// ---- v243: ショック比較(2本立て)。Binance 2019 / 2026(本体・sr: shockbn)と、過去の巨大ショックとの比較(返信・sr: shockcmp) ----
// 価格は Binance BTCUSDT の日足終値。発生の前日の終値＝0%。節目の日(終値が確定した日)に自動で投稿する。英語は30分後
export const SHOCK = {
  cur: 'binance2026',
  ev: [
    { id: 'binance2019', d0: '2019-05-07', ja: 'Binance', en: 'Binance', y: 2019, kind: ['ハッキング', 'hack'], size: ['7,000 BTC・当時約4,000万ドル', '7,000 BTC, ~$40M then'] },
    { id: 'luna2022', d0: '2022-05-09', ja: 'LUNA', en: 'LUNA', y: 2022, kind: ['崩壊', 'collapse'] },
    { id: 'ftx2022', d0: '2022-11-08', ja: 'FTX', en: 'FTX', y: 2022, kind: ['破綻', 'bankruptcy'] },
    { id: 'bybit2025', d0: '2025-02-21', ja: 'Bybit', en: 'Bybit', y: 2025, kind: ['ハッキング', 'hack'] },
    { id: 'binance2026', d0: '2026-10-29', ja: 'Binance', en: 'Binance', y: 2026, kind: ['ハッキング', 'hack'], size: ['約63億ドル・Binance推計', '~$6.3B, Binance estimate'] },
  ],
  marks: [3, 7, 14, 30, 60, 76, 90],   // 節目(発生日=0日目)。3日目は初回
  pre: 15, post: 90,
  mile: [21, 30, 45, 60, 76, 90],   // v321: 空き枠の投稿は、この日(発生日=0日目)に1本だけ。回復・最安・急変動のきっかけ投稿はこれまでどおり
};
// rows: Binance の日足 [[openTime, o, h, l, c, ...]]。確定した日だけ(今日の途中の足は除く)
export function shockSeries(e, rows, now) {
  const DAYMS = 864e5, t0 = Date.parse(e.d0 + 'T00:00:00Z');
  const by = new Map(rows.filter((r) => +r[0] + DAYMS <= now).map((r) => [Math.round((+r[0] - t0) / DAYMS), +r[4]]));
  const base = by.get(-1); if (!base) return null;
  const days = [...by.entries()].filter(([d]) => d >= -SHOCK.pre && d <= SHOCK.post).sort((a, b) => a[0] - b[0]).map(([d, c]) => [d, +((c / base - 1) * 100).toFixed(2)]);
  const rec = days.find(([d, v]) => d >= 0 && v >= 0);
  return { id: e.id, base, recover: rec ? rec[0] : null, days };
}
const pctS = (v) => (v > 0 ? '+' : '') + v.toFixed(1) + '%';
export function shockTexts(sd, lg) {
  const en = lg === 'en', cur = sd.ev[SHOCK.cur], n = sd.n, at = (id) => { const x = sd.ev[id] && sd.ev[id].days.find((q) => q[0] === n); return x ? pctS(x[1]) : '—'; };
  const rc = cur.recover != null ? (en ? `Back to the pre-shock level on day ${cur.recover}.` : `${cur.recover}日目に前の水準へ戻った。`) : '';
  // v322: 1行目に今の数字、2行目に過去との答え。作り方の説明は画像に任せる
  const raw = (id) => { const x = sd.ev[id] && sd.ev[id].days.find((q) => q[0] === n); return x ? x[1] : null; }, a26 = raw('binance2026'), a19 = raw('binance2019'), gap = a26 != null && a19 != null ? Math.round(Math.abs(a26 - a19)) : null;
  const rd = (id) => sd.ev[id].recover != null ? sd.ev[id].recover : (id === 'luna2022' ? 534 : null);
  const main = en
    ? [`${n} days since the Binance hack: BTC ${at('binance2026')}`, `Day ${n} after the 2019 hack: ${at('binance2019')}` + (gap != null ? ` (${gap} pts apart)` : ''), rc, '', '2019 came mid-uptrend, and the loss was ~150x smaller.', 'Past record. Not a forecast.', '#Binance #Bitcoin']
    : [`Binanceハッキングから${n}日、BTCは${at('binance2026')}`, `2019年の同じ${n}日目は${at('binance2019')}` + (gap != null ? `。差は約${gap}ポイント` : ''), rc, '', '前回は上昇相場の途中で、被害額も約150倍ちがいます', '過去の記録。予測ではありません', '#Binance #ビットコイン'];
  const reply = en
    ? [`Day ${n} after a major shock. Binance now: ${at('binance2026')}`, `Same day ${n}: FTX ${at('ftx2022')} / LUNA ${at('luna2022')} / Bybit ${at('bybit2025')}`, '', `Days to get back: FTX ${rd('ftx2022')}, Bybit ${rd('bybit2025')}, LUNA ${rd('luna2022')}`, 'Past record. Not a forecast.', '#Bitcoin #Binance']
    : [`大きなショックから${n}日目。今回のBinanceは${at('binance2026')}`, `同じ${n}日目：FTX ${at('ftx2022')}／LUNA ${at('luna2022')}／Bybit ${at('bybit2025')}`, '', `元の水準に戻るまで：FTX ${rd('ftx2022')}日・Bybit ${rd('bybit2025')}日・LUNA ${rd('luna2022')}日`, '過去の記録。予測ではありません', '#ビットコイン #Binance'];
  return { main: main.filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n'), reply: reply.join('\n') };
}
// v245: 1本ずつ作る。kind = 'shockbn'(Binance 2019/2026) か 'shockcmp'(ショック後のBTC)。why は id に残す(空き枠・回復・最安・急変動)
export function shockDraft(sd, now, kind, why) {
  const id = (kind === 'shockbn' ? 'shock:' : 'shockcmp:') + SHOCK.cur + ':d' + sd.n + ':' + why, dues = { ja: now, en: now + 30 * 60000 };
  const ja = shockTexts(sd, 'ja'), en = shockTexts(sd, 'en'), k = kind === 'shockbn' ? 'main' : 'reply';
  return { id, sr: kind, parent: undefined, due: now, dues, ja: ja[k], en: en[k], h: hashStr(ja[k] + en[k]), img: { shock: sd }, why };
}
// v245: 空き枠の条件。日本時間9〜23時、前の4時間と先の2時間に自動投稿が無い、前のショック比較から4時間
// v251: 定時の投稿(daily・pre・arch・vol・pat・sum・week・liqday)は前後30分だけよける。それ以外の自動投稿(急変動・清算・資金の現況など)は前2時間・先1時間
export const SHOCKFIXED = new Set(['histw', 'histm', 'midterm', 'corrts', 'daily', 'pre', 'arch', 'vol', 'pat', 'sum', 'week', 'liqday']);
export const SHOCKGAP = { from: 9, to: 23, before: 2 * H, after: 1 * H, fixed: 30 * 60000, last: 22, every: 4 * H, trigGap: 3 * H, perDay: 3, slotPerDay: 2 }   // v250: 空き枠は4時間あけて1日2本まで(交互)。きっかけ込みで1日3本まで;

// ---- v259: BTC × S&P500 の相関の推移(1時間足・直近24時間の相関を1時間ずつずらして7日分) ----
export const CORRTS = { days: 7, win: 24, maxEv: 4, postFrom: 6, postTo: 9, jump: 0.5 };
// bt・sp = [[開始ms, 始, 高, 安, 終]]。確定した足だけ。返り値 { at, end, t:[], r:[], b:[], s:[] }  r = 相関(null あり)・b/s = 7日前＝0% の変化率
export function corrSeries(bt, sp, now) {
  const fin = (a) => new Map((a || []).filter((x) => x[0] + H <= now).map((x) => [x[0], x[4]]));
  const B = fin(bt), S = fin(sp); if (!B.size || !S.size) return null;
  const end = Math.min(Math.max(...B.keys()), Math.max(...S.keys())), n = CORRTS.days * 24, t0 = end - (n - 1) * H;
  const ret = (m, t) => { const a = m.get(t - H), b = m.get(t); return a > 0 && b > 0 ? Math.log(b / a) : null; };
  const out = { at: now, end: end + H, t: [], r: [], b: [], s: [] }, b0 = B.get(t0 - H) || B.get(t0), s0 = S.get(t0 - H) || S.get(t0);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * H, x = [], y = [];
    for (let k = t - (CORRTS.win - 1) * H; k <= t; k += H) { const a = ret(B, k), c = ret(S, k); if (a != null && c != null) { x.push(a); y.push(c); } }
    const r = x.length >= CORRTS.win * 0.8 ? pearson(x, y) : null;
    out.t.push(t); out.r.push(r == null || !isFinite(r) ? null : Math.round(r * 100) / 100);
    const bv = B.get(t), sv = S.get(t); out.b.push(bv && b0 ? +((bv / b0 - 1) * 100).toFixed(2) : null); out.s.push(sv && s0 ? +((sv / s0 - 1) * 100).toFixed(2) : null);
  }
  return out;
}
const lastOf = (a) => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return [i, a[i]]; return [-1, null]; };
export function corrStats(c) {
  const [i, now] = lastOf(c.r), ago = i >= 24 ? c.r[i - 24] : null, v = c.r.filter((x) => x != null);
  return { now, ago, hi: v.length ? Math.max(...v) : null, lo: v.length ? Math.min(...v) : null, i };
}
export const corrWord = (v, lg) => v == null ? (lg === 'en' ? 'not enough data' : 'データ不足') : v >= 0.5 ? (lg === 'en' ? 'moving in the same direction' : '同じ方向に動く傾向') : v <= -0.5 ? (lg === 'en' ? 'moving in opposite directions' : '逆方向に動く傾向') : (lg === 'en' ? 'no clear relationship' : 'はっきりした関係なし');
const sg = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2);
export function corrText(c, lg) {
  const st = corrStats(c);
  // v322: 1行目に「何が起きたか」
  const ext = st.now != null && st.hi != null && st.now >= st.hi ? 'hi' : st.now != null && st.lo != null && st.now <= st.lo ? 'lo' : null;
  return lg === 'en'
    ? [`BTC and US stocks (S&P 500), 24h correlation ${sg(st.now)} (24h ago ${sg(st.ago)})`, `${corrWord(st.now, 'en')[0].toUpperCase() + corrWord(st.now, 'en').slice(1)}` + (ext === 'hi' ? ' — the strongest in 7 days' : ext === 'lo' ? ' — the weakest in 7 days' : ` (7-day range ${sg(st.lo)} to ${sg(st.hi)})`), '', 'Correlation is not causation.', '#Bitcoin #SP500'].join('\n')
    : [`BTCと米国株(S&P500)、直近24時間の相関 ${sg(st.now)}(24時間前 ${sg(st.ago)})`, `${corrWord(st.now, 'ja')}` + (ext === 'hi' ? '。この7日で一番強い' : ext === 'lo' ? '。この7日で一番弱い' : `(7日の幅 ${sg(st.lo)}〜${sg(st.hi)})`), '', '相関は原因を示しません', '#ビットコイン #SP500'].join('\n');
}
export function corrDraft(c, now, why) {
  const id = 'corrts:' + isoDay(now) + (why === 'daily' ? '' : ':' + why), ja = corrText(c, 'ja'), en = corrText(c, 'en');
  return { id, sr: 'corrts', due: now, dues: { ja: now, en: now + 30 * 60000 }, ja, en, h: hashStr(ja + en), img: { corr: c }, why };
}

// ---- v260→v264: 米中間選挙の前後3日のBTC(1時間足)。投票日(UTC)の終値＝0%。過去3回と今回を重ねる ----
export const MID = {
  cur: 'mid2026', pre: 96, post: 72,   // 投票日の0時(UTC)の3日前〜投票日の終値の3日後(時間)
  ev: [
    { id: 'mid2014', d0: '2014-11-04', y: 2014 },
    { id: 'mid2018', d0: '2018-11-06', y: 2018 },
    { id: 'mid2022', d0: '2022-11-08', y: 2022, note: ['FTXが破産申請', 'FTX files for bankruptcy'], noteAt: Date.UTC(2022, 10, 11, 14) },
    { id: 'mid2026', d0: '2026-11-03', y: 2026 },
  ],
};
// rows = [[開始ms, 始, 高, 安, 終]] の1時間足。確定した足だけ。x = 投票日の終値からの時間(h)。{ id, base, pts:[[h, pct]], h1d, h3d, min:[h,pct] }
export function midSeries(e, rows, now) {
  const T = Date.parse(e.d0 + 'T00:00:00Z') + DAY, by = new Map(rows.filter((r) => +r[0] + H <= now).map((r) => [Math.round((+r[0] + H - T) / H), +r[4]]));
  const base = by.get(0); if (!base) return { id: e.id, base: null, pts: [] };
  const pts = [...by.keys()].filter((h) => h >= -MID.pre && h <= MID.post).sort((a, b) => a - b).map((h) => [h, +((by.get(h) / base - 1) * 100).toFixed(2)]);
  const at = (h) => { const q = pts.find((z) => z[0] === h); return q ? q[1] : null; }, after = pts.filter((q) => q[0] > 0);
  return { id: e.id, base, pts, h1d: at(24), h3d: at(72), min: after.length ? after.reduce((a, q) => q[1] < a[1] ? q : a) : null };
}
const sgn1 = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(1) + '%';
export function midText(md, lg) {
  const E = md.ev, P = ['mid2014', 'mid2018', 'mid2022'], done = md.done, row = (f, sep) => [...P, ...(E[MID.cur] && E[MID.cur].base ? [MID.cur] : [])].map((id) => (id === MID.cur ? (lg === 'en' ? 'now' : '今回') : id.slice(3)) + ' ' + sgn1(f(E[id] || {}))).join(sep);
  if (lg === 'en') return ['BTC around US midterm election day (close = 0%)', `+3 days: ${row((e) => e.h3d, ' / ')}`, `3-day low: ${row((e) => e.min && e.min[1], ' / ')}`, '', 'Only 3 cases. This time may differ.', '#Bitcoin'].join('\n');
  return ['米中間選挙 投票日前後のBTC（投票日の終値＝0%）', `3日後 ${row((e) => e.h3d, '／')}`, `3日以内の最安 ${row((e) => e.min && e.min[1], '／')}`, '', '3例だけの記録。今回も同じとは限りません', '#ビットコイン'].join('\n');
}
export function midDraft(md, now) {
  const id = 'mid:2026:' + isoDay(now), ja = midText(md, 'ja'), en = midText(md, 'en');   // v266: 1日1本(投票日の終値が出てから3日後まで)
  return { id, sr: 'midterm', due: now, dues: { ja: now, en: now + 30 * 60000 }, ja, en, h: hashStr(ja + en), img: { mid: md } };
}

// ---- v272: 「暗号資産のブームと危機の歴史」(手で投稿する下書き・画像は public/csa-history-ja/en.png) ----
export function historyDraft(now) {
  const ja = ['暗号資産のブームと危機の歴史（2017〜2026）', '', 'ICO、DeFi、NFT、アルゴ型ステーブル、貸し出し、ミーム、取引所。お金が集まった場所と、同じ時期に起きた危機を1枚に並べました', '', '並べたもので、原因を示すものではありません', '#ビットコイン #暗号資産'].join('\n');
  const en = ['Crypto booms and crises, 2017–2026', '', 'ICO, DeFi, NFTs, algorithmic stablecoins, lending, memecoins, exchanges: where the money went, and the crises that hit around the same time, on one chart.', '', 'Shown side by side; this does not show cause.', '#Bitcoin #Crypto'].join('\n');
  return { id: 'history:2026-11', sr: 'history', man: 1, due: now, ja, en, h: hashStr(ja + en), img: { src: { ja: '/csa-history-ja.png', en: '/csa-history-en.png' } } };
}

// ---- v273: 年表の投稿(週1：2017年〜今 / 毎日：直近1か月) ----
// v274: ハッシュタグをその時の中身から作る。危機の名前(#Binance など)・#ハッキング・#仮想通貨(日本語では「暗号資産」より使われている)
const tagOf = (n) => { const t = String(n || '').split(/[(（]/)[0].replace(/[^A-Za-z0-9]/g, ''); return t.length >= 3 && t.length <= 16 && !/^\d/.test(t) ? '#' + t : null; };
const tagsJa = (names, hack) => [...new Set(['#仮想通貨', '#ビットコイン', ...names.map(tagOf).filter(Boolean).slice(0, 2), ...(hack ? ['#ハッキング'] : [])])].join(' ');
const tagsEn = (names, hack) => [...new Set(['#Bitcoin', '#Crypto', ...names.map(tagOf).filter(Boolean).slice(0, 2), ...(hack ? ['#hack'] : [])])].join(' ');
const bfmt = (b) => b >= 1000 ? (b / 1000).toFixed(1) + '兆ドル' : b >= 1 ? Math.round(b * 10) + '億ドル' : Math.round(b * 1000) + '百万ドル';
const bfmtE = (b) => b >= 1000 ? '$' + (b / 1000).toFixed(1) + 'T' : b >= 1 ? '$' + (b >= 10 ? Math.round(b) : b.toFixed(1)) + 'B' : '$' + Math.round(b * 1000) + 'M';
// base = booms-data.json、bm = /api/booms。DefiLlama の月ごとの実データで置き換える(途中の月は除く)
export function histMerge(base, bm, now) {
  const cur = new Date(now).toISOString().slice(0, 7), api = (bm && bm.data) || {}, clean = (r) => { const o = (r || []).filter((q) => q[0] < cur); while (o.length && !o[0][1]) o.shift(); return o.map(([m, v]) => [m, v, 'e']); };
  const booms = base.booms.map((b) => ({ ...b, pts: api[b.id] && api[b.id].length ? (b.id === 'algo' ? clean(api.algo).map(([m, v]) => [m, v + ({ '2021-04': 1, '2021-05': 2, '2021-06': 0.3 }[m] || 0), 'e']) : clean(api[b.id])) : b.pts }));
  const crises = [...base.crises];
  for (const h of (bm && bm.hacks) || []) if (h.b >= 0.5 && h.d >= '2026-01-01' && !crises.some((c) => Math.abs(Date.parse(c.d) - Date.parse(h.d)) < 4 * DAY)) crises.push({ n: h.n, d: h.d, k: 'hack', b: h.b, boom: 'cex' });
  crises.sort((a, b) => a.d < b.d ? -1 : 1); crises.forEach((c) => { c.cur = c === crises[crises.length - 1] ? 1 : 0; });
  return { at: now, mcap: base.mcap, booms, crises: crises.slice(-12) };
}
export function histWeekDraft(base, bm, now) {
  const hd = histMerge(base, bm, now), B = Object.fromEntries(hd.booms.map((b) => [b.id, b])), lastV = (b) => b.pts[b.pts.length - 1], peak = (b) => b.pts.reduce((a, q) => q[1] > a[1] ? q : a);
  const pct = (id) => { const b = B[id]; return Math.round(lastV(b)[1] / peak(b)[1] * 100); }, lc = hd.crises[hd.crises.length - 1];
  const ja = ['2017年からの暗号資産のブームと危機。今はピークのどこ？', `DeFiの預かり資産 ${bfmt(lastV(B.defi)[1])}(ピークの${pct('defi')}%)`, `DEXの取引高 ${bfmt(lastV(B.dex)[1])}/月(ピークの${pct('dex')}%)`, `一番新しい危機：${lc.n}(${lc.d.slice(0, 7).replace('-', '年')}月)`, '', '並べたもので、原因は示しません', tagsJa([lc.n], lc.k === 'hack')].join('\n');   // v322
  const en = ['Crypto booms and crises since 2017: where are we vs the peak?', `DeFi TVL ${bfmtE(lastV(B.defi)[1])} (${pct('defi')}% of peak)`, `DEX volume ${bfmtE(lastV(B.dex)[1])}/mo (${pct('dex')}% of peak)`, `Latest crisis: ${lc.n} (${lc.d.slice(0, 7)})`, '', 'Shown side by side; not a cause.', tagsEn([lc.n], lc.k === 'hack')].join('\n');
  return { id: 'histw:' + isoDay(now), sr: 'histw', due: now, dues: { ja: now, en: now + 30 * 60000 }, ja, en, h: hashStr(ja + en), img: { hist: hd } };
}
// 直近1か月。危機 = DefiLlama のハッキング一覧(100万ドル以上)＋大型ハッキング(HACKS)＋手で足した出来事(◆・ハッキング)
export function histMonthDraft(bm, ce, hacks, now) {
  const from = isoDay(now - 30 * DAY), D = bm.daily, cut = (r) => (r || []).filter((q) => q[0] >= from);
  const cr = [];
  for (const h of bm.hacks || []) if (h.d >= from) cr.push({ n: h.n, d: h.d, b: h.b, k: 'hack' });
  for (const h of hacks || []) { const d = new Date(h.t).toISOString().slice(0, 10); if (d >= from && !cr.some((c) => Math.abs(Date.parse(c.d) - Date.parse(d)) < 3 * DAY && (c.n.toLowerCase().includes(String(h.en).toLowerCase()) || String(h.en).toLowerCase().includes(c.n.toLowerCase())))) cr.push({ n: h.en, d, b: h.id === 'binance2026' ? 6.3 : null, k: 'hack' }); }
  for (const e of ce || []) { const d = new Date(e.t).toISOString().slice(0, 10); if (e.k === 'hack' && d >= from && !cr.some((c) => c.d === d)) cr.push({ n: e.en || e.ja, d, b: null, k: 'hack' }); }
  cr.sort((a, b) => a.d < b.d ? -1 : 1);
  const month = { from, to: isoDay(now), btc: cut(D.btc), defi: cut(D.defi), lend: cut(D.lend), stable: cut(D.stable), dex: cut(D.dex), crises: cr.slice(-10) };
  const ch = (r) => r.length >= 2 ? Math.round((r[r.length - 1][1] / r[0][1] - 1) * 1000) / 10 : null, sg = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v) + '%';
  const big = [...cr].filter((c) => c.b).sort((a, b) => b.b - a.b)[0], top2 = [...cr].sort((a, b) => (b.b || 0) - (a.b || 0)).map((c) => c.n);
  const ja = [`この1か月、BTC ${sg(ch(month.btc))}・DeFi ${sg(ch(month.defi))}・ステーブル ${sg(ch(month.stable))}`, `危機の記録は${cr.length}件` + (big ? `。一番大きかったのは${big.n}(${bfmt(big.b)})` : ''), '', '並べたもので、原因は示しません', tagsJa(top2, cr.length > 0)].join('\n');   // v322
  const en = [`Last 30 days: BTC ${sg(ch(month.btc))}, DeFi ${sg(ch(month.defi))}, stablecoins ${sg(ch(month.stable))}`, `${cr.length} crises recorded` + (big ? `; the largest: ${big.n} (${bfmtE(big.b)})` : ''), '', 'Shown side by side; not a cause.', tagsEn(top2, cr.length > 0)].join('\n');
  return { id: 'histm:' + isoDay(now), sr: 'histm', due: now, dues: { ja: now, en: now + 30 * 60000 }, ja, en, h: hashStr(ja + en), img: { month } };
}
// v279: 「反発」の歴史。BTC 1時間足の始値→終値が −5% 以下の回(24時間以内の続きは1回と数える)の、その後7日間。k = [[t,o,h,l,c]] 古い順
export function rebEvents(k, th = -0.05, HR = 168) {
  const ev = []; let last = -Infinity;
  for (let i = 0; i < k.length; i++) {
    const [t, o, , , c] = k[i]; if (!(o > 0) || c / o - 1 > th || t - last < DAY) continue; last = t;
    const pts = []; for (let h = 0; h <= HR; h++) { const q = k[i + h]; pts.push(q && q[0] - t === h * H ? +((q[4] / c - 1) * 100).toFixed(2) : null); }
    let rec = null; for (let h = 1; h <= HR && k[i + h]; h++) if (k[i + h][2] >= o) { rec = h; break; }
    ev.push({ t, o, c, drop: +((c / o - 1) * 100).toFixed(1), pts, rec });
  }
  return ev;
}

export function rebDraft(ev, now, src = 'Binance BTCUSDT') {
  const n = ev.length, at = (h) => ev.map((e) => e.pts[h]).filter((v) => v != null), cnt = (h) => { const a = at(h); return [a.filter((v) => v > 0).length, a.length]; };
  const med = []; for (let h = 0; h <= 168; h++) med.push(medOf(at(h)));
  const [u24, n24] = cnt(24), [u7, n7] = cnt(168), rec = ev.filter((e) => e.rec != null).length, recH = medOf(ev.filter((e) => e.rec != null).map((e) => e.rec));
  const last = ev[n - 1], y0 = new Date(ev[0].t + JST).getUTCFullYear(), d = new Date(last.t + JST), sg = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const lj = `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`, le = enDate(last.t);
  const s = { n, y0, u24, n24, u7, n7, rec, recH, m24: med[24], m7: med[168], worst: Math.min(...ev.map((e) => e.drop)) };
  let ja = `「反発」の歴史\n\nBTCが1時間で5%以上下げた回(${y0}年以降 ${n}回)のその後\n\n下げた時の終値より上だった回\n・24時間後 ${u24}/${n24}回\n・7日後 ${u7}/${n7}回\n\n中央値 24時間後 ${sg(med[24])} / 7日後 ${sg(med[168])}\n7日以内に下げる前の値へ戻った ${rec}/${n}回\n\n過去の記録で、今回も同じとは限りません`;
  let en = `A history of rebounds\n\nBTC after a 5%+ drop within one hour (${n} times since ${y0})\n\nAbove the close of the drop hour:\n- 24h later: ${u24}/${n24}\n- 7 days later: ${u7}/${n7}\n\nMedian: ${sg(med[24])} after 24h / ${sg(med[168])} after 7d\nBack to the pre-drop price within 7d: ${rec}/${n}\n\nPast record. This time may differ.`;
  for (const [tg, te] of [['\n#ビットコイン #BTC', '\n#Bitcoin #BTC'], ['\n#BTC', '\n#BTC']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  return { id: 'rebound:copy:' + now, sr: 'rebound', man: 1, due: now, ja, en,
    img: { reb: { s, med, src, ev: ev.map((e) => ({ drop: e.drop, p: e.pts.filter((_, h) => h % 2 === 0) })), last: { drop: last.drop, p: last.pts.filter((_, h) => h % 2 === 0), ja: lj, en: le } } } };
}
// v279: 今日と同じ形を探す。直近 W 時間の1時間足の終値の形(始点＝0%)に近い過去の窓を、差の二乗平均の小ささで選ぶ(7日以上離す・直近7日は除く)。その後72時間を並べる
export function samePath(k, W = 24, A = 72, top = 5) {
  const cl = k.map((x) => x[4]), n = cl.length, cur = []; for (let i = n - W; i < n; i++) cur.push((cl[i] / cl[n - W] - 1) * 100);
  const sc = []; for (let s = 0; s + W + A < n - 7 * 24; s++) { let e = 0; const b = cl[s]; for (let j = 0; j < W; j++) { const d = (cl[s + j] / b - 1) * 100 - cur[j]; e += d * d; } sc.push([Math.sqrt(e / W), s]); }
  sc.sort((a, b) => a[0] - b[0]); const pick = [];
  for (const [e, s] of sc) { if (pick.some((p) => Math.abs(p.s - s) < 7 * 24)) continue; pick.push({ s, e }); if (pick.length >= top) break; }
  const corr = (a, b) => { const m = (x) => x.reduce((p, q) => p + q, 0) / x.length, ma = m(a), mb = m(b); let u = 0, va = 0, vb = 0; a.forEach((x, i) => { u += (x - ma) * (b[i] - mb); va += (x - ma) ** 2; vb += (b[i] - mb) ** 2; }); return u / Math.sqrt(va * vb); };
  return { cur, hi: Math.max(...k.slice(n - W).map((x) => x[2])), lo: Math.min(...k.slice(n - W).map((x) => x[3])), now: cl[n - 1], m: pick.map(({ s, e }) => { const b = cl[s], end = cl[s + W - 1], pre = [], post = [];
    for (let j = 0; j < W; j++) pre.push(+((cl[s + j] / b - 1) * 100).toFixed(2)); for (let h = 0; h <= A; h++) post.push(+((cl[s + W - 1 + h] / end - 1) * 100).toFixed(2));
    return { t: k[s + W - 1][0], e: +e.toFixed(2), r: Math.round(corr(pre, cur) * 100), pre, post, a24: post[24], a72: post[A], px: end }; }) };
}
export function sameDraft(sp, now) {
  const sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%', dj = (t) => { const d = new Date(t + JST); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }, m = sp.m.slice(0, 3);
  const up = sp.m.filter((x) => x.a24 > 0).length, $ = (v) => '$' + Math.round(v).toLocaleString('en-US');
  let ja = `今日のBTCと形が近かった過去の日\n\n直近24時間 ${$(sp.hi)}→${$(sp.lo)}→${$(sp.now)}\n\nその後 24時間/72時間\n` + m.map((x, i) => `${'①②③'[i]}${dj(x.t)} ${sg(x.a24)}/${sg(x.a72)}`).join('\n') + `\n\n似た${sp.m.length}回中、24時間後に上 ${up}回\n過去の記録で、今回も同じとは限りません`;
  let en = `Past days shaped like BTC's last 24h\n\nLast 24h: ${$(sp.hi)} → ${$(sp.lo)} → ${$(sp.now)}\n\nNext 24h / 72h\n` + m.map((x, i) => `${'①②③'[i]} ${enDate(x.t)}: ${sg(x.a24)} / ${sg(x.a72)}`).join('\n') + `\n\nHigher 24h later: ${up} of ${sp.m.length}\nPast record. This time may differ.`;
  for (const [tg, te] of [['\n#ビットコイン #BTC', '\n#Bitcoin #BTC'], ['\n#BTC', '\n#BTC']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  return { id: 'samepath:copy:' + now, sr: 'samepath', man: 1, due: now, ja, en, img: { same: { ...sp, lj: sp.m.map((x) => dj(x.t)), le: sp.m.map((x) => enDate(x.t)) } } };
}
// v284: 下落のその後。日足 k = [[t,o,h,l,c]] 古い順。「30日で th% 以上の下げ」に初めて入った日(前回から30日以上あける)を起点に、その後60日。
//   th を省くと、今の30日変化に合わせる(5%刻みで切り捨て・最小10)。その後60日がそろっていない回は集計から外し、直近の回は「今回」として線だけ出す
export function dropStudy(k, th, D = 30, A = 60) {
  const n = k.length, c = k.map((x) => x[4]), r = (i) => i >= D ? (c[i] / c[i - D] - 1) * 100 : 0, cur = r(n - 1);
  if (!th) th = Math.max(10, Math.floor(Math.abs(Math.min(0, cur)) / 5) * 5);
  const ev = []; let last = -1e9;
  for (let i = D + 1; i < n; i++) { if (r(i) > -th || r(i - 1) <= -th || i - last < 30) continue; last = i;
    const p = []; for (let d = 0; d <= A; d++) p.push(i + d < n ? +((c[i + d] / c[i] - 1) * 100).toFixed(2) : null);
    let dd = 0, ld = 0; for (let d = 1; d <= A && i + d < n; d++) { const v = (k[i + d][3] / c[i] - 1) * 100; if (v < dd) { dd = v; ld = d; } }
    const pre = []; for (let d = -D; d <= 0; d++) pre.push(+((c[i + d] / c[i] - 1) * 100).toFixed(2));
    ev.push({ t: k[i][0], p, pre, dd: +dd.toFixed(1), ld, full: i + A < n }); }
  const done = ev.filter((e) => e.full), lastEv = ev[ev.length - 1], live = lastEv && !lastEv.full ? lastEv : null;
  const q = (a, f) => { a = a.slice().sort((x, y) => x - y); const i = f * (a.length - 1), lo = Math.floor(i); return a[lo] + (a[Math.min(a.length - 1, lo + 1)] - a[lo]) * (i - lo); };
  const band = { lo: [], q1: [], md: [], q3: [], hi: [] }; for (let d = 0; d <= A; d++) { const a = done.map((e) => e.p[d]); band.lo.push(Math.min(...a)); band.q1.push(q(a, .25)); band.md.push(q(a, .5)); band.q3.push(q(a, .75)); band.hi.push(Math.max(...a)); }
  const cpre = []; for (let d = -D; d <= 0; d++) cpre.push(+((c[n - 1 + d] / c[n - 1] - 1) * 100).toFixed(2));
  let near = null; for (const e of done) { let u = 0; for (let j = 0; j <= D; j++) u += (e.pre[j] - cpre[j]) ** 2; const er = Math.sqrt(u / (D + 1)); if (!near || er < near.er) near = { er, t: e.t, pre: e.pre, post: e.p, a30: e.p[30], a60: e.p[A], dd: e.dd }; }
  return { cpre, near, px: [c[n - 1 - D], c[n - 1]], th, D, A, cur: +cur.toFixed(1), n: done.length, y0: done.length ? new Date(done[0].t).getUTCFullYear() : null, band, dots: done.map((e) => e.p[30] > 0),
    s: { ddMed: +q(done.map((e) => e.dd), .5).toFixed(1), ddMin: Math.min(...done.map((e) => e.dd)), ldMed: Math.round(q(done.map((e) => e.ld), .5)), up30: done.filter((e) => e.p[30] > 0).length, m30: +band.md[30].toFixed(1), m60: +band.md[A].toFixed(1) },
    live: live ? { p: live.p.filter((v) => v != null), t: live.t } : null };
}
export function dropDraft(ds, now) {
  const s = ds.s, sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const dj = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }, nr = ds.near;
  let ja = `BTC ${ds.D}日で ${sg(ds.cur)}\n${ds.D}日で${ds.th}%以上下げた過去${ds.n}回は、ここからどうなったか\n\n・さらに下げた幅 中央値 ${sg(s.ddMed)}(最大 ${sg(s.ddMin)})\n・底まで 中央値 ${s.ldMed}日\n・30日後に上だった ${s.up30}/${ds.n}回\n\n形が最も近い回 ${dj(nr.t)}→30日後 ${sg(nr.a30)}\n\n過去の記録で、今回も同じとは限りません`;
  let en = `BTC: ${sg(ds.cur)} in ${ds.D} days\nWhat happened next in the ${ds.n} past cases of a ${ds.th}%+ drop\n\n- Further drop: median ${sg(s.ddMed)} (worst ${sg(s.ddMin)})\n- Days to the low: median ${s.ldMed}\n- Higher after 30 days: ${s.up30}/${ds.n}\n\nClosest shape: ${enDate(nr.t)} → ${sg(nr.a30)} after 30d\n\nPast record. This time may differ.`;
  for (const [tg, te] of [['\n#ビットコイン #BTC', '\n#Bitcoin #BTC'], ['\n#BTC', '\n#BTC'], ['', '']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  const jt = new Date(now + JST), z = (v) => String(v).padStart(2, '0');
  ds = { ...ds, nj: dj(nr.t), ne: enDate(nr.t), at: `${jt.getUTCFullYear()}.${z(jt.getUTCMonth() + 1)}.${z(jt.getUTCDate())} ${z(jt.getUTCHours())}:${z(jt.getUTCMinutes())} JST` };
  return { id: 'drop:copy:' + now, sr: 'drop', man: 1, due: now, ja, en, img: { drop: ds } };
}

// v285: 今回と、形が最も近い過去の回。それぞれの時期に起きたこと(FOMC・米CPI・危機)を同じ横軸に並べる。原因とは書かない
//   日付は tools/weekmatch.mjs の FOMC_DAYS・CPI_DAYS の写し(公開側から読めないため)。2026-11-10 の米CPI(10月分)を足した
export const EV_FOMC = ['2017-09-20', '2017-11-01', '2017-12-13', '2018-01-31', '2018-03-21', '2018-05-02', '2018-06-13', '2018-08-01', '2018-09-26', '2018-11-08', '2018-12-19', '2019-01-30', '2019-03-20', '2019-05-01', '2019-06-19', '2019-07-31', '2019-09-18', '2019-10-30', '2019-12-11', '2020-01-29', '2020-04-29', '2020-06-10', '2020-07-29', '2020-09-16', '2020-11-05', '2020-12-16', '2021-01-27', '2021-03-17', '2021-04-28', '2021-06-16', '2021-07-28', '2021-09-22', '2021-11-03', '2021-12-15', '2022-01-26', '2022-03-16', '2022-05-04', '2022-06-15', '2022-07-27', '2022-09-21', '2022-11-02', '2022-12-14', '2023-02-01', '2023-03-22', '2023-05-03', '2023-06-14', '2023-07-26', '2023-09-20', '2023-11-01', '2023-12-13', '2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18', '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10', '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09'];
export const EV_CPI = ['2017-08-11', '2017-09-14', '2017-10-13', '2017-11-15', '2017-12-13', '2018-01-12', '2018-02-14', '2018-03-13', '2018-04-11', '2018-05-10', '2018-06-12', '2018-07-12', '2018-08-10', '2018-09-13', '2018-10-11', '2018-11-14', '2018-12-12', '2019-01-11', '2019-02-13', '2019-03-12', '2019-04-10', '2019-05-10', '2019-06-12', '2019-07-11', '2019-08-13', '2019-09-12', '2019-10-10', '2019-11-13', '2019-12-11', '2020-01-14', '2020-02-13', '2020-03-11', '2020-04-10', '2020-05-12', '2020-06-10', '2020-07-14', '2020-08-12', '2020-09-11', '2020-10-13', '2020-11-12', '2020-12-10', '2021-01-13', '2021-02-10', '2021-03-10', '2021-04-13', '2021-05-12', '2021-06-10', '2021-07-13', '2021-08-11', '2021-09-14', '2021-10-13', '2021-11-10', '2021-12-10', '2022-01-12', '2022-02-10', '2022-03-10', '2022-04-12', '2022-05-11', '2022-06-10', '2022-07-13', '2022-08-10', '2022-09-13', '2022-10-13', '2022-11-10', '2022-12-13', '2023-01-12', '2023-02-14', '2023-03-14', '2023-04-12', '2023-05-10', '2023-06-13', '2023-07-12', '2023-08-10', '2023-09-13', '2023-10-12', '2023-11-14', '2023-12-12', '2024-01-11', '2024-02-13', '2024-03-12', '2024-04-10', '2024-05-15', '2024-06-12', '2024-07-11', '2024-08-14', '2024-09-11', '2024-10-10', '2024-11-13', '2024-12-11', '2025-01-15', '2025-02-12', '2025-03-12', '2025-04-10', '2025-05-13', '2025-06-11', '2025-07-15', '2025-08-12', '2025-09-11', '2025-10-24', '2025-12-18', '2026-01-13', '2026-02-13', '2026-03-11', '2026-04-10', '2026-05-12', '2026-06-10', '2026-07-14', '2026-08-12', '2026-09-11', '2026-10-14', '2026-11-10'];
export function evWindow(t0, from, to, crises) {   // t0 = 0日目(UTC の日の始まり)。from〜to 日の出来事
  const D0 = Math.floor(t0 / DAY), out = [], add = (day, k, ja, en) => { const o = Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / DAY) - D0; if (o >= from && o <= to) out.push({ o, k, ja, en, day }); };
  EV_FOMC.forEach((d) => add(d, 'fomc', 'FOMC', 'FOMC')); EV_CPI.forEach((d) => add(d, 'cpi', '米CPI', 'US CPI'));
  (crises || []).forEach((c) => add(c.d, c.k === 'hack' ? 'hack' : 'fail', c.n + (c.k === 'hack' ? ' 流出' : ' 破綻'), c.n + (c.k === 'hack' ? ' hack' : ' collapse')));
  return out.sort((a, b) => a.o - b.o);
}
export function cmpDraft(k, ds, crises, now) {
  const n = k.length, c = k.map((x) => x[4]), nr = ds.near, i0 = k.findIndex((x) => x[0] === nr.t), D = ds.D, A = ds.A;
  const cur = []; for (let d = -D; d <= 0; d++) cur.push(+((c[n - 1 + d] / c[n - 1] - 1) * 100).toFixed(2));
  const past = []; for (let d = -D; d <= A; d++) past.push(i0 + d >= 0 && i0 + d < n ? +((c[i0 + d] / c[i0] - 1) * 100).toFixed(2) : null);
  const evN = evWindow(k[n - 1][0], -D, 0, crises), evP = evWindow(nr.t, -D, A, crises), pastPct = +((c[i0] / c[i0 - D] - 1) * 100).toFixed(1);
  const dj = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }, sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const uq = (a) => a.filter((v, i) => a.indexOf(v) === i), lj = (e) => uq(e.map((x) => x.ja)).join('・') || 'なし', le = (e) => uq(e.map((x) => x.en)).join(', ') || 'none';
  const pre = evP.filter((e) => e.o <= 0), aft = evP.filter((e) => e.o > 0);
  let ja = `今回の下げと、形が最も近い過去(${dj(nr.t)})\nそれぞれの時期に起きたこと\n\n今回 ${D}日 ${sg(ds.cur)}：${lj(evN)}\n当時 ${D}日 ${sg(pastPct)}：${lj(pre)}\n当時のその後60日：${lj(aft)}\n\n同じ時期に起きたことで、原因とは限りません`;
  let en = `This drop vs the closest past shape (${enDate(nr.t)})\nWhat happened around each\n\nNow, ${sg(ds.cur)} in ${D}d: ${le(evN)}\nThen, ${sg(pastPct)} in ${D}d: ${le(pre)}\nThe 60 days after: ${le(aft)}\n\nSame period, not necessarily the cause.`;
  for (const [tg, te] of [['\n#ビットコイン #BTC', '\n#Bitcoin #BTC'], ['\n#BTC', '\n#BTC'], ['', '']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  const jt = new Date(now + JST), z = (v) => String(v).padStart(2, '0');
  return { id: 'cmp:copy:' + now, sr: 'dropcmp', man: 1, due: now, ja, en, img: { cmp: { D, A, cur, past, evN, evP, curPct: ds.cur, pastPct, pj: dj(nr.t), pe: enDate(nr.t), px: [c[n - 1 - D], c[n - 1]], ppx: [c[i0 - D], c[i0]],
    at: `${jt.getUTCFullYear()}.${z(jt.getUTCMonth() + 1)}.${z(jt.getUTCDate())} ${z(jt.getUTCHours())}:${z(jt.getUTCMinutes())} JST` } } };
}
// v286: 暗号資産・AI の主要企業のトップが、事件や疑惑の中で退いた日の前後のBTC(v287: OpenAI を外して Celsius を入れた。OpenAI は5日後に復帰・取締役会との対立で、ほかと条件が違うため)(全部 BTC で比べる)。0日目 = 退任が伝えられた日(UTC)、前日の終値 = 0%。前後30日
//   選び方: 暗号資産か AI の主要企業で、トップが事件や疑惑の中で退いた日。性質は違う(破産・司法取引・辞任)ので「同じ種類」とは呼ばない
export const CEO_EV = [
  { day: '2022-09-27', ja: 'Celsius', en: 'Celsius', kj: 'マシンスキー氏が辞任(破産後)', ke: 'Mashinsky resigns (post-bankruptcy)', c: '#6ff0b4' },
  { day: '2022-11-11', ja: 'FTX', en: 'FTX', kj: '破産申請・SBF氏が辞任', ke: 'Bankruptcy, SBF resigns', c: '#ff86a8' },
  { day: '2023-11-21', ja: 'Binance', en: 'Binance', kj: 'CZ氏が辞任(司法取引)', ke: 'CZ resigns (plea deal)', c: '#ffc94d' },
  { day: '2026-11-12', ja: 'NVIDIA', en: 'NVIDIA', kj: 'ファン氏が辞任', ke: 'Huang resigns', c: '#a99cff', now: 1 }];
export function ceoDraft(k, now, R = 30) {
  const c = k.map((x) => x[4]), at = (day) => k.findIndex((x) => x[0] === Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)));
  const sg = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const ev = CEO_EV.map((e) => { const i = at(e.day); if (i < R + 1) return null; const b = c[i - 1], p = [];
    for (let d = -R; d <= R; d++) p.push(i + d < k.length ? +((c[i + d] / b - 1) * 100).toFixed(2) : null);
    const last = p.reduce((a, v, j) => v != null ? j : a, 0);
    return { ...e, p, d1: p[R + 1] ?? null, d0: p[R], d7: p[R + 7] ?? null, d30: p[2 * R] ?? null, pre: +((b / c[i - 1 - R] - 1) * 100).toFixed(1), lastD: last - R, lastV: p[last] }; }).filter(Boolean);
  const nv = ev.find((e) => e.now), past = ev.filter((e) => !e.now);
  let ja = `AI・暗号資産の主要企業のトップが\n事件や疑惑の中で退いた日のBTC\n\n` + past.map((e) => `${e.ja}(${e.day.slice(2, 7).replace('-', '/')}) 7日後${sg(e.d7)} 30日後${sg(e.d30)}`).join('\n') + (nv ? `\nNVIDIA(今回) ${nv.lastD}日目${sg(nv.lastV)}` : '') + `\n\n前日の終値＝0%。出来事の性質は違います\n過去の記録で、今回も同じとは限りません`;
  let en = `BTC when heads of top crypto/AI firms left amid scandal\n\n` + past.map((e) => `${e.en} (${e.day.slice(0, 7)}): 7d ${sg(e.d7)}, 30d ${sg(e.d30)}`).join('\n') + (nv ? `\nNVIDIA (now): day ${nv.lastD} ${sg(nv.lastV)}` : '') + `\n\nPrior close = 0%. Different kinds of events.\nPast record. This time may differ.`;
  for (const [tg, te] of [['\n#ビットコイン #NVIDIA', '\n#Bitcoin #NVIDIA'], ['\n#BTC', '\n#BTC'], ['', '']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  const jt = new Date(now + JST), z = (v) => String(v).padStart(2, '0');
  return { id: 'ceo:copy:' + now, sr: 'ceo', man: 1, due: now, ja, en, img: { ceo: { R, ev, at: `${jt.getUTCFullYear()}.${z(jt.getUTCMonth() + 1)}.${z(jt.getUTCDate())} ${z(jt.getUTCHours())}:${z(jt.getUTCMinutes())} JST` } } };
}
// v289: 30日の下落幅と、30日間のロング清算(建玉で割った割合)が、どちらも今回に近い過去の回。k = Binance 日足、liq = [[日, ロング, ショート]]、oi = [[日, 建玉USD]]
//   近い = 下落幅が ±5ポイント以内、かつ清算の割合が 0.7〜1.4倍。回どうしは30日以上あける。3回に満たなければ、差の小さい順に5回
export function liqStudy(k, liq, oi, D = 30, A = 30) {
  const dk = (t) => Math.floor(t / DAY), L = new Map(liq.map((x) => [dk(x[0]), x[1]])), O = new Map(oi.map((x) => [dk(x[0]), x[1]])), c = k.map((x) => x[4]), n = k.length;
  const pt = (i) => { const d0 = dk(k[i][0]); let s = 0, nl = 0, os = 0, no = 0; for (let j = d0 - D + 1; j <= d0; j++) { if (L.has(j)) { s += L.get(j); nl++; } if (O.has(j)) { os += O.get(j); no++; } } if (nl < D * .8) return null; return { i, t: k[i][0], r: (c[i] / c[i - D] - 1) * 100, q: s, usd: s }; };   // v292: 清算は額(ドル)で比べる(建玉は使わない)
  const pts = []; for (let i = D; i < n; i++) { const p = pt(i); if (p) pts.push(p); }
  const now = pts[pts.length - 1]; if (!now || dk(now.t) < dk(k[n - 1][0]) - 2) return null;
  const pool = pts.filter((p) => p.i + A < n), dist = (p) => Math.hypot((p.r - now.r) / 5, Math.log(p.q / now.q) / Math.log(1.4)), pick = (arr) => { const out = []; for (const p of arr.slice().sort((a, b) => dist(a) - dist(b))) { if (out.some((o) => Math.abs(o.i - p.i) < 30)) continue; out.push(p); } return out; };
  let m = pick(pool.filter((p) => Math.abs(p.r - now.r) <= 5 && p.q >= now.q * .7 && p.q <= now.q * 1.4)), strict = true;
  if (m.length < 3) { m = pick(pool).slice(0, 5); strict = false; }
  m = m.slice(0, 6).sort((a, b) => a.t - b.t);
  const path = (i, a, b) => { const o = []; for (let d = a; d <= b; d++) o.push(i + d >= 0 && i + d < n ? +((c[i + d] / c[i] - 1) * 100).toFixed(2) : null); return o; };
  const cases = m.map((p) => { let dd = 0, ld = 0; for (let d = 1; d <= A; d++) { const v = (k[p.i + d][3] / c[p.i] - 1) * 100; if (v < dd) { dd = v; ld = d; } } return { t: p.t, r: +p.r.toFixed(1), q: +p.q.toFixed(1), usd: p.usd, p: path(p.i, -D, A), a30: +((c[p.i + A] / c[p.i] - 1) * 100).toFixed(1), dd: +dd.toFixed(1), ld }; });
  const med = (a) => { a = a.slice().sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
  const qs = pts.map((p) => p.q).sort((x, y) => x - y), pr = (q) => { let lo = 0, hi = qs.length; while (lo < hi) { const md = (lo + hi) >> 1; qs[md] < q ? lo = md + 1 : hi = md; } return lo / qs.length * 100; };   // v290: 清算の多さを順位(下からの%)で見せる
  const bars = []; { const d0 = dk(k[n - 1][0]); for (let j = d0 - D + 1; j <= d0; j++) bars.push(L.has(j) ? L.get(j) : 0); }
  cases.forEach((x) => { x.pr = +pr(x.q).toFixed(1); });
  // v291: 清算のランキング。平常時 = 30日の清算(建玉比)の中央値。山 = 多い順に、30日以上あけて選ぶ(直近30日は今回なので除く)
  const qm = qs[qs.length >> 1] || 1, peaks = []; for (const p of pts.filter((p) => p.i < n - D).sort((a, b) => b.q - a.q)) { if (peaks.some((o) => Math.abs(o.i - p.i) < 30)) continue; peaks.push(p); }
  const rank = 1 + peaks.filter((p) => p.q > now.q).length, top = peaks.slice(0, 10).map((p) => ({ t: p.t, m: p.q, r: +p.r.toFixed(1), c: cases.findIndex((x) => Math.abs(x.t - p.t) <= 20 * DAY) }));
  return { rank, top, nPeaks: peaks.length, D, A, strict, since: pts[0].t, now: { t: now.t, r: +now.r.toFixed(1), q: now.q, m: now.q, med: qm, pr: +pr(now.q).toFixed(1), usd: now.usd, p: path(n - 1, -D, 0), bars }, cases,
    up: cases.filter((x) => x.a30 > 0).length, ddMed: cases.length ? +med(cases.map((x) => x.dd)).toFixed(1) : null, scat: pts.filter((_, j) => j % 2 === 0).map((p) => [+p.r.toFixed(1), +pr(p.q).toFixed(1)]) };
}
export function liqDraft(st, now) {
  const sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%', dj = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }, y0 = new Date(st.since).getUTCFullYear(), N = st.cases.length;
    const rj = (v) => v >= 50 ? `上位${Math.max(1, Math.round(100 - v))}%` : `下位${Math.max(1, Math.round(v))}%`, re2 = (v) => v >= 50 ? `top ${Math.max(1, Math.round(100 - v))}%` : `bottom ${Math.max(1, Math.round(v))}%`;
  const mk = (nc) => { const cs = st.cases.slice(-nc), more = N - nc;
    const ja = `BTC 30日間のロング清算ランキングと、その後の推移\n今回 $${(st.now.usd / 1e9).toFixed(1)}B は${y0}年以降で${st.rank}位(同じ30日のBTC ${sg(st.now.r)})\n清算額と下落幅が今回に${st.strict ? '近い' : '最も近い'}過去${N}回の30日後${more ? '(新しい' + nc + '回)' : ''}\n\n` + cs.map((x) => `${dj(x.t)} ${sg(x.a30)}`).join('\n') + `\n\n${N}回中、30日後に上 ${st.up}回\n過去の記録で、今回も同じとは限りません`;
    const en = `BTC 30-day long liquidation ranking & what came next\nNow: $${(st.now.usd / 1e9).toFixed(1)}B, #${st.rank} since ${y0} (BTC ${sg(st.now.r)})\n${N} past periods ${st.strict ? 'close' : 'closest'} on liquidations & drop, 30d later${more ? ' (latest ' + nc + ')' : ''}:\n\n` + cs.map((x) => `${enDate(x.t)} ${sg(x.a30)}`).join('\n') + `\n\nHigher 30d later: ${st.up} of ${N}\nPast record. This time may differ.`;
    return [ja, en]; };
  let nc = N, [ja, en] = mk(nc); while (nc > 2 && (xlen(ja) > 280 || xlen(en) > 280)) [ja, en] = mk(--nc);
  for (const [tg, te] of [['\n#ビットコイン #清算', '\n#Bitcoin #Liquidations'], ['\n#BTC', '\n#BTC'], ['', '']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  const jt = new Date(now + JST), z = (v) => String(v).padStart(2, '0');
  return { id: 'liqcmp:copy:' + now, sr: 'liqcmp', man: 1, due: now, ja, en, img: { lq: { ...st, y0, cj: st.cases.map((x) => dj(x.t)), ce: st.cases.map((x) => enDate(x.t)), at: `${jt.getUTCFullYear()}.${z(jt.getUTCMonth() + 1)}.${z(jt.getUTCDate())} ${z(jt.getUTCHours())}:${z(jt.getUTCMinutes())} JST` } } };
}
// v299: 大量清算の後のBTC(ショック後のBTC と同じ型)。30日間のロング清算が今回と同規模だった過去の時期を3つ。清算の山の日 = 0日目、30日前の終値 = 0%。「清算が積み上がる前の価格」に戻るまでの日数
export function liqShock(k, liq, crises, D = 30, A = 90, anchor = null) {   // v300: anchor(YYYY-MM-DD)を渡すと、その日を清算の山(0日目)に固定して、今日まで線を伸ばす
  const dk = (t) => Math.floor(t / DAY), L = new Map(liq.map((x) => [dk(x[0]), x[1]])), c = k.map((x) => x[4]), n = k.length;
  const sum = (i) => { const d0 = dk(k[i][0]); let s = 0, m = 0; for (let j = d0 - D + 1; j <= d0; j++) if (L.has(j)) { s += L.get(j); m++; } return m >= D * .8 ? s : null; };
  const pts = []; for (let i = D; i < n; i++) { const s = sum(i); if (s != null) pts.push({ i, s }); }
  let now = pts[pts.length - 1]; if (!now || now.i < n - 3) return null;
  if (anchor) { const ta = Date.UTC(+anchor.slice(0, 4), +anchor.slice(5, 7) - 1, +anchor.slice(8, 10)), pa = pts.find((p) => k[p.i][0] === ta); if (!pa) return null; now = pa; }
  const peaks = []; for (const p of pts.filter((p) => p.i < now.i - 45).sort((a, b) => b.s - a.s)) { if (peaks.some((o) => Math.abs(o.i - p.i) < 45)) continue; peaks.push(p); }
  const near = peaks.slice().sort((a, b) => Math.abs(Math.log(a.s / now.s)) - Math.abs(Math.log(b.s / now.s))).slice(0, 3).sort((a, b) => a.i - b.i);
  const dj = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}`; };
  const nm = (t) => { const cs = (crises || []).filter((x) => { const o = Math.round((Date.UTC(+x.d.slice(0, 4), +x.d.slice(5, 7) - 1, +x.d.slice(8, 10)) - t) / DAY); return o >= -D - 5 && o <= 5; }); return cs.length ? cs[cs.length - 1].n : ''; };
  const cases = near.map((p) => { const b = c[p.i - D], days = []; for (let d = -D; d <= A && p.i + d < n; d++) days.push([d, +((c[p.i + d] / b - 1) * 100).toFixed(2)]);
    let rec = null; for (let d = 1; p.i + d < n; d++) if (c[p.i + d] >= b) { rec = d; break; }
    return { t: k[p.i][0], s: p.s, days, d0: +((c[p.i] / b - 1) * 100).toFixed(1), rec, ym: dj(k[p.i][0]), name: nm(k[p.i][0]) }; });
  const ia = now.i, b = c[ia - D], cur = []; for (let d = -D; d <= A && ia + d < n; d++) cur.push([d, +((c[ia + d] / b - 1) * 100).toFixed(2)]);
  const dn = cur[cur.length - 1][0]; let rec = null; for (let d = 1; ia + d < n && d <= A; d++) if (c[ia + d] >= b) { rec = d; break; }
  cases.forEach((x) => { const q = x.days.find((z) => z[0] === dn); x.atN = q ? q[1] : null; });
  return { D, A, anchor, n: anchor ? dn : null, now: { t: k[ia][0], s: now.s, days: cur, d0: cur[cur.length - 1][1], px: [b, c[Math.min(n - 1, ia + Math.max(0, dn))]], rec }, cases, since: k[pts[0].i][0], nPeaks: peaks.length };
}
export function liqShockDraft(st, now) {
  const B = (v) => '$' + (v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : Math.round(v / 1e6) + 'M'), sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%', y0 = new Date(st.since).getUTCFullYear();
  const rj = (x) => x.rec == null ? 'まだ戻っていない' : x.rec + '日', re = (x) => x.rec == null ? 'not yet' : x.rec + 'd';
  let ja = `BTC 30日間のロング清算 ${B(st.now.s)}\n同規模の清算があった過去${st.cases.length}回、清算が積み上がる前の価格に戻るまで\n\n` + st.cases.map((x) => `・${x.ym}${x.name ? '(' + x.name + ')' : ''} ${B(x.s)}→${rj(x)}`).join('\n') + `\n\n今回は30日で ${sg(st.now.d0)}\n過去の記録。予測ではありません`;
  let en = `BTC: ${B(st.now.s)} long liquidations in 30 days\n${st.cases.length} past periods of similar size: days to regain the pre-liquidation price\n\n` + st.cases.map((x) => `- ${x.ym}${x.name ? ' (' + x.name + ')' : ''} ${B(x.s)}: ${re(x)}`).join('\n') + `\n\nNow: ${sg(st.now.d0)} in 30 days\nPast record, not a forecast.`;
  for (const [tg, te] of [['\n#ビットコイン #BTC', '\n#Bitcoin #BTC'], ['\n#BTC', '\n#BTC'], ['', '']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  return { id: 'liqshock:copy:' + now, sr: 'liqshock', man: 1, due: now, ja, en, img: { ls: { ...st, y0 } } };
}

// v300: 大量清算の後のBTC を毎日 18:30(日本時間)に。0日目 = LIQSHOCK.anchor に固定して、1日ずつ線を伸ばす。前の価格に戻った日か90日目で終わり。英語は出さない(ショック後のBTC と同じ)
export const LIQSHOCK = { anchor: '2026-11-14', at: 18.5 * H, end: 90, gap: 2 * H, mile: [7, 14, 30, 60, 90] };   // v316: 毎日ではなく節目の日(mile)と、元の価格に戻った日だけ出す
export function liqShockDay(st, now) {
  const B = (v) => '$' + (v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : Math.round(v / 1e6) + 'M'), sg = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%', y0 = new Date(st.since).getUTCFullYear(), N = st.n;
  const ad = new Date(st.now.t), aj = `${ad.getUTCMonth() + 1}/${ad.getUTCDate()}`, rj = (x) => x.rec == null ? 'まだ' : x.rec + '日';
  // v322: 1行目に今の数字、2行目に過去との答え
  const pos = st.cases.filter((x) => x.atN != null && x.atN > 0).length, nN = st.cases.filter((x) => x.atN != null).length;
  const head = st.now.rec != null ? `${B(st.now.s)}の大量清算から${N}日、BTCは清算前の価格に戻った` : `${B(st.now.s)}の大量清算から${N}日、BTCは清算前の価格から${sg(st.now.d0)}`;
  const mk = (cs) => `${head}\n同じ規模の過去${nN}回、${N}日目に清算前の価格を上回っていたのは${pos}回\n\n` + cs.map((x) => `・${x.ym}${x.name ? '(' + x.name + ')' : ''} ${sg(x.atN)}・${x.rec == null ? 'まだ戻っていない' : x.rec + '日で戻った'}`).join('\n') + `\n\n過去の記録。予測ではありません`;
  let ja = mk(st.cases); if (xlen(ja) > 280) ja = mk(st.cases.map((x) => ({ ...x, name: '' })));
  for (const tg of ['\n#ビットコイン #BTC', '\n#BTC', '']) if (xlen(ja + tg) <= 280) { ja += tg; break; }
  const day = Math.floor((now + JST) / DAY) * DAY - JST;
  return { id: 'liqshock:' + isoDay(now), sr: 'liqshock', due: day + LIQSHOCK.at, langs: ['ja'], ja, en: '', img: { ls: { ...st, y0 } } };
}

// v301: Coinbase プレミアムの検証。cb = [[日, 終値]](Coinbase BTC-USD)、bn = [[日, 終値]](Binance BTCUSDT)。プレミアム = (Coinbase − Binance) ÷ Binance。連続マイナスの区間を長い順に
export function cbPremium(cb, bn, k) {
  const dk = (t) => Math.floor(t / DAY), B = new Map(bn.map((x) => [dk(x[0]), x[1]])), K = new Map((k || []).map((x, i) => [dk(x[0]), i]));
  const pr = cb.filter((x) => B.has(dk(x[0]))).map((x) => [x[0], (x[1] / B.get(dk(x[0])) - 1) * 100]).sort((a, b) => a[0] - b[0]);
  const runs = []; let st = null;
  pr.forEach(([t, v], i) => { if (v < 0) { if (st == null) st = i; } else if (st != null) { runs.push([st, i - 1]); st = null; } });
  if (st != null) runs.push([st, pr.length - 1]);
  const close = (t) => { const i = K.get(dk(t)); return i == null ? null : k[i][4]; }, after = (t, d) => { const i = K.get(dk(t)); return i == null || !k[i + d] ? null : k[i + d][4]; };
  const R = runs.map(([a, b]) => { const t0 = pr[a][0], t1 = pr[b][0], c0 = close(t0), c1 = close(t1), c30 = after(t1, 30); return { from: t0, to: t1, days: b - a + 1, avg: pr.slice(a, b + 1).reduce((s2, x) => s2 + x[1], 0) / (b - a + 1), during: c0 && c1 ? (c1 / c0 - 1) * 100 : null, after30: c1 && c30 ? (c30 / c1 - 1) * 100 : null, open: b === pr.length - 1 }; });
  const cur = R.length && R[R.length - 1].open ? R[R.length - 1] : null;
  return { pr, runs: R.slice().sort((a, b) => b.days - a.days), cur, last: pr[pr.length - 1] };
}
// v302: Coinbase プレミアムの連続マイナス(2020年以降。2018〜19年は USDT の価格のずれで Binance の価格が歪むため除く)。日足の終値で比べる(CoinGlass の数え方とは違う)
//   連続マイナスの始まった日を0日目にそろえ、その日の前日の終値＝0%。今回と、過去の長い3回。過去の回は終わった日と、その30日後
export function cbStudy(cb, bn, k, from = '2020-01-01', top = 3) {
  const t0 = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10)), r = cbPremium(cb.filter((x) => x[0] >= t0), bn, k);
  if (!r.cur) return { none: true, last: r.last };
  const dk = (t) => Math.floor(t / DAY), K = new Map(k.map((x, i) => [dk(x[0]), i])), c = k.map((x) => x[4]);
  const path = (from2, len, ext) => { const i = K.get(dk(from2)); if (i == null || i < 1) return []; const b = c[i - 1], o = [[0, 0]]; for (let d = 0; d < len + ext && i + d < c.length; d++) o.push([d + 1, +((c[i + d] / b - 1) * 100).toFixed(2)]); return o; };   // 0日目 = 前日の終値、1日目 = 始まった日
  const past = r.runs.filter((x) => !x.open).slice(0, top).sort((a, b) => a.from - b.from).map((x) => ({ ...x, days2: path(x.from, x.days, 30) }));
  const rank = 1 + r.runs.filter((x) => !x.open && x.days > r.cur.days).length;
  return { since: t0, cur: { ...r.cur, days2: path(r.cur.from, r.cur.days, 0) }, past, rank, n: r.runs.length, last: r.last };
}
export function cbDraft(st, now) {
  const ym = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}`; }, m = (t) => new Date(t).getUTCMonth() + 1, sg = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const y0 = new Date(st.since).getUTCFullYear(), c = st.cur, best = st.past.slice().sort((a, b) => b.days - a.days)[0];
  const rk = st.rank === 1 ? `${y0}年以降で最長` : `${y0}年以降で${st.rank}番目の長さ(1位は${ym(best.from)}〜${m(best.to)}月の${best.days}日)`;
  const rke = st.rank === 1 ? `the longest since ${y0}` : `#${st.rank} since ${y0} (record: ${best.days} days, ${ym(best.from)}–${m(best.to)})`;
  let ja = `Coinbaseプレミアム ${c.days}日連続マイナス\n${rk}\n\n過去の長い回が終わった後30日のBTC\n` + st.past.map((x) => `・${ym(x.from)}〜${m(x.to)}月 ${x.days}日→${sg(x.after30)}`).join('\n') + `\n\n今回の${c.days}日間のBTC ${sg(c.during)}\n日足の終値で比較。予測ではありません`;
  let en = `Coinbase premium: negative for ${c.days} straight days\n${rke}\n\nBTC 30 days after past long streaks ended\n` + st.past.map((x) => `- ${ym(x.from)}–${m(x.to)}: ${x.days}d → ${sg(x.after30)}`).join('\n') + `\n\nBTC over these ${c.days} days: ${sg(c.during)}\nDaily closes. Not a forecast.`;
  for (const [tg, te] of [['\n#ビットコイン #BTC', '\n#Bitcoin #BTC'], ['\n#BTC', '\n#BTC'], ['', '']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  return { id: 'cbprem:copy:' + now, sr: 'cbprem', man: 1, due: now, ja, en, img: { cb: { ...st, y0, cy: st.past.map((x) => ym(x.from) + '〜' + m(x.to) + '月'), ce: st.past.map((x) => ym(x.from) + '–' + m(x.to)) } } };
}
// v303: 最高値の半値。前の2回の下げ相場(2017/12・2021/11 の最高値)と今回を、最高値の日からの日数でそろえ、最高値からの下げ(%)を重ねる。半値を割った日(安値)と底(終値の最安)に印
export const HALF_CYC = [{ k: '2018', ja: '2017→18年', en: '2017–18', a: '2017-09-01', b: '2019-06-30' }, { k: '2022', ja: '2021→22年', en: '2021–22', a: '2021-01-01', b: '2023-06-30' }, { k: 'now', ja: '今回', en: 'Now', a: '2024-01-01', b: '2099-01-01' }];
export function halfStudy(k) {
  const U = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return HALF_CYC.map((cy) => { const idx = k.map((x, i) => i).filter((i) => k[i][0] >= U(cy.a) && k[i][0] <= U(cy.b)); if (!idx.length) return null;
    let ia = idx[0]; for (const i of idx) if (k[i][2] > k[ia][2]) ia = i; const ath = k[ia][2];
    let rec = null; if (cy.k !== 'now') { for (let i = ia + 1; i < k.length; i++) if (k[i][4] >= ath) { rec = { d: i - ia, t: k[i][0] }; break; } }   // v304: 最高値(日足の高値)を終値で取り戻した日
    const end = cy.k === 'now' ? k.length - 1 : Math.min(k.length - 1, ia + (rec ? rec.d + 30 : 1300)), path = []; let half = null, ib = ia;
    for (let i = ia; i <= end; i++) { path.push([i - ia, +((k[i][4] / ath - 1) * 100).toFixed(2)]); if (half == null && k[i][3] <= ath / 2) half = { d: i - ia, t: k[i][0], low: k[i][3] }; if ((!rec || i - ia <= rec.d) && k[i][4] < k[ib][4]) ib = i; }
    const bot = { d: ib - ia, t: k[ib][0], pct: +((k[ib][4] / ath - 1) * 100).toFixed(1), px: k[ib][4] };
    return { ...cy, ath, athT: k[ia][0], path, half, bot, rec, now: k[end][4], nowPct: +((k[end][4] / ath - 1) * 100).toFixed(1), lowPct: +((Math.min(...k.slice(ia, end + 1).map((x) => x[3])) / ath - 1) * 100).toFixed(1), last: end - ia }; }).filter(Boolean);
}
export function halfDraft(cs, now) {
  const cur = cs.find((x) => x.k === 'now'), past = cs.filter((x) => x.k !== 'now'), $ = (v) => '$' + Math.round(v).toLocaleString('en-US'), ym = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  const hj = cur.half ? `BTC、最高値の半値割れ(最高値から${cur.half.d}日)` : `BTC 最高値から ${cur.nowPct}%(半値まで あと${(-50 - cur.nowPct).toFixed(1)}%)`;
  const he = cur.half ? `BTC below half its ATH (${cur.half.d} days after the peak)` : `BTC ${cur.nowPct}% from its ATH`;
  const mk = (lowLine) => {
    const ja = `${hj}\n` + (lowLine ? `最高値 ${$(cur.ath)}(${ym(cur.athT)})→安値 ${$(cur.ath * (1 + cur.lowPct / 100))}\n` : '') + `\n前の2回は\n` + past.map((x) => `・${x.ja} 半値${x.half ? x.half.d + '日目' : 'なし'}→底${x.bot.pct}%(${x.bot.d}日目)→最高値へ${x.rec ? x.rec.d + '日目' : 'まだ'}`).join('\n') + `\n\n今回は最高値から${cur.last}日目\n過去の記録。予測ではありません`;
    const en = `${he}\n` + (lowLine ? `ATH ${$(cur.ath)} (${ym(cur.athT)}) → low ${$(cur.ath * (1 + cur.lowPct / 100))}\n` : '') + `\nPrevious two:\n` + past.map((x) => `- ${x.en}: half d${x.half ? x.half.d : '—'}, bottom ${x.bot.pct}% d${x.bot.d}, ATH again d${x.rec ? x.rec.d : '—'}`).join('\n') + `\n\nNow: day ${cur.last}. Past record, not a forecast.`;
    return [ja, en]; };
  let [ja, en] = mk(true); if (xlen(ja) > 280 || xlen(en) > 280) [ja, en] = mk(false);
  for (const [tg, te] of [['\n#ビットコイン #BTC', '\n#Bitcoin #BTC'], ['\n#BTC', '\n#BTC'], ['', '']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  return { id: 'half:copy:' + now, sr: 'half', man: 1, due: now, ja, en, img: { half: { cs } } };
}

// v305: 恐怖指数(alternative.me Fear & Greed)が今の値以下になった過去の回と、その後60日のBTC。回 = 指数が今の値以下になった最初の日(前の回から30日以上あける)。0日目の終値＝0%
export function fngStudy(fng, k, crises, A = 60, TH = 24, MAXD = 600) {   // v306: 回の区切りは「極度の恐怖(24以下)に入った日」に固定(今の値ではなく)
  const dk = (t) => Math.floor(t / DAY), F = new Map(fng.map((x) => [dk(x[0]), x[1]])), K = new Map(k.map((x, i) => [dk(x[0]), i])), c = k.map((x) => x[4]);
  const last = fng.reduce((a, x) => x[0] > a[0] ? x : a, fng[0]), th = TH, days = [...F.keys()].sort((a, b) => a - b);
  const ep = []; let lastLow = -1e9; for (const d of days) { if (F.get(d) <= th) { if (d - lastLow > 30) ep.push(d); lastLow = d; } }   // 新しい回 = 30日を超えてその水準より上にいた後、また下がった日
  const nowD = dk(last[0]), curD = ep.length && nowD - ep[ep.length - 1] <= 90 ? ep[ep.length - 1] : nowD, past = ep.filter((d) => d !== curD);
  const nm = (t) => { const cs = (crises || []).filter((x) => Math.abs(Math.round((Date.UTC(+x.d.slice(0, 4), +x.d.slice(5, 7) - 1, +x.d.slice(8, 10)) - t) / DAY)) <= 14); return cs.length ? cs[cs.length - 1].n : ''; };
  const one = (d0, len) => { const i = K.get(d0); if (i == null) return null; const b = c[i];
    // v307: 元値(0日目の終値)に戻るまで。底は「元値に戻るまで」の間の最安。線は戻った日の10日後まで(最長 MAXD 日)
    let rec = null; for (let d = 1; i + d < c.length && d <= MAXD; d++) if (c[i + d] >= b && d > 1) { const lowBefore = Math.min(...k.slice(i + 1, i + d).map((x) => x[3])); if (lowBefore < b) { rec = d; break; } }
    let mn = 0, md = 0; for (let d = 1; d <= (rec || MAXD) && i + d < c.length; d++) { const v = (k[i + d][3] / b - 1) * 100; if (v < mn) { mn = v; md = d; } }
    const L2 = rec ? Math.min(MAXD, rec + 10) : MAXD, p = []; for (let d = 0; d <= L2 && i + d < c.length; d++) p.push([d, +((c[i + d] / b - 1) * 100).toFixed(2)]);
    return { t: k[i][0], v: F.get(d0), p, dd: +mn.toFixed(1), ld: md, rec, el: c.length - 1 - i /* v310: 今日までの日数 */, a30: i + 30 < c.length ? +((c[i + 30] / b - 1) * 100).toFixed(1) : null, name: nm(k[i][0]) }; };
  const cases = past.map((d) => one(d, A)).filter((x) => x && x.a30 != null), cur = one(curD, A), recN = cases.filter((x) => x.rec != null).length;
  const med = (a) => { a = a.filter((v) => v != null).sort((x, y) => x - y); if (!a.length) return null; const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
  return { th, nowV: last[1], cls: last[2] || '', cur, cases, recN, MAXD, up30: cases.filter((x) => x.a30 > 0).length, ddMed: med(cases.map((x) => x.dd)), recMed: med(cases.map((x) => x.rec)), since: fng[fng.length - 1] ? Math.min(...fng.map((x) => x[0])) : 0, A };
}
export function fngDraft(st, now) {
  const ym = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}`; }, sg = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%', y0 = new Date(st.since).getUTCFullYear(), N = st.cases.length;
  const JA = { 'Extreme Fear': '極度の恐怖', Fear: '恐怖', Neutral: '中立', Greed: '強欲', 'Extreme Greed': '極度の強欲' }, labE = st.cls || '', lab = JA[labE] || labE;   // v306: 区分は alternative.me の value_classification をそのまま
  const show = st.cases.slice().sort((a, b) => b.t - a.t).slice(0, 10).sort((a, b) => a.t - b.t);   // v309: 画像の色付きの線は新しい10回(本文は入るだけ)
  // v312: 本文は戻るまでの日数(中央値・平均・何日以内に何回・最長)と、まだ戻っていない回
  const rc = st.cases.filter((x) => x.rec != null), avg = rc.length ? Math.round(rc.reduce((a, x) => a + x.rec, 0) / rc.length) : null, w7 = rc.filter((x) => x.rec <= 7).length, w30 = rc.filter((x) => x.rec <= 30).length;
  const lg = rc.slice().sort((a, b) => b.rec - a.rec)[0], nb = st.cases.filter((x) => x.rec == null), nm = (x, e) => ym(x.t) + (x.name ? (e ? ' (' + x.name + ')' : '(' + x.name + ')') : '');
  const mk = (o) => {
    const ja = [`恐怖指数 ${st.nowV}(${lab})`, `${y0}年以降、極度の恐怖(${st.th}以下)に入った過去${N}回`, '', `入った日の価格(元値)に戻った ${st.recN}回`,
      `・戻るまで 中央値${st.recMed == null ? '—' : Math.round(st.recMed) + '日'}/平均${avg == null ? '—' : avg + '日'}`, o.w ? `・7日以内 ${w7}回/30日以内 ${w30}回` : null, o.l && lg ? `・最長 ${nm(lg)} ${lg.rec}日` : null,
      `・その間の底 中央値${sg(st.ddMed)}`, nb.length ? '\nまだ戻っていない：' + nb.map((x) => nm(x) + (x.el < st.MAXD ? `(${x.el}日目)` : `(${st.MAXD}日超)`)).join('、') : null, '', '過去の記録。予測ではありません'];
    const en = [`Fear & Greed ${st.nowV} (${labE})`, `Since ${y0}: ${N} entries into Extreme Fear (≤${st.th})`, '', `Back to the entry price: ${st.recN}/${N}`,
      `- Days to get back: median ${st.recMed == null ? '—' : Math.round(st.recMed) + 'd'}, avg ${avg == null ? '—' : avg + 'd'}`, o.w ? `- ≤7d: ${w7} / ≤30d: ${w30}` : null, o.l && lg ? `- Longest: ${nm(lg, 1)} ${lg.rec}d` : null,
      `- Low in between, median ${sg(st.ddMed)}`, nb.length ? '\nNot back yet: ' + nb.map((x) => nm(x, 1) + (x.el < st.MAXD ? ` (day ${x.el})` : ` (${st.MAXD}d+)`)).join(', ') : null, '', 'Past record. Not a forecast.'];
    return [ja, en].map((a) => a.filter((v) => v != null).join('\n')); };
  let ja, en; for (const o of [{ w: 1, l: 1 }, { w: 0, l: 1 }, { w: 0, l: 0 }]) { [ja, en] = mk(o); if (xlen(ja) <= 280 && xlen(en) <= 280) break; }
  for (const [tg, te] of [['\n#ビットコイン #BTC', '\n#Bitcoin #BTC'], ['\n#BTC', '\n#BTC'], ['', '']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  return { id: 'fng:copy:' + now, sr: 'fng', man: 1, due: now, ja, en, img: { fng: { ...st, y0, lab, labE, show } } };
}
// v313: V字リバウンド。今の「30日で大きく下げた底 → そこから戻した」と同じ形の過去の回を探し、その後30日で前の底を割ったかを数える。
//   k = Binance 日足 [[t,o,h,l,c]] 古い順。x = 底からの日数、y = 底(その日の安値)からの%。
export function vStudy(k, crises, A = 30) {
  const n = k.length, lo = k.map((x) => x[3]), hi = k.map((x) => x[2]), c = k.map((x) => x[4]), last = n - 1;
  const nm = (t) => { const cs = (crises || []).filter((x) => Math.abs(Math.round((Date.UTC(+x.d.slice(0, 4), +x.d.slice(5, 7) - 1, +x.d.slice(8, 10)) - t) / DAY)) <= 21); return cs.length ? cs[cs.length - 1].n : ''; };
  const mxH = (a, b) => { let m = 0; for (let i = Math.max(0, a); i <= b; i++) m = Math.max(m, hi[i]); return m; };
  let bi = last; for (let i = last; i >= last - 21 && i > 0; i--) if (lo[i] < lo[bi]) bi = i;   // 今の底 = 直近21日の最安
  const dn = last - bi, bounce = (c[last] / lo[bi] - 1) * 100, drop = (lo[bi] / mxH(bi - 30, bi) - 1) * 100;
  let B = Math.max(2, Math.floor(bounce)), DR = Math.max(10, Math.floor(-drop / 5) * 5);
  const path = (j, len) => { const p = []; for (let d = 0; d <= len && j + d < n; d++) p.push([d, +((c[j + d] / lo[j] - 1) * 100).toFixed(2)]); return p; };
  const scan = () => { const cases = []; let skip = -1;
  for (let i = 31; i < last - 2; i++) { if (i <= skip) continue;
    let j = i; for (let q = i; q >= i - 21 && q > 30; q--) if (lo[q] < lo[j]) j = q;
    if ((j === i && dn > 0) || (lo[j] / mxH(j - 30, j) - 1) * 100 > -DR || (c[i] / lo[j] - 1) * 100 < B) continue;
    let brk = null; for (let d = 1; d <= A && i + d < n; d++) if (lo[i + d] < lo[j]) { brk = i + d - j; break; }
    const ok = i + A <= last || brk != null; if (ok) cases.push({ t: k[j][0], ti: k[i][0], dn: i - j, brk, a30: i + A <= last ? +((c[i + A] / c[i] - 1) * 100).toFixed(1) : null, up: +((c[i] / lo[j] - 1) * 100).toFixed(1), drop: +((lo[j] / mxH(j - 30, j) - 1) * 100).toFixed(1), p: path(j, i - j + A), name: nm(k[j][0]) });
    skip = i + 45; }
  return cases; };
  // 過去の回が8回に届くまで、下げ幅を5%ずつ(最小10%)、戻し幅を2%ずつ(最小2%)ゆるめる
  let cases = scan(); while (cases.length < 8 && (DR > 10 || B > 2)) { if (DR > 10) DR -= 5; else B = Math.max(2, B - 2); cases = scan(); }
  const med = (a) => { a = a.filter((v) => v != null).sort((x, y) => x - y); if (!a.length) return null; const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
  const br = cases.filter((x) => x.brk != null);
  return { B, DR, A, bounce: +bounce.toFixed(1), drop: +drop.toFixed(1), dn, low: lo[bi], lowT: k[bi][0], nowP: c[last], cur: { t: k[bi][0], p: path(bi, dn) }, cases, brkN: br.length, brkMed: med(br.map((x) => x.brk)), a30Med: med(cases.filter((x) => x.brk == null).map((x) => x.a30)), since: k[0][0] };
}
export function vDraft(st, now) {
  const ym = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}`; }, md = (t) => { const d = new Date(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }, sg = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%', y0 = new Date(st.since).getUTCFullYear(), N = st.cases.length, ok = N - st.brkN;
  const $ = (v) => '$' + Math.round(v).toLocaleString('en-US'), show = st.cases.slice().sort((a, b) => b.t - a.t).slice(0, 10).sort((a, b) => a.t - b.t);
  const mk = (m) => { const rc = m ? show.slice(-m).reverse() : [];
    const ja = [`BTC 底から${sg(st.bounce)}(${st.dn ? md(st.lowT) + 'の' + $(st.low) + 'から' + st.dn + '日' : '今日の安値' + $(st.low) + 'から'})`, `${y0}年以降、30日で${st.DR}%以上下げた後に底から${st.B}%以上戻した過去${N}回`, '', `その後30日で前の底を割った ${st.brkN}回`, st.brkN ? `・割ったのは 中央値で底から${Math.round(st.brkMed)}日目` : null, `割らなかった ${ok}回`, ok && st.a30Med != null ? `・30日後 中央値${sg(st.a30Med)}` : null,
      m ? '' : null, ...rc.map((x) => `・${ym(x.t)}${x.name ? '(' + x.name + ')' : ''} ${x.brk != null ? x.brk + '日目に底割れ' : '割らず'}`), '', '過去の記録。予測ではありません'];
    const en = [`BTC ${sg(st.bounce)} off the low (${$(st.low)}${st.dn ? ' on ' + md(st.lowT) + ', ' + st.dn + 'd ago' : ', today'})`, `Since ${y0}: ${N} times BTC bounced ${st.B}%+ off a low after a ${st.DR}%+ 30-day drop`, '', `Broke that low within 30 days: ${st.brkN}`, st.brkN ? `- median: day ${Math.round(st.brkMed)} from the low` : null, `Held the low: ${ok}`, ok && st.a30Med != null ? `- 30 days later, median ${sg(st.a30Med)}` : null,
      m ? '' : null, ...rc.map((x) => `- ${ym(x.t)}${x.name ? ' (' + x.name + ')' : ''}: ${x.brk != null ? 'broke on day ' + x.brk : 'held'}`), '', 'Past record. Not a forecast.'];
    return [ja, en].map((a) => a.filter((v) => v != null).join('\n')); };
  let m = Math.min(3, show.length), [ja, en] = mk(m); while (m > 0 && (xlen(ja) > 280 || xlen(en) > 280)) [ja, en] = mk(--m);
  if (m === 1) [ja, en] = mk(0);   // 1回だけの箇条書きは出さない
  for (const [tg, te] of [['\n#ビットコイン #BTC', '\n#Bitcoin #BTC'], ['\n#BTC', '\n#BTC'], ['', '']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  return { id: 'vreb:copy:' + now, sr: 'vreb', man: 1, due: now, ja, en, img: { vreb: { ...st, y0, show } } };
}
// v317: 今に似ている過去(調べる用)。物差しごとの近さを順位(0=一番近い〜1)にして平均し、総合で近い日を出す。
//   k = Binance 日足 [[t,o,h,l,c]] 古い順、fng = [[t,値,分類]](無くてもよい)。
export function likeStudy(k, fng, crises, AFT = 60) {
  const n = k.length - 1, c = k.map((x) => x[4]), hi = k.map((x) => x[2]), lo = k.map((x) => x[3]), lc = c.map(Math.log), dk = (t) => Math.floor(t / DAY);
  const F = new Map((fng || []).map((x) => [dk(x[0]), x[1]]));
  const corr = (a, b, L) => { let sa = 0, sb = 0; for (let q = 0; q <= L; q++) { sa += lc[a - q]; sb += lc[b - q]; } sa /= L + 1; sb /= L + 1; let xy = 0, xx = 0, yy = 0; for (let q = 0; q <= L; q++) { const x = lc[a - q] - sa, y = lc[b - q] - sb; xy += x * y; xx += x * x; yy += y * y; } return xx && yy ? xy / Math.sqrt(xx * yy) : 0; };
  const runMax = []; let m = 0; for (let i = 0; i <= n; i++) { m = Math.max(m, hi[i]); runMax.push(m); }
  const r30 = (i) => c[i] / c[i - 30] - 1, dd = (i) => c[i] / runMax[i] - 1, rg = (i) => { let H2 = 0, L2 = 1e18; for (let q = i - 13; q <= i; q++) { H2 = Math.max(H2, hi[q]); L2 = Math.min(L2, lo[q]); } return Math.log(H2 / L2); };
  const fv = (i) => F.get(dk(k[i][0]));
  const M = [
    { id: 'shape30', ja: '1か月の形', en: '30-day shape', f: (i) => 1 - corr(i, n, 30) },
    { id: 'ret30', ja: '30日の上げ下げ幅', en: '30-day change', f: (i) => Math.abs(r30(i) - r30(n)) },
    { id: 'ath', ja: '最高値からの位置', en: 'distance from ATH', f: (i) => Math.abs(dd(i) - dd(n)) },
    { id: 'shape7', ja: '1週間の形', en: '7-day shape', f: (i) => 1 - corr(i, n, 7) },
    { id: 'vol14', ja: '14日の値幅', en: '14-day range', f: (i) => Math.abs(rg(i) - rg(n)) },
    { id: 'fng', ja: '恐怖指数', en: 'Fear & Greed', f: (i) => fv(i) == null || fv(n) == null ? null : Math.abs(fv(i) - fv(n)) },
  ];
  const cand = []; for (let i = 60; i <= n - AFT; i++) cand.push(i);
  const pr = M.map((me) => { const v = cand.map((i) => [i, me.f(i)]).filter((x) => x[1] != null).sort((a, b) => a[1] - b[1]); const P = new Map(); v.forEach(([i], r) => P.set(i, r / Math.max(1, v.length - 1))); return P; });
  const score = cand.map((i) => { const ps = pr.map((P) => P.get(i)).filter((v) => v != null); return { i, s: ps.reduce((a, v) => a + v, 0) / ps.length, ps: pr.map((P) => P.get(i)) }; }).sort((a, b) => a.s - b.s);
  const nm = (t) => { const cs = (crises || []).filter((x) => Math.abs(Math.round((Date.UTC(+x.d.slice(0, 4), +x.d.slice(5, 7) - 1, +x.d.slice(8, 10)) - t) / DAY)) <= 30); return cs.length ? cs[cs.length - 1].n : ''; };
  const after = (i) => { let mn = 0, md = 0, rec = null, below = false; for (let d = 1; d <= 365 && i + d <= n; d++) { const v = c[i + d] / c[i] - 1; if (d <= AFT && v < mn) { mn = v; md = d; } if (v < 0) below = true; if (below && rec == null && v >= 0) rec = d; }
    const at = (d) => i + d <= n ? +((c[i + d] / c[i] - 1) * 100).toFixed(1) : null; return { a7: at(7), a14: at(14), a30: at(30), a60: at(60), low: +(mn * 100).toFixed(1), lowD: md, rec: below ? rec : 0 }; };
  const pick = (list, K, gap = 45) => { const out = []; for (const x of list) { if (out.every((o) => Math.abs(o.i - x.i) > gap)) out.push(x); if (out.length >= K) break; } return out; };
  const path = (i, B = 30, Af = AFT) => { const p = []; for (let d = -B; d <= Af && i + d <= n; d++) if (i + d >= 0) p.push([d, +((c[i + d] / c[i] - 1) * 100).toFixed(2)]); return p; };
  const fmt = (x) => ({ t: k[x.i][0], s: +x.s.toFixed(3), ps: x.ps.map((v) => v == null ? null : +v.toFixed(3)), name: nm(k[x.i][0]), ...after(x.i), p: path(x.i) });
  const top = pick(score, 5).map(fmt).map((x, r) => ({ ...x, rank: r + 1 }));
  const recent = top.filter((x) => k[n][0] - x.t <= 400 * DAY);   // v318: この1年(400日)の中で同じ形だった回
  const per = M.map((me, j) => { const l = score.filter((x) => x.ps[j] != null).slice().sort((a, b) => a.ps[j] - b.ps[j]); return { id: me.id, ja: me.ja, en: me.en, best: pick(l, 3).map((x) => ({ t: k[x.i][0], name: nm(k[x.i][0]) })) }; });
  return { recent, cur: path(n, 30, 0), now: { t: k[n][0], c: c[n], r30: +(r30(n) * 100).toFixed(1), dd: +(dd(n) * 100).toFixed(1), rg14: +((Math.exp(rg(n)) - 1) * 100).toFixed(1), fng: fv(n) ?? null }, M: M.map((x) => x.ja), top, per, N: cand.length };
}

// v318: 「この形、今年◯回目」(スポット)。likeStudy の総合上位のうち、この1年の回を今と並べる
export function likeDraft(R, now) {
  const md = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }, mo = (t) => (new Date(t).getUTCMonth() + 1), sg = (v) => v == null ? '—' : (v > 0 ? '+' : '') + v + '%';
  const rc = R.recent.slice(0, 3).sort((a, b) => a.t - b.t), yr = new Date(R.now.t).getUTCFullYear(), same = rc.every((x) => new Date(x.t).getUTCFullYear() === yr), cnt = rc.length + 1;
  const dn = R.now.r30 < 0, wj = dn ? 'この下げ方' : 'この上げ方', we = dn ? 'This kind of drop' : 'This kind of rise', fj = `1か月で${sg(R.now.r30)}・最高値から${sg(R.now.dd)}`, fe = `${sg(R.now.r30)} in a month, ${sg(R.now.dd)} from the ATH`;   // v320: 何の投稿か一目で分かるよう、まず今の数字を書く
  const hj = same ? `${wj}、今年${cnt}回目` : `${wj}、この1年で${cnt}回目`, he = same ? `${we}: ${cnt}${cnt === 2 ? 'nd' : cnt === 3 ? 'rd' : 'th'} time this year` : `${we}: ${cnt} times in a year`;
  const oth = R.top.find((x) => !rc.includes(x)), rec = (x, e) => x.rec === 0 ? (e ? 'never below' : '下回らず') : x.rec == null ? (e ? 'not back in 365d' : '365日内に戻らず') : (e ? `back in ${x.rec}d` : `${x.rec}日で元値`);
  // v319: 本文を読みやすく(見出し→1位と何位→その後→問いかけ)
  const md2 = (t) => { const d = new Date(t); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; }, bj = (x) => (x.lowD === 1 ? '翌日に' : x.lowD + '日目に') + sg(x.low), be = (x) => `${sg(x.low)} ${x.lowD === 1 ? 'the next day' : 'by day ' + x.lowD}`;
  const rk = rc.slice().sort((a, b) => a.rank - b.rank), rj = (x) => x.rec === 0 ? '下回らず' : x.rec == null ? '1年戻らず' : x.rec <= 7 ? `${x.rec}日で戻り` : `戻るまで${x.rec}日`;
  const me = (t) => { const d = new Date(t); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCDate() + (same ? '' : ', ' + d.getUTCFullYear()); };
  const re2 = (x) => x.rec === 0 ? 'never below' : x.rec == null ? 'not back in a year' : `back in ${x.rec}d`;
  const mk = (o) => [
    [`BTC ${fj}`, `${hj}`, '', `2017年以降で今に一番近いのは`, rk.map((x) => `${yr === new Date(x.t).getUTCFullYear() && same ? md2(x.t) : md(x.t)}(${x.rank}位)`).join('・'), '', 'その後',
      ...rc.map((x) => `${mo(x.t)}月：${bj(x)}、${rj(x)}、60日後${sg(x.a60)}`), '', o ? '今回はどっちの道か。' : null, o ? '' : null, '過去の記録。予測ではありません'],
    [`BTC ${fe}`, `${he}`, '', `Closest to now since 2017:`, rk.map((x) => `${me(x.t)} (#${x.rank})`).join(', '), '', 'What came next',
      ...rc.map((x) => `${me(x.t)}: ${be(x)}, ${re2(x)}, day 60 ${sg(x.a60)}`), '', o ? 'Which path this time?' : null, o ? '' : null, 'Past record. Not a forecast.']].map((a) => a.filter((v) => v != null).join('\n'));
  let ja = mk(1)[0], en = mk(1)[1]; if (xlen(ja) > 280) ja = mk(0)[0]; if (xlen(en) > 280) en = mk(0)[1];   // v319: 問いかけは言語ごとに入るなら入れる
  for (const [tg, te] of [['\n#ビットコイン #BTC', '\n#Bitcoin #BTC'], ['\n#BTC', '\n#BTC'], ['', '']]) { if (xlen(ja + tg) <= 280 && xlen(en + te) <= 280) { ja += tg; en += te; break; } }
  return { id: 'like:copy:' + now, sr: 'like', man: 1, due: now, ja, en, img: { like: { now: R.now, cur: R.cur, rc, oth: oth ? { t: oth.t, rank: oth.rank, a60: oth.a60 } : null, N: R.N, M: R.M, hj, he, fj, fe } } };
}
