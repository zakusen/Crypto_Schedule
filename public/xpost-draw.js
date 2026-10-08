// CSA の投稿画像(1200×675)を描く共通部品(v94)。/posts.html(ブラウザ)と /render.html(GitHub Actions の自動投稿)が使う。
// ---------- 画像(1200×675。仕様書のデザイン: near-black navy・細いグリッド・金・シアン・くすんだ緑/赤) ----------
const W = 1200, Hh = 675, C = { bg: '#0a0e16', grid: 'rgba(140,160,190,0.07)', tx: '#e6e9ef', mut: '#8a94a7', gold: '#c9b37e', cyan: '#7fc8d8', up: '#5fa88a', dn: '#c2645f', line: '#1f2a3d' };
const SANS = '"IBM Plex Sans","Noto Sans JP",sans-serif', MONO = '"IBM Plex Mono","Noto Sans JP",monospace';
const P2 = (n) => String(n).padStart(2, '0');
const WE = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], ME = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], WJ = ['日', '月', '火', '水', '木', '金', '土'];
const D = (t) => new Date(t + 9 * 36e5);   // v74: 画像の日時は英語も日本語も日本時間(JST)
const hm = (t, lg) => { const d = D(t, lg); return P2(d.getUTCHours()) + ':' + P2(d.getUTCMinutes()); };
const dayEn = (t) => { const d = D(t, 'en'); return `${WE[d.getUTCDay()]} ${ME[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const dateEn = (t) => { const d = D(t, 'en'); return `${ME[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const dayJa = (t) => { const d = D(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WJ[d.getUTCDay()]})`; };
const dateJa = (t) => { const d = D(t); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; };
const usd = (v, dp = 0) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const pctTxt = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';

function fitFont(g, text, maxW, size, weight, fam) { let s = size; do { g.font = `${weight} ${s}px ${fam}`; if (g.measureText(text).width <= maxW) return s; s -= 2; } while (s > 12); return s; }
function txt(g, text, x, y, { size = 24, w = 400, fam = SANS, col = C.tx, max = 0, align = 'left', ls = 0 } = {}) {
  if (max) fitFont(g, text, max, size, w, fam); else g.font = `${w} ${size}px ${fam}`;
  g.fillStyle = col; g.textAlign = align; g.textBaseline = 'alphabetic';
  if ('letterSpacing' in g) g.letterSpacing = ls + 'px';
  let t = text;
  if (max && g.measureText(t).width > max) { while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1); t += '…'; }
  g.fillText(t, x, y);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}
function frame(g, label, foot) {
  g.fillStyle = C.bg; g.fillRect(0, 0, W, Hh);
  g.strokeStyle = C.grid; g.lineWidth = 1;
  for (let x = 0; x <= W; x += 48) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, Hh); g.stroke(); }
  for (let y = 0; y <= Hh; y += 48) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  txt(g, 'CRYPTO SIGNAL ARCHIVE', 56, 66, { size: 17, w: 600, fam: MONO, col: C.gold, ls: 4 });
  txt(g, label, W - 56, 66, { size: 17, w: 600, fam: MONO, col: C.cyan, align: 'right', ls: 3 });
  g.fillStyle = C.gold; g.globalAlpha = 0.5; g.fillRect(56, 84, W - 112, 1); g.globalAlpha = 1;
  g.fillStyle = C.line; g.fillRect(56, Hh - 64, W - 112, 1);
  txt(g, '@csa_archive', 56, Hh - 32, { size: 16, w: 600, fam: MONO, col: C.gold });
  txt(g, foot, W - 56, Hh - 32, { size: 13, fam: MONO, col: C.mut, align: 'right', max: 820 });
}
function spark(g, vals, x, y, w, h, opt = {}) {
  const v = vals.map((a) => (a == null ? null : +a)), ok = v.filter((a) => a != null).concat(opt.extra || []);
  const lo = Math.min(...ok), hi = Math.max(...ok), pad = (hi - lo) * 0.12 || hi * 0.001;
  const X = (i) => x + (i / (v.length - 1)) * w, Y = (a) => y + h - ((a - (lo - pad)) / ((hi + pad) - (lo - pad))) * h;
  g.strokeStyle = C.line; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w, h);
  for (const m of opt.marks || []) { g.strokeStyle = m.col; g.setLineDash(m.dash || []); g.beginPath(); g.moveTo(X(m.i), y); g.lineTo(X(m.i), y + h); g.stroke(); g.setLineDash([]); if (m.label) txt(g, m.label, X(m.i), y + h + 24, { size: 14, fam: MONO, col: m.col, align: 'center' }); }
  g.strokeStyle = opt.col || C.cyan; g.lineWidth = 2.5; g.beginPath(); let st = false;
  v.forEach((a, i) => { if (a == null) return; st ? g.lineTo(X(i), Y(a)) : g.moveTo(X(i), Y(a)); st = true; }); g.stroke();
  for (const d of opt.dots || []) { g.fillStyle = d.col; g.beginPath(); g.arc(X(d.i), Y(d.v), 6, 0, 7); g.fill(); }
}

function drawDaily(g, im, lg) {
  const en = lg === 'en';
  frame(g, im.next && !im.today.length ? (en ? 'DAILY TIMELINE' : 'DAILY TIMELINE') : 'DAILY TIMELINE', en ? 'Times in JST (UTC+9) · prev 1h = BTC change 1h after the previous release (Binance spot)' : '時刻は日本時間 / 前回1h = 前回の発表から1時間のBTCの変動(Binance現物)');
  txt(g, en ? `TODAY · ${dateEn(im.day)}` : `今日のイベント  ${dayJa(im.day)}`, 56, 150, { size: 44, w: 600, col: C.tx, max: 1088 });
  // 左: 今日(縦のタイムライン)
  txt(g, en ? 'UPCOMING TODAY' : '今日このあと', 56, 210, { size: 16, w: 600, fam: MONO, col: C.cyan, ls: 2 });
  const T = im.today.slice(0, 6), top = 250, step = T.length > 4 ? 58 : 70;
  g.fillStyle = C.cyan; g.globalAlpha = 0.6; g.fillRect(74, top - 10, 1.5, Math.max(1, (T.length - 1) * step + 20)); g.globalAlpha = 1;
  if (!T.length) txt(g, en ? 'No scheduled events' : '予定なし', 100, top + 10, { size: 26, col: C.mut });
  T.forEach((e, i) => {
    const y = top + i * step; g.fillStyle = C.gold; g.beginPath(); g.arc(75, y, 6, 0, 7); g.fill();
    txt(g, hm(e.t, lg), 100, y + 9, { size: 24, w: 600, fam: MONO, col: C.gold });
    txt(g, e[lg], 210, y + 9, { size: 24, w: 600, col: C.tx, max: e.pv != null ? 270 : 390 });
    if (e.pv != null) {
      txt(g, en ? 'prev 1h' : '前回1h', 596, y - 8, { size: 12, fam: MONO, col: C.mut, align: 'right' });
      txt(g, pctTxt(e.pv), 596, y + 14, { size: 20, w: 600, fam: MONO, col: e.pv > 0 ? C.up : e.pv < 0 ? C.dn : C.tx, align: 'right' });
    }
  });
  if (im.today.length > 6) txt(g, (en ? `+${im.today.length - 6} more` : `ほか${im.today.length - 6}件`), 100, top + 6 * step, { size: 18, col: C.mut });
  // 右: 今週
  const rx = 660; g.fillStyle = C.line; g.fillRect(rx - 28, 190, 1, 400);
  txt(g, en ? (im.next ? 'NEXT WEEK' : 'THIS WEEK') : (im.next ? '来週' : '今週'), rx, 210, { size: 16, w: 600, fam: MONO, col: C.cyan, ls: 2 });
  const WN = im.week.length > 8 ? 7 : 8, Wk = im.week.slice(0, WN);   // 「ほか」の行が下の線に重ならないように
  if (!Wk.length) txt(g, en ? 'No scheduled events' : '予定なし', rx, 256, { size: 22, col: C.mut });
  Wk.forEach((e, i) => {
    const y = 254 + i * 44;
    txt(g, en ? dayEn(e.t) : dayJa(e.t), rx, y, { size: 17, w: 600, fam: MONO, col: C.gold });
    txt(g, e[lg], rx + 150, y, { size: 19, col: C.tx, max: 340 });
  });
  if (im.week.length > WN) txt(g, en ? `+${im.week.length - WN} more` : `ほか${im.week.length - WN}件`, rx, 254 + WN * 44, { size: 16, col: C.mut });
}
// v91: 発表後の値動き(4銘柄 × +5分/+15分/+1時間)。バーは ±2% で端まで(超える分は端で止める)
function drawArch2(g, im, lg) {
  const en = lg === 'en', T = ['#5b8def', '#a77bdb', '#d9b45a', '#e08a4f'];   // 発表・5分・15分・1時間の色
  frame(g, 'POST-RELEASE RECORD', en ? 'Binance spot · base = 5m open at release · +5m/+15m/+1h = 5m close · bar = ±2%' : 'Binance現物 / 基準 = 発表時刻の5分足の始値 / 各時点 = 5分足の終値 / バーの端 = ±2%');
  txt(g, (im.icon ? im.icon + ' ' : '') + im[lg], 56, 146, { size: 40, w: 600, col: C.tx, max: 1088 });
  txt(g, en ? `${dateEn(im.t)} · ${hm(im.t, 'en')} JST` : `${dateJa(im.t)} ${hm(im.t, 'ja')}(日本時間)`, 56, 188, { size: 20, fam: MONO, col: C.mut });
  // 時間の流れ
  const steps = [[en ? 'RELEASE' : '発表', 0], ['+5M', 1], ['+15M', 2], ['+1H', 3]], tx0 = 300, tw = 260;
  const ly = 262, rx0 = 196;   // 時間の線(発表 → +5M → +15M → +1H)。点の下の列が各時点の値
  g.strokeStyle = C.line; g.lineWidth = 2; g.beginPath(); g.moveTo(rx0, ly); g.lineTo(tx0 + tw * 2 + 120, ly); g.stroke();
  steps.forEach(([l, i]) => { const x = i ? tx0 + tw * (i - 1) + 120 : rx0; g.fillStyle = T[i]; g.beginPath(); g.arc(x, ly, 7, 0, 7); g.fill(); txt(g, l, x, ly - 16, { size: 15, w: 600, fam: MONO, col: T[i], align: 'center' }); });
  // 表
  const COIN = [['BTC', '₿'], ['ETH', '◆'], ['SOL', '◎'], ['BNB', '◇']].filter(([c]) => im.coins && im.coins[c]);
  const cols = [['c5', 1], ['c15', 2], ['c60', 3]];
  COIN.forEach(([c, sym], r) => {
    const y = 336 + r * 66, o = im.coins[c];
    g.fillStyle = 'rgba(255,255,255,0.025)'; if (r % 2 === 0) g.fillRect(56, y - 34, 1088, 60);
    txt(g, sym + ' ' + c, 72, y + 4, { size: 26, w: 600, fam: MONO, col: C.gold });
    cols.forEach(([k, i], j) => {
      const v = o[k], cx = tx0 + tw * j + 120;
      if (v == null) { txt(g, '—', cx, y + 2, { size: 26, fam: MONO, col: C.mut, align: 'center' }); return; }
      const col = v > 0 ? C.up : v < 0 ? C.dn : C.tx;
      txt(g, (v > 0 ? '▲ +' : v < 0 ? '▼ −' : '± ') + Math.abs(v).toFixed(2) + '%', cx, y + 2, { size: 26, w: 600, fam: MONO, col, align: 'center' });
      const bw = 100, f = Math.max(-1, Math.min(1, v / 2));
      g.fillStyle = C.line; g.fillRect(cx - bw, y + 14, bw * 2, 4);
      g.fillStyle = col; g.fillRect(f >= 0 ? cx : cx + f * bw, y + 14, Math.abs(f) * bw, 4);
      g.fillStyle = C.mut; g.fillRect(cx - 1, y + 10, 2, 12);
    });
  });
}
function drawEvent(g, im, lg, otd) {
  if (im && im.v === 2) return drawArch2(g, im, lg);
  const en = lg === 'en', up = im.chg >= 0, col = im.chg > 0 ? C.up : im.chg < 0 ? C.dn : C.tx;
  frame(g, otd ? 'ON THIS DATE' : 'ARCHIVED', en ? 'BTCUSDT · Binance spot · before = 5m open at release · after = 5m close at +1h' : 'BTCUSDT・Binance現物 / 前 = 発表時刻の5分足の始値 / 後 = 1時間後の5分足の終値');
  if (otd) {
    txt(g, en ? dateEn(im.t) : dateJa(im.t), 56, 150, { size: 46, w: 600, col: C.gold, max: 1088 });
    txt(g, im[lg], 56, 200, { size: 30, w: 600, col: C.tx, max: 860 });
    txt(g, hm(im.t, 'en') + (en ? ' JST' : '(日本時間)'), 56 + 1088, 200, { size: 22, fam: MONO, col: C.mut, align: 'right' });
  } else {
    txt(g, im[lg], 56, 150, { size: 42, w: 600, col: C.tx, max: 1088 });
    txt(g, en ? `${dateEn(im.t)} · ${hm(im.t, 'en')} JST` : `${dateJa(im.t)} ${hm(im.t, 'ja')}(日本時間)`, 56, 196, { size: 22, fam: MONO, col: C.mut });
  }
  spark(g, im.spark, 56, 240, 640, 300, {
    extra: [im.before, im.after],
    marks: [{ i: 0, col: C.mut, label: '−1h' }, { i: 12, col: C.gold, label: en ? 'RELEASE' : '発表' }, { i: 23, col: C.cyan, dash: [5, 5], label: '+1h' }],
    dots: [{ i: 12, v: im.before, col: C.gold }, { i: 23, v: im.after, col: C.cyan }],
  });
  const rx = 760;
  txt(g, en ? 'BEFORE' : 'イベント前', rx, 270, { size: 16, w: 600, fam: MONO, col: C.gold, ls: 2 });
  txt(g, 'BTC ' + usd(im.before), rx, 312, { size: 34, w: 600, fam: MONO, col: C.tx, max: 384 });
  txt(g, en ? 'AFTER (+1h)' : 'イベント後(1時間後)', rx, 372, { size: 16, w: 600, fam: MONO, col: C.cyan, ls: 2 });
  txt(g, 'BTC ' + usd(im.after), rx, 414, { size: 34, w: 600, fam: MONO, col: C.tx, max: 384 });
  txt(g, en ? 'CHANGE' : '変動', rx, 474, { size: 16, w: 600, fam: MONO, col: C.mut, ls: 2 });
  txt(g, pctTxt(im.chg), rx, 540, { size: 60, w: 600, fam: MONO, col, max: 384 });
  void up;
}
// v92: 週間記録(4銘柄の週の変化 + 主要指標ごとの BTC +1h)。バーの端 = ±10%
function drawWeek2(g, im, lg) {
  const en = lg === 'en', d = (t) => { const x = D(t); return `${x.getUTCMonth() + 1}/${x.getUTCDate()}`; };
  frame(g, 'WEEKLY RECORD', en ? 'Binance spot · week = Sat 00:00 → Sat 00:00 JST · first 1h open → last 1h close · bar = ±10%' : 'Binance現物 / 週 = 土曜0時〜次の土曜0時(日本時間) / 最初の1時間足の始値 → 最後の1時間足の終値 / バーの端 = ±10%');
  txt(g, `🗓️ ${d(im.ws)} — ${d(im.we - 864e5)} (JST)`, 56, 146, { size: 40, w: 600, col: C.tx, max: 1088 });
  txt(g, en ? 'WEEK CHANGE' : '週の変化', 56, 204, { size: 15, w: 600, fam: MONO, col: C.cyan, ls: 2 });
  const COIN = [['BTC', '₿'], ['ETH', '◆'], ['SOL', '◎'], ['BNB', '◇']].filter(([c]) => im.coins && im.coins[c]);
  COIN.forEach(([c, sym], r) => {
    const y = 256 + r * 74, o = im.coins[c], v = o.chg, col = v > 0 ? C.up : v < 0 ? C.dn : C.tx;
    txt(g, sym + ' ' + c, 56, y, { size: 26, w: 600, fam: MONO, col: C.gold });
    txt(g, (v > 0 ? '▲ +' : v < 0 ? '▼ −' : '± ') + Math.abs(v).toFixed(2) + '%', 380, y, { size: 28, w: 600, fam: MONO, col, align: 'right' });
    const cx = 500, bw = 90, f = Math.max(-1, Math.min(1, v / 10));
    g.fillStyle = C.line; g.fillRect(cx - bw, y - 9, bw * 2, 5); g.fillStyle = col; g.fillRect(f >= 0 ? cx : cx + f * bw, y - 9, Math.abs(f) * bw, 5); g.fillStyle = C.mut; g.fillRect(cx - 1, y - 14, 2, 15);
  });
  // 右: その週の指標(重要度順)。多い時は2列(1列7件)
  const rx = 640; g.fillStyle = C.line; g.fillRect(rx - 24, 190, 1, 400);
  txt(g, en ? 'RELEASES · BTC +1H (by importance)' : '指標 · BTC +1時間(重要度順)', rx, 204, { size: 15, w: 600, fam: MONO, col: C.cyan, ls: 1 });
  const ALL = im.ev || [], two = ALL.length > 7, per = 7, cw = two ? 252 : 504, E = ALL.slice(0, two ? 14 : 7);
  if (!E.length) txt(g, en ? 'None' : 'なし', rx, 256, { size: 22, col: C.mut });
  E.forEach((e, i) => {
    const col0 = rx + Math.floor(i / per) * cw, y = 252 + (i % per) * 48, v = e.btc, col = v == null ? C.mut : v > 0 ? C.up : v < 0 ? C.dn : C.tx;
    txt(g, d(e.t), col0, y, { size: two ? 13 : 16, w: 600, fam: MONO, col: e.major ? C.gold : C.mut });
    txt(g, (e.icon || '') + ' ' + (en ? e.sen || e.en : e.sja || e.ja), col0, y + (two ? 18 : 0) , { size: two ? 15 : 19, col: C.tx, max: two ? 160 : 300 });
    txt(g, v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%', col0 + cw - 16, y + (two ? 18 : 0), { size: two ? 15 : 19, w: 600, fam: MONO, col, align: 'right' });
  });
  if (ALL.length > E.length) txt(g, en ? `+${ALL.length - E.length} more` : `ほか${ALL.length - E.length}件`, rx, 252 + per * 48 - 6, { size: 14, col: C.mut });
}
function drawWeek(g, im, lg) {
  if (im && im.v === 2) return drawWeek2(g, im, lg);
  const en = lg === 'en';
  frame(g, 'WEEK IN CRYPTO', en ? 'Binance spot · week = Mon 00:00 → Mon 00:00 JST · 1h open → 1h close' : 'Binance現物 / 週 = 月曜0時〜次の月曜0時(日本時間) / 最初の1時間足の始値 → 最後の1時間足の終値');
  txt(g, en ? `${dayEn(im.ws)} — ${dayEn(im.we - 864e5)}, ${D(im.ws).getUTCFullYear()} (JST)` : `${dayJa(im.ws)} 〜 ${dayJa(im.we - 864e5)}`, 56, 150, { size: 40, w: 600, col: C.tx, max: 1088 });
  [['BTC', im.btc], ['ETH', im.eth]].filter(([, o]) => o).forEach(([sym, o], k) => {
    const y = 200 + k * 200, col = o.chg > 0 ? C.up : o.chg < 0 ? C.dn : C.tx;
    txt(g, sym, 56, y + 30, { size: 22, w: 600, fam: MONO, col: C.gold, ls: 3 });
    txt(g, `${usd(o.s, o.dp)} → ${usd(o.e, o.dp)}`, 56, y + 76, { size: 28, w: 600, fam: MONO, col: C.tx, max: 420 });
    txt(g, pctTxt(o.chg), 56, y + 140, { size: 48, w: 600, fam: MONO, col, max: 300 });
    spark(g, o.spark, 380, y + 96, 220, 70, { col });
  });
  if (!im.eth) {   // v80: BTC だけ。ほかの銘柄はサイトへ
    txt(g, en ? 'ETH / SOL / BNB and 5m–24h moves' : 'ETH・SOL・BNB や 5分〜24時間の値動きは', 56, 470, { size: 20, col: C.mut, max: 560 });
    txt(g, en ? 'on the site →' : 'サイトで →', 56, 504, { size: 20, w: 600, col: C.cyan, max: 560 });
  }
  const rx = 660; g.fillStyle = C.line; g.fillRect(rx - 28, 190, 1, 400);
  txt(g, en ? 'EVENTS' : 'イベント', rx, 214, { size: 16, w: 600, fam: MONO, col: C.cyan, ls: 2 });
  const E = im.ev.slice(0, 8);
  if (!E.length) txt(g, en ? 'None' : 'なし', rx, 258, { size: 22, col: C.mut });
  E.forEach((e, i) => { const y = 258 + i * 42; txt(g, en ? dayEn(e.t) : dayJa(e.t), rx, y, { size: 17, w: 600, fam: MONO, col: C.gold }); txt(g, e[lg], rx + 150, y, { size: 19, col: C.tx, max: 340 }); });
  if (im.ev.length > 8) txt(g, en ? `+${im.ev.length - 8} more` : `ほか${im.ev.length - 8}件`, rx, 258 + 8 * 42, { size: 16, col: C.mut });
}

let fontsReady = null;
function loadFonts(sample) {
  const specs = ['600 24px "IBM Plex Mono"', '400 24px "IBM Plex Mono"', '600 24px "IBM Plex Sans"', '400 24px "IBM Plex Sans"', '700 24px "Noto Sans JP"', '400 24px "Noto Sans JP"'];
  return Promise.race([Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))), new Promise((r) => setTimeout(r, 4000))]);
}

// 投稿1つの画像を描いて canvas を返す(描けない種類は null)
export async function drawPost(p, lg) {
  await loadFonts(JSON.stringify(p.img) + 'イベント前後今日週来変動発表日本時間予定なしほか件翌年月日このあと前回指標重要度順' + p[lg]);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const g = cv.getContext('2d');
  if (p.sr === 'daily') drawDaily(g, p.img, lg);
  else if (p.sr === 'arch') drawEvent(g, p.img, lg, false);
  else if (p.sr === 'week') drawWeek(g, p.img, lg);
  else return null;
  return cv;
}
export { W, Hh, loadFonts };
