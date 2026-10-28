// CSA の投稿画像(1200×675)を描く共通部品(v94)。/posts.html(ブラウザ)と /render.html(GitHub Actions の自動投稿)が使う。
// ---------- 画像(1200×675。仕様書のデザイン: near-black navy・細いグリッド・金・シアン・くすんだ緑/赤) ----------
const W = 1200, Hh = 675, C = { bg: '#07080f', grid: 'rgba(140,160,190,0.06)', tx: '#f2f4f8', mut: '#8f99ad', gold: '#ffc94d', cyan: '#69e0ff', up: '#2fe38a', dn: '#ff4d66', line: '#1f2a3d' };   // v203: 派手版(色を明るく)
// v203: 画像ごとの色(上の帯・背景のにじみ)。drawPost が投稿の中身で決める
const TONES = { red: ['#ff2e4d', 'rgba(255,40,70,0.30)'], green: ['#10c97a', 'rgba(16,201,122,0.28)'], blue: ['#2f7dff', 'rgba(47,125,255,0.28)'], gold: ['#e8a21a', 'rgba(232,162,26,0.26)'], purple: ['#8b5cf6', 'rgba(139,92,246,0.28)'] };
let TONE = TONES.blue;
const SANS = '"IBM Plex Sans","Noto Sans JP",sans-serif', MONO = '"IBM Plex Mono","Noto Sans JP",monospace';
const P2 = (n) => String(n).padStart(2, '0');
const WE = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], ME = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], WJ = ['日', '月', '火', '水', '木', '金', '土'];
const D = (t, lg) => new Date(t + (lg === 'en' ? 0 : 9 * 36e5));   // v103: 画像の日時は英語 = UTC、日本語 = 日本時間
const hm = (t, lg) => { const d = D(t, lg); return P2(d.getUTCHours()) + ':' + P2(d.getUTCMinutes()); };
const dayEn = (t) => { const d = D(t, 'en'); return `${WE[d.getUTCDay()]} ${ME[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const dateEn = (t) => { const d = D(t, 'en'); return `${ME[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const dayJa = (t) => { const d = D(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WJ[d.getUTCDay()]})`; };
const dateJa = (t) => { const d = D(t); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; };
const usd = (v, dp = 0) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
// v96: 相関の強さの目安(xpost-lib.js の corrLabel と同じ区分)
function corrLabel(v, lang) { if (v == null) return ''; const a = Math.abs(v), en = lang === 'en', inv = v < 0; if (a < 0.2) return en ? 'little link' : 'ほぼ無関係'; const k = a >= 0.7 ? 0 : a >= 0.4 ? 1 : 2; return en ? ['strong', 'moderate', 'weak'][k] + (inv ? ' inverse' : '') : ['強い', '中程度の', '弱い'][k] + (inv ? '逆連動' : '連動'); }
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
function frame(g, label, foot) {   // v203: 派手版。色の帯(種類)・にじむ背景・下の帯
  const bg = g.createLinearGradient(0, 0, W, Hh); bg.addColorStop(0, '#0c0610'); bg.addColorStop(0.55, C.bg); bg.addColorStop(1, '#030812'); g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  const rg = g.createRadialGradient(320, 260, 10, 320, 260, 560); rg.addColorStop(0, TONE[1]); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, Hh);
  g.strokeStyle = C.grid; g.lineWidth = 1;
  for (let x = 0; x <= W; x += 48) { g.beginPath(); g.moveTo(x + 0.5, 64); g.lineTo(x + 0.5, Hh - 44); g.stroke(); }
  for (let y = 64; y <= Hh - 44; y += 48) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  g.fillStyle = TONE[0]; g.fillRect(0, 0, W, 64);
  txt(g, label, 40, 43, { size: 28, w: 900, col: '#ffffff', max: 760 });
  txt(g, 'CRYPTO SIGNAL ARCHIVE', W - 40, 41, { size: 19, w: 700, fam: MONO, col: '#ffffff', align: 'right', ls: 2 });
  g.fillStyle = 'rgba(6,8,14,0.92)'; g.fillRect(0, Hh - 44, W, 44);
  txt(g, '@csa_archive', 40, Hh - 15, { size: 18, w: 800, fam: MONO, col: C.gold });
  txt(g, foot, W - 40, Hh - 16, { size: 14, fam: SANS, col: C.mut, align: 'right', max: 860 });
}
// v203: 光る文字
function glow(g, text, x, y, opt = {}) { g.save(); g.shadowColor = opt.glow || opt.col || C.tx; g.shadowBlur = opt.blur || 24; txt(g, text, x, y, opt); g.restore(); }
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

function drawDaily(g, im0, lg) {
  const im = lg === 'en' && im0.enl ? { ...im0, ...im0.enl } : im0;   // v104: 英語(UTC)は UTC の区切りの今日・今週
  const en = lg === 'en', tz = en && !im.utc ? 'ja' : lg, dE = (t) => { const d = D(t, tz); return `${WE[d.getUTCDay()]} ${ME[d.getUTCMonth()]} ${d.getUTCDate()}`; };   // v103: 英語の UTC は自動投稿になる日(img.utc)から。手で予約済みの分は日本時間のまま
  frame(g, en ? '🗓 TODAY' : '🗓 本日の予定', en ? (im.utc ? 'Times in UTC' : 'Times in JST (UTC+9)') + ' · prev 1h = BTC change 1h after the previous release (Binance spot)' : '時刻は日本時間 / 前回1h = 前回の発表から1時間のBTCの変動(Binance現物)');
  txt(g, en ? `TODAY · ${dateEn(im.day + 12 * 36e5)}` : `今日のイベント  ${dayJa(im.day)}`, 56, 150, { size: 44, w: 600, col: C.tx, max: 1088 });
  // 左: 今日(縦のタイムライン)
  txt(g, en ? 'UPCOMING TODAY' : '今日このあと', 56, 210, { size: 16, w: 600, fam: MONO, col: C.cyan, ls: 2 });
  const T = im.today.slice(0, 6), top = 250, step = T.length > 4 ? 58 : 70;
  g.fillStyle = C.cyan; g.globalAlpha = 0.6; g.fillRect(74, top - 10, 1.5, Math.max(1, (T.length - 1) * step + 20)); g.globalAlpha = 1;
  if (!T.length) txt(g, en ? 'No scheduled events' : '予定なし', 100, top + 10, { size: 26, col: C.mut });
  T.forEach((e, i) => {
    const y = top + i * step; g.fillStyle = C.gold; g.beginPath(); g.arc(75, y, 6, 0, 7); g.fill();
    txt(g, hm(e.t, tz), 100, y + 9, { size: 24, w: 600, fam: MONO, col: C.gold });
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
    txt(g, en ? dE(e.t) : dayJa(e.t), rx, y, { size: 17, w: 600, fam: MONO, col: C.gold });
    txt(g, e[lg], rx + 150, y, { size: 19, col: C.tx, max: 340 });
  });
  if (im.week.length > WN) txt(g, en ? `+${im.week.length - WN} more` : `ほか${im.week.length - WN}件`, rx, 254 + WN * 44, { size: 16, col: C.mut });
}
// v91: 発表後の値動き(4銘柄 × +5分/+15分/+1時間)。バーは ±2% で端まで(超える分は端で止める)
function drawArch2(g, im, lg) {
  const en = lg === 'en', T = ['#5b8def', '#a77bdb', '#d9b45a', '#e08a4f'];   // 発表・5分・15分・1時間の色
  frame(g, en ? '📈 1H AFTER RELEASE' : '📈 発表から1時間', en ? 'Binance spot · base = 5m open at release · +5m/+15m/+1h = 5m close · bar = ±2%' : 'Binance現物 / 基準 = 発表時刻の5分足の始値 / 各時点 = 5分足の終値 / バーの端 = ±2%');
  txt(g, (im.icon ? im.icon + ' ' : '') + im[lg], 56, 146, { size: 40, w: 600, col: C.tx, max: 1088 });
  txt(g, en ? `${dateEn(im.t)} · ${hm(im.t, 'en')} UTC` : `${dateJa(im.t)} ${hm(im.t, 'ja')}(日本時間)`, 56, 188, { size: 20, fam: MONO, col: C.mut });
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
    txt(g, hm(im.t, lg) + (en ? ' UTC' : '(日本時間)'), 56 + 1088, 200, { size: 22, fam: MONO, col: C.mut, align: 'right' });
  } else {
    txt(g, im[lg], 56, 150, { size: 42, w: 600, col: C.tx, max: 1088 });
    txt(g, en ? `${dateEn(im.t)} · ${hm(im.t, 'en')} UTC` : `${dateJa(im.t)} ${hm(im.t, 'ja')}(日本時間)`, 56, 196, { size: 22, fam: MONO, col: C.mut });
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
  const en = lg === 'en', d = (t) => { const x = D(t, lg); return `${x.getUTCMonth() + 1}/${x.getUTCDate()}`; };
  frame(g, 'WEEKLY RECORD', en ? 'Binance spot · week = Fri 15:00 → Fri 15:00 UTC · first 1h open → last 1h close · bar = ±10%' : 'Binance現物 / 週 = 土曜0時〜次の土曜0時(日本時間) / 最初の1時間足の始値 → 最後の1時間足の終値 / バーの端 = ±10%');
  txt(g, en ? `🗓️ ${dayEn(im.ws).slice(4)} ${hm(im.ws, 'en')} → ${dayEn(im.we).slice(4)} ${hm(im.we, 'en')} UTC` : `🗓️ ${d(im.ws)} — ${d(im.we - 864e5)}(日本時間)`, 56, 146, { size: 40, w: 600, col: C.tx, max: 1088 });
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
    txt(g, (e.icon || '') + ' ' + (en ? e.sen || e.en : e.sja || e.ja), col0 + (two ? 0 : 80), y + (two ? 18 : 0),   // v103: 1列の時は日付の右に(重なっていた)
      { size: two ? 15 : 19, col: C.tx, max: two ? 160 : 300 });
    txt(g, v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%', col0 + cw - 16, y + (two ? 18 : 0), { size: two ? 15 : 19, w: 600, fam: MONO, col, align: 'right' });
  });
  if (ALL.length > E.length) txt(g, en ? `+${ALL.length - E.length} more` : `ほか${ALL.length - E.length}件`, rx, 252 + per * 48 - 6, { size: 14, col: C.mut });
}
function drawWeek(g, im, lg) {
  if (im && im.v === 2) return drawWeek2(g, im, lg);
  const en = lg === 'en';
  frame(g, 'WEEK IN CRYPTO', en ? 'Binance spot · week = Sun 15:00 → Sun 15:00 UTC · 1h open → 1h close' : 'Binance現物 / 週 = 月曜0時〜次の月曜0時(日本時間) / 最初の1時間足の始値 → 最後の1時間足の終値');
  txt(g, en ? `${dayEn(im.ws)} — ${dayEn(im.we - 864e5)}, ${D(im.ws, 'en').getUTCFullYear()} (UTC)` : `${dayJa(im.ws)} 〜 ${dayJa(im.we - 864e5)}`, 56, 150, { size: 40, w: 600, col: C.tx, max: 1088 });
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

// v95: 急変動(1時間で ±3% 以上)。左 = 4銘柄と S&P500 の同じ1時間の変化(バーの端 = ±5%)、右 = S&P500 との相関(30日・7日。バーの端 = ±1)
function drawSpike(g, im, lg) {
  const en = lg === 'en', d = D(im.t0, lg), md = en ? `${ME[d.getUTCMonth()]} ${d.getUTCDate()}` : `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  frame(g, en ? '⚡ BTC SHARP MOVE' : '⚡ BTC 急変動', en ? 'Pacifica perps · 1h = 5m closes · corr = Pearson, 1h returns, all hours · bars ±5% / ±1' : 'Pacifica 先物 / 1時間 = 5分足の終値 / 相関 = 1時間足のピアソン・全時間 / バー ±5%・±1');
  const bv = im.coins.BTC;   // v98: きっかけは BTC だけ
  txt(g, '⚡ BTC ' + (en ? '' : '1時間で ') + (bv == null ? '—' : (bv > 0 ? '+' : bv < 0 ? '−' : '±') + Math.abs(bv).toFixed(2) + '%') + (en ? ' IN 1H' : ''), 56, 146, { size: 40, w: 600, col: C.tx, max: 1088 });
  txt(g, `${md} · ${hm(im.t0, lg)} → ${hm(im.t1, lg)} ${en ? 'UTC' : '(日本時間)'}`, 56, 188, { size: 20, fam: MONO, col: C.mut });
  txt(g, en ? '1H CHANGE' : '同じ1時間の変化', 56, 236, { size: 15, w: 600, fam: MONO, col: C.cyan, ls: 2 });
  const R = [['BTC', '₿'], ['ETH', '◆'], ['SOL', '◎'], ['BNB', '◇']].filter(([c]) => im.coins[c] != null).map(([c, s]) => [s + ' ' + c, im.coins[c], im.hit.includes(c)]);
  R.push(['S&P500', im.spx, false]);
  R.forEach(([name, v], r) => {
    const y = 286 + r * 60, sp = name === 'S&P500', col = v == null ? C.mut : v > 0 ? C.up : v < 0 ? C.dn : C.tx;
    if (sp) { g.fillStyle = C.line; g.fillRect(56, y - 40, 540, 1); }
    txt(g, name, 56, y, { size: 24, w: 600, fam: MONO, col: sp ? C.cyan : C.gold });
    txt(g, v == null ? '—' : (v > 0 ? '▲ +' : v < 0 ? '▼ −' : '± ') + Math.abs(v).toFixed(2) + '%', 380, y, { size: 26, w: 600, fam: MONO, col, align: 'right' });
    if (v != null) { const cx = 500, bw = 90, f = Math.max(-1, Math.min(1, v / 5)); g.fillStyle = C.line; g.fillRect(cx - bw, y - 9, bw * 2, 5); g.fillStyle = col; g.fillRect(f >= 0 ? cx : cx + f * bw, y - 9, Math.abs(f) * bw, 5); g.fillStyle = C.mut; g.fillRect(cx - 1, y - 14, 2, 15); }
    if (sp && !im.open) txt(g, en ? 'US market closed' : '米国市場の時間外', 56, y + 26, { size: 14, fam: MONO, col: C.mut });
  });
  const rx = 660; g.fillStyle = C.line; g.fillRect(rx - 28, 214, 1, 360);
  txt(g, en ? 'CORRELATION W/ S&P500 (1H RETURNS)' : 'S&P500との相関(1時間足)', rx, 236, { size: 15, w: 600, fam: MONO, col: C.cyan, ls: 1 });
  const cols = [[30, en ? '30D' : '30日', 880], [7, en ? '7D' : '7日', 1060]];
  cols.forEach(([, l, x]) => txt(g, l, x, 276, { size: 15, w: 600, fam: MONO, col: C.mut, align: 'center' }));
  [['BTC', '₿'], ['ETH', '◆'], ['SOL', '◎'], ['BNB', '◇']].forEach(([c, s], r) => {
    const y = 318 + r * 74;
    txt(g, s + ' ' + c, rx, y, { size: 24, w: 600, fam: MONO, col: C.gold });
    cols.forEach(([k, , x]) => {
      const o = im.corr && im.corr[k] && im.corr[k][c], v = o ? o.r : null;
      txt(g, v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2), x, y, { size: 26, w: 600, fam: MONO, col: v == null ? C.mut : C.tx, align: 'center' });
      if (v != null) txt(g, corrLabel(v, lg), x, y + 40, { size: 14, col: Math.abs(v) >= 0.4 ? C.cyan : C.mut, align: 'center' });   // v96: 強さの目安
      if (v != null) { const bw = 60, f = Math.max(-1, Math.min(1, v)); g.fillStyle = C.line; g.fillRect(x - bw, y + 12, bw * 2, 4); g.fillStyle = C.cyan; g.fillRect(f >= 0 ? x : x + f * bw, y + 12, Math.abs(f) * bw, 4); g.fillStyle = C.mut; g.fillRect(x - 1, y + 8, 2, 12); }
    });
  });
}

// ================= v109: チャートの画像(発表後の値動き・週間記録・急変動) =================
const LC = { BTC: '#c9b37e', ETH: '#7fc8d8', SOL: '#b9a6e0', BNB: '#e8a87c' };
const ME3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const dU = (t) => { const d = new Date(t); return `${P2(d.getUTCDate())} ${ME3[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const pS = (v, dp = 2) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(dp) + '%';
function niceStep(range, n) { const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p; return 10 * p; }
// 軸の枠。x0..x1, y0..y1 に lo..hi(値)を描く。戻り値 Y(v)
function axisY(g, x0, x1, y0, y1, lo, hi, fmt, n = 6) {
  const st = niceStep(hi - lo || 1, n), a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st;
  const Y = (v) => y1 - ((v - a) / (b - a)) * (y1 - y0);
  g.strokeStyle = 'rgba(140,160,190,0.13)'; g.lineWidth = 1;
  for (let v = a; v <= b + st / 2; v += st) { const y = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); txt(g, fmt(v, st), x0 - 12, y + 6, { size: 17, fam: MONO, col: C.mut, align: 'right' }); }
  g.strokeStyle = C.line; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
  return { Y, a, b };
}
function polyline(g, pts, col, w) { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); let st = false; for (const [x, y] of pts) { if (y == null || !isFinite(y)) { st = false; continue; } st ? g.lineTo(x, y) : g.moveTo(x, y); st = true; } g.stroke(); }
// 右端のラベル(重ならないように上下にずらす)
function endLabels(g, items, x, y0, y1, gap = 26) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
  const over = items.length ? items[items.length - 1].y - y1 : 0; if (over > 0) items.forEach((it) => { it.y -= over; });
  for (const it of items) txt(g, it.t, x, Math.max(y0 + 8, it.y) + 6, { size: 19, w: 600, fam: MONO, col: it.col });
}
const pctFmt = (v, st) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(st < 0.1 ? 2 : st < 1 ? 1 : 0) + '%';

// ② 発表後の値動き: 発表1時間前〜1時間後、発表時点 = 0% で4銘柄を重ねる
function drawArch3(g, im, lg) {
  const en = lg === 'en';
  frame(g, en ? '📈 1H AFTER RELEASE' : '📈 発表から1時間', en ? 'Binance spot · 0% = 5m open at release · 5m closes' : 'Binance現物 / 0% = 発表時刻の5分足の始値 / 5分足の終値');
  txt(g, (im.icon === '🏛️' ? '🏦' : im.icon || '') + ' ' + im[lg], W / 2, 142, { size: 40, w: 600, col: C.tx, max: 1000, align: 'center' });
  txt(g, en ? `${dU(im.t)} · ${hm(im.t, 'en')} UTC` : `${dateJa(im.t)} ${hm(im.t, 'ja')}(日本時間)`, W / 2, 180, { size: 20, fam: MONO, col: C.mut, align: 'center' });
  const x0 = 140, x1 = 960, y0 = 210, y1 = 560, X = (m) => x0 + ((m + 60) / 120) * (x1 - x0);   // m = 発表からの分
  const S = {};
  for (const c of ['BTC', 'ETH', 'SOL', 'BNB']) {
    const o = im.coins && im.coins[c]; if (!o || !o.sp || !o.before) continue;
    const pts = []; for (let i = 0; i < 24; i++) { const v = o.sp[i]; pts.push([(i - 11) * 5, v == null ? null : (v / o.before - 1) * 100]); }   // 足 i の終値 = 発表から (i−11)×5 分
    pts.splice(12, 0, [0, 0]); pts.splice(11, 1);   // 発表の瞬間 = 0%(発表の前の足の終値の代わりに基準そのもの)
    S[c] = pts;
  }
  const vals = Object.values(S).flat().map((p) => p[1]).filter((v) => v != null).concat([0]);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(0.15, (hi - lo) * 0.12); lo -= pad; hi += pad;
  const { Y } = axisY(g, x0, x1, y0, y1, lo, hi, pctFmt);
  g.strokeStyle = 'rgba(200,210,225,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, Y(0)); g.lineTo(x1, Y(0)); g.stroke();
  g.strokeStyle = C.gold; g.setLineDash([7, 7]); g.lineWidth = 2; g.beginPath(); g.moveTo(X(0), y0); g.lineTo(X(0), y1); g.stroke(); g.setLineDash([]);
  txt(g, en ? '−1H' : '1時間前', x0, y1 + 32, { size: 18, w: 600, fam: MONO, col: C.tx, align: 'center' });
  txt(g, en ? 'RELEASE' : '発表', X(0), y1 + 32, { size: 18, w: 600, fam: MONO, col: C.gold, align: 'center' });
  txt(g, en ? '+1H' : '1時間後', x1, y1 + 32, { size: 18, w: 600, fam: MONO, col: C.tx, align: 'center' });
  const labels = [];
  for (const c of ['BNB', 'SOL', 'ETH', 'BTC']) { if (!S[c]) continue; polyline(g, S[c].map(([m, v]) => [X(m), v == null ? null : Y(v)]), LC[c], c === 'BTC' ? 4.5 : 2.5); }
  for (const c of ['BTC', 'ETH', 'SOL', 'BNB']) { if (!S[c]) continue; const last = [...S[c]].reverse().find((p) => p[1] != null); const v = im.coins[c].c60 ?? (last && last[1]); if (last) labels.push({ y: Y(last[1]), t: `${c} ${pS(v)}`, col: LC[c] }); }
  endLabels(g, labels, x1 + 14, y0, y1);
}

// ③ 週間記録: BTC の1時間足の線 + 指標の発表時刻の点 + 右に4銘柄の週の変化
function drawWeek3(g, im, lg) {
  const en = lg === 'en', d = (t) => { const x = D(t, lg); return en ? `${P2(x.getUTCDate())} ${ME3[x.getUTCMonth()]}` : `${x.getUTCMonth() + 1}/${x.getUTCDate()}`; };
  frame(g, en ? '📊 WEEKLY RECORD' : '📊 週間記録', en ? 'Binance spot · BTC 1h · dot = BTC change 1h after each release' : 'Binance現物 / BTC 1時間足 / 点 = 各指標の発表から1時間の BTC の変化');
  txt(g, en ? `${d(im.ws)} ${hm(im.ws, 'en')} → ${d(im.we)} ${hm(im.we, 'en')} UTC` : `${d(im.ws)} 〜 ${d(im.we - 864e5)}(日本時間)`, 56, 146, { size: 40, w: 600, fam: MONO, col: C.tx, max: 1088 });
  const x0 = 150, x1 = 880, y0 = 190, y1 = 560, X = (t) => x0 + ((t - im.ws) / (im.we - im.ws)) * (x1 - x0);
  const P = (im.btc || []).map((v, i) => [im.ws + i * 36e5, v]).filter((p) => p[1] > 0);
  if (P.length) {
    const vs = P.map((p) => p[1]); let lo = Math.min(...vs), hi = Math.max(...vs); const pad = (hi - lo) * 0.18 || hi * 0.01; lo -= pad; hi += pad;
    const { Y } = axisY(g, x0, x1, y0, y1, lo, hi, (v) => '$' + Math.round(v).toLocaleString('en-US'), 6);
    for (let k = 1; k < 7; k++) { const t = im.ws + k * 864e5, x = Math.round(X(t)) + 0.5; g.strokeStyle = 'rgba(140,160,190,0.10)'; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
    for (let k = 0; k <= 7; k++) { const t = im.ws + k * 864e5; txt(g, en ? `${d(t)} ${hm(t, 'en')}`.replace(' 15:00', '') : d(t), X(t), y1 + 30, { size: 16, fam: MONO, col: C.mut, align: 'center' }); }
    polyline(g, P.map(([t, v]) => [X(t), Y(v)]), '#e6e9ef', 2.2);
    const at = (t) => { let best = P[0]; for (const p of P) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p; return best; };
    const EV = (im.ev || []).filter((e) => e.t >= im.ws && e.t < im.we).slice().sort((a, b) => a.t - b.t);
    const placed = [];
    EV.slice(0, 10).forEach((e) => {
      const p = at(e.t), x = X(e.t), y = Y(p[1]), r = e.major ? 8 : 5.5;
      g.fillStyle = C.gold; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      const name = en ? (e.sen || e.en) : (e.sja || e.ja), val = e.btc == null ? '—' : pS(e.btc), vc = e.btc == null ? C.mut : e.btc > 0 ? C.up : e.btc < 0 ? C.dn : C.tx;
      let ly = y - 78; if (ly < y0 + 24) ly = y + 60;                          // 上に入らなければ下に
      for (const q of placed) if (Math.abs(q.x - x) < 150 && Math.abs(q.y - ly) < 46) ly = q.y + (ly <= q.y ? -48 : 48);
      ly = Math.max(y0 + 22, Math.min(y1 - 30, ly)); placed.push({ x, y: ly });
      const lx = Math.max(x0 + 70, Math.min(x1 - 70, x));
      g.font = `600 16px ${SANS}`; const bw = Math.min(180, Math.max(g.measureText(name).width, 70)) + 16;   // 文字の後ろに地の色(線と重なっても読めるように)
      g.fillStyle = 'rgba(10,14,22,0.82)'; g.fillRect(lx - bw / 2, ly - 20, bw, 48);
      g.strokeStyle = 'rgba(201,179,126,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(lx, ly < y ? ly + 28 : ly - 20); g.stroke();
      txt(g, name, lx, ly, { size: 16, w: 600, col: C.gold, align: 'center', max: 170 });
      txt(g, val, lx, ly + 22, { size: 16, w: 600, fam: MONO, col: vc, align: 'center' });
    });
  }
  // 右: 4銘柄の週の変化(横棒。0 の線の左右)
  const rx0 = 930, rx1 = 1144, zx = rx0 + (rx1 - rx0) * 0.6;
  g.fillStyle = C.line; g.fillRect(rx0 - 20, y0, 1, y1 - y0);
  const CO = ['BTC', 'ETH', 'SOL', 'BNB'].filter((c) => im.coins && im.coins[c]), mx = Math.max(5, ...CO.map((c) => Math.abs(im.coins[c].chg)));
  g.fillStyle = 'rgba(200,210,225,0.4)'; g.fillRect(zx, y0, 1.5, y1 - y0);
  CO.forEach((c, i) => {
    const v = im.coins[c].chg, y = y0 + 30 + i * ((y1 - y0 - 20) / CO.length), col = v > 0 ? C.up : v < 0 ? C.dn : C.tx, bw = (Math.abs(v) / mx) * (zx - rx0 - 6) * (v >= 0 ? (rx1 - zx) / (zx - rx0) : 1);
    txt(g, c, rx0, y, { size: 20, w: 600, fam: MONO, col: C.gold });
    txt(g, pS(v), rx1, y, { size: 19, w: 600, fam: MONO, col, align: 'right' });
    g.fillStyle = col; g.fillRect(v >= 0 ? zx : zx - bw, y + 14, Math.max(2, bw), 18);
  });
}

// ④ 急変動: 直近6時間の BTC(急変動の1時間を色付け)と S&P500、右に S&P500 との相関(30日)
function drawSpike2(g, im, lg) {
  const en = lg === 'en', bv = im.coins.BTC, vcol = bv > 0 ? C.up : bv < 0 ? C.dn : C.tx, WN = im.win || 1;
  frame(g, en ? `⚡ BTC SHARP MOVE · ${WN}H` : `⚡ BTC 急変動 · ${WN}時間`, en ? 'Pacifica perps · 5m closes · Pearson correlation of 1h returns' : 'Pacifica 先物 / 5分足の終値 / 相関 = 1時間足の変化率のピアソン相関');
  // 見出し: ⚡ BTC −3.42% IN 1H(値だけ色)
  g.font = `600 44px ${SANS}`; const h1 = '⚡ BTC ' + (en ? '' : WN + '時間で '), h2 = pS(bv), h3 = en ? ` IN ${WN}H` : '';
  let x = 56; txt(g, h1, x, 146, { size: 44, w: 600, col: C.tx }); g.font = `600 44px ${SANS}`; x += g.measureText(h1).width;
  txt(g, h2, x, 146, { size: 44, w: 600, col: vcol }); g.font = `600 44px ${SANS}`; x += g.measureText(h2).width; if (h3) txt(g, h3, x, 146, { size: 44, w: 600, col: C.tx });
  const dd = D(im.t0, lg), de = D(im.t1, lg), same = dd.getUTCDate() === de.getUTCDate(); txt(g, en ? (same ? `${P2(dd.getUTCDate())} ${ME3[dd.getUTCMonth()]} ${dd.getUTCFullYear()} · ${hm(im.t0, lg)}→${hm(im.t1, lg)} UTC` : `${P2(dd.getUTCDate())} ${ME3[dd.getUTCMonth()]} ${hm(im.t0, lg)} → ${P2(de.getUTCDate())} ${ME3[de.getUTCMonth()]} ${hm(im.t1, lg)} UTC`) : (same ? `${dateJa(im.t0)} ${hm(im.t0, lg)}→${hm(im.t1, lg)}(日本時間)` : `${dd.getUTCMonth() + 1}/${dd.getUTCDate()} ${hm(im.t0, lg)} → ${de.getUTCMonth() + 1}/${de.getUTCDate()} ${hm(im.t1, lg)}(日本時間)`), 56, 186, { size: 20, fam: MONO, col: C.mut });
  const ser0 = im.ser || {}, n = Math.max(2, (ser0.btc || []).length || 72), x0 = 120, x1 = 760, y0 = 230, y1 = 560, X = (i) => x0 + (i / (n - 1)) * (x1 - x0);
  const ser = ser0, pph = 12 / (ser0.step || 1), bi = Math.max(0, Math.round(n - 1 - pph * WN));   // pph = 1時間あたりの点の数                                    // 基準 = 急変動の1時間の始まり(後ろから13本目の終値)
  const norm = (a) => { if (!a || !a.length) return []; const base = a[bi] || a.find((v) => v > 0); return a.map((v) => (v > 0 && base ? (v / base - 1) * 100 : null)); };
  const B = norm(ser.btc), Sx = norm(ser.spx), vals = B.concat(Sx).filter((v) => v != null).concat([0, bv, im.spx ?? 0]);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(0.2, (hi - lo) * 0.1); lo -= pad; hi += pad;
  const { Y } = axisY(g, x0, x1, y0, y1, lo, hi, pctFmt, 5);
  g.fillStyle = bv < 0 ? 'rgba(194,100,95,0.20)' : 'rgba(95,168,138,0.20)'; g.fillRect(X(bi), y0 + 1, x1 - X(bi), y1 - y0 - 1);   // 急変動の1時間
  g.strokeStyle = 'rgba(200,210,225,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, Y(0)); g.lineTo(x1, Y(0)); g.stroke();
  const spanH = Math.round((n - 1) / pph), stepH = spanH > 24 ? 6 : spanH > 6 ? 2 : 1; for (let hh = spanH; hh >= 1; hh--) { if (hh % stepH) continue; const i = Math.round(n - 1 - hh * pph); if (i < 0) continue; const xx = X(i); g.strokeStyle = 'rgba(140,160,190,0.10)'; g.beginPath(); g.moveTo(xx, y0); g.lineTo(xx, y1); g.stroke(); txt(g, en ? `−${hh}H` : `${hh}時間前`, xx, y1 + 30, { size: 16, fam: MONO, col: C.mut, align: 'center' }); }
  txt(g, en ? 'NOW' : '直近', x1, y1 + 30, { size: 16, w: 600, fam: MONO, col: C.tx, align: 'center' });
  polyline(g, Sx.map((v, i) => [X(i), v == null ? null : Y(v)]), '#6f9bb0', 2.2);
  polyline(g, B.slice(0, bi + 1).map((v, i) => [X(i), v == null ? null : Y(v)]), C.gold, 3.5);
  polyline(g, B.map((v, i) => [X(i), i < bi || v == null ? null : Y(v)]), vcol, 3.5);
  const lb = []; const lastB = [...B].reverse().find((v) => v != null), lastS = [...Sx].reverse().find((v) => v != null);
  if (lastB != null) lb.push({ y: Y(lastB), t: 'BTC ' + pS(bv), col: vcol }); if (lastS != null && im.spx != null) lb.push({ y: Y(lastS), t: 'S&P ' + pS(im.spx), col: '#8fb6c8' });
  endLabels(g, lb, x1 + 12, y0, y1);
  // 凡例
  g.fillStyle = C.gold; g.fillRect(560, 196, 22, 4); txt(g, 'BTC', 590, 203, { size: 16, fam: MONO, col: C.mut });
  g.fillStyle = '#6f9bb0'; g.fillRect(650, 196, 22, 4); txt(g, 'S&P500', 680, 203, { size: 16, fam: MONO, col: C.mut });
  // 右: 相関
  const rx = 920, rw = 224; g.fillStyle = C.line; g.fillRect(rx - 24, 120, 1, 470);
  txt(g, en ? 'CORRELATION' : 'S&P500との相関', rx, 146, { size: 21, w: 600, col: C.tx }); txt(g, en ? 'W/ S&P500 · 30D' : '30日・1時間足', rx, 174, { size: 17, fam: MONO, col: C.mut });
  ['BTC', 'ETH', 'SOL', 'BNB'].forEach((c, i) => {
    const o = im.corr && im.corr[30] && im.corr[30][c], v = o ? o.r : null, y = 236 + i * 84;
    txt(g, c, rx, y, { size: 20, w: 600, fam: MONO, col: C.tx }); txt(g, v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2), rx + 62, y, { size: 20, w: 600, fam: MONO, col: C.gold });
    txt(g, corrLabel(v, lg), rx + rw, y, { size: 14, col: C.mut, align: 'right' });
    g.fillStyle = C.line; g.fillRect(rx, y + 14, rw, 8); if (v != null) { g.fillStyle = v < 0 ? C.dn : C.gold; g.fillRect(rx, y + 14, Math.min(1, Math.abs(v)) * rw, 8); }
    txt(g, '0', rx, y + 42, { size: 13, fam: MONO, col: C.mut }); txt(g, '1', rx + rw, y + 42, { size: 13, fam: MONO, col: C.mut, align: 'right' });
  });
}


// v152: 清算(巨額清算の総括 kind='wave' / 毎朝のまとめ kind='day')。上 = ロング清算(赤)・下 = ショート清算(緑)
const usdK = (v) => { v = Math.abs(+v || 0); return v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e7 ? '$' + Math.round(v / 1e6) + 'M' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v); };
// v171: 清算の色・言い回しは /next.html に揃える(ロング #e07a7a・ショート #7fc99a)。倍率は next.html と同じ定義
const LQL = '#e07a7a', LQS = '#7fc99a';
const fxs = (v) => v == null || !isFinite(v) ? '—' : v >= 10 ? v.toFixed(0) : v.toFixed(1);
function twoTone(g, x, y, a, b, { size = 14, align = 'left', fam = MONO, w = 600, gap = 12 } = {}) {   // 左 = ロング色、右 = ショート色
  g.font = `${w} ${size}px ${fam}`; const wa = g.measureText(a).width, wb = g.measureText(b).width, x0 = align === 'right' ? x - (wa + gap + wb) : x;
  txt(g, a, x0, y, { size, w, fam, col: LQL }); txt(g, b, x0 + wa + gap, y, { size, w, fam, col: LQS });
  return x0;
}
function drawLiq(g, im, lg) {
  const en = lg === 'en', wave = im.kind === 'wave', co = im.coins || {}, mu = !wave && im.mult ? im.mult : null;
  frame(g, wave ? (en ? '🔥 LIQUIDATION WAVE' : '🔥 巨額清算') : (en ? '🧹 LIQUIDATIONS 24H' : '🧹 清算 24時間'),
    wave ? (en ? 'Bybit + OKX live liquidation streams · USD · not the whole market' : 'Bybit・OKX のライブ受信の合算 / USD / 全市場ではありません')
      : (en ? 'Binance + Bybit + OKX + Huobi (Coinalyze) · USD · normal day = prior 14-day median · not whole market' : 'Binance・Bybit・OKX・Huobi の合算(Coinalyze)/ USD / 平常日 = 直前14日の中央値 / 全市場ではありません'));
  let tl = 0, ts = 0; for (const c of Object.keys(co)) { tl += co[c].long || 0; ts += co[c].short || 0; }
  txt(g, wave ? (en ? 'LIQUIDATION WAVE' : '巨額清算') : (en ? 'LIQUIDATIONS · LAST 24H' : '清算額 · 直近24時間'), 56, 146, { size: 44, w: 600, max: 470 });
  const a = im.start, b = im.end, d1 = D(a, lg), d2 = D(b, lg);
  const rng = en ? `${P2(d1.getUTCDate())} ${ME3[d1.getUTCMonth()]} ${hm(a, lg)} → ${P2(d2.getUTCDate())} ${ME3[d2.getUTCMonth()]} ${hm(b, lg)} UTC` : `${d1.getUTCMonth() + 1}/${d1.getUTCDate()} ${hm(a, lg)} → ${d2.getUTCMonth() + 1}/${d2.getUTCDate()} ${hm(b, lg)} 日本時間`;
  txt(g, rng + (im.partial ? (en ? ' · partial' : ' · 記録は途中から') : ''), 56, 182, { size: 18, fam: MONO, col: C.mut });
  txt(g, (en ? 'LONG ' : 'ロング ') + usdK(tl), 760, 146, { size: 30, w: 600, col: LQL, align: 'right' });
  txt(g, (en ? 'SHORT ' : 'ショート ') + usdK(ts), 760, 182, { size: 30, w: 600, col: LQS, align: 'right' });
  if (mu && mu.l != null && mu.s != null) {   // 平常日比(全銘柄の合計 ÷ 各銘柄の平常日の合計)
    const lx = twoTone(g, 760, 210, (en ? 'LONG ×' : 'ロング ×') + fxs(mu.l), (en ? 'SHORT ×' : 'ショート ×') + fxs(mu.s), { size: 17, align: 'right' });
    txt(g, en ? 'vs normal day' : '平常日比', lx - 12, 210, { size: 15, fam: MONO, col: C.mut, align: 'right' });
  }
  const ser = wave ? (im.ser || []) : (im.hours || []), step = wave ? 3e5 : 36e5, n = Math.max(2, Math.round((b - a) / step));
  const x0 = 120, x1 = 760, y0 = 236, y1 = 560, mid = (y0 + y1) / 2, half = (y1 - y0) / 2;
  const mx = Math.max(1, ...ser.map((q) => Math.max(q[1], q[2]))) * 1.12;
  g.strokeStyle = C.line; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
  for (const f of [-1, -0.5, 0, 0.5, 1]) { const y = mid - f * half; g.strokeStyle = f === 0 ? 'rgba(200,210,225,0.35)' : 'rgba(140,160,190,0.10)'; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); txt(g, f === 0 ? '0' : usdK(Math.abs(f) * mx), x0 - 10, y + 5, { size: 14, fam: MONO, col: C.mut, align: 'right' }); }
  const bw = Math.max(2, (x1 - x0) / n - 2);
  for (const q of ser) {
    const i = Math.max(0, Math.min(n - 1, Math.floor((q[0] - a) / step))), x = x0 + (i / n) * (x1 - x0) + 1, lh = (q[1] / mx) * half, sh = (q[2] / mx) * half;
    if (lh > 0) { g.fillStyle = LQL; g.fillRect(x, mid - lh, bw, lh); } if (sh > 0) { g.fillStyle = LQS; g.fillRect(x, mid, bw, sh); }
  }
  txt(g, 'LONG ↑', x0 + 8, y0 + 20, { size: 14, w: 600, fam: MONO, col: LQL }); txt(g, 'SHORT ↓', x0 + 8, y1 - 10, { size: 14, w: 600, fam: MONO, col: LQS });
  for (let k = 0; k <= 4; k++) { const t = a + (b - a) * k / 4; txt(g, hm(t, lg), x0 + (x1 - x0) * k / 4, y1 + 28, { size: 14, fam: MONO, col: C.mut, align: k === 0 ? 'left' : k === 4 ? 'right' : 'center' }); }
  if (wave && im.maxOne) txt(g, (en ? 'LARGEST ' : '最大の1件 ') + usdK(im.maxOne.usd) + ' ' + im.maxOne.coin + (en ? (im.maxOne.side === 'long' ? ' LONG' : ' SHORT') : (im.maxOne.side === 'long' ? ' ロング' : ' ショート')), x0, 214, { size: 18, w: 600, fam: MONO, col: C.gold });
  if (mu && mu.live) txt(g, en ? 'The latest hours are Bybit + OKX only until the next refresh' : '直近の数時間は、次の取り直しまで Bybit・OKX のみの分を含む', x0, y1 + 52, { size: 13, fam: MONO, col: C.mut });
  const rx = 920, rw = 224; g.fillStyle = C.line; g.fillRect(rx - 24, 120, 1, 470);
  txt(g, en ? 'BY COIN' : '銘柄別', rx, 146, { size: 21, w: 600 }); txt(g, en ? 'LONG / SHORT' : 'ロング / ショート', rx, 174, { size: 17, fam: MONO, col: C.mut });
  ['BTC', 'ETH', 'SOL', 'BNB'].forEach((c, i) => {
    const o = co[c] || { long: 0, short: 0 }, y = 236 + i * 84, sum = (o.long || 0) + (o.short || 0), cm = mu && mu.coins && mu.coins[c];
    txt(g, c, rx, y - 24, { size: 20, w: 600, fam: MONO });
    if (cm && cm.l != null) twoTone(g, rx, y, '×' + fxs(cm.l), '×' + fxs(cm.s), { size: 14, gap: 8 });
    txt(g, usdK(o.long), rx + rw, y - 24, { size: 18, w: 600, fam: MONO, col: LQL, align: 'right' }); txt(g, usdK(o.short), rx + rw, y, { size: 18, w: 600, fam: MONO, col: LQS, align: 'right' });
    g.fillStyle = C.line; g.fillRect(rx, y + 14, rw, 8); if (sum > 0) { g.fillStyle = LQL; g.fillRect(rx, y + 14, (o.long / sum) * rw, 8); g.fillStyle = LQS; g.fillRect(rx + (o.long / sum) * rw, y + 14, (o.short / sum) * rw, 8); }
  });
  if (mu) txt(g, en ? '× = vs normal day' : '× = 平常日比', rx, 612, { size: 12, fam: MONO, col: C.mut });
}

// v171: 清算の反応(発表を含む1時間を 0 として ±6時間。/next.html の案Aと同じ作り: 上 = ロング・下 = ショート、細線 = 過去の各回、太線 = 中央値、棒 = 今回)
function drawLiqImp(g, im, lg) {
  const en = lg === 'en', win = im.win || 6, nb = 2 * win + 1;
  frame(g, en ? '🌊 LIQUIDATIONS × MACRO' : '🌊 清算 × 指標', en ? 'Binance + Bybit + OKX + Huobi (Coinalyze) · 1× = median hour, prior 14 days · not causal' : 'Binance・Bybit・OKX・Huobi 合算(Coinalyze)/ 1× = 直前14日の1時間中央値 / 因果ではありません');
  txt(g, en ? im.en : im.ja, 56, 146, { size: 44, w: 600, max: 640 });
  const d = D(im.t, lg);
  txt(g, (en ? `${P2(d.getUTCDate())} ${ME3[d.getUTCMonth()]} ${hm(im.t, lg)} UTC release` : `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hm(im.t, lg)} 日本時間 発表`) + ` · ${im.sym}`, 56, 182, { size: 18, fam: MONO, col: C.mut });
  const cb = im.cw && im.cw[im.sym];
  if (cb && cb.l != null) { txt(g, (en ? 'LONG ×' : 'ロング ×') + fxs(cb.l), 760, 146, { size: 30, w: 600, col: LQL, align: 'right' }); txt(g, (en ? 'SHORT ×' : 'ショート ×') + fxs(cb.s), 760, 182, { size: 30, w: 600, col: LQS, align: 'right' }); }
  txt(g, en ? `${im.sym} · avg of the 3 hours from the release hour, vs a normal hour` : `${im.sym} · 発表を含む1時間から3時間の平均(平常の1時間比)`, 760, 210, { size: 14, fam: MONO, col: C.mut, align: 'right' });
  const x0 = 120, x1 = 760, y0 = 236, y1 = 560, mid = (y0 + y1) / 2, half = (y1 - y0) / 2, slot = (x1 - x0) / nb;
  const pk = Math.max(2, ...(im.med.l || []).map((v) => v || 0), ...(im.med.s || []).map((v) => v || 0), ...(im.cur.l || []).map((v) => v || 0), ...(im.cur.s || []).map((v) => v || 0));
  const mx = Math.ceil(pk * 1.25), X = (j) => x0 + (j + win + 0.5) * slot, YL = (v) => mid - Math.min(v, mx) / mx * half, YS = (v) => mid + Math.min(v, mx) / mx * half;
  g.strokeStyle = C.line; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
  for (const f of [-1, -0.5, 0, 0.5, 1]) { const y = mid - f * half; g.strokeStyle = f === 0 ? 'rgba(200,210,225,0.35)' : 'rgba(140,160,190,0.10)'; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); txt(g, f === 0 ? '0' : '×' + fxs(Math.abs(f) * mx), x0 - 10, y + 5, { size: 14, fam: MONO, col: C.mut, align: 'right' }); }
  const ks = im.cur.k;
  const line = (arr, up, col, w, al) => { g.strokeStyle = col; g.globalAlpha = al; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); let st = false; arr.forEach((v, i) => { if (v == null) { st = false; return; } const x = X(ks[i]), y = up ? YL(v) : YS(v); st ? g.lineTo(x, y) : g.moveTo(x, y); st = true; }); g.stroke(); g.globalAlpha = 1; };
  const bw = Math.max(4, slot - 10);
  ks.forEach((j, i) => { const l = im.cur.l[i], sh = im.cur.s[i]; if (l != null) { g.globalAlpha = 0.78; g.fillStyle = LQL; g.fillRect(X(j) - bw / 2, YL(l), bw, mid - YL(l)); } if (sh != null) { g.globalAlpha = 0.78; g.fillStyle = LQS; g.fillRect(X(j) - bw / 2, mid, bw, YS(sh) - mid); } g.globalAlpha = 1; });
  for (const q of im.past || []) { line(q.l, true, LQL, 1.2, 0.2); line(q.s, false, LQS, 1.2, 0.2); }
  line(im.med.l, true, LQL, 3.5, 1); line(im.med.s, false, LQS, 3.5, 1);
  g.strokeStyle = C.gold; g.setLineDash([6, 5]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(0), y0); g.lineTo(X(0), y1); g.stroke(); g.setLineDash([]);
  txt(g, en ? 'RELEASE HOUR' : '発表を含む1時間', X(0) + 8, y0 + 18, { size: 13, w: 600, fam: MONO, col: C.gold });
  txt(g, 'LONG ↑', x0 + 8, y0 + 20, { size: 14, w: 600, fam: MONO, col: LQL }); txt(g, 'SHORT ↓', x0 + 8, y1 - 10, { size: 14, w: 600, fam: MONO, col: LQS });
  for (const j of [-win, -win / 2, 0, win / 2, win]) txt(g, (j > 0 ? '+' : '') + j + 'h', X(j), y1 + 28, { size: 14, fam: MONO, col: C.mut, align: 'center' });
  txt(g, en ? `Bars: this release · Thin: each past release · Thick: median (n = ${im.n})` : `棒: 今回 · 細線: 過去の各回 · 太線: 中央値(n = ${im.n}回)`, x0, y1 + 54, { size: 13, fam: MONO, col: C.mut });
  const rx = 920, rw = 224; g.fillStyle = C.line; g.fillRect(rx - 24, 120, 1, 470);
  txt(g, en ? 'BY COIN' : '銘柄別', rx, 146, { size: 21, w: 600 }); txt(g, en ? 'NEXT 3H · LONG / SHORT' : '発表後3時間 · ロング / ショート', rx, 174, { size: 14, fam: MONO, col: C.mut });
  ['BTC', 'ETH', 'SOL', 'BNB'].forEach((c, i) => { const o = im.cw && im.cw[c], y = 236 + i * 70; txt(g, c, rx, y, { size: 20, w: 600, fam: MONO }); if (o && o.l != null) twoTone(g, rx + rw, y, '×' + fxs(o.l), '×' + fxs(o.s), { size: 20, align: 'right', gap: 10 }); g.fillStyle = C.line; g.fillRect(rx, y + 16, rw, 1); });
  if (im.mw && im.mw.l != null) { txt(g, en ? `${im.sym} PAST MEDIAN (n = ${im.n})` : `${im.sym} 過去の中央値(n = ${im.n}回)`, rx, 530, { size: 13, w: 600, fam: MONO, col: C.mut }); twoTone(g, rx + rw, 560, '×' + fxs(im.mw.l), '×' + fxs(im.mw.s), { size: 22, align: 'right', gap: 10 }); }
}

let fontsReady = null;
function loadFonts(sample) {
  const specs = ['900 24px "Zen Kaku Gothic New"', '700 24px "Zen Kaku Gothic New"', '700 24px "Space Grotesk"', '500 24px "Space Grotesk"', '600 24px "IBM Plex Mono"', '400 24px "IBM Plex Mono"', '600 24px "IBM Plex Sans"', '400 24px "IBM Plex Sans"', '700 24px "Noto Sans JP"', '400 24px "Noto Sans JP"'];
  return Promise.race([Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))), new Promise((r) => setTimeout(r, 4000))]);
}


// v204: BTC実況(今週のBTCがなぞっている過去の週 TOP3)。lv = tools/weekmatch.mjs の weekMatch の結果
const LJ = '"Zen Kaku Gothic New","Noto Sans JP",sans-serif', LN = '"Space Grotesk","Zen Kaku Gothic New","Noto Sans JP",sans-serif';
const LCY = '#2ff3ff', LRK = ['#ff9f1c', '#3cff9a', '#b49cff'];
function lt(g, s, x, y, o = {}) { g.font = `${o.w || 700} ${o.s || 24}px ${o.f || LJ}`; g.fillStyle = o.c || '#ffffff'; g.textAlign = o.a || 'left'; if (o.glow) { g.save(); g.shadowColor = o.glow; g.shadowBlur = o.b || 18; g.fillText(s, x, y); g.restore(); } else g.fillText(s, x, y); g.textAlign = 'left'; return g.measureText(s).width; }
function drawLive(g, lv, lg) {
  const en = lg === 'en', off = en ? 0 : 9 * 36e5, P = (n) => String(n).padStart(2, '0');
  const bg = g.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#0b1424'); bg.addColorStop(1, '#070c17'); g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  // 見出し
  lt(g, '📡', 26, 42, { s: 26 }); lt(g, en ? 'BTC LIVE' : 'BTC実況', 66, 42, { s: 26, w: 900, c: LCY });
  const de = new Date(lv.end + off), WD = en ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : WJ;
  const hd = `#${P(lv.no || 1)} · ${de.getUTCMonth() + 1}/${de.getUTCDate()}(${WD[de.getUTCDay()]}) ${de.getUTCHours()}:${P(de.getUTCMinutes())}${en ? ' UTC' : ''}`;
  lt(g, hd, W - 28, 42, { s: 24, w: 700, f: LN, a: 'right' });
  g.strokeStyle = 'rgba(160,190,220,.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(26, 56); g.lineTo(W - 26, 56); g.stroke();
  g.font = `900 46px ${LJ}`; const T = en ? 'Past weeks this BTC week is tracing' : '今週のBTCがなぞっている過去'; let ts = 46; while (g.measureText(T).width > W - 60 && ts > 28) { ts -= 2; g.font = `900 ${ts}px ${LJ}`; }
  lt(g, T, 28, 110, { s: ts, w: 900 });
  // グラフ
  const x0 = 92, x1 = W - 60, y0 = 160, y1 = 430, N = 336, K = lv.K, top = lv.top.slice(0, 3);
  const all = [...lv.cur, ...top.flatMap((m) => m.path)], mx0 = Math.max(...all), mn0 = Math.min(...all), st = mx0 - mn0 > 8 ? 4 : mx0 - mn0 > 4 ? 2 : 1;
  const hi = Math.ceil((mx0 + 0.2) / st) * st, lo = Math.floor((mn0 - 0.2) / st) * st;
  const X = (k) => x0 + k / N * (x1 - x0), Y = (v) => y0 + (hi - v) / (hi - lo || 1) * (y1 - y0);
  g.setLineDash([2, 6]); g.strokeStyle = 'rgba(160,190,220,.22)'; g.lineWidth = 1;
  for (let v = lo; v <= hi + 1e-9; v += st) { g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v) + '%', x0 - 14, Y(v) + 8, { s: 22, w: 500, f: LN, c: '#d6e2ee', a: 'right' }); }
  g.setLineDash([]);
  const DN = en ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['月', '火', '水', '木', '金', '土', '日'], today = Math.min(6, Math.floor(K / 48));
  DN.forEach((d, i) => lt(g, d, X(i * 48 + 24), y1 + 34, { s: 24, w: 900, c: i === today ? LCY : '#ffffff', a: 'center' }));
  // 今の線
  const xn = X(K); g.strokeStyle = LCY; g.lineWidth = 2; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(xn, y0 - 10); g.lineTo(xn, y1); g.stroke(); g.setLineDash([]);
  lt(g, en ? 'NOW ▼' : '今 ▼', xn, y0 - 18, { s: 22, w: 900, c: LCY, a: 'center' });
  // 過去の週(今まで = 細い実線、その後 = 点線)
  const line = (pts, col, w, dash) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.setLineDash(dash || []); g.beginPath(); pts.forEach(([k, v], i) => i ? g.lineTo(X(k), Y(v)) : g.moveTo(X(k), Y(v))); g.stroke(); g.setLineDash([]); };
  top.slice().reverse().forEach((m, j) => { const i = top.length - 1 - j, c = LRK[i];
    line(m.path.slice(0, K + 1).map((v, k) => [k, v]), c, 2.2); line(m.path.slice(K).map((v, k) => [k + K, v]), c, 2.6, [7, 6]); });
  // 今週
  g.save(); g.shadowColor = LCY; g.shadowBlur = 16; line(lv.cur.map((v, k) => [k, v]), LCY, 5); g.restore();
  // 投稿の印(#1, #2 …)
  (lv.marks || []).forEach((m, i) => { const last = i === lv.marks.length - 1, x = X(m.k), y = Y(lv.cur[m.k]);
    if (last) { g.save(); g.shadowColor = LCY; g.shadowBlur = 20; g.fillStyle = LCY; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); g.restore(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 11, 0, 7); g.stroke(); }
    else { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.strokeStyle = '#0b1424'; g.lineWidth = 2; g.stroke(); }
    if (!last) lt(g, '#' + m.n, x + 6, y - 14, { s: 17, w: 700, f: LN }); });
  // 線の終わりの番号(重ならないようにずらす)
  const ends = top.map((m, i) => ({ i, y: Y(m.path[m.path.length - 1]), y0: Y(m.path[m.path.length - 1]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 40) ends[k].y = ends[k - 1].y + 40;
  for (let k = ends.length - 1; k >= 0; k--) if (ends[k].y > y1 + 10) { ends[k].y = y1 + 10; if (k) ends[k - 1].y = Math.min(ends[k - 1].y, ends[k].y - 40); }
  ends.forEach((e) => { const c = LRK[e.i], xe = X(N); g.fillStyle = c; g.beginPath(); g.arc(xe, e.y0, 5, 0, 7); g.fill(); g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(xe, e.y0); g.lineTo(xe + 22, e.y); g.stroke();
    g.beginPath(); g.arc(xe + 36, e.y, 17, 0, 7); g.fill(); lt(g, String(e.i + 1), xe + 36, e.y + 8, { s: 22, w: 900, f: LN, c: '#06101c', a: 'center' }); });
  // 凡例
  g.strokeStyle = LCY; g.lineWidth = 5; g.beginPath(); g.moveTo(28, 496); g.lineTo(84, 496); g.stroke(); lt(g, en ? 'This week' : '今週', 96, 504, { s: 20, w: 700 });
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.setLineDash([7, 6]); g.beginPath(); g.moveTo(196, 496); g.lineTo(252, 496); g.stroke(); g.setLineDash([]); lt(g, en ? 'Dotted = what came next' : '点線＝過去のその後', 264, 504, { s: 20, w: 700, c: '#d6e2ee' });
  g.strokeStyle = 'rgba(160,190,220,.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(26, 524); g.lineTo(W - 26, 524); g.stroke();
  // 過去の週 TOP3(1つずつ独立)
  lt(g, en ? 'PAST WEEKS' : '過去の週', 26, 552, { s: 18, w: 900, c: '#c9d4e2' });
  const cw = (W - 52) / 3, MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  top.forEach((m, i) => { const cx = 26 + i * cw, c = LRK[i], d = new Date(m.w + off);
    if (i) { g.strokeStyle = 'rgba(160,190,220,.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, 540); g.lineTo(cx, 640); g.stroke(); }
    const bx = cx + (i ? 46 : 120); g.fillStyle = c; g.beginPath(); g.arc(bx, 582, 20, 0, 7); g.fill(); lt(g, String(i + 1), bx, 591, { s: 24, w: 900, f: LN, c: '#06101c', a: 'center' });
    const ds = en ? `${MO[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}〜`;
    g.font = `700 34px ${LN}`; let fs = 34; const mw = cx + cw - bx - 40; while (g.measureText(ds).width > mw && fs > 22) { fs -= 2; g.font = `700 ${fs}px ${LN}`; }
    lt(g, ds, bx + 32, 594, { s: fs, w: 700, f: LN });
    const wl = lt(g, en ? 'Match' : '一致率', bx + 32, 640, { s: 24, w: 900 });
    lt(g, m.rate + '%', bx + 32 + wl + 12, 642, { s: 44, w: 700, f: LN, c, glow: c + '99', b: 14 }); });
  lt(g, '@csa_archive', 26, 664, { s: 18, w: 700, f: LN, c: '#9fb0c4' });
  lt(g, en ? 'Past data · not a forecast' : '予測ではありません', W - 26, 664, { s: 16, w: 700, c: '#9fb0c4', a: 'right' });
}
export async function renderLive(lv, lg) {   // サイトのカード用
  await loadFonts('今週のBTCがなぞっている過去月火水木金土日一致率点線＝のその後予測ではありません実況〜0123456789#%@csa_archive');
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; drawLive(cv.getContext('2d'), lv, lg); return cv;
}

// 投稿1つの画像を描いて canvas を返す(描けない種類は null)

// v192: ボラティリティ(普段の何倍か)。48時間の終値 + 24時間前からの「普段の幅」(±1σ√時間)の帯
function drawVol(g, im, lg, marks = null) {   // v195: marks = 今日の指標 [{t, en, ja}](毎朝の予定の画像)
  const en = lg === 'en';
  frame(g, marks ? (en ? 'TODAY · BTC VOLATILITY' : '本日 · BTC 値動きの大きさ') : (en ? 'BTC VOLATILITY' : 'BTC 値動きの大きさ'), en ? 'Pacifica perps · 1h closes · normal = RMS of 1h log returns, past 30 days' : 'Pacifica 先物 · 1時間足 · 普段 = 過去30日の1時間変化の二乗平均平方根');
  txt(g, im.ratio.toFixed(1) + '×', 56, 210, { size: 96, w: 700, fam: MONO, col: C.gold });
  txt(g, en ? 'vs the 30-day normal' : '過去30日の普段と比べて', 56, 252, { size: 22, col: C.mut });
  const pc = (v) => '±' + v.toFixed(2) + '%';
  txt(g, (en ? 'Last 24h avg 1h move  ' : '直近24時間の1時間の変動  ') + pc(im.now1), 56, 312, { size: 22, col: C.tx });
  txt(g, (en ? '30-day normal  ' : '過去30日の普段  ') + pc(im.typ[1]), 56, 350, { size: 22, col: C.mut });
  if (im.range24) txt(g, (en ? '24h range  ' : '24時間の値幅  ') + im.range24.pct + '%', 56, 388, { size: 22, col: C.mut });
  if (im.g24 != null) txt(g, (en ? 'Model (ref.) 24h  ±' : 'モデル(参考) 24時間  ±') + im.g24.toFixed(2) + '%', 56, 440, { size: 17, col: C.cyan });
  const px = im.px || []; if (px.length < 5) return;
  const mk = (marks || []).filter((m) => m.t > im.end - 2 * 864e5 && m.t < im.end + 864e5);
  const x0 = 560, x1 = W - 56, y0 = 120, y1 = Hh - 100, t0 = px[0][0], t1 = Math.max(im.end, ...mk.map((m) => m.t + 2 * 36e5)), s1 = im.typ[1] / 100;
  const i0 = px.findIndex((p) => p[0] >= im.end - 864e5), base = px[Math.max(0, i0 - 1)], env = [];
  for (let k = 0; k <= 24; k++) { const w = s1 * Math.sqrt(k); env.push([base[0] + k * 36e5, base[1] * Math.exp(w), base[1] * Math.exp(-w)]); }
  const vals = [...px.map((p) => p[1]), ...env.map((e) => e[1]), ...env.map((e) => e[2])], mx = Math.max(...vals), mn = Math.min(...vals);
  const X = (t) => x0 + (t - t0) / (t1 - t0) * (x1 - x0), Y = (v) => y0 + (mx - v) / (mx - mn || 1) * (y1 - y0);
  g.fillStyle = 'rgba(127,200,216,0.14)'; g.beginPath(); env.forEach((e, i) => i ? g.lineTo(X(e[0]), Y(e[1])) : g.moveTo(X(e[0]), Y(e[1]))); for (let i = env.length - 1; i >= 0; i--) g.lineTo(X(env[i][0]), Y(env[i][2])); g.closePath(); g.fill();
  g.strokeStyle = C.cyan; g.globalAlpha = 0.6; g.lineWidth = 1.5; g.setLineDash([6, 6]); for (const j of [1, 2]) { g.beginPath(); env.forEach((e, i) => i ? g.lineTo(X(e[0]), Y(e[j])) : g.moveTo(X(e[0]), Y(e[j]))); g.stroke(); } g.setLineDash([]); g.globalAlpha = 1;
  g.strokeStyle = '#f7931a'; g.lineWidth = 3.5; g.beginPath(); px.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.stroke();
  // 今日の指標の発表時刻(縦の点線と名前)。右端を越える名前は左寄せで内側に
  mk.forEach((m, i) => { const x = X(m.t); g.strokeStyle = C.gold; g.globalAlpha = 0.7; g.lineWidth = 1.5; g.setLineDash([4, 5]); g.beginPath(); g.moveTo(x, y0 - 10); g.lineTo(x, y1); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    const nm = (en ? m.en : m.ja) || ''; txt(g, nm.length > 16 ? nm.slice(0, 15) + '…' : nm, x - 6, y0 + 8 + i * 22, { size: 15, w: 600, col: C.gold, align: 'right' }); });
  txt(g, en ? '48h · band = normal range from 24h ago' + (mk.length ? ' · dotted = today\'s releases' : '') : '48時間 · 帯 = 24時間前からの普段の幅' + (mk.length ? ' · 点線 = 本日の指標' : ''), x0, y1 + 30, { size: 15, col: C.mut, max: x1 - x0 });
}

// v196: 似ている過去の値動き。今(オレンジ太線)と過去の上位3件(細線。「今」より右 = その後は点線)を始まり 0% で重ねる
function drawPat(g, im, lg, opt = {}) {   // v202: opt = {label, ratio}(毎朝の予定の画像)。v203: 派手版
  const en = lg === 'en', q = im.q, N = q.path.length - 1, top = (im.top || []).slice(0, 3), COL = [C.cyan, C.gold, '#b28cff'], dn = q.chg < 0;
  frame(g, opt.label || (en ? (dn ? '⚡ BTC DROP · SIMILAR PAST' : '⚡ BTC RALLY · SIMILAR PAST') : (dn ? '⚡ BTC 急落 · 似ている過去' : '⚡ BTC 急騰 · 似ている過去')), en ? 'BTC 5m since 2017 · DTW · a past record, not a forecast' : '2017年以降の BTC 5分足から検索 · 過去の記録です(未来の方向は示しません)');
  const sg = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
  const hc = dn ? C.dn : C.up;
  g.font = `900 120px ${MONO}`; let hs = 120; while (hs > 60 && g.measureText(sg(q.chg)).width > 480) { hs -= 6; g.font = `900 ${hs}px ${MONO}`; }
  glow(g, sg(q.chg), 40, 200, { size: hs, w: 900, fam: MONO, col: hc, blur: 30 });
  txt(g, (en ? `in ${im.win}h · ` : `${im.win}時間で · `) + (q.p0 ? `${usd(q.p0)} → ${usd(q.p1)}` : ''), 44, 246, { size: 26, w: 800, col: C.tx, max: 470 });
  const m = top[0];
  if (m) {
    g.save(); g.fillStyle = 'rgba(255,255,255,0.06)'; g.strokeStyle = C.cyan; g.lineWidth = 3; g.beginPath(); (g.roundRect ? g.roundRect(40, 280, 480, 250, 18) : g.rect(40, 280, 480, 250)); g.fill(); g.stroke(); g.restore();
    txt(g, en ? `Closest match to this ${dn ? 'drop' : 'move'}` : `この${dn ? '下げ方' : '値動き'}に一番似ているのは`, 64, 322, { size: 22, w: 800, col: C.cyan, max: 440 });
    const d = D(m.t0, lg), ds = `${d.getUTCFullYear()}.${P2(d.getUTCMonth() + 1)}.${P2(d.getUTCDate())}`;
    glow(g, ds, 64, 392, { size: 56, w: 900, fam: MONO, col: '#ffffff', glow: C.cyan, blur: 22 });
    txt(g, `${hm(m.t0, lg)}${en ? ' UTC' : ''}`, 64, 428, { size: 20, w: 700, fam: MONO, col: C.mut });
    txt(g, en ? '24h after' : 'その後24時間', 64, 498, { size: 22, w: 700, col: '#cfe9f2' });
    glow(g, sg(m.after24), 230, 502, { size: 42, w: 900, fam: MONO, col: m.after24 > 0 ? C.up : m.after24 < 0 ? C.dn : C.tx, blur: 18 });
  }
  if (opt.ratio != null) txt(g, (en ? 'Volatility  ' : '値動き  普段の') + opt.ratio + (en ? 'x normal' : '倍'), 44, Hh - 70, { size: 18, w: 700, col: C.gold });
  const x0 = 590, x1 = W - 40, y0 = 104, y1 = Hh - 84, L = N * 2;
  const vals = [...q.path, ...top.flatMap((t) => t.path)], mx = Math.max(...vals) + 0.3, mn = Math.min(...vals) - 0.3;
  const X = (i) => x0 + i / L * (x1 - x0), Y = (v) => y0 + (mx - v) / (mx - mn || 1) * (y1 - y0);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; for (let v = Math.ceil(mn); v <= Math.floor(mx); v++) { g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); txt(g, (v > 0 ? '+' : '') + v + '%', x0 - 8, Y(v) + 5, { size: 14, fam: MONO, col: C.mut, align: 'right' }); }
  g.fillStyle = dn ? 'rgba(255,46,77,0.09)' : 'rgba(16,201,122,0.09)'; g.fillRect(X(0), y0, X(N) - X(0), y1 - y0);
  g.strokeStyle = '#ffffff'; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(X(N), y0 - 8); g.lineTo(X(N), y1); g.stroke(); g.setLineDash([]);
  txt(g, en ? 'now' : '今', X(N) + 8, y0 + 8, { size: 18, w: 800, col: '#ffffff' });
  top.forEach((t, k) => { g.strokeStyle = COL[k]; g.globalAlpha = k ? 0.6 : 0.95; g.lineWidth = k ? 2 : 3; g.beginPath(); t.path.forEach((v, i) => { if (i === N + 1) { g.stroke(); g.setLineDash([7, 6]); g.beginPath(); g.moveTo(X(N), Y(t.path[N])); } i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); }); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; });
  g.save(); g.shadowColor = 'rgba(255,140,30,0.9)'; g.shadowBlur = 18; g.strokeStyle = '#ff9a1f'; g.lineWidth = 6; g.beginPath(); q.path.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke(); g.restore();
  g.fillStyle = '#ff9a1f'; g.beginPath(); g.arc(X(N), Y(q.path[N]), 9, 0, 7); g.fill();
  txt(g, en ? `−${im.win}h` : `−${im.win}時間`, x0, y1 + 24, { size: 14, col: C.mut });
  txt(g, en ? `+${im.win}h (dotted = what came next)` : `+${im.win}時間(点線 = 過去のその後)`, X(N) + 8, y1 + 24, { size: 14, col: C.mut });
}
export async function drawPost(p, lg) {
  await loadFonts(JSON.stringify(p.img) + 'イベント前後今日週来変動発表日本時間予定なしほか件翌年月日このあと前回指標重要度順同じ時間の変化米国市場外相関足強中程度弱逆連動無係時間前後直近' + '巨額清算額直近銘柄別ロングショート記録は途中からの最大1件全市場ではありません公開清算ストリームの合算' + '今週のBTCがなぞっている過去実況一致率点線＝その後予測月火水木金土日〜' + '平常日比直前中央値取り直し数時間のみを含む次の清算経済指標発表を含む反応棒今回過去各回太線細線倍率平均因果示すものではありませんの合算1時間足あたり' + p[lg]);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const g = cv.getContext('2d');
  // v203: 色(上の帯・背景)を中身で決める。上げ = 緑・下げ = 赤・予定やまとめ = 青・値動きの大きさ = 金・清算の反応 = 紫
  const im = p.img || {}, sgn = (v) => v == null ? TONES.blue : v < 0 ? TONES.red : TONES.green;
  TONE = p.sr === 'pat' ? sgn(im.q && im.q.chg) : p.sr === 'spike' ? sgn(im.coins && im.coins.BTC) : p.sr === 'arch' ? sgn(im.coins && im.coins.BTC ? im.coins.BTC.c60 : im.chg)
    : p.sr === 'week' ? sgn(im.coins && im.coins.BTC ? im.coins.BTC.chg : null) : p.sr === 'vol' ? TONES.gold : p.sr === 'liq' || p.sr === 'liqday' ? TONES.red : p.sr === 'liqimp' ? TONES.purple : TONES.blue;
  const LV = p.img && p.img.live && p.img.live[lg];   // v204: 毎朝・夜は BTC実況の画像
  if ((p.sr === 'daily' || p.sr === 'sum') && LV && LV.top && LV.top.length) drawLive(g, LV, lg);
  else if (p.sr === 'daily') {
    if (p.img && p.img.pat && p.img.pat.q) drawPat(g, p.img.pat, lg, { label: lg === 'en' ? 'TODAY · SIMILAR PAST 24H' : '本日 · 似ている過去の24時間', ratio: p.img.vol ? p.img.vol.ratio : null });   // v202
    else if (p.img && p.img.vol && p.img.vol.px) drawVol(g, p.img.vol, lg, lg === 'en' && p.img.enl ? p.img.enl.today : p.img.today);
    else return null;
  }
  else if (p.sr === 'sum') { if (p.img && p.img.vol && p.img.vol.px) drawVol(g, p.img.vol, lg, p.img.marks); else return null; }   // v202: 夜のまとめ   // v195: ボラティリティ入りの日だけ画像あり                                     // v109: 毎朝の予定は画像なし(本文と同じ内容のため)
  else if (p.sr === 'arch') { if (p.img && p.img.v === 3) drawArch3(g, p.img, lg); else drawEvent(g, p.img, lg, false); }
  else if (p.sr === 'pat') { if (p.img && p.img.q && p.img.q.path) drawPat(g, p.img, lg); else return null; }   // v196
  else if (p.sr === 'vol') { if (p.img && p.img.px) drawVol(g, p.img, lg); else return null; }   // v192
  else if (p.sr === 'pre') { if (p.img && p.img.v === 3) drawArch3(g, p.img, lg); else return null; }   // v181: 発表前の予告 = 前回の発表後の値動きの画像
  else if (p.sr === 'week') { if (p.img && p.img.v === 3 && p.img.btc) drawWeek3(g, p.img, lg); else drawWeek(g, p.img, lg); }
  else if (p.sr === 'spike') { if (p.img && p.img.v === 2 && p.img.ser) drawSpike2(g, p.img, lg); else drawSpike(g, p.img, lg); }
  else if (p.sr === 'liq' || p.sr === 'liqday') drawLiq(g, p.img, lg);   // v152
  else if (p.sr === 'liqimp') drawLiqImp(g, p.img, lg);   // v171
  else return null;
  return cv;
}
export { W, Hh, loadFonts };
