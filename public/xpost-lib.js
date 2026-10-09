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
  // v108: 毎朝の予定と同じ形。⏱️ の行はやめた。値は発表時点(5分足の始値)から1時間後(5分足の終値)まで
  const build = (lang) => (o) => {
    const en = lang === 'en', rule = '━'.repeat(o.rule);
    return [...(o.brand ? [BRAND[lang], ''] : []),
      en ? `🟢 +1H AFTER RELEASE · ${dEnU(ts)} · ${uhm(ts)} UTC` : `🟢 発表から1時間 · ${dJaL(ts)} · ${hm(ts)}発表`, rule,
      `🟡 ${icon2(g)} ${en ? nE.toUpperCase() : nJ}`, '',
      ...COINS.filter(([c]) => mv[c]).map(([c, , s]) => coinRow(c, s, mv[c].c60)), rule,
      ...(o.cta ? ['', en ? `🗂️ Past ${k.short[0] ? k.short[0] + ' ' : ''}records: link in bio` : `🗂️ 過去の${k.short[1] || 'この指標'}の記録はプロフィールのリンクから`] : []),
      ...(o.tag ? [en ? tagE : tagJ] : [])].join('\n');
  };
  const OPT = [{ brand: 1, rule: 18, cta: 1, tag: 1 }, { brand: 1, rule: 10, cta: 1, tag: 1 }, { rule: 10, cta: 1, tag: 1 }, { rule: 10, cta: 1 }, { rule: 10 }];
  const en = fit280(build('en'), OPT), ja = fit280(build('ja'), OPT);
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
  return { id: 'week:' + isoDay(wk.ws), sr: 'week', due: wk.we + WEEK_AT, en, ja, h: hashStr(en + ja), img: { v: 3, ws: wk.ws, we: wk.we, coins: wk.coins, ev: wk.ev, btc: wk.btc || null } };   // v109: btc = 1時間足の終値(週の168本)
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
export function spikeMoves(B, T, now, win = 1) {   // v121: win = 1 / 6(時間)
  const hit = [SPIKE_COIN], K = 12 * win;
  const map = {}; for (const k of Object.keys(B)) map[k] = new Map((B[k] || []).map((b) => [b[0], b[4]]));
  const ch = (k, e) => { const a = map[k] && map[k].get(e - K * M5), b = map[k] && map[k].get(e); return a > 0 && b > 0 ? pct(a, b) : null; };
  let best = null;
  for (let e = Math.floor((T - 10 * 60000) / M5) * M5 - M5; e <= T + 5 * 60000; e += M5) {
    if (e + M5 > now || e + M5 < T - 10 * 60000) continue;
    const v = Math.max(...hit.map((c) => Math.abs(ch(c, e) ?? 0)));
    if (!best || v > best.v) best = { e, v };
  }
  if (!best || best.v < SPIKE_PCT) return null;
  const coins = {}; for (const [c] of COINS) { const v = ch(c, best.e); if (v != null) coins[c] = v; }
  const t1 = best.e + M5, t0 = t1 - win * H, span = win > 6 ? 576 : win > 1 ? 144 : 72, step = win > 6 ? 6 : 1;   // 画像: 1時間 = 直近6時間 / 6時間 = 直近12時間 / 24時間 = 直近48時間(30分おき)
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
export function spikePost(sp, corr, link) {   // link = サイトの URL(付けない時は null)
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
      en ? `🟡 ${W}H CHANGE | CORR W/ S&P500 (30D)` : `🟡 ${W}時間の変化 | S&P500との相関(30日)`,
      ...COINS.filter(([c]) => sp.coins[c] != null).map(([c, , s]) => `${s} ${c} ${mv(sp.coins[c], o.dot)} | ${cr(c, lang, !o.nolab)}`),
      `📈 S&P500 ${mv(sp.spx, o.dot)}${sp.open || o.noclosed ? '' : en ? ' (US market closed)' : '(米国市場の時間外)'}`, rule,
      ...(link ? ['🔗 ' + link] : []),
      ...(o.tag ? [en ? '#Bitcoin #SP500' : '#ビットコイン #SP500'] : [])].join('\n');
  };
  const LV = [{ brand: 1, rule: 18, dot: 1, tag: 1 }, { brand: 1, dot: 1, tag: 1 }, { dot: 1, tag: 1 }, { dot: 1 }, {}, { noclosed: 1 }, { noclosed: 1, nodate: 1 }, { noclosed: 1, nodate: 1, nolab: 1 }];   // 相関の目安の言葉は最後まで残す(時刻は画像にもある・投稿はすぐ出る)
  const fitS = (lang) => { for (const o of LV) { const t = build(lang, o); if (xlen(t) <= 280) return t; } return build(lang, LV[LV.length - 1]); };
  const en = fitS('en'), ja = fitS('ja');
  return { id: sp.id, sr: 'spike', due: sp.due, en, ja, h: hashStr(en + ja), img: { v: 2, win: W, t0: sp.t0, t1: sp.t1, coins: sp.coins, spx: sp.spx, open: sp.open, hit: sp.hit, link: !!link, ser: sp.ser || null, corr: corr ? { 30: corr.w[30], 7: corr.w[7], end: corr.end } : null } };
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
      en ? '🔥 LIQUIDATION WAVE' : '🔥 巨額清算', ...(o.nodate ? [] : [rangeTxt(ev.start, ev.end, lang)]), rule,
      ...liqRows(ev.coins), rule,
      en ? `🔴 Long ${usdS(tot.l)} · 🟢 Short ${usdS(tot.s)}` : `🔴 ロング ${usdS(tot.l)} · 🟢 ショート ${usdS(tot.s)}`,
      ...(mo && !o.nomax ? [en ? `💥 Largest: ${usdS(mo.usd)} ${mo.coin} ${mo.side}` : `💥 最大の1件: ${usdS(mo.usd)} ${mo.coin}の${mo.side === 'long' ? 'ロング' : 'ショート'}`] : []),
      ...(o.src ? [en ? 'Bybit + OKX' : 'Bybit・OKX合算'] : []),
      ...(o.tag ? [en ? '#Crypto #Liquidations' : '#仮想通貨 #清算'] : [])].join('\n');
  };
  const LV = [{ brand: 1, rule: 18, src: 1, tag: 1 }, { brand: 1, src: 1, tag: 1 }, { brand: 1, tag: 1 }, { tag: 1 }, {}, { nomax: 1 }, { nomax: 1, nodate: 1 }];
  const fitL = (lang) => { for (const o of LV) { const t = build(lang, o); if (xlen(t) <= 280) return t; } return build(lang, LV[LV.length - 1]); };
  const en = fitL('en'), ja = fitL('ja');
  return { id: ev.id, sr: 'liq', due: ev.end, en, ja, h: hashStr(en + ja), ...(ev.man ? { man: 1 } : {}),
    img: { v: 1, kind: 'wave', start: ev.start, end: ev.end, capped: !!ev.capped, coins: ev.coins, maxOne: mo || null, ser: ev.ser || [] } };
}
// 毎朝のまとめ: day = 日本時間の0時(ms)。直近24時間 = (day+9h-24h) 〜 (day+9h)。coins = {BTC:{long,short}}, hours = [[t,long,short]](24本まで)、from = 記録の始まり(24時間に満たない時)
export function liqDayPost(day, coins, hours, from, mult) {   // v171: mult = {l, s, n, coins:{BTC:{l,s}}, live} 平常日比(next.html の案Bと同じ定義)
  const end = day + LIQ_DAY_AT, start = end - DAY, tot = liqTot(coins);
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
  return { id: 'liqday:' + isoDay(day), sr: 'liqday', due: end, en, ja, h: hashStr(en + ja),
    img: { v: 2, kind: 'day', start, end, coins, hours: hours || [], partial: !!part, mult: mult || null } };
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
export const AUTO_WINDOW = 3 * H;   // 投稿時刻からこの時間を過ぎたものは自動で出さない(古い投稿を急に出さない)
export const SPIKE_WINDOW = 6 * H;  // v147: 急変動は見つけてから6時間まで
export const winOf = (p) => (p && (p.sr === 'spike' || p.sr === 'liq' || String(p.id || '').startsWith('spike:'))) ? SPIKE_WINDOW : AUTO_WINDOW;   // v152: 巨額清算の総括も6時間まで
// v101: man = /posts.html の「過去の発表から作る」で手で作った下書き(自動投稿しない)
export const isAuto = (p) => !p.man && (p.sr === 'arch' || p.sr === 'week' || p.sr === 'spike' || p.sr === 'liq' || p.sr === 'liqday' || p.sr === 'liqimp' || (p.sr === 'daily' && isoDay(p.due || 0) >= AUTO_DAILY_FROM));
// Worker が見張る「自動投稿の予定」(小さく保つ): 未投稿の自動投稿 + これからの主要指標の発表65分後
export function dueList(posts, events, now) {
  const items = [], seen = new Set();
  for (const p of posts || []) { seen.add(p.id); if (isAuto(p) && p.due && !(p.done && p.done.en && p.done.ja) && p.due > now - winOf(p) && p.due < now + 8 * DAY) items.push({ id: p.id, due: p.due }); }
  for (const g of groups((events || []).filter(MAJOR))) { const id = archId(g), due = g[0].ts + ARCH_WAIT; if (!seen.has(id) && due > now - AUTO_WINDOW && due < now + 8 * DAY) items.push({ id, due }); }
  for (const g of groups((events || []).filter(MAJOR))) { const id = liqImpId(g), due = liqImpDue(g[0].ts); if (!seen.has(id) && due > now - AUTO_WINDOW && due < now + 8 * DAY) items.push({ id, due }); }   // v171: 清算の反応(下書きは x_notify が、データが揃ってから作る)
  return { at: now, items: items.sort((a, b) => a.due - b.due) };
}
