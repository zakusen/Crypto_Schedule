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
  const mh = wave && im.hrs;   // v277: /posts.html で手で作った「直近◯時間」(集計は /api/liq)
  frame(g, mh ? (en ? `🔥 LIQUIDATIONS ${im.hrs}H` : `🔥 清算 ${im.hrs}時間`) : wave ? (en ? '🔥 LIQUIDATION WAVE' : '🔥 巨額清算') : (en ? '🧹 LIQUIDATIONS 24H' : '🧹 清算 24時間'),
    mh ? (en ? 'Binance+Bybit+OKX+Huobi · USD · not the whole market' : 'Binance・Bybit・OKX・Huobi合算 / USD / 全市場ではありません') : wave ? (en ? 'Bybit + OKX live liquidation streams · USD · not the whole market' : 'Bybit・OKX のライブ受信の合算 / USD / 全市場ではありません')
      : (en ? 'Binance + Bybit + OKX + Huobi (Coinalyze) · USD · normal day = prior 14-day median · not whole market' : 'Binance・Bybit・OKX・Huobi の合算(Coinalyze)/ USD / 平常日 = 直前14日の中央値 / 全市場ではありません'));
  let tl = 0, ts = 0; for (const c of Object.keys(co)) { tl += co[c].long || 0; ts += co[c].short || 0; }
  txt(g, mh ? (en ? `LIQUIDATIONS · LAST ${im.hrs}H` : `清算 · 直近${im.hrs}時間`) : wave ? (en ? 'LIQUIDATION WAVE' : '巨額清算') : (en ? 'LIQUIDATIONS · LAST 24H' : '清算額 · 直近24時間'), 56, 146, { size: 44, w: 600, max: 470 });
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
  const specs = ['900 24px "Noto Serif JP"', '700 24px "Noto Serif JP"', '500 24px "Inter"', '700 24px "Inter"', '900 24px "Noto Sans JP"', '700 24px "Noto Sans JP"', '900 24px "Zen Kaku Gothic New"', '700 24px "Zen Kaku Gothic New"', '700 24px "Space Grotesk"', '500 24px "Space Grotesk"', '600 24px "IBM Plex Mono"', '400 24px "IBM Plex Mono"', '600 24px "IBM Plex Sans"', '400 24px "IBM Plex Sans"', '700 24px "Noto Sans JP"', '400 24px "Noto Sans JP"'];
  return Promise.race([Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))), new Promise((r) => setTimeout(r, 4000))]);
}


// v204: BTC実況(今週のBTCがなぞっている過去の週 TOP3)。lv = tools/weekmatch.mjs の weekMatch の結果
const LJ = '"Zen Kaku Gothic New","Noto Sans JP",sans-serif', LN = '"Space Grotesk","Zen Kaku Gothic New","Noto Sans JP",sans-serif';
const LCY = '#2ff3ff', LRK = ['#ff9f1c', '#3cff9a', '#b49cff'];
const ltBase = (...a) => lt(...a);   // v284: 関数の中で lt を上書きする時のもと
function lt(g, s, x, y, o = {}) { g.font = `${o.w || 700} ${o.s || 24}px ${o.f || LJ}`; g.fillStyle = o.c || '#ffffff'; g.textAlign = o.a || 'left'; if (o.glow) { g.save(); g.shadowColor = o.glow; g.shadowBlur = o.b || 18; g.fillText(s, x, y); g.restore(); } else g.fillText(s, x, y); g.textAlign = 'left'; return g.measureText(s).width; }
const LH = 800;   // v205: BTC実況は縦を伸ばして予定の欄を合体。v207: 種類ごとに見出しを主役にした形(kind = daily / pre / arch / spike / liq)
const LP = (n) => String(n).padStart(2, '0');
function liveChart(g, lv, lg, y0, y1, o = {}) {
  const en = lg === 'en', off = en ? 0 : 9 * 36e5, dd = (t) => new Date(t + off), md = (t) => { const d = dd(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }, hmL = (t) => { const d = dd(t); return `${d.getUTCHours()}:${LP(d.getUTCMinutes())}`; };
  const WD = en ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : WJ;
  const x0 = 92, x1 = W - 60, N = lv.N || 336, STP = lv.st || 1800000, K = lv.K, top = lv.top.slice(0, 3), WEEKV = N * STP >= 3 * 864e5;
  const all = [...lv.cur, ...top.flatMap((m) => m.path)], mx0 = Math.max(...all), mn0 = Math.min(...all), st = mx0 - mn0 > 8 ? 4 : mx0 - mn0 > 4 ? 2 : 1;
  const hi = Math.ceil((mx0 + 0.2) / st) * st, lo = Math.floor((mn0 - 0.2) / st) * st;
  const X = (k) => x0 + k / N * (x1 - x0), Y = (v) => y0 + (hi - v) / (hi - lo || 1) * (y1 - y0), Xt = (t) => X((t - lv.ws) / STP);
  if (WEEKV) { g.fillStyle = 'rgba(47,243,255,.07)'; g.fillRect(X(144), y0 - 6, X(192) - X(144), y1 - y0 + 46); }   // 今日の列
  g.setLineDash([2, 6]); g.strokeStyle = 'rgba(160,190,220,.22)'; g.lineWidth = 1;
  for (let v = lo; v <= hi + 1e-9; v += st) { g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v) + '%', x0 - 14, Y(v) + 8, { s: 22, w: 500, f: LN, c: '#d6e2ee', a: 'right' }); }
  g.setLineDash([]);
  const ay = y1 + 32;
  if (!WEEKV) { const span = N * STP / 60000, tk = [15, 30, 60, 120, 180, 360].find((m) => span / m <= 8) * 60000;
    for (let t = Math.ceil((lv.ws + off) / tk) * tk - off; t <= lv.ws + N * STP; t += tk) { const x = Xt(t); g.strokeStyle = 'rgba(160,190,220,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y1); g.lineTo(x, y1 + 8); g.stroke();
      const mid = dd(t).getUTCHours() === 0 && dd(t).getUTCMinutes() === 0; lt(g, mid ? md(t) : hmL(t), x, ay, { s: 22, w: mid ? 900 : 700, f: LN, a: 'center', c: mid ? LCY : '#ffffff' }); } }
  else for (let i = 0; i < 7; i++) { const t = lv.ws + i * 864e5 + 12 * 36e5, d = dd(t), td = i === 3;
    lt(g, md(t), X(i * 48 + 24) - (en ? 22 : 18), ay, { s: 24, w: 700, f: LN, c: td ? LCY : '#ffffff', a: 'center' });
    lt(g, `(${WD[d.getUTCDay()]})`, X(i * 48 + 24) + (en ? 30 : 26), ay, { s: 18, w: 700, c: td ? LCY : '#c9d4e2', a: 'center' }); }
  // 予定の縦線(daily: これからの予定に A・B・C…)
  (o.letters || []).forEach((e) => { const x = Xt(e.t); g.strokeStyle = 'rgba(255,201,77,.8)'; g.lineWidth = 1.5; g.setLineDash([4, 5]); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.setLineDash([]); lt(g, e.L, x, y0 - 10, { s: 22, w: 900, f: LN, c: '#ffc94d', a: 'center' }); });
  // 出来事の帯(発表・急変動・清算)
  if (lv.hl) { const tc = lv.tone || '#ffc94d', xa = Xt(lv.hl.t0), xb = Xt(lv.hl.t1 || lv.hl.t0);
    if (xb - xa > 3) { g.fillStyle = tc + '22'; g.fillRect(xa, y0, xb - xa, y1 - y0); }
    g.strokeStyle = tc; g.lineWidth = 2.5; g.beginPath(); g.moveTo(xa, y0 - 8); g.lineTo(xa, y1); g.stroke();
    lt(g, lv.hl[lg] || lv.hl.ja, xa + 8, y0 + 4, { s: 20, w: 900, c: tc });
    if (o.bracket && xb - xa > 60) { const yb = y0 + 34; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xa + 4, yb); g.lineTo(xb - 4, yb); g.stroke(); g.beginPath(); g.moveTo(xa + 12, yb - 6); g.lineTo(xa + 4, yb); g.lineTo(xa + 12, yb + 6); g.moveTo(xb - 12, yb - 6); g.lineTo(xb - 4, yb); g.lineTo(xb - 12, yb + 6); g.stroke();
      g.font = `700 20px ${LJ}`; const bt = o.bracket, bw = g.measureText(bt).width + 16; g.fillStyle = '#0b1424'; g.fillRect((xa + xb) / 2 - bw / 2, yb - 14, bw, 28); lt(g, bt, (xa + xb) / 2, yb + 7, { s: 20, w: 700, a: 'center' }); } }
  // 今の線
  const xn = X(K); g.strokeStyle = LCY; g.lineWidth = 2; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(xn, y0 - 10); g.lineTo(xn, y1); g.stroke(); g.setLineDash([]);
  lt(g, (en ? 'NOW' : '今') + (o.nowTime ? ' ' + hmL(lv.end) : '') + ' ▼', xn, y0 - 18, { s: 22, w: 900, c: LCY, a: 'center' });
  const line = (pts, col, w, dash) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.setLineDash(dash || []); g.beginPath(); pts.forEach(([k, v], i) => i ? g.lineTo(X(k), Y(v)) : g.moveTo(X(k), Y(v))); g.stroke(); g.setLineDash([]); };
  top.slice().reverse().forEach((m, j) => { const i = top.length - 1 - j, c = LRK[i]; line(m.path.slice(0, K + 1).map((v, k) => [k, v]), c, 2.2); line(m.path.slice(K).map((v, k) => [k + K, v]), c, 2.6, [7, 6]); });
  g.save(); g.shadowColor = LCY; g.shadowBlur = 16; line(lv.cur.map((v, k) => [k, v]), LCY, 5); g.restore();
  (lv.marks || []).forEach((m, i) => { const last = i === lv.marks.length - 1, x = X(m.k), y = Y(lv.cur[m.k]);
    if (last) { g.save(); g.shadowColor = LCY; g.shadowBlur = 20; g.fillStyle = LCY; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); g.restore(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 11, 0, 7); g.stroke(); }
    else { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.strokeStyle = '#0b1424'; g.lineWidth = 2; g.stroke(); } });
  const ends = top.map((m, i) => ({ i, y: Y(m.path[m.path.length - 1]), y0: Y(m.path[m.path.length - 1]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 40) ends[k].y = ends[k - 1].y + 40;
  for (let k = ends.length - 1; k >= 0; k--) if (ends[k].y > y1 + 10) { ends[k].y = y1 + 10; if (k) ends[k - 1].y = Math.min(ends[k - 1].y, ends[k].y - 40); }
  ends.forEach((e) => { const c = LRK[e.i], xe = X(N); g.fillStyle = c; g.beginPath(); g.arc(xe, e.y0, 5, 0, 7); g.fill(); g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(xe, e.y0); g.lineTo(xe + 22, e.y); g.stroke();
    g.beginPath(); g.arc(xe + 36, e.y, 17, 0, 7); g.fill(); lt(g, String(e.i + 1), xe + 36, e.y + 8, { s: 22, w: 900, f: LN, c: '#06101c', a: 'center' }); });
}
function liveLegend(g, lg, y, marks, x = 28) {
  const en = lg === 'en'; g.strokeStyle = LCY; g.lineWidth = 5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 52, y); g.stroke(); x += 62; x += lt(g, en ? 'Now' : '今', x, y + 7, { s: 20, w: 700 }) + 36;
  if (marks) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); x += 14; x += lt(g, en ? 'Past posts' : 'これまでの投稿', x, y + 7, { s: 20, w: 700, c: '#d6e2ee' }) + 36; }
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.setLineDash([7, 6]); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 56, y); g.stroke(); g.setLineDash([]); lt(g, en ? 'Dotted = what came next' : '点線＝過去のその後', x + 68, y + 7, { s: 20, w: 700, c: '#d6e2ee' });
}
function fitBig(g, text, maxW, size, w, fam) { g.font = `${w} ${size}px ${fam}`; let s2 = size; while (g.measureText(text).width > maxW && s2 > 24) { s2 -= 2; g.font = `${w} ${s2}px ${fam}`; } return s2; }

const BIGN = { fomc: ['FOMC', 'FOMC', 'Statement ', '声明 '], cpi: ['米CPI', 'US CPI', 'Release ', '発表 '], nfp: ['米雇用統計', 'US jobs report', 'Release ', '発表 '], pce: ['米PCE', 'US PCE', 'Release ', '発表 '] };   // v215
// v208: FOMC の親子ポスト(fomc1 = 親: 一番似ていた1回 / fomc3 = 子: TOP3 / fomcres = 結果)。横軸 = 発表からの時間(−24h〜+4h)
function fomcChart(g, lv, lg, y0, y1, o = {}) {
  const en = lg === 'en', x0 = 96, x1 = W - 60, N = lv.N || 112, K = lv.K, kE = Math.round((lv.E - lv.ws) / lv.st), top = o.one ? lv.top.slice(0, 1) : lv.top.slice(0, 3);
  const all = [...lv.cur, ...top.flatMap((m) => m.path.slice(0, N + 1))], mx0 = Math.max(...all), mn0 = Math.min(...all), st = mx0 - mn0 > 8 ? 4 : mx0 - mn0 > 3 ? 2 : 1;
  const hi = Math.ceil((mx0 + 0.2) / st) * st, lo = Math.floor((mn0 - 0.2) / st) * st, X = (k) => x0 + k / N * (x1 - x0), Y = (v) => y0 + (hi - v) / (hi - lo || 1) * (y1 - y0);
  const SG = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
  lt(g, en ? 'Each meeting: 24h before release = 0%' : '各回の発表24時間前＝0%', x0 + 6, y0 - 14, { s: 18, w: 700, c: '#c9d4e2' });
  g.strokeStyle = 'rgba(160,190,220,.2)'; g.lineWidth = 1;
  for (let v = lo; v <= hi + 1e-9; v += st) { g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%', x0 - 12, Y(v) + 8, { s: 22, w: 700, f: LN, a: 'right' }); }
  g.strokeStyle = 'rgba(200,215,230,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.lineTo(x1, y1); g.stroke();
  const kNow = Math.min(K, kE), ticks = [[0, '−24h'], [48, '−12h'], ...(o.res ? [] : [[kNow, `−${Math.round((kE - kNow) / 4 * 2) / 2}h`]]), [kE, '0'], [kE + 4, o.res ? '+1h' : null], [N, '+4h']].filter((x) => x[1]);
  const used = []; ticks.forEach(([k, l]) => { const x = X(k); if (used.some((u) => Math.abs(u - x) < 46)) return; used.push(x); g.strokeStyle = 'rgba(160,190,220,.12)'; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); lt(g, l, x, y1 + 30, { s: 22, w: 700, f: LN, a: 'center' }); });
  // 発表の線
  g.strokeStyle = '#ffd23f'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(X(kE), y0 - 20); g.lineTo(X(kE), y1); g.stroke(); lt(g, (en ? (BIGN[lv.k || 'fomc'] || BIGN.fomc)[1] + ' release' : (BIGN[lv.k || 'fomc'] || BIGN.fomc)[0] + '発表'), X(kE), y0 - 30, { s: 22, w: 900, c: '#ffd23f', a: 'center' });
  if (!o.res) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(X(kNow), y0 - 6); g.lineTo(X(kNow), y1); g.stroke(); g.setLineDash([]); lt(g, en ? 'Now' : '今', X(kNow), y0 - 12, { s: 20, w: 900, a: 'center' }); }
  const line = (pts, col, w, dash) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.setLineDash(dash || []); g.beginPath(); pts.forEach(([k, v], i) => i ? g.lineTo(X(k), Y(v)) : g.moveTo(X(k), Y(v))); g.stroke(); g.setLineDash([]); };
  const dot = (k, v, c, r = 7) => { g.fillStyle = c; g.beginPath(); g.arc(X(k), Y(v), r, 0, 7); g.fill(); };
  const KS = lv.KS != null ? lv.KS : K;
  top.slice().reverse().forEach((m, j) => { const i = top.length - 1 - j, c = LRK[i], P = m.path.slice(0, N + 1);
    line(P.slice(0, KS + 1).map((v, k) => [k, v]), c, 2.4); line(P.slice(KS).map((v, k) => [k + KS, v]), c, 2.8, [7, 6]);
    dot(kE, P[kE], c); dot(kE + 4, P[kE + 4], c); dot(N, P[N], c);
    if (o.one && m.a1 != null) { const yy = Math.min(Y(P[kE + 4]), Y(P[kE])) - 40; lt(g, en ? '1h after' : '発表後1時間', X(kE + 4), yy - 26, { s: 18, w: 700, c, a: 'center' }); lt(g, SG(m.a1), X(kE + 4), yy, { s: 24, w: 900, f: LN, c, a: 'center' }); } });
  g.save(); g.shadowColor = LCY; g.shadowBlur = 14; line(lv.cur.slice(0, N + 1).map((v, k) => [k, v]), LCY, 4.5); g.restore();
  const kl = Math.min(K, N); g.fillStyle = LCY; g.beginPath(); g.arc(X(kl), Y(lv.cur[kl]), 10, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  if (o.res && lv.cur[kE + 4] != null) { lt(g, (en ? 'This time ' : '今回 ') + SG(lv.a1), X(kE + 4), Y(lv.cur[kE + 4]) - 22, { s: 24, w: 900, f: LN, c: LCY, a: 'center' }); }
}
function drawFomc(g, lv, lg) {
  const BN = BIGN[lv.k || 'fomc'] || BIGN.fomc, NM = lg === 'en' ? BN[1] : BN[0];
  const en = lg === 'en', off = en ? 0 : 9 * 36e5, H2 = LH, kind = lv.kind, SG = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%', SC = (v) => v == null ? '#ffffff' : v < 0 ? '#ff6b7d' : '#ffffff';
  const WD = en ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : WJ, dd = (t) => new Date(t + off), dl = (t) => { const d = new Date(t - 4 * 36e5); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };   // FOMC の日付は米国の開催日
  const bg = g.createLinearGradient(0, 0, 0, H2); bg.addColorStop(0, '#0d1d33'); bg.addColorStop(1, '#091526'); g.fillStyle = bg; g.fillRect(0, 0, W, H2);
  const rule = (y, a = 26, b = W - 26, c = 'rgba(160,190,220,.28)') => { g.strokeStyle = c; g.lineWidth = 1.5; g.beginPath(); g.moveTo(a, y); g.lineTo(b, y); g.stroke(); };
  const tw0 = lt(g, en ? 'CSA / BTC LIVE' : 'CSA / BTC実況', 26, 44, { s: 30, w: 900 });
  const E = dd(lv.E), ht = `${E.getUTCMonth() + 1}/${E.getUTCDate()}(${WD[E.getUTCDay()]}) ${E.getUTCHours()}:${LP(E.getUTCMinutes())} ${en ? 'UTC' : 'JST'}`;
  const hw = lt(g, (en ? BN[2] : BN[3]) + ht, W - 26, 44, { s: 24, w: 900, a: 'right' }); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(tw0 + 46, 50); g.lineTo(W - 26, 50); g.stroke();
  const legend = (y, items) => { let w = 0; g.font = `700 22px ${LJ}`; items.forEach((it) => { w += 60 + g.measureText(it[0]).width + 36; }); let x = (W - w) / 2;
    items.forEach(([t2, c, dash]) => { g.strokeStyle = c; g.lineWidth = dash ? 3 : 5; g.setLineDash(dash ? [8, 6] : []); g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 48, y - 7); g.stroke(); g.setLineDash([]); x += 60; x += lt(g, t2, x, y, { s: 22, w: 700 }) + 36; }); };
  const t1 = lv.top[0];
  if (kind === 'fomc1') {
    const left = Math.max(0, lv.E - (lv.now || lv.end)), hh = Math.round(left / 36e5 * 2) / 2, big = hh >= 1 ? (en ? `${hh}h` : (Number.isInteger(hh) ? `${hh}時間` : `${Math.floor(hh)}時間半`)) : (en ? `${Math.max(1, Math.round(left / 6e4))} min` : `${Math.max(1, Math.round(left / 6e4))}分`);
    const pre = en ? NM + ' in ' : NM + 'まで、あと'; g.font = `900 92px ${LJ}`; let fs = 92; while (g.measureText(pre + big).width > W - 60 && fs > 40) { fs -= 4; g.font = `900 ${fs}px ${LJ}`; }
    const pw = lt(g, pre, 26, 148, { s: fs, w: 900 }); lt(g, big, 26 + pw, 148, { s: fs, w: 900, c: LCY });
    { const sub = en ? `Overlaid with the most similar past ${NM}` : `今回に最も似た過去の${NM}を重ねる`; lt(g, sub, 28, 214, { s: fitBig(g, sub, W - 60, 44, 900, LJ), w: 900 }); }
    fomcChart(g, lv, lg, 300, 490, { one: 1, dl });
    legend(572, [[en ? 'This time' : '今回', LCY], [dl(t1.fomc), LRK[0]], [en ? 'Dotted = what came next' : '点線＝過去のその後', '#c9d4e2', 1]]);
    rule(600);
    let x = 40; x += lt(g, en ? 'Shape match' : '形状の一致率', x, 690, { s: 40, w: 900 }) + 24; lt(g, t1.rate + '%', x, 712, { s: 118, w: 900, f: LN, c: LCY });
    g.strokeStyle = 'rgba(160,190,220,.5)'; g.beginPath(); g.moveTo(560, 620); g.lineTo(560, 720); g.stroke();
    let x2 = 590; lt(g, dl(t1.fomc), x2, 652, { s: 26, w: 700, f: LN, c: '#c9d4e2' }); x2 += lt(g, en ? '1h after' : '発表後1時間', x2, 698, { s: 34, w: 900 }) + 20;
    lt(g, SG(t1.a1), W - 30, 712, { s: 96, w: 900, f: LN, c: LRK[0], a: 'right' });
    const rt = en ? 'Comparison with the other 2 in the reply ↓' : 'ほかの2回との比較は返信へ ↓'; const rw = lt(g, rt, W - 30, 752, { s: 26, w: 900, c: LCY, a: 'right' }); rule(762, W - 30 - rw, W - 30, LCY);
    lt(g, en ? 'Match = shape similarity, not a probability of rising.' : '一致率は形状の近さであり、上昇確率ではありません。', 26, 788, { s: 18, w: 700, c: '#c9d4e2' });
  } else {
    const res = kind === 'fomcres';
    if (res) { const t0r = en ? NM + ' · BTC 1h after ' : NM + ' 発表後1時間 '; const fr = fitBig(g, t0r + '−0.00%', W - 60, 70, 900, LJ); const pw = lt(g, t0r, 26, 140, { s: fr, w: 900 }); lt(g, SG(lv.a1), 26 + pw, 142, { s: fr + 6, w: 900, f: LN, c: lv.a1 < 0 ? '#ff6b7d' : LCY }); lt(g, en ? 'Side by side with the 3 closest past releases' : '似ていた過去3回と並べて', 28, 200, { s: 38, w: 900 }); }
    else { const pre = en ? 'The 3 closest past releases, then ' : '似ていた過去3回、その後の'; g.font = `900 76px ${LJ}`; let fs = 76; while (g.measureText(pre + 'BTC').width > W - 60 && fs > 44) { fs -= 4; g.font = `900 ${fs}px ${LJ}`; } const pw = lt(g, pre, 26, 140, { s: fs, w: 900 }); lt(g, 'BTC', 26 + pw, 140, { s: fs, w: 900, f: LN, c: LCY }); lt(g, en ? 'Compared on 24h before release → now' : '発表24時間前〜今の値動きで比較', 28, 200, { s: 38, w: 900 }); }
    fomcChart(g, lv, lg, 262, 416, { res, dl });
    legend(486, [[en ? 'This time' : '今回', LCY], ...lv.top.slice(0, 3).map((m, i) => [['①', '②', '③'][i] + dl(m.fomc), LRK[i]]), [en ? 'After' : 'その後', '#c9d4e2', 1]]);
    const cx = [26, 420, 790, W - 26], ty = 516; rule(ty - 10);
    lt(g, en ? 'Past ' + NM : '過去の' + NM, (cx[0] + cx[1]) / 2, ty + 26, { s: 26, w: 900, a: 'center' }); lt(g, en ? 'Shape match' : '形状の一致率', (cx[1] + cx[2]) / 2, ty + 26, { s: 26, w: 900, a: 'center' }); lt(g, en ? '1h after release' : '発表後1時間', (cx[2] + cx[3]) / 2, ty + 26, { s: 26, w: 900, a: 'center' });
    rule(ty + 42);
    const rows = [...(res ? [{ me: 1 }] : []), ...lv.top.slice(0, 3)], rh = res ? 38 : 44;
    rows.forEach((m, i) => { const y = ty + 42 + rh * (i + 1) - rh * 0.28;
      if (m.me) { lt(g, en ? 'This time' : '今回', (cx[0] + cx[1]) / 2, y, { s: 28, w: 900, c: LCY, a: 'center' }); lt(g, '—', (cx[1] + cx[2]) / 2, y, { s: 28, w: 700, f: LN, c: '#c9d4e2', a: 'center' }); lt(g, SG(lv.a1), (cx[2] + cx[3]) / 2, y, { s: 34, w: 900, f: LN, c: lv.a1 < 0 ? '#ff6b7d' : LCY, a: 'center' }); }
      else { const k = i - (res ? 1 : 0), c = LRK[k]; g.fillStyle = c; g.beginPath(); g.arc(cx[0] + 90, y - 10, 17, 0, 7); g.fill(); lt(g, String(k + 1), cx[0] + 90, y - 2, { s: 22, w: 900, f: LN, c: '#06101c', a: 'center' }); lt(g, dl(m.fomc), cx[0] + 120, y, { s: 30, w: 700, f: LN });
        lt(g, m.rate + '%', (cx[1] + cx[2]) / 2, y, { s: 36, w: 900, f: LN, c: LCY, a: 'center' }); lt(g, SG(m.a1), (cx[2] + cx[3]) / 2, y, { s: 36, w: 900, f: LN, c: SC(m.a1), a: 'center' }); }
      rule(ty + 42 + rh * (i + 1), 26, W - 26, 'rgba(160,190,220,.16)'); });
    [cx[1], cx[2]].forEach((x) => { g.strokeStyle = 'rgba(160,190,220,.28)'; g.beginPath(); g.moveTo(x, ty - 6); g.lineTo(x, ty + 42 + rh * rows.length - 4); g.stroke(); });
    const ny = ty + 42 + rh * rows.length + 28;
    lt(g, en ? 'Compared: 24h before each release up to the same time left as now (moves after release not used).' : '比較：各回の発表24時間前から、今回と同じ残り時間まで（発表後の動きは選定に使っていません）。', 26, ny, { s: 18, w: 700, c: '#d6e2ee' });
    lt(g, en ? '1h after = from the price at each release.' : '発表後1時間の騰落率は、各回の発表時点の価格を基準に計算。', 26, ny + 26, { s: 18, w: 700, c: '#d6e2ee' });
    lt(g, en ? 'Match = shape similarity, not a probability.' : '一致率は形状の近さであり、上昇・下落の確率ではありません。', 26, 788, { s: 18, w: 700, c: '#c9d4e2' });
  }
  lt(g, '@csa_archive', W - 26, 788, { s: 18, w: 700, f: LN, c: '#c9d4e2', a: 'right' });
}

// v219/v220: 急変動の「戻るのか？」。今回の動き → 過去の記録で戻った割合(3時間・24時間・7日)を大きく → 似ていた3回が戻るまでの時間
function drawSpkCmp(g, lv, lg) {
  const en = lg === 'en', off = en ? 0 : 9 * 36e5, H2 = LH, dn = lv.dir < 0, tone = dn ? '#ff4d66' : '#2fe38a', st = lv.stats || {}, SG = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
  const WD = en ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : WJ, dd = (t) => new Date(t + off), hmL = (t) => { const d = dd(t); return `${d.getUTCHours()}:${LP(d.getUTCMinutes())}`; }, dl = (t) => { const d = dd(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  const dur = (ms) => { if (ms == null) return null; const m = ms / 60000; return en ? (m < 60 ? `${Math.round(m)} min` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)} days`) : (m < 60 ? `${Math.round(m)}分` : m < 2880 ? `${Math.round(m / 60)}時間` : `${Math.round(m / 1440)}日`); };
  const bg = g.createLinearGradient(0, 0, 0, H2); bg.addColorStop(0, '#0b1424'); bg.addColorStop(1, '#070c17'); g.fillStyle = bg; g.fillRect(0, 0, W, H2);
  g.fillStyle = tone; g.fillRect(0, 0, W, 8);
  lt(g, en ? 'CSA / BTC LIVE' : 'CSA / BTC実況', 26, 50, { s: 26, w: 900, c: LCY });
  const de = dd(lv.end); lt(g, `${de.getUTCMonth() + 1}/${de.getUTCDate()}(${WD[de.getUTCDay()]}) ${hmL(lv.end)}${en ? ' UTC' : ''}`, W - 26, 50, { s: 24, w: 700, f: LN, a: 'right' });
  // 今回の動き
  const pre = en ? `BTC · last ${lv.hrs}h ` : `BTC 直近${lv.hrs}時間で `; const pw = lt(g, pre, 26, 136, { s: 46, w: 900 });
  const mw = lt(g, SG(lv.mv), 26 + pw, 142, { s: 96, w: 700, f: LN, c: tone, glow: tone + '66', b: 20 });
  if (lv.p0 && lv.p1) lt(g, `$${Math.round(lv.p0).toLocaleString('en-US')} → $${Math.round(lv.p1).toLocaleString('en-US')}`, W - 26, 132, { s: 30, w: 700, f: LN, c: '#d6e2ee', a: 'right' });
  // 問い
  g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 168, W, 64);
  const q = en ? `Did past ${dn ? 'drops' : 'jumps'} like this come back?` : `過去の同じような${dn ? '急落' : '急騰'}、${dn ? '下げる' : '上げる'}前の価格に戻った？`;
  lt(g, q, W / 2, 214, { s: fitBig(g, q, W - 60, 40, 900, LJ), w: 900, a: 'center' });
  // 答え(割合)
  const bars = [[en ? 'within 3h' : '3時間以内', st.r3], [en ? 'within 24h' : '24時間以内', st.r24], [en ? 'within 7 days' : '7日以内', st.r7]];
  const bw = (W - 52 - 40) / 3;
  bars.forEach(([lab, v], i) => { const x = 26 + i * (bw + 20), y = 254, hl = i === 1;
    g.fillStyle = hl ? 'rgba(47,243,255,.10)' : 'rgba(255,255,255,.04)'; g.strokeStyle = hl ? LCY : 'rgba(160,190,220,.35)'; g.lineWidth = hl ? 3 : 1.5; g.beginPath(); g.roundRect(x, y, bw, 200, 14); g.fill(); g.stroke();
    lt(g, lab, x + bw / 2, y + 44, { s: 30, w: 900, a: 'center' });
    lt(g, v == null ? '—' : v + '%', x + bw / 2, y + 140, { s: 96, w: 700, f: LN, c: hl ? LCY : '#ffffff', a: 'center', glow: hl ? LCY + '66' : null, b: 16 });
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x + 24, y + 166, bw - 48, 12); g.fillStyle = hl ? LCY : '#c9d4e2'; g.fillRect(x + 24, y + 166, (bw - 48) * (v || 0) / 100, 12); });
  const meta = en ? `${st.n} cases since 2017 (${dn ? '−' : '+'}${Math.round(lv.th * 10) / 10}%+ in ${lv.hrs}h)${st.med != null ? ` · median ${dur(st.med)}` : ''}` : `2017年以降の${st.n}回（${lv.hrs}時間で${dn ? '−' : '+'}${Math.round(lv.th * 10) / 10}%以上）${st.med != null ? `・戻るまでの中央値 ${dur(st.med)}` : ''}`;
  lt(g, meta, W / 2, 494, { s: 24, w: 700, c: '#d6e2ee', a: 'center' });
  // 似ていた3回
  g.strokeStyle = 'rgba(160,190,220,.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(26, 516); g.lineTo(W - 26, 516); g.stroke();
  lt(g, en ? 'The 3 closest in shape' : '形が近かった3回', 26, 552, { s: 26, w: 900 });
  const top = lv.top.slice(0, 3), cw = (W - 52 - 36) / 3, cy = 570, ch = 186, B = lv.K, N = lv.N;
  top.forEach((m, i) => { const cx = 26 + i * (cw + 18), c = LRK[i];
    g.fillStyle = 'rgba(255,255,255,.04)'; g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.roundRect(cx, cy, cw, ch, 12); g.fill(); g.stroke();
    lt(g, dl(m.day), cx + 16, cy + 34, { s: 24, w: 700, f: LN });
    const x0 = cx + 16, x1 = cx + cw - 16, y0 = cy + 48, y1 = cy + 112, all = [...lv.cur, ...m.path], hi = Math.max(...all) + 0.2, lo = Math.min(...all) - 0.2, X = (k) => x0 + k / N * (x1 - x0), Y = (v) => y0 + (hi - v) / (hi - lo || 1) * (y1 - y0);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(B), y0); g.lineTo(X(B), y1); g.stroke();
    const ln = (pts, col, w, dash) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.setLineDash(dash || []); g.beginPath(); pts.forEach(([k, v], j) => j ? g.lineTo(X(k), Y(v)) : g.moveTo(X(k), Y(v))); g.stroke(); g.setLineDash([]); };
    ln(m.path.slice(0, B + 1).map((v, k) => [k, v]), c, 2); ln(m.path.slice(B).map((v, k) => [k + B, v]), c, 2.6, [5, 4]); ln(lv.cur.map((v, k) => [k, v]), LCY, 3);
    const rt = m.rec != null ? (en ? `back in ${dur(m.rec)}` : `${dur(m.rec)}で回復`) : (en ? 'not back in 30 days' : '30日以内に戻らず');
    lt(g, rt, cx + cw / 2, cy + 162, { s: fitBig(g, rt, cw - 24, 40, 900, LJ), w: 900, c: m.rec != null ? '#3cff9a' : '#ff6b7d', a: 'center' }); });
  lt(g, en ? 'Past record, not a forecast · cyan = now' : '過去の記録で、予測ではありません・水色＝今回', 26, 786, { s: 18, w: 700, c: '#9fb0c4' });
  lt(g, '@csa_archive', W - 26, 786, { s: 18, w: 700, f: LN, c: '#9fb0c4', a: 'right' });
}

// v221: 大型ハッキングの後のBTC。発生の時刻を0にそろえて、過去の大型ハッキングと今回を重ねる(−6時間〜+24時間)
function drawHack(g, hv, lg) {
  const en = lg === 'en', off = en ? 0 : 9 * 36e5, H2 = LH, SG = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
  const WD = en ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : WJ, dd = (t) => new Date(t + off), hmL = (t) => { const d = dd(t); return `${d.getUTCHours()}:${LP(d.getUTCMinutes())}`; }, ym = (t) => { const d = dd(t); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}`; };
  const COLS = ['#ff9f1c', '#3cff9a', '#b49cff', '#ffd23f', '#ff6bd6', '#7ec8ff'];
  const bg = g.createLinearGradient(0, 0, 0, H2); bg.addColorStop(0, '#0b1424'); bg.addColorStop(1, '#070c17'); g.fillStyle = bg; g.fillRect(0, 0, W, H2);
  g.fillStyle = '#ff4d66'; g.fillRect(0, 0, W, 8);
  lt(g, en ? 'CSA / BTC LIVE' : 'CSA / BTC実況', 26, 50, { s: 26, w: 900, c: LCY });
  const de = dd(hv.end); lt(g, `${de.getUTCMonth() + 1}/${de.getUTCDate()}(${WD[de.getUTCDay()]}) ${hmL(hv.end)}${en ? ' UTC' : ''}`, W - 26, 50, { s: 24, w: 700, f: LN, a: 'right' });
  const T = en ? 'BTC after past major exchange hacks' : '過去の大型ハッキング、その後のBTC'; lt(g, T, 26, 124, { s: fitBig(g, T, W - 52, 58, 900, LJ), w: 900 });
  const sub = en ? `Now: large outflow from a ${hv.ev.en} wallet (suspected hack, unconfirmed)` : `今回：${hv.ev.ja}のウォレットから大量流出（ハッキングの疑い・未確認）`;
  lt(g, sub, 26, 172, { s: fitBig(g, sub, W - 52, 28, 900, LJ), w: 900, c: '#ff8a9a' });
  // チャート
  const x0 = 92, x1 = W - 200, y0 = 228, y1 = 470, N = hv.N, B = hv.B, all = [...hv.cur, ...hv.past.flatMap((h) => h.path)];
  const mx = Math.max(...all), mn = Math.min(...all), stp = mx - mn > 12 ? 4 : mx - mn > 6 ? 2 : 1, hi = Math.ceil((mx + 0.3) / stp) * stp, lo = Math.floor((mn - 0.3) / stp) * stp;
  const X = (k) => x0 + k / N * (x1 - x0), Y = (v) => y0 + (hi - v) / (hi - lo || 1) * (y1 - y0);
  g.strokeStyle = 'rgba(160,190,220,.2)'; g.lineWidth = 1; for (let v = lo; v <= hi + 1e-9; v += stp) { g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v) + '%', x0 - 12, Y(v) + 8, { s: 20, w: 700, f: LN, a: 'right' }); }
  [[0, '−6h'], [B, '0'], [B + 24, '+6h'], [B + 48, '+12h'], [B + 72, '+18h'], [N, '+24h']].forEach(([k, l]) => lt(g, l, X(k), y1 + 28, { s: 20, w: 700, f: LN, a: 'center' }));
  g.strokeStyle = '#ff4d66'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(X(B), y0 - 14); g.lineTo(X(B), y1); g.stroke(); lt(g, en ? 'hack' : '発生', X(B), y0 - 20, { s: 20, w: 900, c: '#ff4d66', a: 'center' });
  const line = (a, c, w) => { g.strokeStyle = c; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); a.forEach((v, k) => k ? g.lineTo(X(k), Y(v)) : g.moveTo(X(k), Y(v))); g.stroke(); };
  hv.past.forEach((h, i) => line(h.path, COLS[i % COLS.length] + 'cc', 2.2));
  g.save(); g.shadowColor = LCY; g.shadowBlur = 14; line(hv.cur, LCY, 5); g.restore();
  const kc = hv.cur.length - 1; g.fillStyle = LCY; g.beginPath(); g.arc(X(kc), Y(hv.cur[kc]), 9, 0, 7); g.fill();
  // 線の終わりの名前(重ならないようにずらす)
  const ends = hv.past.map((h, i) => ({ i, y: Y(h.path[N]), y0: Y(h.path[N]), nm: h[en ? 'en' : 'ja'] })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 26) ends[k].y = ends[k - 1].y + 26;
  ends.forEach((e) => { const c = COLS[e.i % COLS.length]; g.strokeStyle = c; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(N), e.y0); g.lineTo(X(N) + 12, e.y); g.stroke(); lt(g, e.nm, X(N) + 16, e.y + 7, { s: 20, w: 900, c }); });
  // 表(発生から24時間)
  g.strokeStyle = 'rgba(160,190,220,.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(26, 524); g.lineTo(W - 26, 524); g.stroke();
  lt(g, en ? 'BTC 24h after' : '発生から24時間のBTC', 26, 560, { s: 28, w: 900 });
  const rows = [...hv.past.map((h, i) => ({ nm: h[en ? 'en' : 'ja'], d: ym(h.t), v: h.a24, c: COLS[i % COLS.length] }))], cw = (W - 52) / 3;
  rows.forEach((r, i) => { const cx = 26 + (i % 3) * cw, cy = 600 + Math.floor(i / 3) * 62; g.fillStyle = r.c; g.fillRect(cx, cy - 24, 6, 34);
    lt(g, `${r.nm}（${r.d}）`, cx + 16, cy, { s: 22, w: 900 }); lt(g, SG(r.v), cx + cw - 20, cy + 2, { s: 30, w: 700, f: LN, c: r.v < 0 ? '#ff6b7d' : '#3cff9a', a: 'right' }); });
  const hrs = Math.round((hv.end - hv.ev.t) / 36e5 * 10) / 10;
  const nw = lt(g, en ? `This time (${hrs}h in) ` : `今回（${hrs}時間後まで） `, 26, 744, { s: 30, w: 900, c: LCY });
  lt(g, SG(hv.nowChg), 26 + nw, 748, { s: 46, w: 700, f: LN, c: LCY });
  lt(g, en ? 'Past record, not a forecast' : '過去の記録で、予測ではありません', 26, 786, { s: 18, w: 700, c: '#9fb0c4' });
  lt(g, '@csa_archive', W - 26, 786, { s: 18, w: 700, f: LN, c: '#9fb0c4', a: 'right' });
}
export async function renderHack(hv, lg) { await loadFonts('過去の大型ハッキングその後今回ウォレットから大量流出疑い未確認発生時間記録予測ではありません'); const cv = document.createElement('canvas'); cv.width = W; cv.height = LH; drawHack(cv.getContext('2d'), hv, lg); return cv; }

function drawLive(g, lv, lg) {
  if (lv.kind === 'spkcmp') return drawSpkCmp(g, lv, lg);   // v219
  if (String(lv.kind || '').startsWith('fomc')) return drawFomc(g, lv, lg);
  const en = lg === 'en', off = en ? 0 : 9 * 36e5, H2 = LH, kind = lv.kind || (lv.N && lv.N * (lv.st || 0) < 3 * 864e5 ? 'short' : 'daily'), sc = lv.stat || {};
  const WD = en ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : WJ, dd = (t) => new Date(t + off), md = (t) => { const d = dd(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; }, hmL = (t) => { const d = dd(t); return `${d.getUTCHours()}:${LP(d.getUTCMinutes())}`; };
  const bg = g.createLinearGradient(0, 0, 0, H2); bg.addColorStop(0, '#0b1424'); bg.addColorStop(1, '#070c17'); g.fillStyle = bg; g.fillRect(0, 0, W, H2);
  const rule = (y, x0 = 26, x1 = W - 26) => { g.strokeStyle = 'rgba(160,190,220,.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); };
  const T = en ? 'The past BTC is tracing now' : '今のBTCがなぞっている過去', tone = lv.tone || '#ffc94d';
  // 上の帯
  g.fillStyle = LCY; g.fillRect(26, 22, 6, 24); lt(g, en ? 'BTC LIVE' : 'BTC実況', 42, 42, { s: 24, w: 900, c: LCY });
  const de = dd(lv.end); lt(g, `${de.getUTCMonth() + 1}/${de.getUTCDate()}(${WD[de.getUTCDay()]}) ${hmL(lv.end)}${en ? ' UTC' : ''}`, W - 28, 42, { s: 24, w: 700, f: LN, a: 'right' });
  if (kind === 'spike') { g.strokeStyle = tone; g.lineWidth = 2; g.beginPath(); g.moveTo(170, 34); g.lineTo(W - 220, 34); g.stroke(); } else rule(56);
  const badge = (txt, x, y, c) => { g.font = `900 26px ${LJ}`; const bw = g.measureText(txt).width + 28; g.fillStyle = c; g.beginPath(); g.roundRect(x, y - 34, bw, 46, 8); g.fill(); lt(g, txt, x + 14, y - 2, { s: 26, w: 900, c: '#06101c' }); return bw; };
  let legendY = 0, marks = false;
  if (kind === 'daily') {
    lt(g, T, 28, 112, { s: fitBig(g, T, W - 60, 50, 900, LJ), w: 900 });
    const fut = (lv.ev || []).filter((e) => e.t > lv.end).sort((a, b) => a.t - b.t).slice(0, 4).map((e, i) => ({ ...e, L: 'ABCD'[i] }));
    liveChart(g, lv, lg, 168, 420, { letters: fut });
    rule(470); lt(g, en ? 'UPCOMING' : '今後の主な予定', 28, 502, { s: 22, w: 900 });
    const FL = { US: '🇺🇸', JP: '🇯🇵', EU: '🇪🇺' };
    if (!fut.length) lt(g, en ? 'No major releases in the next days' : 'この先3日に主要な指標はありません', 60, 556, { s: 24, w: 700, c: '#c9d4e2' });
    const cw = (W - 52) / Math.max(fut.length, 1);
    fut.forEach((e, i) => { const x = 26 + i * cw; if (i) { g.strokeStyle = 'rgba(160,190,220,.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 520); g.lineTo(x, 576); g.stroke(); }
      let xx = x + 22; xx += lt(g, e.L, xx, 560, { s: 34, w: 700, f: LN, c: '#ffc94d' }) + 14;
      const nm = en ? e.en : e.ja; xx += lt(g, nm, xx, 558, { s: fitBig(g, nm, cw - 200, 26, 900, LJ), w: 900 }) + 14;
      lt(g, `${md(e.t)} ${hmL(e.t)}`, xx, 557, { s: 20, w: 500, f: LN, c: '#c9d4e2' }); });
    rule(594); legendY = 620; marks = (lv.marks || []).length > 1;
  } else if (kind === 'pre') {
    const nm = sc.name || '', left = Math.max(0, (sc.t || lv.end) - lv.end), lm = Math.round(left / 60000);
    const h1 = `${nm} ${sc.whenTxt || ''}`.trim(); const hs = fitBig(g, h1, 640, 68, 900, LJ); const hw = lt(g, h1, 28, 128, { s: hs, w: 900 });
    badge(en ? 'BEFORE' : '発表前', 28 + hw + 24, 124, '#ffc94d');
    if (lm > 0) { const big = lm >= 60 ? String(Math.round(lm / 60)) : String(lm), unit = lm >= 60 ? (en ? 'h' : '時間') : (en ? 'min' : '分');
      g.font = `900 76px ${LN}`; const ub = (g.font = `900 52px ${LJ}`, g.measureText(unit).width); g.font = `900 76px ${LN}`; const bwid = g.measureText(big).width;
      lt(g, unit, W - 28, 128, { s: 52, w: 900, c: '#ffc94d', a: 'right' }); lt(g, big, W - 28 - ub - 4, 130, { s: 76, w: 900, f: LN, c: '#ffc94d', a: 'right' }); lt(g, en ? 'in' : 'あと', W - 28 - ub - bwid - 14, 128, { s: 34, w: 900, c: '#ffc94d', a: 'right' }); }
    lt(g, T, 30, 176, { s: 26, w: 900, c: '#d6e2ee' });
    liveChart(g, lv, lg, 226, 430, {});
    if (sc.hist && sc.hist.length) {   // v208: FOMC = 過去の発表後1時間を並べる
      let hx = 28; hx += lt(g, en ? 'PAST FOMC · BTC 1h after' : '過去のFOMC · 発表後1時間のBTC', hx, 512, { s: 26, w: 900 }) + 20;
      if (sc.fx && sc.fx.fc) lt(g, (en ? 'Forecast ' : '市場予想 ') + sc.fx.fc + (sc.fx.pv ? (en ? ` (prev ${sc.fx.pv})` : `（前回 ${sc.fx.pv}）`) : ''), W - 28, 512, { s: 22, w: 700, c: '#ffc94d', a: 'right' });
      const hw2 = (W - 52) / sc.hist.length;
      sc.hist.forEach((x, i) => { const cx = 26 + i * hw2; if (i) { g.strokeStyle = 'rgba(160,190,220,.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, 540); g.lineTo(cx, 610); g.stroke(); }
        lt(g, x.d, cx + hw2 / 2, 562, { s: 22, w: 700, f: LN, c: '#c9d4e2', a: 'center' }); lt(g, (x.v > 0 ? '+' : x.v < 0 ? '−' : '±') + Math.abs(x.v).toFixed(2) + '%', cx + hw2 / 2, 604, { s: 36, w: 700, f: LN, c: x.v < 0 ? '#ff6b7d' : '#3cff9a', a: 'center' }); });
      rule(626);
    } else {
    lt(g, en ? 'LAST TIME' : '前回の反応', 28, 512, { s: 28, w: 900 }); if (sc.lastDate) { g.strokeStyle = 'rgba(160,190,220,.4)'; g.beginPath(); g.moveTo(196, 488); g.lineTo(196, 518); g.stroke(); lt(g, sc.lastDate, 212, 512, { s: 24, w: 500, f: LN }); } rule(500, 300);
    let x = 28; x += lt(g, en ? '1h after release' : '発表後1時間', x, 584, { s: 26, w: 900 }) + 28; lt(g, sc.big || '—', x, 590, { s: 46, w: 700, f: LN, c: sc.col || '#ffffff' });
    if (sc.typ) { const x2 = 470; g.strokeStyle = 'rgba(160,190,220,.4)'; g.beginPath(); g.moveTo(x2, 548); g.lineTo(x2, 604); g.stroke(); let x3 = x2 + 40; x3 += lt(g, en ? 'Normal hour' : '普段の1時間', x3, 584, { s: 26, w: 900 }) + 28; lt(g, sc.typ, x3, 590, { s: 46, w: 700, f: LN }); }
    rule(626);
    }
  } else if (kind === 'arch') {
    lt(g, '|', 194, 40, { s: 22, w: 400, c: 'rgba(160,190,220,.5)' }); lt(g, T, 214, 40, { s: 22, w: 700, c: '#d6e2ee' });
    g.font = `700 92px ${LN}`; const bwid = g.measureText(sc.big || '').width; lt(g, sc.big || '', W - 28, 142, { s: 92, w: 700, f: LN, c: sc.col || '#fff', a: 'right', glow: (sc.col || '#fff') + '66', b: 18 });
    const bl = lt(g, 'BTC', W - 28 - bwid - 18, 136, { s: 58, w: 700, f: LN, a: 'right' });
    const h1 = sc.name ? `${sc.name} ${en ? '· 1h after' : '発表後1時間'}` : ''; lt(g, h1, 28, 140, { s: fitBig(g, h1, W - 120 - bwid - 140, 72, 900, LJ), w: 900 });
    liveChart(g, lv, lg, 210, 400, { bracket: en ? '1h after release' : '発表後1時間', nowTime: 1 });
    legendY = 462; rule(484);
    lt(g, en ? '1h move after release' : '発表後1時間の騰落率', 28, 516, { s: 26, w: 900 }); if (sc.range) lt(g, `(${sc.range})`, 300, 514, { s: 20, w: 500, f: LN, c: '#c9d4e2' });
    const cs = sc.coins || [], cw = (W - 52) / Math.max(cs.length, 1), mxa = Math.max(1, Math.ceil(Math.max(...cs.map((c) => Math.abs(c.v || 0))) * 2) / 2);
    cs.forEach((c, i) => { const x = 26 + i * cw, col = c.v < 0 ? '#ff6b7d' : '#3cff9a'; if (i) { g.strokeStyle = 'rgba(160,190,220,.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 530); g.lineTo(x, 626); g.stroke(); }
      const xx = x + 20 + lt(g, c.k, x + 20, 566, { s: 30, w: 700, f: LN }) + 18; lt(g, (c.v > 0 ? '+' : c.v < 0 ? '−' : '±') + Math.abs(c.v).toFixed(2) + '%', xx, 566, { s: 32, w: 700, f: LN, c: col });
      const ax0 = x + 30, ax1 = x + cw - 26, zx = (ax0 + ax1) / 2, sx = (v) => zx + v / mxa * (ax1 - ax0) / 2;
      g.fillStyle = col; const xa = Math.min(zx, sx(c.v)), xw = Math.abs(sx(c.v) - zx); g.fillRect(xa, 580, Math.max(2, xw), 20);
      g.strokeStyle = 'rgba(200,215,230,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(ax0, 606); g.lineTo(ax1, 606); g.moveTo(zx, 576); g.lineTo(zx, 610); g.stroke();
      [-mxa, 0, mxa].forEach((v) => lt(g, (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%', sx(v), 628, { s: 15, w: 500, f: LN, c: '#c9d4e2', a: 'center' })); });
    rule(640);
  } else if (kind === 'spike') {
    lt(g, T, 30, 92, { s: 26, w: 900, c: '#d6e2ee' });
    const h1 = sc.head || ''; g.font = `900 30px ${LJ}`; const bdg = sc.badge || (en ? 'SHARP MOVE' : '急変動'), bw0 = g.measureText(bdg).width + 28;
    const hs = fitBig(g, h1, W - 90 - bw0, 96, 900, LN); const hw = lt(g, h1, 26, 180, { s: hs, w: 900, f: LN, c: tone, glow: tone + '55', b: 14 });
    badge(bdg, 26 + hw + 22, 170, tone);
    if (sc.px) lt(g, sc.px, 28, 240, { s: 50, w: 700, f: LN });
    liveChart(g, lv, lg, sc.px ? 300 : 250, 480, {});
    legendY = 540; rule(560);
    lt(g, en ? 'Same window' : '同じ時間帯の情報', 46, 604, { s: 24, w: 900, c: '#d6e2ee' }); g.fillStyle = LCY; g.fillRect(28, 580, 4, 32);
    const info = (sc.info || []).slice(0, 2); if (!info.length) lt(g, en ? 'No scheduled release' : '指標の発表なし', 340, 606, { s: 30, w: 900 });
    info.forEach((t, i) => { const cx = 330 + i * 420; if (i) { g.strokeStyle = 'rgba(160,190,220,.35)'; g.beginPath(); g.moveTo(cx - 20, 578); g.lineTo(cx - 20, 622); g.stroke(); } lt(g, t, cx + 190, 610, { s: fitBig(g, t, 380, 36, 900, LJ), w: 900, a: 'center' }); });
    rule(640);
  } else if (kind === 'liq') {
    lt(g, T, 30, 92, { s: 26, w: 900, c: '#d6e2ee' });
    const pre = sc.head || (en ? 'Liquidated' : '清算'); const mw = sc.mult ? 230 : 0;
    g.font = `900 92px ${LN}`; const nwid = g.measureText(sc.big || '').width; const ps = fitBig(g, pre, W - 70 - nwid - mw - 24, 84, 900, LJ);
    const pw = lt(g, pre, 26, 190, { s: ps, w: 900 }); lt(g, sc.big || '', 26 + pw + 20, 192, { s: 92, w: 900, f: LN, c: tone, glow: tone + '66', b: 18 });
    if (sc.mult) { g.strokeStyle = 'rgba(160,190,220,.4)'; g.beginPath(); g.moveTo(W - 240, 112); g.lineTo(W - 240, 196); g.stroke(); lt(g, en ? 'vs normal' : '普段の', W - 210, 140, { s: 28, w: 900 }); lt(g, sc.mult, W - 28, 194, { s: 56, w: 900, f: LN, a: 'right' }); }
    const L0 = sc.long || 0, S0 = sc.short || 0, tot = L0 + S0, bx0 = 30, bx1 = W - 30, lw = tot > 0 ? (bx1 - bx0) * L0 / tot : (bx1 - bx0) / 2;
    g.fillStyle = '#ff6b7d'; g.fillRect(bx0, 214, lw, 34); g.fillStyle = '#3cff9a'; g.fillRect(bx0 + lw, 214, bx1 - bx0 - lw, 34);
    if (tot > 0) { const lp = Math.round(L0 / tot * 100); if (lw > 80) lt(g, lp + '%', bx0 + lw / 2, 240, { s: 22, w: 700, f: LN, a: 'center' }); if (bx1 - bx0 - lw > 80) lt(g, (100 - lp) + '%', bx0 + lw + (bx1 - bx0 - lw) / 2, 240, { s: 22, w: 700, f: LN, c: '#06101c', a: 'center' }); }
    lt(g, `${en ? 'Long' : 'ロング'} ${sc.longTxt || ''}`, 30, 286, { s: 30, w: 900, c: '#ff8a9a' }); lt(g, `${en ? 'Short' : 'ショート'} ${sc.shortTxt || ''}`, W - 30, 286, { s: 30, w: 900, c: '#6fe3a8', a: 'right' });
    liveChart(g, lv, lg, 340, 548, {});
    legendY = 610; rule(632);
  }
  if (legendY) liveLegend(g, lg, legendY, marks);
  // 過去 TOP3
  const WEEKV = kind === 'daily', by = H2 - 150;
  lt(g, lv.spk ? (en ? `CLOSEST PAST ${lv.dir < 0 ? 'DROPS' : 'JUMPS'} (BTC next 3h) · ${lv.n} since 2017` : `似ていた過去の${lv.dir < 0 ? '急落' : '急騰'}（その後3時間のBTC）· 2017年以降${lv.n}回`) : lv.fomc ? (en ? 'CLOSEST PAST FOMC (BTC 1h after)' : 'FOMC前の動きが一番近い過去のFOMC（発表後1時間のBTC）') : WEEKV ? (en ? 'SAME DAY IN THE PAST' : '過去の同じ日') : (en ? 'SAME MOMENT IN THE PAST' : '過去の同じ時刻'), 26, by + 28, { s: 22, w: 900, c: '#ffffff' });
  const cw = (W - 52) / 3, MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  lv.top.slice(0, 3).forEach((m, i) => { const cx = 26 + i * cw, c = LRK[i], d = dd(m.day != null ? m.day : m.w);
    if (i) { g.strokeStyle = 'rgba(160,190,220,.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, by + 16); g.lineTo(cx, by + 116); g.stroke(); }
    const bx = cx + (i ? 46 : 70); g.fillStyle = c; g.beginPath(); g.arc(bx, by + 58, 20, 0, 7); g.fill(); lt(g, String(i + 1), bx, by + 67, { s: 24, w: 900, f: LN, c: '#06101c', a: 'center' });
    const ds = (en ? `${MO[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`) + (WEEKV || lv.fomc ? '' : ' ' + hmL(m.day));
    const fs = fitBig(g, ds, cx + cw - bx - (lv.fomc || lv.spk ? 150 : 40), 34, 700, LN); const dw = lt(g, ds, bx + 32, by + 70, { s: fs, w: 700, f: LN });
    if ((lv.fomc || lv.spk) && m.a1 != null) lt(g, (m.a1 > 0 ? '+' : m.a1 < 0 ? '−' : '±') + Math.abs(m.a1).toFixed(2) + '%', bx + 32 + dw + 12, by + 68, { s: 26, w: 700, f: LN, c: m.a1 < 0 ? '#ff6b7d' : '#3cff9a' });
    const wl = lt(g, en ? 'Match' : '一致率', bx + 32, by + 116, { s: 24, w: 900 });
    lt(g, m.rate + '%', bx + 32 + wl + 12, by + 118, { s: 44, w: 700, f: LN, c, glow: c + '99', b: 14 }); });
  lt(g, '@csa_archive', 26, H2 - 10, { s: 18, w: 700, f: LN, c: '#9fb0c4' });
  lt(g, en ? 'Past data · not a forecast' : '予測ではありません', W - 26, H2 - 10, { s: 16, w: 700, c: '#9fb0c4', a: 'right' });
}
export async function renderLive(lv, lg) {   // サイトのカード用
  await loadFonts('今のBTCがなぞっている過去月火水木金土日一致率点線＝のその後予測ではありません実況〜予定これまでの投稿同じ日主要な指標ほか件0123456789#%@csa_archive' + JSON.stringify(lv.ev || []));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = LH; drawLive(cv.getContext('2d'), lv, lg); return cv;
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
// v226: 過去最大の流出(Bybit) vs 今回(Binance)。発生から12時間を1時間刻みで、上下2レーン。今回は「今ここ」で止まる
function drawChainCmp(g, c, lg) {
  const en = lg === 'en', H2 = LH, YC = '#f5c542', CC = '#5fd4f0', PC = '#a78bfa', RC = '#ff5c7a', N = c.hours || 12;
  g.fillStyle = '#0a1220'; g.fillRect(0, 0, W, H2);
  const T = en ? 'Biggest past outflow vs now: the first 12 hours' : '過去最大の流出 vs 今回：発生から12時間の資金の動き';
  lt(g, T, W / 2, 56, { s: fitBig(g, T, W - 60, 36, 900, LJ), w: 900, a: 'center' });
  const sub = [[c.past[lg], YC], [en ? ' (2025, confirmed)   /   ' : '（2025・確定）　／　', '#b9c6d8'], [c.cur[lg], CC], [en ? ' (2026, suspected hack, unconfirmed)' : '（2026・ハッキングの疑い・未確認）', '#b9c6d8']];
  g.font = `700 19px ${LJ}`; let sx = W / 2 - sub.reduce((a, [t]) => a + g.measureText(t).width, 0) / 2;
  sub.forEach(([t, col]) => { sx += lt(g, t, sx, 92, { s: 19, w: 700, c: col }); });
  const X0 = 200, WW = 960, cw = WW / N, X = (h) => X0 + h * cw;
  g.strokeStyle = '#1c2b44'; g.lineWidth = 1;
  for (let h = 0; h <= N; h++) { g.beginPath(); g.moveTo(X(h), 132); g.lineTo(X(h), 760); g.stroke(); lt(g, h + 'h', X(h), 126, { s: 16, w: 700, f: LN, c: '#9fb0c8', a: 'center' }); }
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const lane = (top, L, col) => {
    g.strokeStyle = col; g.lineWidth = 2; rr(24, top, 160, 290, 12); g.stroke();
    lt(g, L[lg], 42, top + 130, { s: 32, w: 900, c: col }); lt(g, en ? L.yen : L.yja, 42, top + 162, { s: 15, w: 700, c: col });
    lt(g, en ? 'New addresses' : '新しい送金先の数', 42, top + 262, { s: 13, w: 600, c: '#7f8ea6' });
    L.ev.forEach((e, i) => { const a = X(e[0]) + 3, b = X(e[1]) - 3, y = top + 8 + i * 48, s = en ? e[3] : e[2];
      g.font = `800 17px ${LJ}`; const tw = g.measureText(s).width + 22;
      g.fillStyle = '#0d1a2c'; rr(a, y, Math.max(b - a, tw), 36, 8); g.fill(); g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = col; rr(a, y + 38, b - a, 4, 2); g.fill(); lt(g, s, a + 10, y + 25, { s: 17, w: 800 }); });
    const base = top + 275, mx = Math.max(...c.past.bars, ...c.cur.bars);
    L.bars.forEach((v, h) => { const bh = Math.max(2, v / mx * 110); g.globalAlpha = 0.85; g.fillStyle = col; rr(X(h) + 16, base - bh, cw - 32, bh, 3); g.fill(); g.globalAlpha = 1; lt(g, String(v), X(h) + cw / 2, base - bh - 6, { s: 15, w: 700, f: LN, c: '#dfe6f0', a: 'center' }); });
    const end = L.end ? X(L.end) : X(N); g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(X0, base + 3); g.lineTo(end, base + 3); g.stroke();
    if (L.end) { g.globalAlpha = 0.4; g.lineWidth = 2; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(end, base + 3); g.lineTo(X(N), base + 3); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
    return base;
  };
  lane(140, c.past, YC); const b2 = lane(460, c.cur, CC);
  const nx = X(c.cur.end);
  g.strokeStyle = RC; g.lineWidth = 3; g.beginPath(); g.moveTo(nx, 452); g.lineTo(nx, b2 + 10); g.stroke();
  g.fillStyle = RC; g.beginPath(); g.arc(nx, b2 + 3, 9, 0, 7); g.fill();
  rr(nx - 44, 455, 88, 30, 15); g.fill(); lt(g, en ? 'NOW' : '今ここ', nx, 476, { s: 17, w: 900, a: 'center' });
  lt(g, en ? c.nowEn : c.nowJa, nx + 52, 476, { s: 15, w: 700, f: LN, c: '#ff9aac' });
  const bx = nx + 40; g.fillStyle = '#0f1d30'; rr(bx, 590, 300, 80, 10); g.fill(); g.strokeStyle = '#2a3d5c'; g.lineWidth = 1; g.stroke();
  c.stat.forEach(([ja, enS, k], i) => lt(g, (k === 'fz' ? '🔒 ' : '') + (en ? enS : ja), bx + 16, 622 + i * 32, { s: 20, w: 800, c: k === 'fz' ? CC : PC }));
  lt(g, en ? 'On-chain records on Ethereum (Etherscan)' : 'Ethereum上のオンチェーン記録（Etherscan）', 36, 788, { s: 15, w: 500, c: '#7f8ea6' });
}
// v227: 今回の流出の行き先と時系列(氷の図)。横軸は時刻(前半を広く)。凍結は氷の箱
function drawChainFlow(g, c, lg) {
  const en = lg === 'en', H2 = LH, GC = '#5ee9c8', EC = '#f2c94c', PC = '#a78bfa', IC = '#8fd8ff', RC = '#ff5c7a', J = (a) => en ? a[1] : a[0];
  const K = [[315, 250], [360, 600], [420, 780], [540, 920], [810, 1150]];
  const X = (t) => { for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const [a, xa] = K[i - 1], [b, xb] = K[i]; return xa + (t - a) / (b - a) * (xb - xa); } return 1150; };
  const hm = (t) => { const v = ((en ? t - 540 : t) + 1440) % 1440; return Math.floor(v / 60) + ':' + LP(v % 60); };
  const bg = g.createRadialGradient(W / 2, 320, 40, W / 2, 320, 800); bg.addColorStop(0, '#0f1f3a'); bg.addColorStop(1, '#040913'); g.fillStyle = bg; g.fillRect(0, 0, W, H2);
  g.fillStyle = 'rgba(191,230,255,.35)'; for (let i = 0; i < 60; i++) { g.beginPath(); g.arc((i * 397) % W, (i * 211) % H2, i % 3 ? 1 : 1.6, 0, 7); g.fill(); }
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const curve = (x1, y1, x2, y2, col, w) => { const mx = (x1 + x2) / 2; g.save(); g.strokeStyle = col; g.lineCap = 'round'; g.shadowColor = col; g.shadowBlur = 14; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.bezierCurveTo(mx, y1, mx, y2, x2, y2); g.stroke(); g.restore(); };
  const node = (x, y, col) => { g.save(); g.shadowColor = col; g.shadowBlur = 10; g.fillStyle = '#081324'; g.strokeStyle = col; g.lineWidth = 3.5; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); g.stroke(); g.restore(); };
  const dia = (x, y) => { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = '#2a2208'; g.strokeStyle = EC; g.lineWidth = 2.5; g.fillRect(-9, -9, 18, 18); g.strokeRect(-9, -9, 18, 18); g.restore(); };
  const ice = (x, y, w, h, lab, val) => {
    g.save(); g.shadowColor = IC; g.shadowBlur = 14; const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(43,90,134,.8)'); gr.addColorStop(.5, 'rgba(22,49,79,.85)'); gr.addColorStop(1, 'rgba(58,111,158,.75)');
    g.fillStyle = gr; g.strokeStyle = IC; g.lineWidth = 2; rr(x, y, w, h, 10); g.fill(); g.stroke(); g.restore();
    g.strokeStyle = 'rgba(205,238,255,.45)'; g.lineWidth = .8; for (let k = 0; k < 5; k++) { const a = x + 12 + (k * 53) % (w - 24), b = y + 8 + (k * 29) % (h - 16); g.beginPath(); g.moveTo(a, b); g.lineTo(a + 14 + k * 3, b + 8 - k * 4); g.lineTo(a + 24 + k * 3, b + 2 - k * 3); g.stroke(); }
    g.fillStyle = 'rgba(205,238,255,.55)'; for (let k = 0; k < w / 14; k++) { const d = 5 + (k * 7) % 9; g.beginPath(); g.moveTo(x + 8 + k * 14, y + h); g.lineTo(x + 11 + k * 14, y + h + d); g.lineTo(x + 14 + k * 14, y + h); g.fill(); }
    g.fillStyle = '#0d3a5c'; g.strokeStyle = IC; g.lineWidth = 1.5; rr(x + w - 92, y - 12, 86, 24, 12); g.fill(); g.stroke(); lt(g, '❄ FROZEN', x + w - 49, y + 6, { s: 13, w: 900, c: '#e6f7ff', a: 'center' });
    lt(g, lab, x + 14, y + 28, { s: 16, w: 700, c: '#cfe9ff' }); lt(g, '🔒 ' + val, x + 14, y + h - 16, { s: fitBig(g, '🔒 ' + val, w - 24, 30, 900, LJ), w: 900, c: '#e9f8ff' });
  };
  const card = (x, y, w, h, col, lab, val) => { g.fillStyle = 'rgba(12,23,41,.92)'; g.strokeStyle = col + 'b3'; g.lineWidth = 1.5; rr(x, y, w, h, 10); g.fill(); g.stroke(); lt(g, lab, x + 14, y + 26, { s: 15, w: 700, c: '#9fb0c8' }); lt(g, val, x + 14, y + h - 14, { s: 28, w: 900, c: col }); };
  const T = en ? 'Binance outflow: where the funds went, hour by hour' : '今回の流出：資金の行き先と時系列';
  lt(g, T, 30, 50, { s: fitBig(g, T, W - 260, 32, 900, LJ), w: 900 });
  lt(g, en ? 'Suspected hack, unconfirmed · times in UTC' : 'Binance（ハッキングの疑い・未確認）／時刻は日本時間', 30, 80, { s: 18, w: 700, c: '#7dd3fc' });
  const AX = 740; g.strokeStyle = '#1a2c48'; g.setLineDash([2, 6]); g.lineWidth = 1;
  for (const h of [6, 7, 8, 9, 11, 13]) { const x = X(h * 60); g.beginPath(); g.moveTo(x, 104); g.lineTo(x, AX); g.stroke(); lt(g, hm(h * 60), x, AX + 26, { s: 18, w: 700, f: LN, c: '#9fb0c8', a: 'center' }); }
  g.setLineDash([]); g.strokeStyle = '#2c4366'; g.lineWidth = 2; g.beginPath(); g.moveTo(240, AX); g.lineTo(1160, AX); g.stroke();
  lt(g, hm(c.t0), X(c.t0), AX + 26, { s: 18, w: 800, f: LN, c: '#ff9aac', a: 'center' });
  const nx = X(c.now); g.strokeStyle = RC; g.lineWidth = 2.5; g.setLineDash([7, 6]); g.beginPath(); g.moveTo(nx, 112); g.lineTo(nx, AX); g.stroke(); g.setLineDash([]);
  g.save(); g.shadowColor = RC; g.shadowBlur = 12; g.fillStyle = RC; rr(nx - 52, 92, 104, 32, 16); g.fill(); g.restore();
  lt(g, en ? 'NOW' : '今ここ', nx, 115, { s: 18, w: 900, a: 'center' }); lt(g, hm(c.now), nx, AX + 50, { s: 18, w: 900, f: LN, c: RC, a: 'center' });
  // 最初の受取先
  g.fillStyle = 'rgba(11,22,40,.85)'; g.strokeStyle = '#2a4466'; g.lineWidth = 1.5; rr(18, 104, 214, 636, 14); g.fill(); g.stroke();
  lt(g, en ? 'First recipient' : '最初の受取先', 34, 138, { s: 20, w: 900 }); lt(g, '0x5227…', 34, 162, { s: 15, w: 700, f: LN, c: '#7f93b0' });
  lt(g, en ? `Received ~$3.2B at ${hm(c.t0)}` : `受け取り 約32億ドル（${hm(c.t0)}）`, 34, 196, { s: 14, w: 700, c: '#9fb0c8' });
  ice(30, 222, 190, 92, en ? 'Still here: USDT' : '残っている USDT', J(c.root.usdt));
  ice(30, 340, 190, 92, en ? 'Still here: USDC' : '残っている USDC', J(c.root.usdc));
  lt(g, en ? 'Still here: ETH' : '残っている ETH', 34, 478, { s: 15, w: 700, c: '#9fb0c8' }); lt(g, J(c.root.eth), 34, 512, { s: 28, w: 900, c: PC });
  const RX = 232, A = c.a, B = c.b, C = c.c, D = c.d;
  // A
  let y = 196; curve(RX, 250, X(A.t), y, GC, 14); node(X(A.t), y, GC); lt(g, J(A.amt), RX + 18, 186, { s: 22, w: 900, c: GC });
  curve(X(A.t), y, X(A.sw), 150, GC, 10); curve(X(A.sw), 150, X(A.end), 150, EC, 10); dia(X(A.sw), 150);
  card(X(A.end), 118, 200, 66, EC, hm(A.end), J(A.endv)); lt(g, J(A.swl), (X(A.sw) + X(A.end)) / 2, 140, { s: 18, w: 900, c: EC, a: 'center' });
  curve(X(A.t), y, X(A.fz) - 6, 262, GC, 8); ice(X(A.fz), 226, 180, 80, hm(A.fz), J(A.fzv));
  // B
  y = 388; curve(RX, 300, X(B.t), y, GC, 10); node(X(B.t), y, GC); lt(g, J(B.amt), RX + 16, 288, { s: 22, w: 900, c: GC });
  curve(X(B.t), y, X(B.end), y, GC, 9); card(X(B.end) + 4, y - 34, 250, 66, '#7fe8cf', hm(B.end) + (en ? ' · ' : '・') + J(B.endl), J(B.endv));
  // C
  y = 520; curve(RX, 520, X(C.t), y, EC, 14); node(X(C.t), y, EC); lt(g, J(C.amt), RX + 16, y - 18, { s: 22, w: 900, c: EC });
  lt(g, hm(C.t), X(C.t), y + 38, { s: 16, w: 700, f: LN, c: '#9fb0c8', a: 'center' });
  g.strokeStyle = EC; g.globalAlpha = .7; g.lineWidth = 3; g.setLineDash([3, 10]); g.beginPath(); g.moveTo(X(C.t) + 12, y); g.lineTo(X(C.add) - 12, y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
  lt(g, J(C.hold), (X(C.t) + X(C.add)) / 2 + 40, y - 12, { s: 17, w: 700, c: '#9fb0c8', a: 'center' });
  node(X(C.add), y, EC); lt(g, J(C.addv), X(C.add), y - 22, { s: 20, w: 900, c: EC, a: 'center' }); lt(g, hm(C.add), X(C.add), y + 38, { s: 16, w: 700, f: LN, c: '#9fb0c8', a: 'center' });
  // D
  y = 640; curve(RX, 600, X(D.t), y, PC, 8); node(X(D.t), y, PC); lt(g, J(D.amt), X(D.t) - 16, y - 24, { s: 20, w: 900, c: PC, a: 'right' });
  lt(g, hm(D.t) + '〜' + hm(D.t2), X(D.t), y + 38, { s: 16, w: 700, f: LN, c: '#9fb0c8', a: 'center' });
  curve(X(D.t), y, X(D.sw), y, PC, 8); curve(X(D.sw), y, X(D.end), y, EC, 6); dia(X(D.sw), y); card(X(D.end) + 4, y - 34, 190, 66, EC, hm(D.end), J(D.endv));
  lt(g, en ? `On-chain records on Ethereum (Etherscan) · as of ${hm(c.now)} UTC` : `Ethereum上のオンチェーン記録（Etherscan）・${hm(c.now)}時点`, 30, 786, { s: 15, w: 500, c: '#7f8ea6' });
}
import { BN as BNC, SHOCK, MID, IPO_PRE, IPO_POST, IPO_STEP, TWIN, STREAK } from './xpost-lib.js';
const BNFZ = BNC.fzSteps, BNAAVE = BNC.aaveAt, BNTL = BNC.tl;
// v237: Binance流出「資金の現況」(sr: bnstatus)。上 = 未凍結ETHの積み上げ＋1時間ごとの交換回数・保有アドレス、左下 = 凍結、右下 = 未凍結のBTC
function drawBnStatus(g, s, ch, lg) {
  const en = lg === 'en', H2 = LH, H = 36e5, EL = '#ffd27a', IC = '#9ad3ff', GC = '#5ee9c8', BC = '#f7931a', MU = '#8ea2bf';
  const N2 = (v) => { const a = Math.abs(v); return en ? (a >= 1e9 ? (+(a / 1e9).toFixed(2)) + 'B' : a >= 1e6 ? (+(a / 1e6).toFixed(1)) + 'M' : a >= 1e4 ? Math.round(a / 1e3) + 'k' : Math.round(a).toLocaleString('en-US')) : (a >= 1e8 ? (+(a / 1e8).toFixed(2)) + '億' : a >= 1e4 ? (+(a / 1e4).toFixed(a >= 1e6 ? 0 : 1)) + '万' : Math.round(a).toLocaleString('en-US')); };
  const hm = (t) => { const d = new Date(t + (en ? 0 : 9 * H)); return d.getUTCHours() + ':' + LP(d.getUTCMinutes()); };
  const bg = g.createRadialGradient(360, 80, 20, 360, 80, 1300); bg.addColorStop(0, '#16243f'); bg.addColorStop(1, '#03060d'); g.fillStyle = bg; g.fillRect(0, 0, W, H2);
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const card = (x, y, w, h, c, a, b) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; rr(x, y, w, h, 14); g.fill(); g.strokeStyle = c; g.globalAlpha = .7; g.lineWidth = 1.6; g.stroke(); g.globalAlpha = 1; };
  const glow = (c, f) => { g.save(); g.shadowColor = c; g.shadowBlur = 12; f(); g.restore(); };
  const area = (pts, base, fillA, fillB, line, top) => { const gr = g.createLinearGradient(0, top, 0, base); gr.addColorStop(0, fillA); gr.addColorStop(1, fillB); g.fillStyle = gr; g.beginPath(); g.moveTo(pts[0][0], base); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(pts[pts.length - 1][0], base); g.closePath(); g.fill(); glow(line, () => { g.strokeStyle = line; g.lineWidth = 2.6; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }); };
  // 見出し
  lt(g, en ? 'Binance outflow: where the funds are' : 'Binance流出：資金の現況', 30, 50, { s: 32, w: 900 });
  const head = ch && ch.kind === 'close' ? (en ? 'Regular updates end here · next: when funds move' : '定期更新はここで区切り・次は資金が動いたら') : ch && ch.kind === 'change' ? (en ? 'Since last: ' : '前回から：') + ch.ch.map(([k, v]) => (k === 'fz' ? (en ? 'Frozen $' : '凍結 ') : k === 'eth' ? (en ? 'ETH ' : 'ETH ') : k === 'btc' ? 'BTC ' : (en ? 'ETH sold ' : 'ETH売り ')) + (v > 0 ? '+' : '') + N2(v) + (k === 'fz' && !en ? 'ドル' : '')).join(en ? ' / ' : '／') : '';
  lt(g, (en ? 'CSA on-chain tracking · ' : 'CSA独自追跡・オンチェーンの記録・') + (en ? `${new Date(s.asof).getUTCMonth() + 1}/${new Date(s.asof).getUTCDate()} ${hm(s.asof)} UTC` : `${hm(s.asof)} 日本時間`) + (en ? ` · ${s.hrs}h in` : `・発生から${s.hrs}時間`), 30, 80, { s: 17, w: 800, c: MU });
  lt(g, '@csa_archive', W - 30, 48, { s: 18, w: 800, c: MU, a: 'right' }); if (head) lt(g, head, W - 30, 80, { s: fitBig(g, head, 520, 20, 900, LJ), w: 900, c: '#ff9a9a', a: 'right' });
  // ===== 上段 ETH =====
  card(20, 94, 1160, 310, '#f5b942', '#1c1a14', '#0b0e16');
  glow('#f5b942', () => lt(g, en ? 'Unfrozen ETH' : '未凍結ETH（枚）', 40, 130, { s: 26, w: 900, c: EL }));
  g.fillStyle = '#f5b942'; g.fillRect(250, 120, 28, 4); lt(g, en ? 'held (stacked)' : '保有の積み上げ', 284, 128, { s: 15, w: 800, c: '#e8d3a8' });
  g.fillStyle = '#fff3c4'; g.fillRect(410, 121, 28, 3); lt(g, en ? 'swaps per hour' : '1時間ごとの交換回数', 444, 128, { s: 15, w: 800, c: '#fff3c4' });
  { const x0 = 90, x1 = 830, y0 = 360, y1 = 150, tE = s.asof, X = (t) => x0 + (t - s.t0) / (tE - s.t0) * (x1 - x0);
    const sum = s.steps.reduce((a, q) => a + q[1], 0), mx = Math.max(s.eth, sum) * 1.12 || 1, Y = (v) => y0 - v / mx * (y0 - y1);
    const smx = Math.max(10, ...s.swaps) * 1.25, Ys = (n) => y0 - n / smx * (y0 - y1);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    [0, .5, 1].forEach((f) => { const v = Math.round(mx / 1.12 * f); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, v ? N2(v) : '0', x0 - 10, Y(v) + 5, { s: 14, w: 800, c: MU, a: 'right' }); });
    const hrs = Math.floor((tE - s.t0) / H), stp = Math.max(1, Math.round(hrs / 6));
    for (let h = 0; h <= hrs; h += stp) { lt(g, h + 'h', X(s.t0 + h * H), y0 + 20, { s: 13, w: 800, c: '#cfd8e6', a: 'center' }); lt(g, hm(s.t0 + h * H), X(s.t0 + h * H), y0 + 36, { s: 12, w: 700, c: MU, a: 'center' }); }
    let c = 0; const pts = [[X(s.t0), Y(0)]]; s.steps.forEach(([t, v]) => { pts.push([X(t), Y(c)]); c += v; pts.push([X(t), Y(c)]); }); pts.push([X(tE), Y(c)]); pts.push([X(tE), Y(s.eth)]);
    area(pts, y0, 'rgba(232,163,60,.9)', 'rgba(74,42,8,.25)', '#ffcf6b', y1);
    const sp = s.swaps.map((n, i) => [X(s.t0 + i * H + H / 2), Ys(n), n]).filter((q) => q[0] <= x1);
    g.strokeStyle = '#fff3c4'; g.lineWidth = 2.4; g.setLineDash([5, 4]); g.beginPath(); sp.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.setLineDash([]);
    sp.forEach(([x, y, n]) => { g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); if (n) lt(g, n + (en ? '' : '回'), x, y - 9, { s: 13, w: 800, c: '#fff3c4', a: 'center' }); });
    for (let n = 0; n <= smx; n += smx > 300 ? 100 : 50) lt(g, String(n), x1 + 10, Ys(n) + 5, { s: 13, w: 700, c: '#d9cfa8' });
    glow(EL, () => { g.fillStyle = EL; g.beginPath(); g.arc(X(tE), Y(s.eth), 7, 0, 7); g.fill(); });
    glow('#f5b942', () => lt(g, (en ? '~' : '約') + N2(s.eth) + ' ETH', X(tE) - 10, Y(s.eth) - 14, { s: 28, w: 900, c: EL, a: 'right' })); }
  g.strokeStyle = 'rgba(255,255,255,.13)'; g.beginPath(); g.moveTo(860, 110); g.lineTo(860, 390); g.stroke();
  lt(g, en ? 'Addresses holding ETH' : 'ETHを持つアドレス', 880, 130, { s: 18, w: 900, c: EL });
  s.holders.forEach(([a, v], k) => { const y = 162 + k * 30; g.fillStyle = '#f5b942'; rr(880, y - 14, 14, 14, 3); g.fill(); lt(g, a.slice(0, 6) + '…', 902, y - 2, { s: 16, w: 800, c: '#e8d3a8', f: LN }); lt(g, N2(v) + ' ETH', 1160, y - 2, { s: 17, w: 900, c: EL, a: 'right' }); });
  g.fillStyle = 'rgba(255,255,255,.04)'; rr(880, 318, 280, 68, 10); g.fill(); g.strokeStyle = 'rgba(255,255,255,.14)'; g.stroke();
  lt(g, s.sold ? (en ? 'Swaps selling ETH' : 'ETHを売った交換') : (en ? 'All swaps were into ETH' : '交換はすべてETHに替える方向'), 1020, 346, { s: 16, w: 900, a: 'center' });
  lt(g, s.sold ? N2(s.sold) + ' ETH' : (en ? 'Swaps selling ETH: 0' : 'ETHを売る交換 0件'), 1020, 374, { s: 18, w: 900, c: '#ff8a8a', a: 'center' });
  // ===== 凍結(左下)・BTC(右下)は時刻の軸(発生の30分前〜今) =====
  const Y2 = 418, H3 = 232, ta = Math.floor((s.t0 + 9 * H) / H) * H - 9 * H, tb = Math.ceil((s.asof + 9 * H) / H) * H - 9 * H, stepPts = (st, X, Y, end) => { let c = 0; const p = [[X(ta), Y(0)]]; st.forEach(([t, v]) => { p.push([X(t), Y(c)]); c += v; p.push([X(t), Y(c)]); }); p.push([X(end), Y(c)]); return [p, c]; };
  const tick = (X, yb) => { const n = 4, sh = Math.max(1, Math.round((tb - ta) / H / n)); for (let k = 0; ta + k * sh * H <= tb; k++) { const t = ta + k * sh * H; lt(g, hm(t), X(t), yb + 18, { s: 12, w: 700, c: MU, a: 'center' }); } };
  card(20, Y2, 560, H3, '#7cc4ff', '#0f1d36', '#090f1c');
  glow('#7cc4ff', () => lt(g, en ? '🔒 Frozen (USDT, USDC)' : '🔒 凍結（USDT・USDC）', 40, Y2 + 36, { s: 22, w: 900, c: IC }));
  if (s.aave) { lt(g, (en ? '+ USDT deposited to Aave ' : '＋Aaveに預けたUSDT ') + N2(s.aave), 560, Y2 + 30, { s: 14, w: 900, c: GC, a: 'right' }); lt(g, en ? 'separate address' : '別のアドレス・凍結額に含まない', 560, Y2 + 48, { s: 12, w: 700, c: '#bfeee0', a: 'right' }); }
  { const x0 = 84, x1 = 556, yb = Y2 + H3 - 30, yt = Y2 + 64, X = (t) => x0 + (t - ta) / (tb - ta) * (x1 - x0), mx = Math.max(s.fz + s.aave, 1) * 1.12, Yv = (v) => yb - v / mx * (yb - yt);
    [0, 1e9, 2e9].filter((v) => v < mx).forEach((v) => { g.strokeStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(x0, Yv(v)); g.lineTo(x1, Yv(v)); g.stroke(); lt(g, v ? N2(v) : '0', x0 - 8, Yv(v) + 5, { s: 12, w: 800, c: MU, a: 'right' }); });
    tick(X, yb);
    const [pts, c] = stepPts(BNFZ, X, Yv, tb);
    if (s.aave) { g.fillStyle = GC; g.fillRect(X(BNAAVE), Yv(c + s.aave), X(tb) - X(BNAAVE), Yv(c) - Yv(c + s.aave)); }
    area(pts, yb, 'rgba(59,130,246,.8)', 'rgba(11,42,90,.2)', '#9ad3ff', yt);
    (s.checks || [s.asof]).forEach((t) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(X(t), Yv(c), 4.5, 0, 7); g.fill(); });
    glow('#7cc4ff', () => lt(g, (en ? '🔒 Frozen $' : '🔒 凍結 ') + N2(s.fz) + (en ? '' : 'ドル'), (x0 + x1) / 2 + 40, Yv(c * .5), { s: 26, w: 900, a: 'center' }));
    const nck = (s.checks || [s.asof]).length; lt(g, en ? `unchanged across ${nck} checks` : `${nck}回の確認で変化なし`, (x0 + x1) / 2 + 40, Yv(c * .5) + 24, { s: 13, w: 800, c: '#dbeeff', a: 'center' }); }
  card(594, Y2, 586, H3, '#f7931a', '#22160b', '#0d0c10');
  let bw0 = 0; glow('#f7931a', () => { bw0 = lt(g, en ? 'Unfrozen BTC' : '未凍結のBTC', 614, Y2 + 36, { s: 22, w: 900, c: BC }); });
  if (s.btc) { const b = s.btc;
    const bl = `${b.held.toLocaleString('en-US')}${en ? ' BTC · ' : '枚・'}${b.ws.length}${en ? ' wallets · ' : 'のウォレット・'}${b.moved ? (en ? b.moved + ' sent out' : b.moved + 'つから出金') : (en ? 'no outgoing transfer' : '出金0回')}`; let bz = 15; g.font = `800 ${bz}px ${LJ}`; while (g.measureText(bl).width > 1160 - (630 + bw0) && bz > 11) { bz--; g.font = `800 ${bz}px ${LJ}`; } lt(g, bl, 630 + bw0, Y2 + 36, { s: bz, w: 800, c: '#ffe2bf' });
    const x0 = 614, x1 = 870, yb = Y2 + H3 - 30, yt = Y2 + 70, X = (t) => x0 + (t - ta) / (tb - ta) * (x1 - x0), Yv = (v) => yb - v / (b.held * 1.1 || 1) * (yb - yt);
    const [pts] = stepPts(b.steps || [[b.t, b.held]], X, Yv, tb); area(pts, yb, 'rgba(247,147,26,.85)', 'rgba(74,32,6,.2)', '#ffb35c', yt);
    [ta, (ta + tb) / 2, tb].forEach((t, k) => lt(g, hm(t), X(t), yb + 18, { s: 12, w: 700, c: MU, a: ['left', 'center', 'right'][k] }));
    lt(g, b.held.toLocaleString('en-US'), x1 - 6, Yv(b.held) - 8, { s: 16, w: 900, c: '#ffb35c', a: 'right' });
    b.ws.slice(0, 20).forEach(([a, v], k) => { const col = Math.floor(k / 10), r = k % 10, x = 890 + col * 140, y = Y2 + 64 + r * 16.5; lt(g, a.slice(0, 8) + '…' + a.slice(-4), x, y, { s: 11, w: 700, c: '#e8cfae', f: LN }); lt(g, v.toLocaleString('en-US'), x + 132, y, { s: 11, w: 900, c: '#ffb35c', a: 'right' }); }); }
  else lt(g, en ? 'not available this time' : '今回は取得できず', 614, Y2 + 100, { s: 22, w: 800, c: MU });
  // ===== 下段: 主な出来事 =====
  g.fillStyle = 'rgba(15,29,54,.6)'; rr(20, 664, 1160, 108, 14); g.fill(); g.strokeStyle = 'rgba(75,93,125,.8)'; g.stroke();
  g.strokeStyle = '#4b5d7d'; g.lineWidth = 2; g.beginPath(); g.moveTo(50, 700); g.lineTo(1150, 700); g.stroke(); g.fillStyle = '#4b5d7d'; g.beginPath(); g.moveTo(1150, 694); g.lineTo(1162, 700); g.lineTo(1150, 706); g.fill();
  const COL = { b: BC, r: '#ff8a8a', g: GC, a: GC, e: '#f5b942' }, ICN = { b: '₿', r: '!', g: '⇄', a: 'A', e: 'Ξ' };
  let ev = BNTL.slice();
  if (ch && ch.kind === 'change') { ev = ev.slice(0, 5); ev.push([s.asof, en ? 'Change detected' : '変化あり（上記）', 'Change detected', 'r']); }
  ev.forEach(([t, ja, enl, k], i) => { const x = 60 + i * 186, c = COL[k]; glow(c, () => { g.fillStyle = c; g.beginPath(); g.arc(x, 700, 6, 0, 7); g.fill(); }); lt(g, hm(t) + (en ? '' : ''), x + 14, 693, { s: 14, w: 800, c: '#cfe0f2', f: LN });
    g.fillStyle = c; g.beginPath(); g.arc(x + 12, 736, 13, 0, 7); g.fill(); lt(g, ICN[k], x + 12, 741, { s: 14, w: 900, c: '#0b1220', a: 'center' }); const l = en ? enl : ja; let fz2 = 16; g.font = `800 ${fz2}px ${LJ}`; while (g.measureText(l).width > 148 && fz2 > 11) { fz2--; g.font = `800 ${fz2}px ${LJ}`; } lt(g, l, x + 32, 742, { s: fz2, w: 800 }); });
  lt(g, en ? 'Source: on-chain records (Etherscan · mempool.space) / CSA' : '出典：オンチェーンの記録（Etherscan・mempool.space）／CSA調べ', 1170, 794, { s: 12, w: 600, c: '#5d7290', a: 'right' });
}
// v243: ショック比較の共通(BTC実況と同じ枠・水色)。sd = {n, ev:{id:{base, recover, days:[[d, pct]]}}}
function shockFrame(g, lg, tag) {
  const H2 = LH, CY = '#2ee6ff';
  const bg = g.createRadialGradient(360, 160, 20, 360, 160, 1300); bg.addColorStop(0, '#0d1f33'); bg.addColorStop(1, '#050b14'); g.fillStyle = bg; g.fillRect(0, 0, W, H2);
  g.strokeStyle = CY; g.lineWidth = 2.5; [[14, 14, 1, 1], [W - 14, 14, -1, 1], [14, H2 - 14, 1, -1], [W - 14, H2 - 14, -1, -1]].forEach(([x, y, sx, sy]) => { g.beginPath(); g.moveTo(x, y + sy * 26); g.lineTo(x, y); g.lineTo(x + sx * 26, y); g.stroke(); });
  g.save(); g.shadowColor = CY; g.shadowBlur = 10; g.fillStyle = CY; g.beginPath(); g.arc(44, 40, 7, 0, 7); g.fill(); g.restore();
  g.font = `700 15px ${LN}`; g.fillStyle = '#cfe0f2'; g.letterSpacing = '4px'; g.fillText(tag, 60, 46); g.letterSpacing = '0px';
  g.strokeStyle = '#2a4466'; g.lineWidth = 1; g.beginPath(); g.moveTo(360, 41); g.lineTo(1080, 41); g.stroke();
}
function shockAxes(g, X, Y, x0, x1, y0, y1, vt, dt, en) {
  const M = '#7f93ad';
  g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(x0, y0, X(0) - x0, y1 - y0);
  vt.forEach((v) => { g.strokeStyle = v ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.setLineDash(v ? [] : [6, 5]); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + v + '%', x0 - 12, Y(v) + 5, { s: 15, w: 800, f: LN, c: v ? M : '#fff', a: 'right' }); });
  dt.forEach((d) => { g.strokeStyle = 'rgba(255,255,255,.03)'; g.beginPath(); g.moveTo(X(d), y0); g.lineTo(X(d), y1); g.stroke(); lt(g, d === 0 ? (en ? 'Day 0' : '発生') : (d > 0 ? '+' : '') + d + (en ? 'd' : '日'), X(d), y1 + 26, { s: 15, w: 800, c: d === 0 ? '#fff' : '#cfe0f2', a: 'center' }); });
  g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.5; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(X(0), y0); g.lineTo(X(0), y1); g.stroke(); g.setLineDash([]);
  lt(g, en ? 'before' : '発生前', (x0 + X(0)) / 2, y0 + 22, { s: 14, w: 800, c: M, a: 'center' });
}
function shockLine(g, pts, c, w, dash, X, Y, clip) {
  g.save(); if (clip) { g.beginPath(); g.rect(clip[0], clip[1], clip[2], clip[3]); g.clip(); }
  g.strokeStyle = c; g.lineWidth = w; g.lineJoin = 'round'; g.setLineDash(dash || []); g.beginPath(); pts.forEach(([d, v], i) => i ? g.lineTo(X(d), Y(v)) : g.moveTo(X(d), Y(v))); g.stroke(); g.setLineDash([]); g.restore();
}
function shockNow(g, X, Y, y0, y1, cur, en, below) {
  const CY = '#2ee6ff', last = cur.days[cur.days.length - 1], nx = X(last[0]), ny = Y(last[1]), rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  g.strokeStyle = CY; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(nx, y0); g.lineTo(nx, y1); g.stroke(); g.setLineDash([]);
  lt(g, 'NOW', nx + 6, y1 - 10, { s: 15, w: 900, f: LN, c: CY });
  shockLine(g, cur.days, CY, 5, null, X, Y);
  g.strokeStyle = CY; g.lineWidth = 2; g.beginPath(); g.arc(nx, ny, 13, 0, 7); g.stroke(); g.fillStyle = CY; g.beginPath(); g.arc(nx, ny, 7, 0, 7); g.fill();
  const by = below ? ny + 16 : ny - 40; g.fillStyle = CY; rr(nx + 22, by, 132, 28, 5); g.fill();
  lt(g, cur.unit === 'h' ? (en ? 'Now / ' + last[0] + 'h' : '今回 / ' + last[0] + '時間') : (en ? 'Now / day ' : '今回 / ') + last[0] + (en ? '' : '日目'), nx + 88, by + 20, { s: 15, w: 900, c: '#04121a', a: 'center' });   // v323: 時間足
  if (!below) lt(g, (last[1] > 0 ? '+' : '') + last[1].toFixed(1) + '%', nx + 88, ny + 6, { s: 17, w: 900, f: LN, c: CY, a: 'center' });
}
function shockTop(g, items, x, en, label) {
  if (label) lt(g, label, items[0][0], 70, { s: 13, w: 800, c: '#7f93ad' });
  items.forEach(([x2, l, v, c, big]) => { g.strokeStyle = '#2a4466'; g.lineWidth = 1; g.beginPath(); g.moveTo(x2 - 16, 74); g.lineTo(x2 - 16, 150); g.stroke(); lt(g, l, x2, 96, { s: 14, w: 800, c: '#cfe0f2' }); lt(g, v, x2, big ? 142 : 136, { s: big || 26, w: 900, f: LN, c }); });
}
// 1) Binance 2019 / 2026
function drawShockBn(g, sd, lg) {
  const en = lg === 'en', CY = '#2ee6ff', BY = '#ffc400', M = '#7f93ad', n = sd.n, cur = sd.ev.binance2026, old = sd.ev.binance2019;
  shockFrame(g, lg, 'BTC / BINANCE vs BINANCE');
  lt(g, 'DAY ' + n, W - 34, 48, { s: 20, w: 900, f: LN, c: CY, a: 'right' });
  lt(g, en ? 'Binance hack' : 'Binance ハッキング', 38, 86, { s: 30, w: 900 });
  let x = 36; x += lt(g, '2019', x, 140, { s: 58, w: 900, f: LN, c: BY }); x += lt(g, ' / ', x, 140, { s: 58, w: 300, f: LN, c: '#5d7290' }); lt(g, '2026', x, 140, { s: 58, w: 900, f: LN, c: CY });
  lt(g, en ? 'BTC after the hack' : '発生後のBTC', 380, 112, { s: 22, w: 800, c: '#cfe0f2' }); lt(g, en ? 'aligned on day 0, prior close = 0%' : '発生日をそろえ、前日の終値＝0%', 380, 140, { s: 15, w: 700, c: M });
  const at = (e) => { const q = e.days.find((z) => z[0] === n); return q ? (q[1] > 0 ? '+' : '') + q[1].toFixed(1) + '%' : '—'; };
  shockTop(g, [[760, en ? `2026 · day ${n}` : `2026・${n}日目`, at(cur), CY, 44], [980, en ? `2019 · same day ${n}` : `2019・同じ${n}日目`, at(old), BY, 44]], 0, en);
  const span = Math.max(30, Math.min(90, Math.ceil((n + 10) / 15) * 15)), oldIn = old.days.filter((q) => q[0] <= span), all = [...oldIn, ...cur.days].map((q) => q[1]);
  const hi = Math.max(20, Math.ceil((Math.max(...all) + 5) / 20) * 20), lo = Math.min(-20, Math.floor((Math.min(...all) - 5) / 20) * 20);
  const x0 = 100, x1 = 1110, y0 = 190, y1 = 600, X = (d) => x0 + (d + SHOCK.pre) / (span + SHOCK.pre) * (x1 - x0), Y = (v) => y0 + (hi - v) / (hi - lo) * (y1 - y0);
  const vt = []; for (let v = hi; v >= lo; v -= 20) vt.push(v); const dt = []; for (let d = -15; d <= span; d += span > 45 ? 15 : 5) dt.push(d);
  shockAxes(g, X, Y, x0, x1, y0, y1, vt, dt, en);
  const gr = g.createLinearGradient(0, y0, 0, Y(0)); gr.addColorStop(0, 'rgba(255,196,0,.18)'); gr.addColorStop(1, 'rgba(255,196,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(X(oldIn[0][0]), Y(0)); oldIn.forEach(([d, v]) => g.lineTo(X(d), Y(v))); g.lineTo(X(oldIn[oldIn.length - 1][0]), Y(0)); g.fill();
  shockLine(g, oldIn, BY, 4, null, X, Y);
  [7, 30].filter((d) => d <= span).forEach((d) => { const q = old.days.find((z) => z[0] === d); if (!q) return; g.fillStyle = BY; g.beginPath(); g.arc(X(d), Y(q[1]), 5, 0, 7); g.fill(); lt(g, (en ? `day ${d} ` : `${d}日目 `) + (q[1] > 0 ? '+' : '') + q[1].toFixed(0) + '%', X(d), Y(q[1]) - 14, { s: 15, w: 900, c: BY, a: d === span ? 'right' : 'center' }); });
  shockNow(g, X, Y, y0, y1, cur, en, true);
  [[CY, en ? 'Binance now (2026/10 · ~$6.3B, Binance estimate)' : '今回 Binance（2026/10・約63億ドル・Binance推計）', 5], [BY, en ? 'Binance before (2019/5 · 7,000 BTC, ~$40M then)' : '前回 Binance（2019/5・7,000 BTC・当時約4,000万ドル）', 4]].forEach(([c, l, w], i) => { const xx = 40 + i * 560; g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(xx, 662); g.lineTo(xx + 44, 662); g.stroke(); lt(g, l, xx + 56, 668, { s: fitBig(g, l, 490, 17, 800, LJ) > 17 ? 17 : 15, w: 800, c: '#e8f0fb' }); });
  g.strokeStyle = '#2a4466'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 700); g.lineTo(W - 36, 700); g.stroke();
  lt(g, en ? '2019 came during a rising market; the loss was ~150x smaller' : '前回は同じ時期に上昇相場の途中。被害の規模も約150倍ちがう', 40, 742, { s: 20, w: 900 });
  lt(g, en ? 'In 2019 CZ pledged full SAFU coverage and paused withdrawals for ~1 week' : '前回はCZがSAFU基金での全額補償を発表し、出金を約1週間停止', 40, 772, { s: 14, w: 700, c: M });
  lt(g, en ? 'Past record. This time may differ.' : '過去の記録で、今回も同じとは限りません', W - 36, 742, { s: 15, w: 900, c: '#ff9a9a', a: 'right' });
  lt(g, en ? 'Binance BTCUSDT daily close · @csa_archive' : 'Binance BTCUSDT 日足終値・@csa_archive', W - 36, 772, { s: 13, w: 700, c: M, a: 'right' });
}
// 2) 過去の巨大ショックとの比較
function drawShockCmp(g, sd, lg) {
  const en = lg === 'en', CY = '#2ee6ff', OR = '#ff8c1a', EM = '#19d3a2', IN = '#8f84ff', M = '#7f93ad', n = sd.n, E = sd.ev, rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  shockFrame(g, lg, 'BTC / SHOCK COMPARE');
  lt(g, 'DAY ' + n, W - 34, 48, { s: 20, w: 900, f: LN, c: CY, a: 'right' });
  lt(g, en ? 'BTC after shocks' : 'ショック後のBTC', 36, 118, { s: 50, w: 900 });
  lt(g, en ? 'Aligned on day 0, prior close = 0%' : '発生日をそろえて、前日の終値＝0%で並べる', 40, 152, { s: 18, w: 700, c: '#cfe0f2' });
  const at = (e) => { const q = e.days.find((z) => z[0] === n); return q ? (q[1] > 0 ? '+' : '') + q[1].toFixed(1) + '%' : '—'; };
  shockTop(g, [[620, en ? 'Now' : '今回', at(E.binance2026), CY, 34], [760, 'Bybit', at(E.bybit2025), OR], [890, 'FTX', at(E.ftx2022), EM], [1020, 'LUNA', at(E.luna2022), IN]], 0, en, en ? `Same day ${n}` : `同じ${n}日目の比較`);
  const x0 = 100, x1 = 1080, y0 = 180, y1 = 600, X = (d) => x0 + (d + 15) / 105 * (x1 - x0), Y = (v) => y0 + (20 - v) / 70 * (y1 - y0);
  shockAxes(g, X, Y, x0, x1, y0, y1, [20, 10, 0, -10, -20, -30, -40, -50], [-15, 0, 15, 30, 45, 60, 75, 90], en);
  const clip = [x0, y0 - 4, x1 - x0 + 8, y1 - y0 + 8];
  [[IN, 'luna2022'], [EM, 'ftx2022'], [OR, 'bybit2025']].forEach(([c, id]) => shockLine(g, E[id].days, c, 2.4, [6, 5], X, Y, clip));
  [['bybit2025', 'Bybit', OR, -8], ['ftx2022', 'FTX', EM, 12], ['luna2022', 'LUNA', IN, 5]].forEach(([id, nm, c, dy]) => { const q = E[id].days[E[id].days.length - 1]; lt(g, nm, X(q[0]) + 6, Y(q[1]) + dy, { s: 14, w: 900, c }); });
  { const lm = E.luna2022.days.filter((q) => q[0] >= 0).reduce((a, q) => q[1] < a[1] ? q : a); g.fillStyle = IN; g.beginPath(); g.arc(X(lm[0]), Y(lm[1]), 4, 0, 7); g.fill(); lt(g, (en ? 'LUNA low ' : 'LUNA 最安 ') + lm[1].toFixed(1) + '%' + (en ? ` (day ${lm[0]})` : `（${lm[0]}日目）`), X(lm[0]) + 10, Y(lm[1]) + 5, { s: 14, w: 800, c: IN }); }
  const badge = (d, c, txt, up) => { g.strokeStyle = c; g.lineWidth = 2.5; g.beginPath(); g.arc(X(d), Y(0), 8, 0, 7); g.stroke(); const y = up ? Y(0) - 48 : Y(0) + 14; g.fillStyle = c; rr(X(d) - 52, y, 104, up ? 30 : 26, 6); g.fill(); lt(g, txt, X(d), y + (up ? 21 : 18), { s: 15, w: 900, c: '#0b1220', a: 'center' }); };
  if (E.ftx2022.recover != null) badge(E.ftx2022.recover, EM, (en ? 'FTX ' : 'FTX ') + E.ftx2022.recover + (en ? 'd' : '日'), false);
  if (E.bybit2025.recover != null) badge(E.bybit2025.recover, OR, 'Bybit ' + E.bybit2025.recover + (en ? 'd' : '日'), true);
  { const q = E.luna2022.days.find((z) => z[0] === 90) || E.luna2022.days[E.luna2022.days.length - 1], xr = X(90), yl = Y(q[1]) + 30; g.fillStyle = IN; rr(xr - 150, yl, 112, 26, 6); g.fill(); lt(g, 'LUNA 534' + (en ? 'd' : '日'), xr - 94, yl + 18, { s: 15, w: 900, c: '#0b1220', a: 'center' }); g.strokeStyle = IN; g.lineWidth = 4; g.beginPath(); g.moveTo(xr - 34, yl + 13); g.lineTo(xr + 20, yl + 13); g.stroke(); g.fillStyle = IN; g.beginPath(); g.moveTo(xr + 14, yl + 1); g.lineTo(xr + 36, yl + 13); g.lineTo(xr + 14, yl + 25); g.fill(); }
  shockNow(g, X, Y, y0, y1, E.binance2026, en, false);
  const lg2 = [[CY, en ? 'Binance now (2026/10 · hack)' : '今回 Binance（2026/10・ハッキング）', null, 5], [OR, en ? 'Bybit (2025/2 · hack)' : 'Bybit（2025/2・ハッキング）', [6, 5], 2.4], [EM, en ? 'FTX (2022/11 · bankruptcy)' : 'FTX（2022/11・破綻）', [6, 5], 2.4], [IN, en ? 'LUNA (2022/5 · collapse)' : 'LUNA（2022/5・崩壊）', [6, 5], 2.4]];
  lg2.forEach(([c, l, da, w], i) => { const xx = 40 + (i % 2) * 560, y = 652 + Math.floor(i / 2) * 28; g.strokeStyle = c; g.lineWidth = w; g.setLineDash(da || []); g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + 40, y); g.stroke(); g.setLineDash([]); lt(g, l, xx + 50, y + 6, { s: 16, w: 800, c: '#e8f0fb' }); });
  g.strokeStyle = '#2a4466'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 700); g.lineTo(W - 36, 700); g.stroke();
  const rd = (id, dflt) => E[id].recover != null ? E[id].recover : dflt;
  lt(g, en ? `Days to regain the prior level: FTX ${rd('ftx2022')} · Bybit ${rd('bybit2025')} · LUNA 534` : `前の水準に戻るまで：FTX ${rd('ftx2022')}日・Bybit ${rd('bybit2025')}日・LUNA 534日`, 40, 742, { s: 22, w: 900 });
  lt(g, en ? 'LUNA was already falling before; its 534 days include later collapses (Celsius, 3AC)' : 'LUNAは発生前から下げの途中。534日には、その後の連鎖破綻（Celsius・3ACなど）の時期も含む', 40, 772, { s: 13, w: 700, c: M });
  lt(g, en ? 'Past record. This time may differ.' : '過去の記録で、今回も同じとは限りません', W - 36, 742, { s: 15, w: 900, c: '#ff9a9a', a: 'right' });
  lt(g, en ? 'Binance BTCUSDT daily close' : 'Binance BTCUSDT 日足終値', W - 36, 772, { s: 13, w: 700, c: M, a: 'right' });
}
// v259: BTC × S&P500 の相関の推移。c = { t, r, b, s, ev, end }
function drawCorrTs(g, c, lg) {
  const en = lg === 'en', au = c.vs === 'au', CY = '#2ee6ff', BT = '#9db3d1', SP = au ? '#ffd84d' : '#e09a52', M = '#8ea2bf', n = c.t.length, H2 = LH, SN = au ? (en ? 'Gold' : '金') : 'S&P 500';   // v347: 金版
  g.fillStyle = '#070d16'; g.fillRect(0, 0, W, H2); g.fillStyle = CY; g.fillRect(0, 0, W, 5);
  g.fillStyle = M; g.beginPath(); g.arc(46, 42, 6, 0, 7); g.fill();
  g.font = `600 14px ${LN}`; g.letterSpacing = '2px'; g.fillStyle = M; g.fillText('MARKET RELATIONSHIP  /  07 DAYS', 62, 47); g.letterSpacing = '0px';
  const st = corrStatsD(c), sg = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2);
  lt(g, en ? `BTC × ${SN} correlation` : `BTC × ${SN} の相関`, 40, 106, { s: 40, w: 900 });
  const word = st.now == null ? (en ? 'Not enough data' : 'データ不足') : st.now >= 0.5 ? (en ? 'Last 24h: moving in the same direction' : '直近24時間は、同じ方向に動く傾向') : st.now <= -0.5 ? (en ? 'Last 24h: moving in opposite directions' : '直近24時間は、逆方向に動く傾向') : (en ? 'Last 24h: no clear relationship' : '直近24時間は、はっきりした関係なし');
  lt(g, word, 42, 142, { s: 20, w: 800, c: CY });
  g.strokeStyle = '#1c2a3d'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 166); g.lineTo(W - 36, 166); g.stroke();
  const x0 = 92, x1 = 950, y0 = 238, y1 = 540, X = (i) => x0 + i / (n - 1) * (x1 - x0), YC = (v) => y0 + (1 - v) / 2 * (y1 - y0);
  const pv = [...c.b, ...c.s].filter((v) => v != null), pm = Math.max(3, Math.ceil(Math.max(...pv.map(Math.abs), 0) / 3) * 3), YP = (v) => y0 + (pm - v) / (2 * pm) * (y1 - y0);
  lt(g, en ? 'Left: 24h correlation' : '左軸　24時間相関', 92, 202, { s: 18, w: 800 });
  g.strokeStyle = BT; g.lineWidth = 2; g.beginPath(); g.moveTo(352, 196); g.lineTo(374, 196); g.stroke(); lt(g, 'BTC', 382, 202, { s: 15, w: 600, c: BT, f: LN });
  g.strokeStyle = SP; g.beginPath(); g.moveTo(440, 196); g.lineTo(462, 196); g.stroke(); lt(g, SN, 470, 202, { s: 15, w: 600, c: SP, f: LN });
  lt(g, en ? 'Right: price change' : '右軸　価格変化率', 1010, 200, { s: 16, w: 700, c: M, a: 'right' }); lt(g, en ? '7 days ago = 0%' : '7日前＝0%', 1010, 220, { s: 12, w: 600, c: M, a: 'right' });
  lt(g, en ? 'same' : '同方向', 30, 222, { s: 11, w: 600, c: M }); lt(g, en ? 'opposite' : '逆方向', 30, 556, { s: 11, w: 600, c: M });
  g.fillStyle = 'rgba(46,230,255,.08)'; g.fillRect(x0, YC(1), x1 - x0, YC(0.5) - YC(1));
  const ia = Math.max(0, st.i - 24); g.fillStyle = 'rgba(58,106,154,.16)'; g.fillRect(X(ia), y0, x1 - X(ia), y1 - y0);
  g.setLineDash([3, 3]); g.strokeStyle = M; g.beginPath(); g.moveTo(X(ia), y0); g.lineTo(X(ia), y1); g.stroke(); g.setLineDash([]);
  [[1, pm], [0.5, pm / 2], [0, 0], [-0.5, -pm / 2], [-1, -pm]].forEach(([v, p]) => { g.strokeStyle = v ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.2)'; g.setLineDash(v ? [] : [4, 4]); g.beginPath(); g.moveTo(x0, YC(v)); g.lineTo(x1, YC(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + (v ? v.toFixed(1) : '0'), x0 - 14, YC(v) + 5, { s: 14, w: 600, c: '#cfd8e6', a: 'right', f: LN }); lt(g, (p > 0 ? '+' : '') + p + '%', x1 + 12, YC(v) + 5, { s: 12, w: 600, c: M, f: LN }); });
  const line = (a, Y, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); let on = false; a.forEach((v, i) => { if (v == null) { on = false; return; } on ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); on = true; }); g.stroke(); };
  line(c.b, YP, BT, 1.8); line(c.s, YP, SP, 1.8); line(c.r, YC, CY, 3.2);
  const a = st.i >= 24 ? c.r[st.i - 24] : null;
  if (a != null) { g.fillStyle = '#e8f0fb'; g.beginPath(); g.arc(X(st.i - 24), YC(a), 5, 0, 7); g.fill(); const by = YC(a) + (a > 0 ? 12 : -38); g.fillStyle = '#14243a'; g.fillRect(X(st.i - 24) - 118, by, 108, 26); lt(g, (en ? '24h ago ' : '24時間前 ') + a.toFixed(2), X(st.i - 24) - 64, by + 18, { s: 13, w: 600, c: '#e8f0fb', a: 'center' }); }
  if (st.now != null) { const yy = YC(st.now); g.fillStyle = CY; g.beginPath(); g.arc(X(st.i), yy, 7, 0, 7); g.fill(); g.strokeStyle = CY; g.lineWidth = 2; g.beginPath(); g.moveTo(X(st.i), yy); g.lineTo(1010, yy); g.stroke(); const bx = 1010, by = Math.min(Math.max(yy - 42, 180), y1 - 70); g.fillStyle = '#102438'; g.fillRect(bx, by, 160, 88); g.fillStyle = CY; g.fillRect(bx, by, 3, 88); lt(g, en ? 'Correlation now' : '現在の相関', bx + 16, by + 26, { s: 14, w: 600, c: '#cfe0f2' }); lt(g, sg(st.now), bx + 16, by + 70, { s: 36, w: 800, c: CY, f: LN }); }
  const evs = (c.ev || []).map((e) => ({ ...e, i: Math.round((e.t - c.t[0]) / 3600e3) })).filter((e) => e.i >= 0 && e.i < n), nums = ['①', '②', '③', '④'];
  for (let d = 7; d >= 0; d--) { const i = Math.max(0, n - 1 - d * 24); lt(g, d ? (en ? d + 'd ago' : d + '日前') : (en ? 'Now' : '現在'), X(i), y1 + 30, { s: 14, w: 600, c: M, a: 'center' }); }
  const rows = [[], []];
  evs.forEach((e, k) => { const x = X(e.i), col = e.k === 'hack' ? '#ff5c7a' : '#ffd166'; g.strokeStyle = col; g.globalAlpha = .55; g.setLineDash([3, 3]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, 592); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; g.save(); g.translate(x, 600); g.rotate(Math.PI / 4); g.fillStyle = col; g.fillRect(-5, -5, 10, 10); g.restore();
    const lab = nums[k] + ' ' + (en ? e.en : e.ja); g.font = `800 15px ${LJ}`; const w = g.measureText(lab).width, cx = Math.min(Math.max(x, x0 + w / 2), x1 - w / 2), a2 = cx - w / 2 - 8, b2 = cx + w / 2 + 8;
    const r = rows[0].some(([p, q]) => a2 < q && b2 > p) ? 1 : 0; rows[r].push([a2, b2]); lt(g, lab, cx, 628 + r * 24, { s: 15, w: 800, c: col, a: 'center' }); });
  g.strokeStyle = '#1c2a3d'; g.beginPath(); g.moveTo(36, 690); g.lineTo(W - 36, 690); g.stroke();
  lt(g, en ? 'Correlation of 1h returns over the previous 24h, shifted hourly. Prices: change from 7 days ago.' : '相関は1時間ごとの騰落率で、直前24時間ぶんを使って計算。価格は7日前を0%とした変化率。', 40, 722, { s: 14, w: 600, c: M });
  lt(g, en ? '◆ = events in the same period. This chart cannot show cause or direction of influence.' : '◆は同じ時期に起きた出来事。原因や影響の向きは、この図からは分かりません。', 40, 750, { s: 14, w: 600, c: M });
  lt(g, en ? 'Past record. This time may differ.' : '過去の記録で、今回も同じとは限りません', W - 36, 750, { s: 14, w: 800, c: '#ff9a9a', a: 'right' });
  lt(g, au ? (en ? 'Binance 1h (BTC, gold = PAXG) · @csa_archive' : 'Binance 1時間足（BTC・金はPAXG）・@csa_archive') : (en ? 'Pacifica 1h · @csa_archive' : 'Pacifica 1時間足・@csa_archive'), W - 36, 778, { s: 12, w: 600, c: M, a: 'right' });
}
function corrStatsD(c) { let i = c.r.length - 1; while (i >= 0 && c.r[i] == null) i--; return { i, now: i >= 0 ? c.r[i] : null }; }
// v260→v264: 米中間選挙の前後3日のBTC(1時間足)。md = { ev:{ id:{ pts:[[h,pct]], h1d, h3d, min } }, h, done, src }
function drawMidterm(g, md, lg) {
  const en = lg === 'en', CY = '#2ee6ff', M = '#8ea2bf', E = md.ev;
  const S = [['mid2014', '2014', '#8f84ff'], ['mid2018', '2018', '#ff8c1a'], ['mid2022', '2022', '#19d3a2']];
  g.fillStyle = '#070d16'; g.fillRect(0, 0, W, LH); g.fillStyle = CY; g.fillRect(0, 0, W, 5);
  g.fillStyle = M; g.beginPath(); g.arc(46, 42, 6, 0, 7); g.fill(); g.font = `600 14px ${LN}`; g.letterSpacing = '2px'; g.fillStyle = M; g.fillText('BTC / US MIDTERMS / ±3 DAYS', 62, 47); g.letterSpacing = '0px';
  lt(g, en ? 'BTC around US midterm election day' : '米中間選挙 投票日前後のBTC', 40, 106, { s: 38, w: 900 });
  lt(g, en ? '1h candles · election-day close (UTC) = 0%' : '1時間足・投票日の終値（UTC）＝0%', 42, 142, { s: 18, w: 800, c: '#cfe0f2' });
  const sg = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(1) + '%';
  const rows = [...S, ['mid2026', en ? 'Now' : '今回', CY]];
  [[700, en ? '+1 day' : '1日後'], [830, en ? '+3 days' : '3日後'], [960, en ? 'Low in 3 days' : '3日以内の最安']].forEach(([x, l]) => lt(g, l, x, 48, { s: 13, w: 800, c: M }));
  rows.forEach(([id, y, c], k) => { const e = E[id] || {}, yy = 72 + k * 24; lt(g, y, 640, yy, { s: 15, w: 900, c, f: LN }); lt(g, sg(e.h1d), 700, yy, { s: 16, w: 800, c: '#e8f0fb', f: LN }); lt(g, sg(e.h3d), 830, yy, { s: 16, w: 800, c: '#e8f0fb', f: LN }); lt(g, sg(e.min && e.min[1]), 960, yy, { s: 16, w: 800, c: '#e8f0fb', f: LN }); });
  g.strokeStyle = '#1c2a3d'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 172); g.lineTo(W - 36, 172); g.stroke();
  const all = Object.values(E).flatMap((e) => (e.pts || []).map((q) => q[1])), m = Math.max(4, Math.ceil(Math.max(...all.map(Math.abs), 0) / 2) * 2 + 2), lo = -m, hi = m;
  const x0 = 92, x1 = 1080, y0 = 200, y1 = 600, X = (h) => x0 + (h + MID.pre) / (MID.pre + MID.post) * (x1 - x0), Y = (v) => y0 + (hi - v) / (hi - lo) * (y1 - y0);
  g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(X(-24), y0, X(0) - X(-24), y1 - y0); lt(g, en ? 'Election day' : '投票日', (X(-24) + X(0)) / 2, y0 + 20, { s: 14, w: 800, c: '#cfe0f2', a: 'center' });
  const step = m > 12 ? 5 : 2;
  for (let v = Math.floor(hi / step) * step; v >= lo; v -= step) { g.strokeStyle = v ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.35)'; g.setLineDash(v ? [] : [5, 5]); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + v + '%', x0 - 12, Y(v) + 5, { s: 14, w: 700, c: v ? M : '#fff', a: 'right', f: LN }); }
  [[-96, en ? '−3d' : '3日前'], [-72, en ? '−2d' : '2日前'], [-48, en ? '−1d' : '1日前'], [0, en ? 'Close' : '投票日の終値'], [24, '+1' + (en ? 'd' : '日')], [48, '+2' + (en ? 'd' : '日')], [72, '+3' + (en ? 'd' : '日')]].forEach(([h, l]) => { g.strokeStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.moveTo(X(h), y0); g.lineTo(X(h), y1); g.stroke(); lt(g, l, X(h), y1 + 26, { s: 14, w: 700, c: h ? '#cfe0f2' : '#fff', a: 'center' }); });
  const line = (pts, c, w, dash) => { g.strokeStyle = c; g.lineWidth = w; g.lineJoin = 'round'; g.setLineDash(dash || []); g.beginPath(); pts.forEach(([h, v], i) => i ? g.lineTo(X(h), Y(v)) : g.moveTo(X(h), Y(v))); g.stroke(); g.setLineDash([]); };
  S.forEach(([id, y, c]) => { const e = E[id]; if (!e || !e.pts.length) return; line(e.pts, c, 2.2, [6, 5]); const q = e.pts[e.pts.length - 1]; lt(g, y, X(q[0]) + 6, Y(q[1]) + 5, { s: 14, w: 900, c, f: LN }); });
  const nt = MID.ev.find((e) => e.note), ne = nt && E[nt.id]; if (ne && ne.pts.length) { const T = Date.parse(nt.d0 + 'T00:00:00Z') + 864e5, h = Math.round((nt.noteAt - T) / 3600e3), q = ne.pts.find((z) => z[0] === h); if (q) { g.fillStyle = '#19d3a2'; g.beginPath(); g.arc(X(h), Y(q[1]), 5, 0, 7); g.fill(); g.strokeStyle = '#19d3a2'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(h), Y(q[1])); g.lineTo(X(h) - 30, Y(q[1]) + 40); g.stroke(); lt(g, nt.note[en ? 1 : 0], X(h) - 34, Y(q[1]) + 56, { s: 13, w: 800, c: '#19d3a2', a: 'right' }); } }
  const cur = E[MID.cur];
  if (cur && cur.pts.length) { line(cur.pts, CY, 4.5); const q = cur.pts[cur.pts.length - 1]; g.fillStyle = CY; g.beginPath(); g.arc(X(q[0]), Y(q[1]), 6, 0, 7); g.fill(); g.strokeStyle = CY; g.lineWidth = 2; g.beginPath(); g.arc(X(q[0]), Y(q[1]), 12, 0, 7); g.stroke(); }
  const lg2 = [[CY, en ? '2026 (now)' : '2026年（今回）', null, 4.5], ...S.map(([id, y, c]) => [c, y + (en ? '' : '年'), [6, 5], 2.2])];
  lg2.forEach(([c, l, da, w], i) => { const xx = 92 + i * 200; g.strokeStyle = c; g.lineWidth = w; g.setLineDash(da || []); g.beginPath(); g.moveTo(xx, 668); g.lineTo(xx + 36, 668); g.stroke(); g.setLineDash([]); lt(g, l, xx + 46, 674, { s: 15, w: 800, c: '#e8f0fb' }); });
  g.strokeStyle = '#1c2a3d'; g.beginPath(); g.moveTo(36, 700); g.lineTo(W - 36, 700); g.stroke();
  lt(g, en ? 'Only 3 past cases. They cannot show the effect of elections.' : '3例だけの記録で、選挙の影響は判断できません', 40, 738, { s: 17, w: 900 });
  lt(g, en ? 'Past record. This time may differ.' : '過去の記録で、今回も同じとは限りません', 40, 768, { s: 14, w: 800, c: '#ff9a9a' });
  lt(g, (md.src || 'Bitstamp') + (en ? ' BTC/USD 1h · @csa_archive' : ' BTC/USD 1時間足・@csa_archive'), W - 36, 768, { s: 12, w: 600, c: M, a: 'right' });
}
// v273: 年表(週1：2017年〜今)。hd = { mcap:{pts}, booms:[{id,ja,en,pts}], crises:[{n,d,k,b,cur}] }
const HC = { ico: '#8fb4e0', defi: '#7fd3c0', nft: '#c5b3f0', algo: '#e8b97a', lend: '#9fd6a0', meme: '#c9d88a', cex: '#c9b8c8', dex: '#9fb8e8' }, YG = '#b8f03c';
const ymF = (v) => { const [y, m] = v.split('-').map(Number); return y + (m - 0.5) / 12; }, dyF = (v) => { const [y, m, d] = v.split('-').map(Number); return y + (m - 1) / 12 + (d - 1) / 365; };
function hPath(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); }
function hBubble(g, x, y, r, hack) { g.strokeStyle = YG; g.lineWidth = hack ? 2 : 2.6; g.beginPath(); g.arc(x, y, r, 0, 7); if (hack) { g.fillStyle = 'rgba(184,240,60,.45)'; g.fill(); } g.stroke(); }
function hCards(g, items, x0, x1, top, en) {   // 危機の札を等間隔に並べ、引き出し線でつなぐ。items = [{cx, cy, n, date, hack, cur}]
  const bw = (x1 - x0) / Math.max(items.length, 1);
  items.forEach((it, i) => { const bx = x0 + bw * i + bw / 2; g.strokeStyle = 'rgba(184,240,60,.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(it.cx, it.cy); g.lineTo(it.cx, Math.max(it.cy + 6, top - 46)); g.lineTo(bx, top - 14); g.lineTo(bx, top - 2); g.stroke();
    g.fillStyle = it.cur ? '#26341a' : '#16202e'; g.strokeStyle = it.cur ? YG : '#2a3a52'; g.lineWidth = 1; g.beginPath(); g.roundRect(bx - bw / 2 + 4, top, bw - 8, 58, 6); g.fill(); g.stroke();
    lt(g, (it.hack ? '● ' : '○ ') + it.date, bx, top + 20, { s: 12, w: 800, c: YG, a: 'center' }); const nm = it.n.length > 16 ? it.n.slice(0, 15) + '…' : it.n; lt(g, nm, bx, top + 42, { s: nm.length > 11 ? 12 : 14, w: 800, a: 'center' }); });
}
function drawHistW(g, hd, lg) {
  const en = lg === 'en', CY = '#2ee6ff', M = '#8ea2bf', WW = 1440, x0 = 190, x1 = 1320, T0 = 2017, T1 = 2026.95, X = (y) => x0 + (y - T0) / (T1 - T0) * (x1 - x0);
  g.fillStyle = '#070d16'; g.fillRect(0, 0, WW, 1300); g.fillStyle = CY; g.fillRect(0, 0, WW, 5);
  lt(g, 'CSA　/　CRYPTO BOOMS & CRISES', 68, 50, { s: 17, w: 600, c: M, f: LN }); lt(g, en ? 'Includes estimates' : '一部推定を含む', 1295, 48, { s: 17, w: 800, c: '#ffd166', a: 'right' });
  lt(g, en ? 'Crypto booms and crises, 2017–now' : '暗号資産のブームと危機の歴史', 70, 122, { s: 46, w: 900 }); lt(g, en ? 'Total market cap × major crises × booms' : '2017–今　｜　時価総額 × 歴代の危機 × ブーム', 70, 168, { s: 20, w: 500, c: '#9fb2cc' });
  g.fillStyle = '#0e1826'; g.fillRect(64, 205, 1312, 930);
  lt(g, en ? 'Total crypto market cap' : '暗号資産全体の時価総額', 90, 246, { s: 20, w: 800 }); lt(g, en ? 'Log scale (10× per step)' : '対数目盛り（1目盛りで10倍）', 90, 272, { s: 14, w: 500, c: M });
  g.fillStyle = '#1a2418'; g.fillRect(980, 228, 370, 64); hBubble(g, 1002, 250, 8, true); lt(g, en ? 'Filled = hack (amount stolen)' : '塗り＝ハッキング（盗まれた額）', 1018, 256, { s: 14, w: 500, c: '#e6f7c8' }); hBubble(g, 1002, 276, 8, false); lt(g, en ? 'Ring = collapse (value lost)' : '輪＝破綻・崩壊（失われた額）', 1018, 282, { s: 14, w: 500, c: '#e6f7c8' });
  const K = hd.mcap.pts.map(([m, v]) => [ymF(m), v / 1000]), mc = (y) => { if (y <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (y <= K[i][0]) { const [a, b] = K[i - 1], [c, d] = K[i]; return Math.exp(Math.log(b) + (Math.log(d) - Math.log(b)) * (y - a) / (c - a)); } return K[K.length - 1][1]; };
  const lo = Math.log10(0.0012), hi = Math.log10(6), A0 = 320, A1 = 740, Y = (v) => A1 - (Math.log10(v) - lo) / (hi - lo) * (A1 - A0);
  [[0.01, en ? '$10B' : '100億ドル'], [0.1, en ? '$100B' : '1,000億ドル'], [1, en ? '$1T' : '1兆ドル'], [5, en ? '$5T' : '5兆ドル']].forEach(([v, l]) => { g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, l, x0 - 12, Y(v) + 5, { s: 13, w: 500, c: M, a: 'right' }); });
  const tEnd = K[K.length - 1][0], line = []; for (let y = T0; y <= tEnd; y += 0.01) line.push([X(y), Y(mc(y))]);
  hPath(g, [...line, [X(tEnd), A1], [X(T0), A1]]); g.fillStyle = 'rgba(46,230,255,.08)'; g.fill(); hPath(g, line); g.strokeStyle = CY; g.lineWidth = 2.4; g.stroke();
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], R = (b) => Math.min(6 + Math.sqrt(b * 1000) / 4.2, 52);
  const items = hd.crises.map((c) => { const y = dyF(c.d), [yy, mm] = c.d.split('-'); return { cx: X(y), cy: Y(mc(y)), r: R(c.b || 0.05), hack: c.k === 'hack', n: c.n, cur: c.cur, date: en ? MN[+mm - 1] + ' ' + yy + (c.cur ? ' now' : '') : yy + '年' + (+mm) + '月' + (c.cur ? ' 今回' : '') }; });
  items.forEach((it) => hBubble(g, it.cx, it.cy, it.r, it.hack)); hCards(g, items, x0, x1, 650, en);
  g.strokeStyle = '#1c2a3d'; g.beginPath(); g.moveTo(70, 770); g.lineTo(1360, 770); g.stroke();
  lt(g, en ? 'Booms' : 'ブームの波', 90, 800, { s: 20, w: 800 }); lt(g, en ? 'Money in each theme (each peak = 1)' : '各テーマの資金量（それぞれの最大＝1）', 218, 800, { s: 14, w: 500, c: M });
  const RH = 36, R0 = 815;
  hd.booms.forEach((b, k) => { const P = b.pts.map(([m, v]) => [ymF(m), v]), mx = Math.max(...P.map((q) => q[1])), c = HC[b.id] || '#aab', base = R0 + RH * (k + 1) - 4, top = R0 + RH * k + 6;
    const f = (y) => { if (y < P[0][0] || y > P[P.length - 1][0]) return 0; for (let i = 1; i < P.length; i++) if (y <= P[i][0]) { const [a, u] = P[i - 1], [cc, w] = P[i]; return u + (w - u) * (y - a) / (cc - a); } return P[P.length - 1][1]; };
    const pts = []; for (let y = T0; y <= T1; y += 0.01) pts.push([X(y), base - f(y) / mx * (base - top)]);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, base); g.lineTo(x1, base); g.stroke();
    hPath(g, [...pts, [X(T1), base], [X(T0), base]]); g.globalAlpha = .22; g.fillStyle = c; g.fill(); g.globalAlpha = 1; hPath(g, pts); g.strokeStyle = c; g.lineWidth = 1.6; g.stroke();
    lt(g, en ? b.en : b.ja, x0 - 10, base - 8, { s: 11, w: 800, c, a: 'right' });
    const pk = P.reduce((a, q) => q[1] > a[1] ? q : a), per = ['ico', 'nft', 'dex', 'cex'].includes(b.id); lt(g, (en ? 'peak ' + (pk[1] >= 1000 ? '$' + (pk[1] / 1000).toFixed(1) + 'T' : '$' + (pk[1] >= 10 ? Math.round(pk[1]) : pk[1]) + 'B') + (per ? '/mo' : '') : '最大 ' + (pk[1] >= 1000 ? (pk[1] / 1000).toFixed(1) + '兆ドル' : Math.round(pk[1] * 10) + '億ドル') + (per ? '/月' : '')), Math.min(X(pk[0]) + 8, x1 - 90), top + 12, { s: 11, w: 700, c }); });
  const B1 = R0 + RH * hd.booms.length; for (let y = 2017; y <= 2026; y++) lt(g, String(y), X(y), B1 + 26, { s: 15, w: 500, c: '#9fb2cc', a: 'center', f: LN });
  g.strokeStyle = CY; g.lineWidth = 3; g.beginPath(); g.moveTo(68, 1161); g.lineTo(96, 1161); g.stroke(); lt(g, en ? 'Total market cap' : '市場全体の時価総額', 108, 1167, { s: 16, w: 500, c: '#cfd8e6' });
  hBubble(g, 370, 1161, 9, true); lt(g, en ? 'Hack · area = amount stolen' : 'ハッキング｜円の面積＝盗まれた額', 388, 1167, { s: 16, w: 500, c: '#cfd8e6' }); hBubble(g, 720, 1161, 9, false); lt(g, en ? 'Collapse · area = value lost' : '破綻・崩壊｜円の面積＝失われた額', 738, 1167, { s: 16, w: 500, c: '#cfd8e6' });
  g.strokeStyle = '#1c2a3d'; g.beginPath(); g.moveTo(64, 1202); g.lineTo(1376, 1202); g.stroke();
  lt(g, en ? 'DeFi, lending, algorithmic stablecoins, DEX: DefiLlama monthly data. Market cap, ICO, NFT, memecoins, CEX: key data points and estimates.' : 'DeFi・貸し出し・アルゴ型ステーブル・DEXは DefiLlama の月ごとの実データ。時価総額・ICO・NFT・ミーム・CEXは主な時点の数字と推定。', 70, 1238, { s: 15, w: 500, c: M });
  lt(g, en ? 'Shown side by side in time. This does not show cause. @csa_archive' : '同じ時期に起きたことを並べたもので、原因を示すものではありません。@csa_archive', 70, 1266, { s: 15, w: 500, c: M });
}
// v273: 直近1か月。mo = { from, to, btc, defi, lend, stable, dex:[[YYYY-MM-DD, v]], crises:[{n,d,b,k}] }
function drawHistM(g, mo, lg) {
  const en = lg === 'en', CY = '#2ee6ff', M = '#8ea2bf', WW = 1440, HH = 1100, x0 = 190, x1 = 1320, t0 = Date.parse(mo.from), t1 = Date.parse(mo.to), X = (d) => x0 + (Date.parse(d) - t0) / (t1 - t0) * (x1 - x0);
  g.fillStyle = '#070d16'; g.fillRect(0, 0, WW, HH); g.fillStyle = CY; g.fillRect(0, 0, WW, 5);
  lt(g, 'CSA　/　CRYPTO BOOMS & CRISES　/　30 DAYS', 68, 50, { s: 17, w: 600, c: M, f: LN });
  lt(g, en ? 'Crypto booms and crises: last 30 days' : '直近1か月のブームと危機', 70, 122, { s: 46, w: 900 }); lt(g, (mo.from + ' – ' + mo.to) + (en ? '　|　BTC × incidents × where the money is' : '　｜　BTC × 危機 × お金の動き'), 70, 168, { s: 20, w: 500, c: '#9fb2cc' });
  g.fillStyle = '#0e1826'; g.fillRect(64, 205, 1312, 760);
  const bt = mo.btc || [], lo = Math.min(...bt.map((q) => q[1])) * 0.97, hi = Math.max(...bt.map((q) => q[1])) * 1.02, A0 = 300, A1 = 560, Y = (v) => A1 - (v - lo) / (hi - lo) * (A1 - A0);
  lt(g, en ? 'BTC (daily close)' : 'BTC（日足の終値）', 90, 246, { s: 20, w: 800 });
  g.fillStyle = '#1a2418'; g.fillRect(1080, 228, 270, 40); hBubble(g, 1102, 248, 8, true); lt(g, en ? 'Hack · area = amount' : 'ハッキング｜面積＝被害額', 1118, 254, { s: 14, w: 500, c: '#e6f7c8' });
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, '$' + Math.round(v / 1000) + 'k', x0 - 12, Y(v) + 5, { s: 13, w: 500, c: M, a: 'right', f: LN }); }
  const pts = bt.map(([d, v]) => [X(d), Y(v)]); if (pts.length) { hPath(g, [...pts, [pts[pts.length - 1][0], A1], [pts[0][0], A1]]); g.fillStyle = 'rgba(46,230,255,.08)'; g.fill(); hPath(g, pts); g.strokeStyle = CY; g.lineWidth = 2.6; g.stroke(); }
  const at = (d) => { let q = bt[0]; for (const r of bt) if (r[0] <= d) q = r; return q ? q[1] : lo; }, MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const items = (mo.crises || []).map((c, i, arr) => ({ cx: X(c.d), cy: Y(at(c.d)), r: Math.min(5 + Math.sqrt((c.b || 0.003) * 1000) / 2.2, 46), hack: true, n: c.n, cur: i === arr.length - 1, date: en ? MN[+c.d.slice(5, 7) - 1] + ' ' + (+c.d.slice(8)) : (+c.d.slice(5, 7)) + '/' + (+c.d.slice(8)) }));
  items.forEach((it) => hBubble(g, it.cx, it.cy, it.r, true));
  if (items.length) hCards(g, items, x0, x1, 600, en); else lt(g, en ? 'No major incidents recorded in the last 30 days' : '直近1か月に、大きな危機の記録はありません', (x0 + x1) / 2, 630, { s: 18, w: 800, c: '#cfe0f2', a: 'center' });
  g.strokeStyle = '#1c2a3d'; g.beginPath(); g.moveTo(70, 690); g.lineTo(1360, 690); g.stroke();
  lt(g, en ? 'Where the money is' : 'お金の動き', 90, 720, { s: 20, w: 800 }); lt(g, en ? 'Daily, DefiLlama (each 30-day range)' : '日ごと・DefiLlama（それぞれ30日の範囲で）', 240, 720, { s: 14, w: 500, c: M });
  const L4 = [['defi', en ? 'DeFi TVL' : 'DeFiの預かり資産', HC.defi], ['lend', en ? 'Lending' : '貸し出し', HC.lend], ['stable', en ? 'Stablecoins' : 'ステーブル発行額', '#e8b97a'], ['dex', en ? 'DEX volume/day' : 'DEXの取引高/日', HC.dex]], RH = 52, R0 = 735;
  L4.forEach(([id, nm, c], k) => { const r = mo[id] || [], base = R0 + RH * (k + 1) - 6, top = R0 + RH * k + 8; if (!r.length) return; const vs = r.map((q) => q[1]), mn = Math.min(...vs), mx = Math.max(...vs), Yk = (v) => base - (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * (base - top);
    const p2 = r.map(([d, v]) => [X(d), Yk(v)]); g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, base); g.lineTo(x1, base); g.stroke(); hPath(g, p2); g.strokeStyle = c; g.lineWidth = 2; g.stroke();
    lt(g, nm, x0 - 10, base - 12, { s: 12, w: 800, c, a: 'right' }); const lv = vs[vs.length - 1], ch = vs[0] ? (lv / vs[0] - 1) * 100 : 0; lt(g, (lv >= 1000 ? '$' + (lv / 1000).toFixed(2) + 'T' : '$' + lv.toFixed(1) + 'B') + '  ' + (ch >= 0 ? '+' : '−') + Math.abs(ch).toFixed(1) + '%', x1 + 10, Yk(lv) + 5, { s: 12, w: 800, c, f: LN }); });
  for (let k = 0; k <= 4; k++) { const t = t0 + (t1 - t0) * k / 4, d = new Date(t); lt(g, en ? MN[d.getUTCMonth()] + ' ' + d.getUTCDate() : (d.getUTCMonth() + 1) + '/' + d.getUTCDate(), x0 + (x1 - x0) * k / 4, 965 - 8 + 30, { s: 14, w: 500, c: '#9fb2cc', a: 'center', f: LN }); }
  g.strokeStyle = '#1c2a3d'; g.beginPath(); g.moveTo(64, 1010); g.lineTo(1376, 1010); g.stroke();
  lt(g, en ? 'Incidents: DefiLlama hacks list (≥$1M) + CSA records. Shown side by side; this does not show cause.' : '危機：DefiLlama のハッキング一覧（100万ドル以上）＋CSAの記録。並べたもので、原因を示すものではありません。', 70, 1046, { s: 15, w: 500, c: M });
  lt(g, en ? 'BTC: Binance daily close · @csa_archive' : 'BTC：Binance 日足終値・@csa_archive', 70, 1074, { s: 15, w: 500, c: M });
}
// v278: 清算の新しい画像。見出し(合計)・ロング/ショートの割合の帯・上に BTC の価格・下に同じ時間軸で清算(上=買い/下=売り)・右に銘柄別
function drawLiq2(g, im, lg) {
  const en = lg === 'en', wave = im.kind === 'wave', RD = '#ff5c7a', GR = '#3ddc97', CY = '#2ee6ff', M = '#8ea2bf', co = im.coins || {};
  const usd = (v) => v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v >= 1e8 ? Math.round(v / 1e6) : (v / 1e6).toFixed(v >= 1e7 ? 0 : 1)) + 'M' : '$' + Math.round(v / 1e3) + 'K';
  const totL = Object.values(co).reduce((a, c) => a + (c.long || 0), 0), totS = Object.values(co).reduce((a, c) => a + (c.short || 0), 0), tot = totL + totS;
  const hrs = Math.max(1, Math.round((im.end - im.start) / 36e5)), ser = (wave ? im.ser : im.hours) || [], step = wave ? 3e5 : 36e5;
  g.fillStyle = '#070d16'; g.fillRect(0, 0, W, LH); g.fillStyle = RD; g.fillRect(0, 0, W, 5);
  lt(g, (en ? `CRYPTO LIQUIDATIONS / LAST ${hrs}H` : `CRYPTO LIQUIDATIONS / 直近${hrs}時間`), 40, 44, { s: 14, w: 700, c: M, f: LN });
  const ttl = en ? `${usd(tot)} force-closed in ${hrs}h` : `${hrs}時間で ${usd(tot)} が強制決済`; g.font = `900 40px ${LJ}`;
  if (en) lt(g, ttl, 40, 104, { s: 40, w: 900 }); else { let x = 40; x += lt(g, `${hrs}時間で `, x, 104, { s: 40, w: 900 }); x += lt(g, usd(tot), x, 104, { s: 40, w: 900, c: RD }); lt(g, ' が強制決済', x, 104, { s: 40, w: 900 }); }
  // 一文：清算の山の時間に、価格が下げていた/上げていたか(事実だけ)
  const px = im.px || [], at = (t) => { let v = null; for (const q of px) { if (q[0] <= t) v = q[1]; else break; } return v; };
  let pk = null; for (const q of ser) if (!pk || q[1] + q[2] > pk[1] + pk[2]) pk = q;
  let line = '';
  if (pk && px.length) { const a = at(pk[0] - 3 * step), b = at(pk[0] + step); if (a && b) { const ch = (b / a - 1) * 100, longSide = pk[1] >= pk[2];
    line = en ? (ch < 0 && longSide ? 'Longs were liquidated in a cluster as BTC fell' : ch > 0 && !longSide ? 'Shorts were liquidated in a cluster as BTC rose' : `Peak liquidations at ${usd(pk[1] + pk[2])} per ${wave ? '5 min' : 'hour'}`)
      : (ch < 0 && longSide ? 'BTCが下げたところで、買い（ロング）がまとめて清算された' : ch > 0 && !longSide ? 'BTCが上げたところで、売り（ショート）がまとめて清算された' : `清算がいちばん多かったのは ${wave ? '5分' : '1時間'}で ${usd(pk[1] + pk[2])}`); } }
  if (line) lt(g, line, 42, 140, { s: 19, w: 700, c: '#cfe0f2' });
  // ロング/ショートの帯
  const sh = tot ? totL / tot : 0.5, bx = 40, bw = 1120, by = 164; g.fillStyle = RD; g.beginPath(); g.roundRect(bx, by, Math.max(4, bw * sh), 34, 6); g.fill(); g.fillStyle = GR; g.beginPath(); g.roundRect(bx + bw * sh, by, Math.max(4, bw * (1 - sh)), 34, 6); g.fill();
  lt(g, (en ? 'Longs liquidated ' : '買い（ロング）の清算 ') + usd(totL) + '・' + Math.round(sh * 100) + '%', bx + 14, by + 23, { s: 17, w: 900, c: '#1a0a0e' });
  lt(g, (en ? 'Shorts ' : '売り（ショート） ') + usd(totS), bx + bw - 14, by + 23, { s: 17, w: 900, c: '#06221a', a: 'right' });
  // 上：BTC の価格
  const x0 = 110, x1 = 1040, X = (t) => x0 + (t - im.start) / Math.max(1, im.end - im.start) * (x1 - x0), pa = 250, pb = 440;
  const pv = px.filter((q) => q[0] >= im.start - step && q[0] <= im.end);
  lt(g, en ? 'BTC price' : 'BTCの価格', 40, 236, { s: 16, w: 800, c: CY });
  if (pv.length > 1) { const lo = Math.min(...pv.map((q) => q[1])) * 0.998, hi = Math.max(...pv.map((q) => q[1])) * 1.002, Y = (v) => pb - (v - lo) / (hi - lo) * (pb - pa);
    for (let k = 0; k <= 3; k++) { const v = lo + (hi - lo) * k / 3; g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, '$' + (v / 1000).toFixed(1) + 'k', x0 - 10, Y(v) + 5, { s: 13, w: 600, c: M, a: 'right', f: LN }); }
    if (pk) { g.fillStyle = 'rgba(255,92,122,.08)'; g.fillRect(X(pk[0] - 3 * step), pa, X(pk[0] + 2 * step) - X(pk[0] - 3 * step), 610 - pa); }
    g.strokeStyle = CY; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath(); pv.forEach((q, i) => i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1]))); g.stroke();
    const p0 = pv[0][1], p1 = pv[pv.length - 1][1], ch = (p1 / p0 - 1) * 100; lt(g, `BTC ${ch >= 0 ? '+' : '−'}${Math.abs(ch).toFixed(1)}%`, x1, pa + 16, { s: 16, w: 900, c: ch < 0 ? RD : GR, a: 'right' });
  } else lt(g, en ? 'BTC price unavailable' : 'BTCの価格は取得できませんでした', (x0 + x1) / 2, (pa + pb) / 2, { s: 15, w: 700, c: M, a: 'center' });
  // 下：清算
  const la = 470, mid = 590, lb = 640, mx = Math.max(1, ...ser.map((q) => Math.max(q[1], q[2])));
  lt(g, en ? `Liquidations (per ${wave ? '5 min' : 'hour'})` : `清算（${wave ? '5分' : '1時間'}ごと）`, 40, la - 8, { s: 16, w: 800, c: RD });
  lt(g, en ? 'up = longs · down = shorts' : '上＝買いの清算　下＝売りの清算', en ? 300 : 230, la - 8, { s: 13, w: 600, c: M });
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, mid); g.lineTo(x1, mid); g.stroke();
  const bw2 = Math.max(2, (x1 - x0) / Math.max(1, Math.round((im.end - im.start) / step)) * 0.75);
  for (const q of ser) { const x = X(q[0] + step / 2), hl = q[1] / mx * (mid - la), hs = q[2] / mx * (mid - la) * 0.45; g.fillStyle = RD; g.fillRect(x - bw2 / 2, mid - hl, bw2, hl); g.fillStyle = GR; g.fillRect(x - bw2 / 2, mid, bw2, Math.max(1, hs)); }
  if (pk) lt(g, (en ? 'max ' : '最大 ') + usd(pk[1] + pk[2]) + (en ? (wave ? '/5m' : '/h') : (wave ? '/5分' : '/時')), Math.min(Math.max(X(pk[0]), x0 + 60), x1 - 60), mid - pk[1] / mx * (mid - la) - 8, { s: 14, w: 900, a: 'center' });
  [0, 1 / 3, 2 / 3, 1].forEach((f, k) => { const h2 = Math.round(hrs * (1 - f)); lt(g, k === 3 ? (en ? 'now' : '今') : (en ? `−${h2}h` : `−${h2}時間`), x0 + (x1 - x0) * f, lb + 4, { s: 13, w: 700, c: '#cfe0f2', a: 'center' }); });
  // 右：銘柄別
  const cs = Object.entries(co).map(([c, v]) => [c, (v.long || 0) + (v.short || 0)]).sort((a, b) => b[1] - a[1]), cmx = Math.max(1, ...cs.map((q) => q[1]));
  lt(g, en ? 'By coin' : '銘柄別', 1060, 236, { s: 15, w: 800 });
  cs.slice(0, 4).forEach(([c, v], i) => { const y = 252 + i * 50; lt(g, c, 1060, y + 14, { s: 15, w: 800, c: '#e8f0fb', f: LN }); lt(g, usd(v), 1168, y + 14, { s: 13, w: 700, c: M, a: 'right', f: LN }); g.fillStyle = RD; g.beginPath(); g.roundRect(1060, y + 22, Math.max(3, 108 * v / cmx), 8, 3); g.fill(); });
  g.strokeStyle = '#1c2a3d'; g.beginPath(); g.moveTo(36, 680); g.lineTo(W - 36, 680); g.stroke();
  lt(g, en ? 'Liquidation = a position force-closed by the exchange when margin runs out' : '清算＝証拠金が足りなくなったポジションが、取引所に強制的に決済されること', 40, 716, { s: 17, w: 900 });
  lt(g, (wave && !im.hrs ? (en ? 'Bybit + OKX live streams' : 'Bybit・OKX のライブ受信の合算') : (en ? 'Binance+Bybit+OKX+Huobi' : 'Binance・Bybit・OKX・Huobi合算')) + (en ? ' (not the whole market) · USD · BTC: Binance · @csa_archive' : '（全市場ではありません）・USD・BTC：Binance・@csa_archive'), 40, 744, { s: 13, w: 600, c: M });
}
// v279: 「反発」の歴史。r = { s, med:[169], ev:[{drop,p:[85 (2時間ごと)]}], last:{drop,p,ja,en}, src }
function drawReb(g, r, lg) {
  const en = lg === 'en', CY = '#2ee6ff', GD = '#ffc94d', M = '#8ea2bf', s = r.s, sg = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  g.fillStyle = '#070d16'; g.fillRect(0, 0, W, LH); g.fillStyle = CY; g.fillRect(0, 0, W, 5);
  g.fillStyle = M; g.beginPath(); g.arc(46, 42, 6, 0, 7); g.fill(); g.font = `600 14px ${LN}`; g.letterSpacing = '2px'; g.fillStyle = M; g.fillText('BTC / AFTER A 5% DROP IN 1H / 7 DAYS', 62, 47); g.letterSpacing = '0px';
  lt(g, en ? 'A history of rebounds' : '「反発」の歴史', 40, 106, { s: 40, w: 900 });
  lt(g, en ? `BTC after falling 5%+ within one hour · ${s.n} times since ${s.y0}` : `BTCが1時間で5%以上下げた後の7日間 ・ ${s.y0}年以降 ${s.n}回`, 42, 142, { s: 20, w: 800, c: CY });
  g.strokeStyle = '#1c2a3d'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 166); g.lineTo(W - 36, 166); g.stroke();
  const x0 = 96, x1 = 840, y0 = 200, y1 = 600, all = r.ev.flatMap((e) => e.p).filter((v) => v != null).sort((a, b) => a - b);
  const q = (f) => all[Math.floor(f * (all.length - 1))] || 0, top = Math.max(10, Math.ceil(q(0.97) / 5) * 5), bot = Math.min(-10, Math.floor(q(0.03) / 5) * 5);
  const X = (i) => x0 + i / 84 * (x1 - x0), Y = (v) => y0 + (top - Math.min(top, Math.max(bot, v))) / (top - bot) * (y1 - y0);
  for (let v = bot; v <= top; v += 5) { g.strokeStyle = v ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.3)'; g.setLineDash(v ? [] : [4, 4]); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + v + '%', x0 - 12, Y(v) + 5, { s: 13, w: 600, c: '#cfd8e6', a: 'right', f: LN }); }
  [0, 1, 2, 3, 4, 5, 6, 7].forEach((d) => lt(g, d ? (en ? d + 'd' : d + '日後') : (en ? 'Drop hour' : '下げた時'), X(d * 12), y1 + 28, { s: 13, w: 600, c: M, a: 'center' }));
  const line = (a, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); let on = false; a.forEach((v, i) => { if (v == null) { on = false; return; } on ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); on = true; }); g.stroke(); };
  g.save(); g.beginPath(); g.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4); g.clip();
  r.ev.forEach((e) => line(e.p, 'rgba(157,179,209,.22)', 1.2));
  line(r.med.filter((_, h) => h % 2 === 0), CY, 4); if (r.last.p.some((v) => v != null)) line(r.last.p, GD, 3); g.restore();
  const mi = r.med.filter((_, h) => h % 2 === 0), mv = mi[84]; if (mv != null) lt(g, (en ? 'Median ' : '中央値 ') + sg(mv), x1 + 8, Y(mv) + 5, { s: 14, w: 800, c: CY });
  let li = -1; r.last.p.forEach((v, i) => { if (v != null) li = i; }); if (li >= 0) { const v = r.last.p[li]; g.fillStyle = GD; g.beginPath(); g.arc(X(li), Y(v), 6, 0, 7); g.fill(); lt(g, (en ? r.last.en : r.last.ja) + ' ' + r.last.drop + '%', Math.min(X(li) + 10, x1 - 150), Y(v) + (v > 0 ? -12 : 24), { s: 14, w: 800, c: GD }); }
  g.strokeStyle = 'rgba(157,179,209,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(100, 642); g.lineTo(124, 642); g.stroke(); lt(g, en ? 'each case' : '各回', 132, 648, { s: 14, w: 600, c: M });
  g.strokeStyle = CY; g.lineWidth = 4; g.beginPath(); g.moveTo(206, 642); g.lineTo(230, 642); g.stroke(); lt(g, en ? 'median' : '中央値', 238, 648, { s: 14, w: 700, c: CY });
  g.strokeStyle = GD; g.lineWidth = 3; g.beginPath(); g.moveTo(320, 642); g.lineTo(344, 642); g.stroke(); lt(g, en ? 'latest case' : '直近の回', 352, 648, { s: 14, w: 700, c: GD });
  const bx = 930, card = (y, lab, big, sub, col) => { g.fillStyle = '#0d1b2c'; g.fillRect(bx, y, 236, 96); g.fillStyle = col; g.fillRect(bx, y, 3, 96); lt(g, lab, bx + 16, y + 26, { s: 14, w: 700, c: '#cfe0f2' }); lt(g, big, bx + 16, y + 68, { s: 34, w: 800, c: col, f: LN }); if (sub) lt(g, sub, bx + 220, y + 68, { s: 14, w: 600, c: M, a: 'right' }); };
  card(196, en ? 'Higher after 24h' : '24時間後に上', `${s.u24}/${s.n24}`, (en ? 'med ' : '中央値 ') + sg(s.m24), CY);
  card(306, en ? 'Higher after 7 days' : '7日後に上', `${s.u7}/${s.n7}`, (en ? 'med ' : '中央値 ') + sg(s.m7), CY);
  card(416, en ? 'Back to pre-drop price ≤7d' : '7日以内に下げる前の値へ', `${s.rec}/${s.n}`, s.recH != null ? (en ? 'med ' + s.recH + 'h' : '中央値 ' + s.recH + '時間') : '', '#6ff0b4');
  card(526, en ? 'Largest 1h drop' : '最大の1時間の下げ', s.worst.toFixed(1) + '%', '', '#ff8a9b');
  g.strokeStyle = '#1c2a3d'; g.beginPath(); g.moveTo(36, 690); g.lineTo(W - 36, 690); g.stroke();
  lt(g, en ? '“Higher” = above the close of the drop hour (= 0%). Drop = 1h candle open→close ≤ −5%; repeats within 24h counted once.' : '「上」＝下げた1時間の終値（＝0%）より上。下げ＝1時間足の始値→終値が−5%以下。24時間以内の続きは1回と数える。', 40, 722, { s: 13, w: 600, c: M });
  lt(g, en ? 'Lines beyond the chart range are cut at the edge.' : '図の範囲を超えた線は端で切っています。', 40, 750, { s: 13, w: 600, c: M });
  lt(g, en ? 'Past record. This time may differ.' : '過去の記録で、今回も同じとは限りません', W - 36, 750, { s: 14, w: 800, c: '#ff9a9a', a: 'right' });
  lt(g, (r.src || 'Binance BTCUSDT') + (en ? ' 1h · @csa_archive' : ' 1時間足・@csa_archive'), W - 36, 778, { s: 12, w: 600, c: M, a: 'right' });
}
// v279: 今日と同じ形。左＝直近24時間(今回は金・太線)と似た過去の窓、右＝過去の窓のその後72時間
function drawSame(g, d, lg) {
  const en = lg === 'en', GD = '#ffc94d', M = '#8ea2bf', CY = '#2ee6ff', COL = ['#2ee6ff', '#ff8c1a', '#19d3a2', '#8f84ff', '#ff5c7a'], sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  g.fillStyle = '#070d16'; g.fillRect(0, 0, W, LH); g.fillStyle = CY; g.fillRect(0, 0, W, 5);
  g.fillStyle = M; g.beginPath(); g.arc(46, 42, 6, 0, 7); g.fill(); g.font = `600 14px ${LN}`; g.letterSpacing = '2px'; g.fillStyle = M; g.fillText('BTC / SAME SHAPE / LAST 24H → NEXT 72H', 62, 47); g.letterSpacing = '0px';
  lt(g, en ? 'Past days shaped like today' : '今日と同じ形をした過去の日', 40, 106, { s: 38, w: 900 });
  const $ = (v) => '$' + Math.round(v).toLocaleString('en-US');
  lt(g, (en ? 'Last 24h: ' : '直近24時間 ') + `${$(d.hi)} → ${$(d.lo)} → ${$(d.now)}`, 42, 142, { s: 20, w: 800, c: GD });
  g.strokeStyle = '#1c2a3d'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 166); g.lineTo(W - 36, 166); g.stroke();
  const x0 = 96, xm = 380, x1 = 840, y0 = 200, y1 = 600, all = [...d.cur, ...d.m.flatMap((x) => [...x.pre, ...x.post])];
  const top = Math.ceil(Math.max(5, ...all) / 5) * 5, bot = Math.floor(Math.min(-5, ...all) / 5) * 5, Y = (v) => y0 + (top - v) / (top - bot) * (y1 - y0);
  const XL = (j) => x0 + j / 23 * (xm - x0), XR = (h) => xm + h / 72 * (x1 - xm);
  for (let v = bot; v <= top; v += 5) { g.strokeStyle = v ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, (v > 0 ? '+' : '') + v + '%', x0 - 12, Y(v) + 5, { s: 13, w: 600, c: '#cfd8e6', a: 'right', f: LN }); }
  g.fillStyle = 'rgba(255,201,77,.05)'; g.fillRect(x0, y0, xm - x0, y1 - y0); g.setLineDash([4, 4]); g.strokeStyle = M; g.beginPath(); g.moveTo(xm, y0); g.lineTo(xm, y1); g.stroke(); g.setLineDash([]);
  lt(g, en ? 'Last 24h' : '直近24時間', (x0 + xm) / 2, y1 + 28, { s: 13, w: 700, c: GD, a: 'center' }); lt(g, en ? 'Now' : 'いま', xm, y1 + 28, { s: 13, w: 700, c: '#e8f0fb', a: 'center' });
  [24, 48, 72].forEach((h) => lt(g, en ? '+' + h + 'h' : h + '時間後', XR(h), y1 + 28, { s: 13, w: 600, c: M, a: 'center' }));
  lt(g, en ? 'what came next (past cases)' : 'その後（過去の回）', (xm + x1) / 2, y0 - 10, { s: 13, w: 700, c: M, a: 'center' });
  const line = (a, X, col, w, off = 0) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); a.forEach((v, i) => i ? g.lineTo(X(i), Y(v + off)) : g.moveTo(X(i), Y(v + off))); g.stroke(); };
  d.m.forEach((x, i) => { g.globalAlpha = i < 3 ? .85 : .4; line(x.pre, XL, COL[i], 1.6); line(x.post, XR, COL[i], i < 3 ? 2.4 : 1.4, x.pre[23]); g.globalAlpha = 1; if (i < 3) lt(g, '①②③'[i], XR(72) + 8, Y(x.post[72] + x.pre[23]) + 5, { s: 15, w: 800, c: COL[i] }); });
  line(d.cur, XL, GD, 4.5); g.fillStyle = GD; g.beginPath(); g.arc(xm, Y(d.cur[23]), 7, 0, 7); g.fill();
  d.m.slice(0, 3).forEach((x, i) => { const y = 196 + i * 132, bx = 900; g.fillStyle = '#0d1b2c'; g.fillRect(bx, y, 266, 118); g.fillStyle = COL[i]; g.fillRect(bx, y, 3, 118);
    lt(g, '①②③'[i] + ' ' + (en ? d.le[i] : d.lj[i]), bx + 16, y + 28, { s: 17, w: 800, c: COL[i] }); lt(g, (en ? 'match ' : '一致率 ') + x.r + '%', bx + 250, y + 28, { s: 13, w: 600, c: M, a: 'right' });
    lt(g, en ? 'next 24h' : '24時間後', bx + 16, y + 60, { s: 13, w: 600, c: '#cfe0f2' }); lt(g, sg(x.a24), bx + 16, y + 98, { s: 28, w: 800, c: x.a24 >= 0 ? '#6ff0b4' : '#ff8a9b', f: LN });
    lt(g, en ? 'next 72h' : '72時間後', bx + 140, y + 60, { s: 13, w: 600, c: '#cfe0f2' }); lt(g, sg(x.a72), bx + 140, y + 98, { s: 28, w: 800, c: x.a72 >= 0 ? '#6ff0b4' : '#ff8a9b', f: LN }); });
  g.strokeStyle = '#1c2a3d'; g.beginPath(); g.moveTo(36, 690); g.lineTo(W - 36, 690); g.stroke();
  lt(g, en ? 'Shape = 1h closes, start of window = 0%. Picked by smallest gap to today (7+ days apart). Right side: change from the window end.' : '形＝1時間足の終値（窓の始まり＝0%）。今日との差が小さい順に選び、7日以上離す。右側は窓の終わりからの変化。', 40, 722, { s: 13, w: 600, c: M });
  lt(g, en ? 'Match % = correlation of the two 24h shapes. Not a probability.' : '一致率＝24時間の形の相関。確率ではありません。', 40, 750, { s: 13, w: 600, c: M });
  lt(g, en ? 'Past record. This time may differ.' : '過去の記録で、今回も同じとは限りません', W - 36, 750, { s: 14, w: 800, c: '#ff9a9a', a: 'right' });
  lt(g, en ? 'Binance BTCUSDT 1h · @csa_archive' : 'Binance BTCUSDT 1時間足・@csa_archive', W - 36, 778, { s: 12, w: 600, c: M, a: 'right' });
}
// v284: 下落のその後。ニュース番組の画面のような特別版。言いたいことは1つ＝「この下げ方に最も近い過去は◯◯。その後こう動いた」
//   巨大な数字・光る線・光の筋で、いつもの平らな紺の画像に埋もれないようにする。31回の集計は下に「参考」で1行
function drawDrop(g, d, lg) {
  const NF = '"Inter","Noto Sans JP","Noto Sans CJK JP",sans-serif', JF = '"Noto Sans JP","Noto Sans CJK JP",sans-serif';   // 数字＝Inter(主役の数字だけ細字)、日本語＝Noto Sans JP
  const lt = (g2, t, x, y, o = {}) => ltBase(g2, t, x, y, { ...o, f: o.f || JF });
  const en = lg === 'en', GD = '#ffd24a', BL = '#4fb4ff', OR = '#ff8a5c', IC = '#8fe3f2', UP = '#5dffc4', DN = '#ff6b81', s = d.s, A = d.A, D = d.D, nr = d.near, sg = (v, k = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(k) + '%', $ = (v) => '$' + Math.round(v).toLocaleString('en-US');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, LH);
  let sd = 5; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let i = 0; i < 22; i++) { const x = rnd() * W, y = rnd() * LH, r = 10 + rnd() * 44, warm = rnd() < .35, a = .05 + rnd() * .09, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, warm ? `rgba(255,170,60,${a})` : `rgba(50,120,255,${a})`); gr.addColorStop(.9, warm ? `rgba(255,170,60,${a * .9})` : `rgba(50,120,255,${a * .9})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const sp = g.createRadialGradient(300, 210, 0, 300, 210, 360); sp.addColorStop(0, 'rgba(255,90,110,.08)'); sp.addColorStop(1, 'rgba(255,90,110,0)'); g.fillStyle = sp; g.fillRect(0, 0, W, LH);
  const glass = (x, y, w, h, r, tint, edge = .65) => { g.save(); g.beginPath(); g.roundRect(x, y, w, h, r); g.clip(); const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, tint || 'rgba(150,180,230,.025)'); gr.addColorStop(1, 'rgba(40,60,90,0)'); g.fillStyle = 'rgba(0,0,0,.94)'; g.fillRect(x, y, w, h); g.fillStyle = gr; g.fillRect(x, y, w, h);
    const st = g.createLinearGradient(x, y, x + w * .6, y + h); st.addColorStop(0, 'rgba(255,255,255,0)'); st.addColorStop(.5, 'rgba(255,255,255,0)'); st.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = st; g.fillRect(x, y, w, h); g.restore();
    const eg = g.createLinearGradient(x, y, x + w, y + h); eg.addColorStop(0, `rgba(255,255,255,${edge * .7})`); eg.addColorStop(.5, 'rgba(255,255,255,.1)'); eg.addColorStop(1, `rgba(255,255,255,${edge * .7})`); g.strokeStyle = eg; g.lineWidth = 2; g.beginPath(); g.roundRect(x, y, w, h, r); g.stroke(); };
  const glow = (col, b, fn) => { g.save(); g.shadowColor = col; g.shadowBlur = Math.min(6, b * .3); fn(); g.restore(); g.save(); g.globalAlpha = .18; g.shadowColor = col; g.shadowBlur = b * .7; fn(); g.restore(); };   // 光は2層: 細く強い芯＋薄い外側(ぼやけないように)
  glass(28, 22, W - 56, 656, 20);
  // 板の縁を青く光らせる(ネオンの線)。上の辺と左右の上側を強く、下に向かって弱く
  const neon = (x, y, w, h, r, k = 1) => { const NC = d.nc || (d.cur >= 0 ? ['#2bff9e', '#00b86b', '#00e08a', '#d4ffe9'] : ['#ff3b5c', '#c4002b', '#ff1f45', '#ffd0d8']),   // 縁の色: プラス＝緑、マイナス＝赤
    ng = g.createLinearGradient(x, y, x + w, y + h); ng.addColorStop(0, NC[0]); ng.addColorStop(.5, NC[1]); ng.addColorStop(1, NC[0]);
    for (const [bl, al, lw] of [[30, .45 * k, 7], [12, .85 * k, 3.5], [0, .9, 1.4]]) { g.save(); g.shadowColor = NC[2]; g.shadowBlur = bl; g.globalAlpha = al; g.strokeStyle = bl ? ng : NC[3]; g.lineWidth = lw; g.beginPath(); g.roundRect(x, y, w, h, r); g.stroke(); g.restore(); } };
  // 鏡面: 上半分に鋭い境目の照り返し＋上辺の内側に細い光
  const gloss = (x, y, w, h, r, k = 1) => { g.save(); g.beginPath(); g.roundRect(x, y, w, h, r); g.clip();
    const gh = h * .42, gl = g.createLinearGradient(0, y, 0, y + gh); gl.addColorStop(0, `rgba(200,215,255,${.22 * k})`); gl.addColorStop(.6, `rgba(200,215,255,${.07 * k})`); gl.addColorStop(1, `rgba(200,215,255,${.03 * k})`);
    g.fillStyle = gl; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + gh * .78); g.quadraticCurveTo(x + w / 2, y + gh * 1.12, x, y + gh * .78); g.closePath(); g.fill();
    const sl = g.createLinearGradient(x, 0, x + w, 0); sl.addColorStop(0, 'rgba(255,255,255,0)'); sl.addColorStop(.25, `rgba(255,255,255,${.55 * k})`); sl.addColorStop(.75, `rgba(255,255,255,${.55 * k})`); sl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sl; g.fillRect(x + r, y + 2, w - 2 * r, 1.5);
    const bt = g.createLinearGradient(0, y + h - 40, 0, y + h); bt.addColorStop(0, 'rgba(40,90,255,0)'); bt.addColorStop(1, `rgba(40,90,255,${.12 * k})`); g.fillStyle = bt; g.fillRect(x, y + h - 40, w, 40); g.restore(); };
  neon(28, 22, W - 56, 656, 20);
  // 要点の帯(1行で中身が分かる)
  glass(48, 36, W - 96, 66, 14, 'rgba(255,255,255,.03)', .35);
  const hl = en ? [['Key: ', '#fff'], [`BTC ${sg(d.cur)} in ${D} days`, GD], [` · closest past drop `, '#fff'], [d.ne, GD]] : [['要点：', '#fff'], [`BTC ${D}日で${sg(d.cur)}`, GD], ['　最も近い過去は', '#fff'], [d.nj, GD]];
  g.font = `900 34px ${JF}`; let tw0 = 0; hl.forEach(([t]) => tw0 += g.measureText(t).width); let hx0 = W / 2 - tw0 / 2; hl.forEach(([t, c]) => { lt(g, t, hx0, 81, { s: 34, w: 900, c }); g.font = `900 34px ${JF}`; hx0 += g.measureText(t).width; });
  // 巨大な数字(細め・光る)と、金額の1行
  glow('rgba(120,200,255,.9)', 16, () => lt(g, sg(d.cur), 44, 258, { s: 150, w: 500, c: '#fff', f: NF }));
  g.font = `500 150px ${NF}`; const nw = g.measureText(sg(d.cur)).width, qx = Math.max(560, 52 + nw + 56);
  lt(g, (en ? `${D}d ago ` : `${D}日前 `) + $(d.px[0]) + '  →  ' + (en ? 'now ' : '今 ') + $(d.px[1]) + `  (${d.px[1] >= d.px[0] ? '+' : '−'}${$(Math.abs(d.px[1] - d.px[0]))})`, 58, 288, { s: 17, w: 700, c: 'rgba(255,255,255,.78)' });
  const vg = g.createLinearGradient(0, 150, 0, 290); vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(.5, 'rgba(255,255,255,.4)'); vg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = vg; g.fillRect(qx - 28, 150, 2, 140);
  lt(g, en ? `The ${d.ne} case, afterwards` : `${d.nj}の回の、その後`, qx, 172, { s: 22, w: 900, c: GD });
  const big = (lab, v, x) => { lt(g, lab, x, 208, { s: 18, w: 800, c: '#d5ecf7' }); const col = v >= 0 ? UP : DN; glow(col, 14, () => lt(g, sg(v), x, 262, { s: 60, w: 700, c: col, f: NF })); g.font = `700 60px ${NF}`; return x + g.measureText(sg(v)).width + 56; };
  const bx2 = big(en ? '30 days later' : '30日後', nr.a30, qx); big(en ? '60 days later' : '60日後', nr.a60, bx2);
  const x0 = 60, xm = 450, x1 = 1140, y0 = 330, y1 = 640, vals = [...d.cpre, ...nr.pre, ...nr.post, ...d.band.q1, ...d.band.q3], top = Math.max(...vals) + 4, bot = Math.min(...vals) - 6;
  const XL = (j) => x0 + j / D * (xm - x0), XR = (i) => xm + i / A * (x1 - xm), Y = (v) => y0 + (top - v) / (top - bot) * (y1 - y0), b = d.band;
  g.strokeStyle = 'rgba(120,170,255,.05)'; g.lineWidth = 1; for (let x = x0; x <= x1 + 1; x += (x1 - x0) / 16) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); } for (let y = y0; y <= y1 + 1; y += (y1 - y0) / 6) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.5; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(x0, Y(0)); g.lineTo(x1, Y(0)); g.stroke(); g.setLineDash([]);
  const path = (a, X) => { g.beginPath(); a.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); };
  // 帯 = 過去の回の半分が入る範囲(25〜75%)。光る縁つき。真ん中の細い線 = 中央値
  const bg2 = g.createLinearGradient(xm, 0, x1, 0); bg2.addColorStop(0, 'rgba(140,200,255,.38)'); bg2.addColorStop(1, 'rgba(140,200,255,.2)'); g.fillStyle = bg2; g.beginPath(); b.q3.forEach((v, i) => i ? g.lineTo(XR(i), Y(v)) : g.moveTo(XR(i), Y(v))); for (let i = A; i >= 0; i--) g.lineTo(XR(i), Y(b.q1[i])); g.closePath(); g.fill();
  glow('rgba(140,200,255,.9)', 8, () => { g.strokeStyle = 'rgba(190,225,255,.85)'; g.lineWidth = 2; path(b.q3, XR); g.stroke(); path(b.q1, XR); g.stroke(); });
  g.strokeStyle = 'rgba(230,240,255,.7)'; g.lineWidth = 2; g.setLineDash([2, 5]); path(b.md, XR); g.stroke(); g.setLineDash([]);
  g.strokeStyle = 'rgba(255,210,74,.55)'; g.lineWidth = 3; g.setLineDash([7, 6]); path(nr.pre, XL); g.stroke(); g.setLineDash([]);
  glow('rgba(255,210,74,1)', 16, () => { g.strokeStyle = GD; g.lineWidth = 6; g.lineJoin = 'round'; g.setLineDash([16, 9]); path(nr.post, XR); g.stroke(); g.setLineDash([]); }); g.strokeStyle = 'rgba(255,248,220,.85)'; g.lineWidth = 1.6; g.setLineDash([16, 9]); path(nr.post, XR); g.stroke(); g.setLineDash([]);
  glow('rgba(79,180,255,1)', 20, () => { g.strokeStyle = BL; g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round'; path(d.cpre, XL); g.stroke(); }); g.strokeStyle = 'rgba(225,245,255,.9)'; g.lineWidth = 2; path(d.cpre, XL); g.stroke();
  const rg = g.createRadialGradient(xm, Y(0), 10, xm, Y(0), 40); rg.addColorStop(0, 'rgba(255,138,92,.75)'); rg.addColorStop(1, 'rgba(255,138,92,0)'); g.fillStyle = rg; g.fillRect(xm - 40, Y(0) - 40, 80, 80);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(xm, Y(0), 15, 0, 7); g.fill(); g.strokeStyle = OR; g.lineWidth = 7; g.stroke();
  const pill = (t, x, y, col, a, fs = 18, tc = '#fff') => { g.font = `900 ${fs}px ${JF}`; const w = g.measureText(t).width + 24, lx = a === 'center' ? x - w / 2 : a === 'right' ? x - w : x; g.fillStyle = 'rgba(4,8,16,.88)'; g.beginPath(); g.roundRect(lx, y - fs - 7, w, fs + 18, 9); g.fill(); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); lt(g, t, lx + 12, y + 2, { s: fs, w: 900, c: tc }); };
  pill((en ? 'TODAY ' : '今日 ') + $(d.px[1]), xm, Y(0) + 60, OR, 'center', 22);
  [30, A].forEach((v) => { const y = Y(nr.post[v]), col = nr.post[v] >= 0 ? UP : DN; glow(GD, 16, () => { g.fillStyle = GD; g.beginPath(); g.arc(XR(v), y, 10, 0, 7); g.fill(); }); g.strokeStyle = '#02050b'; g.lineWidth = 3; g.beginPath(); g.arc(XR(v), y, 10, 0, 7); g.stroke();
    lt(g, en ? `+${v}d` : `${v}日後`, v === A ? x1 - 4 : XR(v), y + (nr.post[v] >= nr.post[v === A ? 30 : A] ? -20 : 36), { s: 18, w: 900, c: GD, a: v === A ? 'right' : 'center' }); });
  lt(g, en ? `THIS TIME` : `今回`, x0 + 4, y1 - 14, { s: 19, w: 900, c: BL });
  let lx = xm + 40; const leg = (draw, t, col) => { draw(lx, y0 + 18); lt(g, t, lx + 38, y0 + 24, { s: 18, w: 900, c: col }); g.font = `900 18px ${JF}`; lx += 38 + g.measureText(t).width + 34; };
  leg((x, y) => { g.strokeStyle = GD; g.lineWidth = 5; g.setLineDash([10, 6]); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 28, y); g.stroke(); g.setLineDash([]); }, en ? `${d.ne} case` : `${d.nj}の回`, GD);
  leg((x, y) => { g.fillStyle = 'rgba(140,200,255,.45)'; g.fillRect(x, y - 9, 28, 18); g.strokeStyle = 'rgba(190,225,255,.9)'; g.lineWidth = 1.5; g.strokeRect(x, y - 9, 28, 18); }, en ? `range of half of all ${d.n} past cases` : `過去${d.n}回の半分が入る幅`, '#cfe6ff');
  glass(28, 690, W - 56, 52, 12, 'rgba(120,190,230,.03)', .4);
  neon(28, 690, W - 56, 52, 12, .6);
  lt(g, en ? `For reference: ${s.up30} of ${d.n} past ${d.th}%+ drops in ${D} days were higher 30 days later · median further drop ${sg(s.ddMed)}` : `参考：${D}日で${d.th}%以上下げた過去${d.n}回のうち、30日後に上は${s.up30}回 ・ さらに下げた幅の中央値 ${sg(s.ddMed)}`, W / 2, 723, { s: en ? 17 : 19, w: 800, c: '#e8f4fb', a: 'center' });
  lt(g, en ? `Closest = smallest gap in the ${D}-day shape among past ${d.th}%+ drops. Dashes on the left = that case's prior ${D} days. Not a forecast.` : `最も近い＝${D}日で${d.th}%以上下げた過去の回で、形の差が最小。左の細い点線＝その回の直前${D}日。予想ではありません。`, 36, 772, { s: 13, w: 700, c: 'rgba(255,255,255,.7)' });
  lt(g, en ? 'Past record. This time may differ.' : '過去の記録で、今回も同じとは限りません', W - 36, 772, { s: 14, w: 900, c: '#ffb3bd', a: 'right' });
  lt(g, (en ? 'Binance BTCUSDT 1d · ' : 'Binance 日足・') + '@csa_archive', W - 36, 792, { s: 11, w: 800, c: IC, a: 'right' });
  // 鏡面: 画像全体を1枚の磨いたガラス板に見せる(斜めの照り返し2本＋上からの照り)
  if (d.mirror) {   // 鏡面はやめた(黒を黒く保つため)。残すのは試し用
    g.save(); g.globalCompositeOperation = 'screen';
    const tg = g.createLinearGradient(0, 0, 0, LH * .5); tg.addColorStop(0, 'rgba(180,200,255,.07)'); tg.addColorStop(1, 'rgba(180,200,255,0)'); g.fillStyle = tg; g.fillRect(0, 0, W, LH * .5);
    const band = (x, w, a) => { const bg = g.createLinearGradient(x, 0, x + w, 0); bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(.5, `rgba(255,255,255,${a})`); bg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = bg; g.beginPath(); g.moveTo(x + 260, 0); g.lineTo(x + 260 + w, 0); g.lineTo(x + w - 120, LH); g.lineTo(x - 120, LH); g.closePath(); g.fill(); };
    band(520, 150, .07); band(700, 40, .06); g.restore(); }
}
// v285: 今回と、形が最も近い過去の回を上下2段に。それぞれの時期の出来事(FOMC・米CPI・大きな流出/破綻)を同じ横軸に印で付ける
//   見た目は drawDrop と同じ(黒・縁の光はマイナス赤/プラス緑・数字 Inter・日本語 Noto Sans JP)。原因とは書かない
function drawDropCmp(g, d, lg) {
  const NF = '"Inter","Noto Sans JP","Noto Sans CJK JP",sans-serif', JF = '"Noto Sans JP","Noto Sans CJK JP",sans-serif', lt = (g2, t, x, y, o = {}) => ltBase(g2, t, x, y, { ...o, f: o.f || JF });
  const en = lg === 'en', GD = '#ffd24a', BL = '#4fb4ff', D = d.D, A = d.A, sg = (v, k = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(k) + '%', $ = (v) => '$' + Math.round(v).toLocaleString('en-US');
  const EC = { fomc: '#b49cff', cpi: '#ff9d6e', hack: '#ff5c72', fail: '#ff5c72' };
  g.fillStyle = '#000'; g.fillRect(0, 0, W, LH);
  const NC = d.curPct >= 0 ? ['#2bff9e', '#00b86b', '#00e08a', '#d4ffe9'] : ['#ff3b5c', '#c4002b', '#ff1f45', '#ffd0d8'];
  const neon = (x, y, w, h, r, k = 1) => { const ng = g.createLinearGradient(x, y, x + w, y + h); ng.addColorStop(0, NC[0]); ng.addColorStop(.5, NC[1]); ng.addColorStop(1, NC[0]);
    for (const [bl, al, lw] of [[30, .45 * k, 7], [12, .85 * k, 3.5], [0, .9, 1.4]]) { g.save(); g.shadowColor = NC[2]; g.shadowBlur = bl; g.globalAlpha = al; g.strokeStyle = bl ? ng : NC[3]; g.lineWidth = lw; g.beginPath(); g.roundRect(x, y, w, h, r); g.stroke(); g.restore(); } };
  const box = (x, y, w, h, r, a = .35) => { g.fillStyle = 'rgba(0,0,0,.94)'; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 1.5; g.stroke(); };
  const glow = (col, b, fn) => { g.save(); g.shadowColor = col; g.shadowBlur = Math.min(6, b * .3); fn(); g.restore(); g.save(); g.globalAlpha = .18; g.shadowColor = col; g.shadowBlur = b * .7; fn(); g.restore(); };
  box(28, 22, W - 56, 712, 20, .15); neon(28, 22, W - 56, 712, 20);
  box(48, 36, W - 96, 66, 14);
  const hl = en ? [['This drop vs the closest past shape: ', '#fff'], [d.pe, GD]] : [['今回の下げと、形が最も近い過去　', '#fff'], [d.pj, GD]];
  g.font = `900 32px ${JF}`; let tw0 = 0; hl.forEach(([t]) => tw0 += g.measureText(t).width); let hx0 = W / 2 - tw0 / 2; hl.forEach(([t, c]) => { lt(g, t, hx0, 80, { s: 32, w: 900, c, f: /^\d/.test(t) ? NF : JF }); g.font = `900 32px ${/^\d/.test(t) ? NF : JF}`; hx0 += g.measureText(t).width; });
  const x0 = 200, xm = x0 + (1100 - x0) * D / (D + A), x1 = 1140, X = (o) => x0 + (o + D) / (D + A) * (x1 - x0);
  const all = [...d.cur, ...d.past.filter((v) => v != null)], top = Math.max(...all) + 4, bot = Math.min(...all) - 4;
  const panel = (y0, y1, arr, col, title, sub, pct, ev, isNow, px) => {
    const Y = (v) => y0 + (top - v) / (top - bot) * (y1 - y0);
    lt(g, title, 56, y0 + 30, { s: 26, w: 900, c: col }); lt(g, sub, 56, y0 + 58, { s: 15, w: 700, c: 'rgba(255,255,255,.7)', f: /^\d/.test(sub) ? NF : JF });
    glow(col, 14, () => lt(g, sg(pct), 52, y0 + 112, { s: 46, w: 700, c: '#fff', f: NF })); lt(g, en ? `in ${D} days` : `${D}日で`, 56, y0 + 140, { s: 15, w: 700, c: 'rgba(255,255,255,.7)' });
    lt(g, $(px[0]) + ' → ' + $(px[1]), 56, y0 + 166, { s: 14, w: 700, c: 'rgba(255,255,255,.6)', f: NF });
    g.strokeStyle = 'rgba(120,170,255,.06)'; g.lineWidth = 1; for (let o = -D; o <= A; o += 10) { g.beginPath(); g.moveTo(X(o), y0); g.lineTo(X(o), y1); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(x0, Y(0)); g.lineTo(x1, Y(0)); g.stroke(); g.setLineDash([]);
    if (isNow) { g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(xm, y0, x1 - xm, y1 - y0); lt(g, en ? 'not yet known' : 'この先は、まだ分からない', (xm + x1) / 2, (y0 + y1) / 2 + 6, { s: 17, w: 700, c: 'rgba(255,255,255,.35)', a: 'center' }); }
    // 出来事: 縦の点線と札。札は重ならないよう3段に振り分ける
    const rows = [-1e9, -1e9, -1e9]; ev.forEach((e) => { const x = X(e.o), c = EC[e.k], t = en ? e.en : e.ja; g.font = `800 13px ${JF}`; const w = g.measureText(t).width + 14; let r = rows.findIndex((v) => v < x - 4); if (r < 0) r = 2; rows[r] = x + w;
      g.strokeStyle = c; g.globalAlpha = .55; g.lineWidth = 1.5; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(x, y0 + 4 + r * 22); g.lineTo(x, y1); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      g.fillStyle = 'rgba(0,0,0,.9)'; g.beginPath(); g.roundRect(x - 2, y0 - 12 + r * 22, w, 20, 6); g.fill(); g.strokeStyle = c; g.lineWidth = 1.2; g.stroke(); lt(g, t, x + 5, y0 + 3 + r * 22, { s: 13, w: 800, c }); });
    const path = () => { g.beginPath(); let on = false; arr.forEach((v, i) => { if (v == null) { on = false; return; } const x = X(i - D), y = Y(v); on ? g.lineTo(x, y) : g.moveTo(x, y); on = true; }); };
    glow(col, 18, () => { g.strokeStyle = col; g.lineWidth = 6; g.lineJoin = 'round'; g.lineCap = 'round'; path(); g.stroke(); }); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.5; path(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(0), Y(0), 9, 0, 7); g.fill(); g.strokeStyle = col; g.lineWidth = 4; g.stroke();
    return Y; };
  panel(140, 392, d.cur, BL, en ? 'NOW' : '今回', d.at, d.curPct, d.evN, true, d.px);
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(48, 424); g.lineTo(W - 48, 424); g.stroke();
  const Yp = panel(462, 690, d.past, GD, en ? 'THEN' : '当時', en ? d.pe : d.pj, d.pastPct, d.evP, false, d.ppx);
  const pv = d.past[D + A]; if (pv != null) lt(g, (en ? '+60d ' : '60日後 ') + sg(pv), x1 - 4, Yp(pv) + (pv > 0 ? -14 : 26), { s: 18, w: 800, c: GD, a: 'right', f: NF });
  [[-D, en ? `${D}d before` : `${D}日前`], [0, en ? 'Day 0' : '0日目'], [30, en ? '+30d' : '30日後'], [A, en ? '+60d' : '60日後']].forEach(([o, t]) => lt(g, t, X(o), 716, { s: 14, w: 700, c: 'rgba(160,200,240,.85)', a: o === A ? 'right' : o === -D ? 'left' : 'center' }));
  let lx = 56; [['fomc', 'FOMC'], ['cpi', en ? 'US CPI' : '米CPI'], ['hack', en ? 'Big hack / collapse' : '大きな流出・破綻']].forEach(([k2, t]) => { g.fillStyle = EC[k2]; g.beginPath(); g.roundRect(lx, 754, 14, 14, 3); g.fill(); lt(g, t, lx + 20, 766, { s: 13, w: 700, c: '#e8f4fb' }); g.font = `700 13px ${JF}`; lx += 20 + g.measureText(t).width + 22; });
  lt(g, en ? 'Same period, not necessarily the cause. Events = every FOMC, US CPI and major hack/collapse in CSA\'s record.' : '同じ時期に起きたことで、原因とは限りません。出来事＝CSA の記録にある FOMC・米CPI・大きな流出／破綻のすべて。', 56, 790, { s: 12, w: 700, c: 'rgba(255,255,255,.7)' });
  lt(g, (en ? 'Binance BTCUSDT 1d · ' : 'Binance 日足・') + '@csa_archive', W - 36, 766, { s: 12, w: 800, c: '#8fe3f2', a: 'right' });
}
// v286→v288: CEO 退任の前後のBTC。雑誌の誌面のような作り(明朝の大見出し・金の罫線・右に表)を黒の背景で。0日目を真ん中に、今回は今日で止まる
function drawCeo(g, d, lg) {
  const SF = '"Noto Serif JP","Noto Serif CJK JP",serif', lt = (g2, t, x, y, o = {}) => ltBase(g2, t, x, y, { ...o, f: o.f || SF });
  const en = lg === 'en', R = d.R, sg = (v) => v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%', GL = '#c9a25a', IV = '#efe4cc';
  g.fillStyle = '#000'; g.fillRect(0, 0, W, LH);
  const rule = (y, a = 1, x0 = 40, x1 = W - 40) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, `rgba(201,162,90,${.25 * a})`); gr.addColorStop(.5, `rgba(232,200,130,${a})`); gr.addColorStop(1, `rgba(201,162,90,${.25 * a})`); g.fillStyle = gr; g.fillRect(x0, y, x1 - x0, 2); };
  const tg = g.createLinearGradient(0, 30, 0, 100); tg.addColorStop(0, '#fff3d6'); tg.addColorStop(.55, '#ecd29a'); tg.addColorStop(1, '#b8904a');
  g.save(); g.shadowColor = 'rgba(232,200,130,.35)'; g.shadowBlur = 14; lt(g, en ? 'BTC around CEO exits — how did it move?' : 'CEO退任の前後、BTCはどう動いた？', 40, 96, { s: en ? 52 : 60, w: 900, c: tg }); g.restore();
  rule(118);
  lt(g, en ? 'Day 0 = day it was announced; prior close = 0%' : '公表日を0日目とし、前日の終値を基準に比較', 42, 160, { s: 24, w: 700, c: IV });
  const x0 = 96, x1 = 640, y0 = 210, y1 = 630, X = (o) => x0 + (o + R) / (2 * R) * (x1 - x0), all = d.ev.flatMap((e) => e.p).filter((v) => v != null), top = Math.max(...all) + 3, bot = Math.min(...all) - 3, Y = (v) => y0 + (top - v) / (top - bot) * (y1 - y0);
  g.strokeStyle = 'rgba(201,162,90,.13)'; g.lineWidth = 1; for (let o = -R; o <= R; o += 5) { g.beginPath(); g.moveTo(X(o), y0); g.lineTo(X(o), y1); g.stroke(); }
  for (let v = Math.ceil(bot / 10) * 10; v <= top; v += 10) { g.strokeStyle = v ? 'rgba(201,162,90,.13)' : 'rgba(239,228,204,.7)'; g.lineWidth = v ? 1 : 1.4; g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, v ? sg(v).replace('.0', '') : '0%', x0 - 12, Y(v) + 7, { s: 19, w: 700, c: IV, a: 'right' }); }
  g.strokeStyle = 'rgba(239,228,204,.8)'; g.lineWidth = 1.5; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(X(0), y0); g.lineTo(X(0), y1); g.stroke(); g.setLineDash([]);
  const path = (p) => { g.beginPath(); let on = false; p.forEach((v, i) => { if (v == null) { on = false; return; } const x = X(i - R), y = Y(v); on ? g.lineTo(x, y) : g.moveTo(x, y); on = true; }); };
  const nv = d.ev.find((e) => e.now); d.ev.filter((e) => !e.now).forEach((e) => { g.strokeStyle = e.c; g.lineWidth = 3.5; g.lineJoin = 'round'; path(e.p); g.stroke(); });
  if (nv) { g.strokeStyle = nv.c; g.lineWidth = 5; g.lineJoin = 'round'; g.lineCap = 'round'; path(nv.p); g.stroke(); const x = X(nv.lastD), y = Y(nv.lastV); g.fillStyle = nv.c; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 3; g.stroke();
    g.font = `900 19px ${SF}`; const tw = g.measureText(en ? 'now' : '今ここ').width; g.fillStyle = 'rgba(0,0,0,.85)'; g.fillRect(x - tw / 2 - 6, y - 44, tw + 12, 28); lt(g, en ? 'now' : '今ここ', x, y - 23, { s: 19, w: 900, c: nv.c, a: 'center' }); }
  [[-R, en ? `${R}d before` : `${R}日前`, 'left'], [0, en ? 'Announced' : '公表日', 'center'], [R, en ? `${R}d after` : `${R}日後`, 'right']].forEach(([o, t, a]) => lt(g, t, X(o), y1 + 38, { s: 22, w: 700, c: IV, a }));
  const tx = 668, cols = [962, 1060, 1160], hdr = en ? ['Firm · date', 'Day 1', '+7d', '+30d'] : ['企業・公表日', '1日目', '7日後', '30日後'];
  lt(g, hdr[0], tx + 10, 228, { s: 20, w: 700, c: IV }); hdr.slice(1).forEach((t, i) => lt(g, t, cols[i], 228, { s: 20, w: 700, c: IV, a: 'right' })); rule(244, .9, tx, W - 40);
  const rows = d.ev.slice().sort((a, b) => (b.now || 0) - (a.now || 0) || a.day.localeCompare(b.day)), rh = 96;
  rows.forEach((e, i) => { const y = 252 + i * rh; g.fillStyle = e.c; g.fillRect(tx, y + 14, 12, rh - 28);
    lt(g, e.en, tx + 24, y + 40, { s: 27, w: 900, c: '#fff' }); lt(g, e.day.replace(/-/g, '.'), tx + 24, y + 66, { s: 18, w: 700, c: IV }); lt(g, en ? e.ke : e.kj, tx + 24, y + 88, { s: 14, w: 700, c: 'rgba(239,228,204,.8)' });
    [e.d1, e.d7, e.d30].forEach((v, k) => lt(g, sg(v), cols[k], y + 56, { s: 22, w: 700, c: '#fff', a: 'right' })); rule(y + rh - 2, .55, tx, W - 40); });
  rule(690);
  lt(g, en ? 'BTC daily (UTC) | Source: Binance · @csa_archive' : 'BTC 日足（UTC）｜出典：Binance・@csa_archive', 40, 726, { s: 19, w: 700, c: IV });
  lt(g, en ? 'Picked: major crypto/AI firms whose CEO left amid a scandal or legal case. Different kinds of events. Cause not verified. Past record; this time may differ.' : '選び方：暗号資産か AI の主要企業で、CEO が事件や疑惑の中で退いた日。出来事の性質は違います。退任との因果関係は検証していません。', 40, 760, { s: en ? 14 : 17, w: 700, c: 'rgba(239,228,204,.85)' });
  if (!en) lt(g, '過去の記録で、今回も同じとは限りません。', 40, 788, { s: 17, w: 700, c: 'rgba(239,228,204,.85)' });
}
// v289: 30日の下落幅と清算(建玉比)が今回に近い過去の回。左 = すべての日の散布図(今回と近い回に印)、右 = 近い回の前後30日と今回。見た目は drawDrop の型(黒・縁の光)
function drawLiqCmp(g, d, lg) {   // v293: 主役を1つに。巨大な清算額＋ランキングの棒(今回だけ赤く光る)。匹敵する回の30日後は下に札で
  const NF = '"Inter","Noto Sans JP","Noto Sans CJK JP",sans-serif', JF = '"Noto Sans JP","Noto Sans CJK JP",sans-serif', lt = (g2, t, x, y, o = {}) => ltBase(g2, t, x, y, { ...o, f: o.f || JF });
  const en = lg === 'en', sg = (v, k = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(k) + '%', B = (v) => '$' + (v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : Math.round(v / 1e6) + 'M'), RD = '#ff3b5c', IV = 'rgba(255,255,255,.72)';
  g.fillStyle = '#000'; g.fillRect(0, 0, W, LH);
  const NC = d.now.r >= 0 ? ['#2bff9e', '#00b86b', '#00e08a', '#d4ffe9'] : ['#ff3b5c', '#c4002b', '#ff1f45', '#ffd0d8'];
  const neon = (x, y, w, h, r) => { const ng = g.createLinearGradient(x, y, x + w, y + h); ng.addColorStop(0, NC[0]); ng.addColorStop(.5, NC[1]); ng.addColorStop(1, NC[0]); for (const [bl, al, lw] of [[30, .45, 7], [12, .85, 3.5], [0, .9, 1.4]]) { g.save(); g.shadowColor = NC[2]; g.shadowBlur = bl; g.globalAlpha = al; g.strokeStyle = bl ? ng : NC[3]; g.lineWidth = lw; g.beginPath(); g.roundRect(x, y, w, h, r); g.stroke(); g.restore(); } };
  const glow = (col, b, fn) => { g.save(); g.shadowColor = col; g.shadowBlur = Math.min(8, b * .35); fn(); g.restore(); g.save(); g.globalAlpha = .22; g.shadowColor = col; g.shadowBlur = b * .8; fn(); g.restore(); };
  g.fillStyle = 'rgba(0,0,0,.94)'; g.beginPath(); g.roundRect(28, 22, W - 56, 712, 20); g.fill(); neon(28, 22, W - 56, 712, 20);
  // 上: 巨大な清算額
  // v295: 何のランキングか見出しで分かるように
  { const ht = en ? `BTC 30-day long liquidation ranking & what came next (since ${d.y0})` : `BTC 30日間のロング清算ランキングと、その後の推移（${d.y0}年以降）`; let hs = 36; g.font = `900 ${hs}px ${JF}`; while (hs > 22 && g.measureText(ht).width > W - 120) { hs--; g.font = `900 ${hs}px ${JF}`; } lt(g, ht, 60, 84, { s: hs, w: 900, c: '#fff' }); }
  g.fillStyle = 'rgba(255,59,92,.8)'; g.fillRect(60, 100, 120, 3);
  lt(g, en ? 'This time (last 30 days)' : '今回（この30日）', 60, 138, { s: 18, w: 800, c: '#ffb3bd' });
  glow(RD, 30, () => lt(g, B(d.now.usd), 52, 236, { s: 112, w: 500, c: '#fff', f: NF })); g.font = `500 112px ${NF}`; const nw = g.measureText(B(d.now.usd)).width, qx = Math.max(560, 52 + nw + 50);
  g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(qx - 26, 130, 2, 110);
  lt(g, en ? `#${d.rank}` : `${d.rank}位`, qx, 200, { s: 76, w: 900, c: RD, f: en ? NF : JF }); g.font = `900 76px ${en ? NF : JF}`; const rw = g.measureText(en ? `#${d.rank}` : `${d.rank}位`).width;
  lt(g, en ? `since ${d.y0}` : `${d.y0}年以降`, qx + rw + 16, 164, { s: 20, w: 800, c: '#fff' }); lt(g, en ? `of ${d.nPeaks + 1} periods` : `${d.nPeaks + 1}の時期のうち`, qx + rw + 16, 194, { s: 16, w: 700, c: IV });
  lt(g, (en ? 'BTC in the same 30 days ' : '同じ30日のBTC ') + sg(d.now.r), qx, 236, { s: 22, w: 800, c: '#ffd24a' });
  // 中左: ランキングの棒(今回だけ赤く光る)
  const COL = ['#ffd24a', '#8fe3f2', '#b49cff', '#ff9d6e', '#6ff0b4', '#ff86a8'];
  const bx0 = 60, bx1 = 540, by0 = 306, by1 = 556, items = d.top.map((x) => ({ ...x })), inTop = d.rank <= 10;
  if (inTop) items.splice(d.rank - 1, 0, { now: 1, m: d.now.m, t: d.now.t }); const list = inTop ? items.slice(0, 10) : items.slice(0, 9).concat([{ gap: 1 }, { now: 1, m: d.now.m, t: d.now.t }]);
  lt(g, en ? `30-day long liquidations: top 10` : `30日間のロング清算 上位10`, bx0, 276, { s: 15, w: 800, c: '#fff' });
  const mx = Math.max(...list.filter((x) => !x.gap).map((x) => x.m)) * 1.1, bw = (bx1 - bx0) / list.length, BY = (m) => by1 - m / mx * (by1 - by0);
  const yy = (t) => { const z = new Date(t); return `${String(z.getUTCFullYear()).slice(2)}/${z.getUTCMonth() + 1}`; };
  list.forEach((x, k) => { const cx = bx0 + bw * (k + .5); if (x.gap) { lt(g, '…', cx, by1 - 12, { s: 20, w: 800, c: IV, a: 'center' }); return; }
    const y = BY(x.m), w = bw * .68;
    if (x.now) { const gr = g.createLinearGradient(0, y, 0, by1); gr.addColorStop(0, '#ff5c72'); gr.addColorStop(1, '#a3001f'); glow(RD, 26, () => { g.fillStyle = gr; g.beginPath(); g.roundRect(cx - w / 2, y, w, by1 - y, [6, 6, 0, 0]); g.fill(); }); }
    else { const gr = g.createLinearGradient(0, y, 0, by1); gr.addColorStop(0, 'rgba(170,185,210,.55)'); gr.addColorStop(1, 'rgba(90,100,120,.3)'); g.fillStyle = gr; g.beginPath(); g.roundRect(cx - w / 2, y, w, by1 - y, [5, 5, 0, 0]); g.fill(); }
    lt(g, B(x.m), cx, y - 8, { s: x.now ? 15 : 11, w: 800, c: x.now ? '#fff' : IV, a: 'center', f: NF });
    lt(g, x.now ? (en ? 'NOW' : '今回') : yy(x.t), cx, by1 + 20, { s: x.now ? 14 : 11, w: 800, c: x.now ? RD : IV, a: 'center', f: x.now ? JF : NF }); });
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx0, by1); g.lineTo(bx1, by1); g.stroke();
  // 中右: 匹敵する回の前後30日と今回
  const D = d.D, A = d.A, x0 = 590, x1 = 1110, y0 = 300, y1 = 556, X = (o) => x0 + (o + D) / (D + A) * (x1 - x0), all = d.now.p.concat(...d.cases.map((x) => x.p)).filter((v) => v != null), top = Math.max(...all) + 3, bot = Math.min(...all) - 3, Y = (v) => y0 + (top - v) / (top - bot) * (y1 - y0);
  lt(g, en ? 'Similar past periods: 30 days before and after' : '匹敵する過去の回の、前後30日のBTC', x0, 276, { s: 15, w: 800, c: '#fff' });
  g.strokeStyle = 'rgba(120,170,255,.07)'; g.lineWidth = 1; for (let o = -D; o <= A; o += 10) { g.beginPath(); g.moveTo(X(o), y0); g.lineTo(X(o), y1); g.stroke(); }
  for (let v = Math.ceil(bot / 10) * 10; v <= top; v += 10) { g.strokeStyle = v ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.45)'; g.setLineDash(v ? [] : [4, 6]); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, v ? sg(v, 0) : '0%', x1 + 8, Y(v) + 4, { s: 11, w: 700, c: IV, f: NF }); }
  const path = (p) => { g.beginPath(); let on = false; p.forEach((v, i2) => { if (v == null) { on = false; return; } const x = X(i2 - D), y = Y(v); on ? g.lineTo(x, y) : g.moveTo(x, y); on = true; }); };
  d.cases.forEach((x, k) => { g.strokeStyle = COL[k % COL.length]; g.globalAlpha = .9; g.lineWidth = 2.5; g.lineJoin = 'round'; path(x.p); g.stroke(); g.globalAlpha = 1; });
  glow(RD, 20, () => { g.strokeStyle = RD; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round'; path(d.now.p); g.stroke(); }); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.5; path(d.now.p); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(X(0), Y(0), 8, 0, 7); g.fill(); g.strokeStyle = RD; g.lineWidth = 4; g.stroke();
  [[-D, en ? '30d before' : '30日前', 'left'], [0, en ? 'Day 0' : '今日', 'center'], [A, en ? '+30d' : '30日後', 'right']].forEach(([o, t, a]) => lt(g, t, X(o), y1 + 20, { s: 12, w: 700, c: 'rgba(160,200,240,.85)', a }));
  // 下: 匹敵する回の30日後(線と同じ色)
  const cs = d.cases; lt(g, en ? `Past periods close on both (30d drop & liquidations) — 30 days later:` : `下落幅と清算額が今回に${d.strict ? '近かった' : '最も近い'}過去${cs.length}回の、30日後`, 60, 612, { s: 16, w: 800, c: '#fff' });
  lt(g, en ? `Higher: ${d.up} of ${cs.length}` : `上 ${d.up}回・下 ${cs.length - d.up}回`, W - 60, 612, { s: 16, w: 900, c: '#fff', a: 'right' });
  const pw = Math.min(170, (W - 120 - (cs.length - 1) * 10) / cs.length); cs.forEach((x, k) => { const px = 60 + k * (pw + 10), up = x.a30 >= 0, c = COL[k % COL.length];
    g.fillStyle = 'rgba(255,255,255,.04)'; g.beginPath(); g.roundRect(px, 628, pw, 72, 10); g.fill(); g.strokeStyle = c; g.lineWidth = 1.5; g.stroke(); g.fillStyle = c; g.fillRect(px, 640, 4, 48);
    lt(g, en ? d.ce[k] : d.cj[k], px + 14, 654, { s: 13, w: 800, c, f: NF }); lt(g, sg(x.a30), px + 14, 688, { s: 24, w: 800, c: up ? '#2bff9e' : '#ff5c72', f: NF }); });
  lt(g, en ? 'Liquidations = 30-day total of BTC long liquidations, USD at the time; Bybit, OKX, Binance, Huobi USDT perps (Coinalyze). Periods 30+ days apart.' : '清算＝BTCのロング清算の30日合計（その時のドル）。Bybit・OKX・Binance・Huobi の USDT無期限（Coinalyze）。時期どうしは30日以上あける。', 40, 762, { s: 12, w: 700, c: 'rgba(255,255,255,.72)' });
  lt(g, en ? 'Same period, not necessarily the cause. Past record; this time may differ.' : '同じ時期の記録で、原因とは限りません。過去の記録で、今回も同じとは限りません。', 40, 784, { s: 12, w: 700, c: 'rgba(255,255,255,.72)' });
  lt(g, (en ? 'Binance 1d · ' : 'Binance 日足・') + '@csa_archive', W - 36, 784, { s: 12, w: 800, c: '#8fe3f2', a: 'right' });
}
// v299: 大量清算の後のBTC。ショック後のBTC(drawShockCmp)と同じ型。清算の山の日 = 0日目、30日前の終値 = 0%。戻るまでの日数を札で
function drawLiqShock(g, d, lg) {
  const en = lg === 'en', CY = '#2ee6ff', CL = ['#ff8c1a', '#19d3a2', '#8f84ff'], M = '#7f93ad', D = d.D, A = d.A, rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const B = (v) => '$' + (v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : Math.round(v / 1e6) + 'M'), nm = (x) => x.ym + (x.name ? (en ? ' · ' : '・') + x.name : '');
  shockFrame(g, lg, 'BTC / LIQUIDATION COMPARE');
  if (d.n != null) lt(g, 'DAY ' + d.n, W - 34, 48, { s: 20, w: 900, f: LN, c: CY, a: 'right' });   // v300: 毎日の版
  lt(g, en ? 'BTC after mass liquidations' : '大量清算の後のBTC', 36, 118, { s: 50, w: 900 });
  lt(g, en ? 'Past periods with similar 30-day long liquidations' : '30日間のロング清算が今回と同規模だった過去', 40, 150, { s: 17, w: 700, c: '#cfe0f2' });
  lt(g, en ? 'Aligned on the peak day; 30 days before = 0%' : '清算の山の日でそろえ、30日前の終値＝0%', 40, 174, { s: 15, w: 700, c: M });
  const pc = (v) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  if (d.n != null) shockTop(g, [[640, en ? 'Now' : '今回', pc(d.now.d0), CY, 32]].concat(d.cases.map((x, i) => [780 + i * 125, x.ym, pc(x.atN), CL[i]])), 0, en, en ? `Same day ${d.n}` : `同じ${d.n}日目の比較`);
  else shockTop(g, [[640, en ? 'Now' : '今回', B(d.now.s), CY, 32]].concat(d.cases.map((x, i) => [780 + i * 125, x.ym, B(x.s), CL[i]])), 0, en, en ? '30-day long liquidations' : '30日間のロング清算');
  const all = [].concat(...d.cases.map((x) => x.days.filter((q) => q[0] <= A).map((q) => q[1])), d.now.days.map((q) => q[1]), [0]), vmax = Math.ceil((Math.max(...all) + 3) / 10) * 10, vmin = Math.floor((Math.min(...all) - 3) / 10) * 10;
  const x0 = 100, x1 = 1080, y0 = 200, y1 = 600, X = (dd) => x0 + (dd + D) / (D + A) * (x1 - x0), Y = (v) => y0 + (vmax - v) / (vmax - vmin) * (y1 - y0);
  g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(x0, y0, X(0) - x0, y1 - y0);
  for (let v = vmin; v <= vmax; v += 10) { g.strokeStyle = v ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.setLineDash(v ? [] : [6, 5]); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + v + '%', x0 - 12, Y(v) + 5, { s: 15, w: 800, f: LN, c: v ? M : '#fff', a: 'right' }); }
  [-30, 0, 30, 60, 90].filter((v) => v >= -D && v <= A).forEach((dd) => { g.strokeStyle = 'rgba(255,255,255,.03)'; g.beginPath(); g.moveTo(X(dd), y0); g.lineTo(X(dd), y1); g.stroke(); lt(g, dd === 0 ? (en ? 'Peak' : '清算の山') : (dd > 0 ? '+' : '') + dd + (en ? 'd' : '日'), X(dd), y1 + 26, { s: 15, w: 800, c: dd === 0 ? '#fff' : '#cfe0f2', a: 'center' }); });
  g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.5; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(X(0), y0); g.lineTo(X(0), y1); g.stroke(); g.setLineDash([]);
  lt(g, en ? '30 days of liquidations' : '清算が積み上がった30日', (x0 + X(0)) / 2, y0 + 22, { s: 14, w: 800, c: M, a: 'center' });
  lt(g, en ? '0% = price before the liquidations' : '0%＝清算が積み上がる前の価格', X(45), Y(0) - 10, { s: 13, w: 700, c: '#cfe0f2' });
  const clip = [x0, y0 - 4, x1 - x0 + 8, y1 - y0 + 8];
  d.cases.forEach((x, i) => shockLine(g, x.days.filter((q) => q[0] <= A), CL[i], 2.6, [6, 5], X, Y, clip));
  // 戻った日の札(0%の線の上)。90日より後なら右端に
  d.cases.forEach((x, i) => { const c = CL[i], t = x.rec == null ? (en ? 'not yet' : 'まだ') : x.rec + (en ? 'd' : '日'), lab = x.ym.slice(2) + ' ' + t;
    if (x.rec != null && x.rec <= A) { g.strokeStyle = c; g.lineWidth = 2.5; g.beginPath(); g.arc(X(x.rec), Y(0), 8, 0, 7); g.stroke(); const up = i % 2 === 0, y = up ? Y(0) - 46 - i * 6 : Y(0) + 14 + i * 6; g.fillStyle = c; rr(X(x.rec) - 56, y, 112, 28, 6); g.fill(); lt(g, lab, X(x.rec), y + 20, { s: 15, w: 900, c: '#0b1220', a: 'center' }); }
    else { const y = Y(0) + 14 + i * 34; g.fillStyle = c; rr(X(A) - 124, y, 120, 28, 6); g.fill(); lt(g, lab + (x.rec != null ? ' →' : ''), X(A) - 64, y + 20, { s: 15, w: 900, c: '#0b1220', a: 'center' }); } });
  shockNow(g, X, Y, y0, y1, d.now, en, d.now.d0 < -12);
  const ad = new Date(d.now.t), aj = `${ad.getUTCMonth() + 1}/${ad.getUTCDate()}`;
  const lg2 = [[CY, d.n != null ? (en ? `Now (30 days to the ${aj} peak · ${B(d.now.s)})` : `今回（${aj}の山までの30日・${B(d.now.s)}）`) : (en ? `Now (last 30 days · ${B(d.now.s)})` : `今回（この30日・${B(d.now.s)}）`), null, 5]].concat(d.cases.map((x, i) => [CL[i], nm(x) + `（${B(x.s)}）`, [6, 5], 2.6]));
  lg2.forEach(([c, l, da, w], i) => { const xx = 40 + (i % 2) * 560, y = 652 + Math.floor(i / 2) * 28; g.strokeStyle = c; g.lineWidth = w; g.setLineDash(da || []); g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + 40, y); g.stroke(); g.setLineDash([]); lt(g, l, xx + 50, y + 6, { s: 16, w: 800, c: '#e8f0fb' }); });
  g.strokeStyle = '#2a4466'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 700); g.lineTo(W - 36, 700); g.stroke();
  const rs = d.cases.map((x) => x.ym + ' ' + (x.rec == null ? (en ? 'not yet' : 'まだ') : x.rec + (en ? 'd' : '日'))).join(en ? ' · ' : '・');
  lt(g, (en ? 'Days to regain the pre-liquidation price: ' : '清算が積み上がる前の価格に戻るまで：') + rs, 40, 742, { s: en ? 18 : 21, w: 900 });
  lt(g, en ? `Long liquidations: Bybit, OKX, Binance, Huobi USDT perps (Coinalyze), since ${d.y0}. Periods 45+ days apart.` : `ロング清算＝Bybit・OKX・Binance・Huobi の USDT無期限の合計（Coinalyze・${d.y0}年以降）。時期どうしは45日以上あける。`, 40, 772, { s: 13, w: 700, c: M });
  lt(g, en ? 'Past record. This time may differ.' : '過去の記録で、今回も同じとは限りません', W - 36, 742, { s: 15, w: 900, c: '#ff9a9a', a: 'right' });
  lt(g, en ? 'Binance BTCUSDT daily close' : 'Binance BTCUSDT 日足終値', W - 36, 772, { s: 13, w: 700, c: M, a: 'right' });
}
// v302: Coinbase プレミアムの連続マイナス。ショック後のBTC と同じ型。始まった日を0日目、前日の終値＝0%。過去の回は終わった日に札(何日で終わり、30日後)
function drawCbPrem(g, d, lg) {
  const en = lg === 'en', CY = '#2ee6ff', CL = ['#ff8c1a', '#19d3a2', '#8f84ff'], M = '#7f93ad', c = d.cur, rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const sg = (v) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  shockFrame(g, lg, 'BTC / COINBASE PREMIUM');
  lt(g, 'DAY ' + c.days, W - 34, 48, { s: 20, w: 900, f: LN, c: CY, a: 'right' });
  lt(g, en ? 'Coinbase premium' : 'Coinbaseプレミアム', 36, 104, { s: 44, w: 900 }); lt(g, en ? 'negative streaks' : 'の連続マイナス', 38, 138, { s: 26, w: 900, c: '#cfe0f2' });
  lt(g, en ? `Coinbase below Binance ${c.days} days in a row (#${d.rank} since ${d.y0})` : `Coinbase が Binance を下回る日が${c.days}日連続（${d.y0}年以降${d.rank}番目）`, 40, 166, { s: 16, w: 700, c: '#cfe0f2' });
  lt(g, en ? 'Aligned on the first day; prior close = 0%' : '始まった日でそろえ、前日の終値＝0%', 40, 188, { s: 14, w: 700, c: M });
  shockTop(g, [[640, en ? 'Now' : '今回', c.days + (en ? 'd' : '日'), CY, 32]].concat(d.past.map((x, i) => [780 + i * 125, en ? d.ce[i] : d.cy[i], x.days + (en ? 'd' : '日'), CL[i]])), 0, en, en ? 'Streak length' : '連続マイナスの日数');
  const A = Math.min(160, Math.max(c.days + 10, ...d.past.map((x) => x.days + 30))), all = [0].concat(c.days2.map((q) => q[1]), ...d.past.map((x) => x.days2.map((q) => q[1]))), vmax = Math.ceil((Math.max(...all) + 3) / 10) * 10, vmin = Math.floor((Math.min(...all) - 3) / 10) * 10;
  const x0 = 100, x1 = 1080, y0 = 210, y1 = 600, X = (dd) => x0 + dd / A * (x1 - x0), Y = (v) => y0 + (vmax - v) / (vmax - vmin) * (y1 - y0);
  for (let v = vmin; v <= vmax; v += 10) { g.strokeStyle = v ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.setLineDash(v ? [] : [6, 5]); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + v + '%', x0 - 12, Y(v) + 5, { s: 15, w: 800, f: LN, c: v ? M : '#fff', a: 'right' }); }
  for (let dd = 0; dd <= A; dd += A > 120 ? 30 : 20) { g.strokeStyle = 'rgba(255,255,255,.03)'; g.beginPath(); g.moveTo(X(dd), y0); g.lineTo(X(dd), y1); g.stroke(); lt(g, dd === 0 ? (en ? 'Start' : '始まり') : dd + (en ? 'd' : '日'), X(dd), y1 + 26, { s: 15, w: 800, c: dd === 0 ? '#fff' : '#cfe0f2', a: 'center' }); }
  const clip = [x0, y0 - 4, x1 - x0 + 8, y1 - y0 + 8];
  d.past.forEach((x, i) => { const inS = x.days2.filter((q) => q[0] <= x.days), aft = x.days2.filter((q) => q[0] >= x.days); shockLine(g, inS, CL[i], 2.8, null, X, Y, clip); shockLine(g, aft, CL[i], 2.2, [6, 5], X, Y, clip); });
  // 終わった日の札
  d.past.forEach((x, i) => { const q = x.days2.find((z) => z[0] === x.days); if (!q) return; const xx = X(q[0]), yy = Y(q[1]); g.strokeStyle = CL[i]; g.lineWidth = 2.5; g.beginPath(); g.arc(xx, yy, 7, 0, 7); g.stroke();
    const t = (en ? `ended day ${x.days} · +30d ` : `${x.days}日で終了・30日後 `) + sg(x.after30); g.font = `900 14px ${LJ}`; const w = g.measureText(t).width + 16, bx = Math.min(Math.max(xx - w / 2, x0), x1 - w), by = yy + (i % 2 ? 16 : -40); g.fillStyle = CL[i]; rr(bx, by, w, 26, 6); g.fill(); lt(g, t, bx + 8, by + 18, { s: 14, w: 900, c: '#0b1220' }); });
  shockNow(g, X, Y, y0, y1, { days: c.days2 }, en, (c.days2[c.days2.length - 1] || [0, 0])[1] < -8);
  const lg2 = [[CY, (en ? `Now (from ${new Date(c.from).toISOString().slice(0, 10)}) · ` : `今回（${new Date(c.from).toISOString().slice(0, 10)}〜）・`) + c.days + (en ? 'd' : '日'), null, 5]].concat(d.past.map((x, i) => [CL[i], (en ? d.ce[i] : d.cy[i]) + (en ? ` · ${x.days}d (dashed = after)` : `・${x.days}日（点線＝終わった後）`), null, 2.8]));
  lg2.forEach(([cc, l, da, w], i) => { const xx = 40 + (i % 2) * 560, y = 652 + Math.floor(i / 2) * 28; g.strokeStyle = cc; g.lineWidth = w; g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + 40, y); g.stroke(); lt(g, l, xx + 50, y + 6, { s: 16, w: 800, c: '#e8f0fb' }); });
  g.strokeStyle = '#2a4466'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 700); g.lineTo(W - 36, 700); g.stroke();
  lt(g, (en ? '30 days after each ended: ' : '終わった後30日のBTC：') + d.past.map((x, i) => (en ? d.ce[i] : d.cy[i]) + ' ' + sg(x.after30)).join(en ? ' · ' : '・'), 40, 740, { s: en ? 17 : 19, w: 900 });
  lt(g, en ? `Premium = (Coinbase BTC-USD − Binance BTCUSDT) ÷ Binance, daily closes (differs from CoinGlass's count). Since ${d.y0}; 2018–19 excluded (USDT price gaps).` : `プレミアム＝(Coinbase BTC-USD − Binance BTCUSDT)÷Binance、日足の終値で比較（CoinGlass の数え方とは異なる）。${d.y0}年以降（2018〜19年は USDT の価格のずれで除外）。`, 40, 770, { s: 12, w: 700, c: M });
  lt(g, (en ? 'Past record. Not a forecast.' : '過去の記録で、今回も同じとは限りません') + ' · @csa_archive', W - 36, 792, { s: 12, w: 800, c: '#ff9a9a', a: 'right' });
}
// v303: 最高値の半値。ショック後のBTC と同じ型(紺)。横 = 最高値からの日数、縦 = 最高値からの下げ。半値の線を太く
function drawHalf(g, d, lg) {
  const en = lg === 'en', CY = '#2ee6ff', CL = { '2018': '#ff8c1a', '2022': '#19d3a2' }, M = '#7f93ad', cs = d.cs, cur = cs.find((x) => x.k === 'now'), past = cs.filter((x) => x.k !== 'now'), rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const $ = (v) => '$' + Math.round(v).toLocaleString('en-US');
  shockFrame(g, lg, 'BTC / FROM THE ALL-TIME HIGH');
  lt(g, en ? (cur.half ? 'BTC below half its ATH' : 'BTC vs half its ATH') : (cur.half ? 'BTC、最高値の半値割れ' : 'BTC と最高値の半値'), 36, 112, { s: 48, w: 900 });
  lt(g, en ? `ATH ${$(cur.ath)} → now ${$(cur.now)} (${cur.nowPct}%)` : `最高値 ${$(cur.ath)} → いま ${$(cur.now)}（${cur.nowPct}%）`, 40, 150, { s: 19, w: 800, c: CY });
  lt(g, en ? 'Days since each cycle\'s all-time high; ATH = 0%' : 'それぞれの最高値の日からの日数・最高値＝0%', 40, 176, { s: 15, w: 700, c: M });
  shockTop(g, [[640, en ? 'Now' : '今回', cur.half ? cur.half.d + (en ? 'd' : '日') : '—', CY, 32]].concat(past.map((x) => [800 + (x.k === '2022' ? 160 : 0), en ? x.en : x.ja, x.half ? x.half.d + (en ? 'd' : '日') : '—', CL[x.k]])), 0, en, en ? 'Days from ATH to half' : '最高値から半値まで');
  const A = Math.max(420, cur.last + 40, ...past.map((x) => (x.rec ? x.rec.d : 0) + 30)), x0 = 100, x1 = 1080, y0 = 200, y1 = 600, vmin = -90, vmax = 10, X = (dd) => x0 + Math.min(dd, A) / A * (x1 - x0), Y = (v) => y0 + (vmax - v) / (vmax - vmin) * (y1 - y0);
  for (let v = vmin; v <= vmax; v += 10) { const h = v === -50; g.strokeStyle = h ? 'rgba(255,92,114,.75)' : 'rgba(255,255,255,.06)'; g.lineWidth = h ? 2 : 1; g.setLineDash(h ? [8, 6] : []); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, v + '%', x0 - 12, Y(v) + 5, { s: 15, w: 800, f: LN, c: h ? '#ff8a9b' : M, a: 'right' }); }
  lt(g, en ? 'half of the ATH' : '最高値の半値', X(A * .62), Y(-50) - 8, { s: 15, w: 900, c: '#ff8a9b', a: 'center' });
  for (let dd = 0; dd <= A; dd += A > 700 ? 200 : 100) { g.strokeStyle = 'rgba(255,255,255,.03)'; g.beginPath(); g.moveTo(X(dd), y0); g.lineTo(X(dd), y1); g.stroke(); lt(g, dd === 0 ? (en ? 'ATH' : '最高値') : dd + (en ? 'd' : '日'), X(dd), y1 + 26, { s: 15, w: 800, c: dd === 0 ? '#fff' : '#cfe0f2', a: 'center' }); }
  const clip = [x0, y0 - 4, x1 - x0 + 8, y1 - y0 + 8];
  past.forEach((x) => shockLine(g, x.path.filter((q) => q[0] <= A), CL[x.k], 2.8, [7, 5], X, Y, clip));
  past.forEach((x, i) => { const c = CL[x.k];
    if (x.half && x.half.d <= A) { g.fillStyle = c; g.beginPath(); g.arc(X(x.half.d), Y(-50), 7, 0, 7); g.fill(); const t = (en ? x.en + ' halved day ' : x.ja + ' 半値 ') + x.half.d + (en ? '' : '日'); g.font = `900 14px ${LJ}`; const w = g.measureText(t).width + 16, by = Y(-50) + (i ? 14 : -40); g.fillStyle = c; rr(X(x.half.d) - w / 2, by, w, 26, 6); g.fill(); lt(g, t, X(x.half.d), by + 18, { s: 14, w: 900, c: '#0b1220', a: 'center' }); }
    if (x.bot.d <= A) { const bx = X(x.bot.d), byy = Y(x.bot.pct); g.strokeStyle = c; g.lineWidth = 2.5; g.beginPath(); g.arc(bx, byy, 8, 0, 7); g.stroke(); const t = (en ? 'bottom ' : '底 ') + x.bot.pct + '%' + (en ? ` · day ${x.bot.d}` : `・${x.bot.d}日目`); g.font = `900 14px ${LJ}`; const w = g.measureText(t).width + 16; const ty = i === 0 ? byy + 12 : byy - 40, tx = Math.min(Math.max(bx - w / 2, x0), x1 - w); g.fillStyle = c; rr(tx, ty, w, 26, 6); g.fill(); lt(g, t, tx + 8, ty + 18, { s: 14, w: 900, c: '#0b1220' }); } });
  // v304: 最高値に戻った日(0%の線の上)
  past.forEach((x, i) => { if (!x.rec || x.rec.d > A) return; const c = CL[x.k], rx = X(x.rec.d); g.fillStyle = c; g.beginPath(); g.arc(rx, Y(0), 8, 0, 7); g.fill(); const t = (en ? 'back to ATH · day ' : '最高値に戻る・') + x.rec.d + (en ? '' : '日目'); g.font = `900 14px ${LJ}`; const w = g.measureText(t).width + 16, tx = Math.min(Math.max(rx - w / 2, x0), x1 - w), ty = i === 0 ? Y(0) - 36 : Y(0) + 12; g.fillStyle = c; rr(tx, ty, w, 26, 6); g.fill(); lt(g, t, tx + 8, ty + 18, { s: 14, w: 900, c: '#0b1220' }); });
  { g.strokeStyle = 'rgba(46,230,255,.18)'; g.fillStyle = 'rgba(46,230,255,.05)'; g.fillRect(X(cur.last), y0, x1 - X(cur.last), y1 - y0); lt(g, en ? 'not yet known →' : 'この先は、まだ分からない →', X(cur.last) + 16, y0 + 24, { s: 14, w: 800, c: 'rgba(160,220,255,.7)' }); }
  shockNow(g, X, Y, y0, y1, { days: cur.path }, en, false);
  if (cur.half) { g.fillStyle = CY; g.beginPath(); g.arc(X(cur.half.d), Y(-50), 8, 0, 7); g.fill(); }
  const lg2 = [[CY, (en ? 'Now (ATH ' : '今回（最高値 ') + new Date(cur.athT).toISOString().slice(0, 10) + (en ? ')' : '）'), null, 5]].concat(past.map((x) => [CL[x.k], (en ? x.en + ' (ATH ' : x.ja + '（最高値 ') + new Date(x.athT).toISOString().slice(0, 10) + (en ? ')' : '）'), [7, 5], 2.8]));
  lg2.forEach(([c, l, da, w], i) => { const xx = 40 + i * 380, y = 656; g.strokeStyle = c; g.lineWidth = w; g.setLineDash(da || []); g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + 36, y); g.stroke(); g.setLineDash([]); lt(g, l, xx + 44, y + 6, { s: 15, w: 800, c: '#e8f0fb' }); });
  g.strokeStyle = '#2a4466'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 700); g.lineTo(W - 36, 700); g.stroke();
  lt(g, (en ? 'Back to the ATH: ' : '最高値に戻るまで：') + past.map((x) => (en ? x.en : x.ja) + ' ' + (x.rec ? x.rec.d + (en ? 'd' : '日') : '—') + (en ? ` (bottom ${x.bot.pct}%)` : `（底 ${x.bot.pct}%）`)).join(en ? ' · ' : '・') + (en ? ` · now day ${cur.last}` : `・今回は${cur.last}日目`), 40, 742, { s: en ? 17 : 19, w: 900 });
  lt(g, en ? 'Half = daily low at or below 50% of the ATH (daily high). Bottom = lowest daily close. Binance BTCUSDT daily.' : '半値＝日足の安値が最高値（日足の高値）の50%以下。底＝日足終値の最安。Binance BTCUSDT 日足。', 40, 772, { s: 13, w: 700, c: M });
  lt(g, (en ? 'Past record. Not a forecast.' : '過去の記録で、今回も同じとは限りません') + ' · @csa_archive', W - 36, 792, { s: 12, w: 800, c: '#ff9a9a', a: 'right' });
}
// v305: 恐怖指数が今の値以下になった過去の回のその後60日。ショック後のBTC と同じ型。すべての回を細い線、新しい4回を色付き、今回は水色
function drawFng(g, d, lg) {
  const en = lg === 'en', CY = '#2ee6ff', CL = ['#ff8c1a', '#19d3a2', '#8f84ff', '#ffd24a', '#ff6b9d', '#6fc3ff', '#b6e35a', '#ff5c5c', '#c9a0ff', '#f2f2f2'], M = '#7f93ad', A = 30 /* v311: 横軸は30日に固定 */, rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); }, sg = (v) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%', ym = (t) => { const z = new Date(t); return `${z.getUTCFullYear()}/${z.getUTCMonth() + 1}`; };
  shockFrame(g, lg, 'BTC / FEAR & GREED INDEX');
  lt(g, en ? `Fear & Greed: ${d.nowV}` : `恐怖指数 ${d.nowV}`, 36, 108, { s: 50, w: 900 }); g.font = `900 50px ${LJ}`; const tw = g.measureText(en ? `Fear & Greed: ${d.nowV}` : `恐怖指数 ${d.nowV}`).width;
  g.font = `900 20px ${LJ}`; const lw = g.measureText(en ? d.labE : d.lab).width + 28; g.fillStyle = '#ff5c72'; rr(48 + tw, 72, lw, 40, 8); g.fill(); lt(g, en ? d.labE : d.lab, 48 + tw + lw / 2, 99, { s: 20, w: 900, c: '#fff', a: 'center' });
  lt(g, en ? `${d.cases.length} past entries into Extreme Fear (≤${d.th}) since ${d.y0} — BTC over the next ${A} days` : `${d.y0}年以降、極度の恐怖（${d.th}以下）に入った過去${d.cases.length}回`, 40, 150, { s: 17, w: 700, c: '#cfe0f2' });
  lt(g, en ? 'Day 0 = first day in Extreme Fear; that close (entry price) = 0%. First ' + A + ' days' : '0日目＝極度の恐怖に入った日、その日の終値（元値）＝0%。' + A + '日まで', 40, 174, { s: 14, w: 700, c: M });
  shockTop(g, [[640, en ? 'Back to entry' : '元値に戻った', `${d.recN}/${d.cases.length}`, '#19d3a2', 30], [800, en ? 'Days (median)' : '戻るまで', d.recMed == null ? '—' : Math.round(d.recMed) + (en ? 'd' : '日'), '#cfe0f2'], [960, en ? 'Low (median)' : 'その間の底', sg(d.ddMed), '#ff8a9b']], 0, en, en ? 'Past entries' : '過去の回（中央値）');
  const all = [0].concat(...d.cases.map((x) => x.p.filter((q) => q[0] <= A).map((q) => q[1])), d.cur ? d.cur.p.map((q) => q[1]) : []), vmax = Math.min(80, Math.ceil((Math.max(...all) + 3) / 10) * 10), vmin = Math.max(-80, Math.floor((Math.min(...all) - 3) / 10) * 10);
  const x0 = 100, x1 = 880 /* v310: 右に札の列 */, y0 = 200, y1 = 600, X = (dd) => x0 + dd / A * (x1 - x0), Y = (v) => y0 + (vmax - Math.min(vmax, Math.max(vmin, v))) / (vmax - vmin) * (y1 - y0);
  for (let v = vmin; v <= vmax; v += 10) { g.strokeStyle = v ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.4)'; g.lineWidth = 1; g.setLineDash(v ? [] : [6, 5]); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + v + '%', x0 - 12, Y(v) + 5, { s: 15, w: 800, f: LN, c: v ? M : '#fff', a: 'right' }); }
  (A > 400 ? [0, 100, 200, 300, 400, 500, 600] : A > 200 ? [0, 50, 100, 150, 200, 250, 300, 350, 400] : A > 100 ? [0, 30, 60, 90, 120, 150, 180] : A > 30 ? [0, 10, 20, 30, 40, 50, 60] : [0, 5, 10, 15, 20, 25, 30]).filter((v) => v <= A).forEach((dd) => { g.strokeStyle = 'rgba(255,255,255,.03)'; g.beginPath(); g.moveTo(X(dd), y0); g.lineTo(X(dd), y1); g.stroke(); lt(g, dd === 0 ? (en ? 'Day 0' : '0日目') : dd + (en ? 'd' : '日'), X(dd), y1 + 26, { s: 15, w: 800, c: dd === 0 ? '#fff' : '#cfe0f2', a: 'center' }); });
  const clip = [x0, y0 - 4, x1 - x0 + 8, y1 - y0 + 8], sh = new Set(d.show.map((x) => x.t));
  d.cases.filter((x) => !sh.has(x.t)).forEach((x) => shockLine(g, x.p.filter((q) => q[0] <= A), 'rgba(160,180,210,.22)', 1.4, null, X, Y, clip));
  d.show.forEach((x, i) => shockLine(g, x.p.filter((q) => q[0] <= A), CL[i % CL.length], 2.4, [6, 4], X, Y, clip));
  // v307: 元値に戻った日の札(0%の線の上)
  d.show.forEach((x, i) => { if (x.rec == null || x.rec > A) return; const rx = X(x.rec); g.fillStyle = CL[i % CL.length]; g.beginPath(); g.arc(rx, Y(0), 5, 0, 7); g.fill(); });
  // v308: 線の端に日付と結果(線の色)。重ならないよう縦にずらす
  { const labs = d.show.map((x, i) => { const pts = x.p.filter((q) => q[0] <= A), q = pts[pts.length - 1]; const res = x.rec == null ? (x.el != null && x.el < (d.MAXD || 600) ? (en ? `not back yet (day ${x.el})` : `まだ戻っていない(${x.el}日目)`) : en ? `not back in ${d.MAXD || 600}d+` : `元値まで${d.MAXD || 600}日超`) : x.rec <= A ? (en ? `back in ${x.rec}d` : `${x.rec}日で元値`) : (en ? `back in ${x.rec}d` : `元値まで${x.rec}日`);
      return { i, x: X(q[0]), y: Y(q[1]), t: ym(x.t) + (x.name ? (en ? ' ' : '・') + x.name : '') + ' ' + res }; }).sort((a, b) => a.y - b.y);
    labs.forEach((l) => { l.y = Math.max(y0 + 10, Math.min(y1 - 10, l.y)); l.ey = l.y; });
    for (let n = 1; n < labs.length; n++) if (labs[n].y - labs[n - 1].y < 25) labs[n].y = labs[n - 1].y + 25;
    const over = labs.length ? labs[labs.length - 1].y - (y1 - 10) : 0; if (over > 0) labs.forEach((l) => { l.y -= over; });
    const LX = x1 + 22, LW = W - 24 - LX;
    labs.forEach((l) => { const c = CL[l.i % CL.length]; g.strokeStyle = c; g.globalAlpha = .45; g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(l.x + 4, l.ey); g.lineTo(x1 + 8, l.ey); g.lineTo(LX, l.y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      g.fillStyle = c; g.beginPath(); g.arc(l.x, l.ey, 3.5, 0, 7); g.fill();
      let fs = 14; g.font = `900 ${fs}px ${LJ}`; while (fs > 11 && g.measureText(l.t).width + 14 > LW) { fs--; g.font = `900 ${fs}px ${LJ}`; }
      const w = Math.min(LW, g.measureText(l.t).width + 14); g.fillStyle = 'rgba(5,11,20,.92)'; rr(LX, l.y - 11, w, 22, 5); g.fill(); g.strokeStyle = c; g.lineWidth = 1.3; g.stroke(); lt(g, l.t, LX + 7, l.y + 5, { s: fs, w: 900, c }); }); }
  if (d.cur) shockNow(g, X, Y, y0, y1, { days: d.cur.p }, en, (d.cur.p[d.cur.p.length - 1] || [0, 0])[1] < -8);
  const lg2 = [[CY, (en ? 'Now (day 0: ' : '今回（0日目 ') + new Date(d.cur.t).toISOString().slice(0, 10) + (en ? ')' : '）'), 5, null], ['rgba(160,180,210,.6)', en ? 'older times (thin)' : 'さらに前の回（細線）', 1.6, null], ['#cfe0f2', en ? 'dashed = the latest 10 · label = date and result' : '点線＝新しい10回・札＝日付と結果', 2.4, [6, 4]]];
  lg2.forEach(([c, l, w, da], i) => { const xx = 40 + i * 380, y = 656; g.strokeStyle = c; g.lineWidth = w; g.setLineDash(da || []); g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + 34, y); g.stroke(); g.setLineDash([]); lt(g, l, xx + 42, y + 5, { s: 14, w: 800, c: '#e8f0fb' }); });
  g.strokeStyle = '#2a4466'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 708); g.lineTo(W - 36, 708); g.stroke();
  lt(g, en ? `Back to the entry price: ${d.recN} of ${d.cases.length} · median ${d.recMed == null ? '—' : Math.round(d.recMed) + 'd'} · low in between, median ${sg(d.ddMed)}` : `元値に戻った ${d.recN}/${d.cases.length}回・戻るまで 中央値 ${d.recMed == null ? '—' : Math.round(d.recMed) + '日'}・その間の底 中央値 ${sg(d.ddMed)}`, 40, 744, { s: en ? 16 : 19, w: 900 });
  lt(g, en ? `Fear & Greed Index: alternative.me (estimate, since ${d.y0}). Extreme Fear = 0–24; a new entry after 30+ days above 24. BTC: Binance BTCUSDT daily close.` : `恐怖指数＝alternative.me の Fear & Greed Index（推定値・${d.y0}年以降）。極度の恐怖＝0〜24。30日を超えて24より上にいた後、また入った日を新しい回とする。BTC＝Binance BTCUSDT 日足終値。`, 40, 772, { s: 12, w: 700, c: M });
  lt(g, (en ? 'Past record. Not a forecast.' : '過去の記録で、今回も同じとは限りません') + ' · @csa_archive', W - 36, 792, { s: 12, w: 800, c: '#ff9a9a', a: 'right' });
}
// v313: V字リバウンド。底(安値)＝0%、横軸＝底からの日数。0%より下＝前の底を割った
function drawVreb(g, d, lg) {
  const en = lg === 'en', CY = '#2ee6ff', RD = '#ff4d5e', GR = '#19d3a2', CL = ['#ff8c1a', '#19d3a2', '#8f84ff', '#ffd24a', '#ff6b9d', '#6fc3ff', '#b6e35a', '#ff5c5c', '#c9a0ff', '#f2f2f2'], M = '#7f93ad', rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); }, sg = (v) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%', ym = (t) => { const z = new Date(t); return `${z.getUTCFullYear()}/${z.getUTCMonth() + 1}`; };
  const md = (t) => { const z = new Date(t); return `${z.getUTCMonth() + 1}/${z.getUTCDate()}`; }, N = d.cases.length, ok = N - d.brkN, AX = Math.ceil((d.dn + d.A) / 5) * 5;
  shockFrame(g, lg, 'BTC / V-SHAPED REBOUND');
  const hd = en ? `${sg(d.bounce)} off the low` : `${d.unit === 'h' ? '安値' : '底'}から ${sg(d.bounce)}`; lt(g, hd, 36, 108, { s: 50, w: 900, c: GR }); g.font = `900 50px ${LJ}`; const tw = g.measureText(hd).width;
  const Hm = d.unit === 'h', tg = Hm ? (en ? `${d.dn}h since the low` : `${d.lowHm}の安値から${d.dn}時間`) : d.dn ? (en ? `${d.dn}d since ${md(d.lowT)}` : `${md(d.lowT)}の底から${d.dn}日`) : (en ? 'from today\'s low' : '今日の安値から'); g.font = `900 20px ${LJ}`; const lw = g.measureText(tg).width + 28; g.fillStyle = '#1b3350'; rr(48 + tw, 72, lw, 40, 8); g.fill(); lt(g, tg, 48 + tw + lw / 2, 99, { s: 20, w: 900, c: '#fff', a: 'center' });
  lt(g, Hm ? (en ? `${N} past bounces of ${d.B}%+ after a ${d.DR}%+ drop within 24h (since ${d.y0})` : `${d.y0}年以降、24時間で${d.DR}%以上下げた後、安値から${d.B}%以上戻した過去${N}回`) : en ? `${N} past bounces of ${d.B}%+ off a low after a ${d.DR}%+ 30-day drop (since ${d.y0})` : `${d.y0}年以降、30日で${d.DR}%以上下げた後、底から${d.B}%以上戻した過去${N}回`, 40, 150, { s: 17, w: 700, c: '#cfe0f2' });
  lt(g, Hm ? (en ? 'Low = 0%. Below 0% = broke the low. Up to 72 hours after the bounce' : '安値＝0%。0%より下＝安値を割った。戻した時から72時間まで') : en ? 'Low (that day\'s low) = 0%. Below 0% = broke the low. Up to 30 days after the bounce' : '底（その日の安値）＝0%。0%より下＝前の底を割った。戻した日から30日まで', 40, 174, { s: 14, w: 700, c: M });
  const uj = Hm ? '時間' : '日目', ue = Hm ? 'h' : 'd', ul = Hm ? 72 : 30;
  shockTop(g, [[640, en ? 'Broke the low' : (Hm ? '安値を割った' : '底を割った'), `${d.brkN}/${N}`, RD, 30], [800, en ? 'Held' : '割らなかった', `${ok}/${N}`, GR, 30], [960, en ? 'Broke at (median)' : (Hm ? '割った時(中央値)' : '割った日(中央値)'), d.brkMed == null ? '—' : Math.round(d.brkMed) + (en ? ue : uj), '#cfe0f2']], 0, en, en ? `Within ${ul}${Hm ? ' hours' : ' days'}` : `その後${ul}${Hm ? '時間' : '日'}で`);
  const pts = (x) => x.p.filter((q) => q[0] <= AX), all = [0].concat(...d.show.map((x) => pts(x).map((q) => q[1])), d.cur.p.map((q) => q[1]));
  const vmax = Math.ceil((Math.max(...all) + 3) / 10) * 10, vmin = Math.min(-10, Math.floor((Math.min(...all) - 3) / 10) * 10);
  const x0 = 100, x1 = 880, y0 = 200, y1 = 600, X = (dd) => x0 + dd / AX * (x1 - x0), Y = (v) => y0 + (vmax - Math.min(vmax, Math.max(vmin, v))) / (vmax - vmin) * (y1 - y0);
  g.fillStyle = 'rgba(255,77,94,.07)'; g.fillRect(x0, Y(0), x1 - x0, y1 - Y(0));
  for (let v = vmin; v <= vmax; v += 10) { g.strokeStyle = v ? 'rgba(255,255,255,.06)' : RD; g.lineWidth = v ? 1 : 1.6; g.setLineDash(v ? [] : [6, 5]); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + v + '%', x0 - 12, Y(v) + 5, { s: 15, w: 800, f: LN, c: v ? M : RD, a: 'right' }); }
  lt(g, en ? 'the low' : (Hm ? '安値' : '前の底'), x1 - 8, Y(0) - 8, { s: 14, w: 900, c: RD, a: 'right' });
  for (let dd = 0; dd <= AX; dd += AX > 40 ? (Hm ? 12 : 10) : 5) { g.strokeStyle = 'rgba(255,255,255,.03)'; g.beginPath(); g.moveTo(X(dd), y0); g.lineTo(X(dd), y1); g.stroke(); lt(g, dd === 0 ? (en ? 'Low' : (Hm ? '安値' : '底')) : dd + (en ? ue : (Hm ? '時間' : '日')), X(dd), y1 + 26, { s: 15, w: 800, c: dd === 0 ? '#fff' : '#cfe0f2', a: 'center' }); }
  const clip = [x0, y0 - 4, x1 - x0 + 8, y1 - y0 + 8], sh = new Set(d.show.map((x) => x.t));
  d.cases.filter((x) => !sh.has(x.t)).forEach((x) => shockLine(g, pts(x), 'rgba(160,180,210,.22)', 1.4, null, X, Y, clip));
  d.show.forEach((x, i) => shockLine(g, pts(x), CL[i % CL.length], 2.4, [6, 4], X, Y, clip));
  d.show.forEach((x, i) => { if (x.brk == null || x.brk > AX) return; g.strokeStyle = RD; g.lineWidth = 2.5; const bx = X(x.brk), by = Y(0); g.beginPath(); g.moveTo(bx - 6, by - 6); g.lineTo(bx + 6, by + 6); g.moveTo(bx + 6, by - 6); g.lineTo(bx - 6, by + 6); g.stroke(); });
  { const labs = d.show.map((x, i) => { const q = pts(x), e = q[q.length - 1]; const res = x.brk != null ? (en ? `broke at ${x.brk}${ue}` : (Hm ? `${x.brk}時間で安値割れ` : `${x.brk}日目に底割れ`)) : (en ? `held, ${ul}${ue} ${sg(x.a30)}` : `割らず ${ul}${Hm ? '時間' : '日'}後${sg(x.a30)}`);
      return { i, x: X(e[0]), y: Y(e[1]), t: ym(x.t) + (x.name ? (en ? ' ' : '・') + x.name : '') + ' ' + res, br: x.brk != null }; }).sort((a, b) => a.y - b.y);
    labs.forEach((l) => { l.y = Math.max(y0 + 10, Math.min(y1 - 10, l.y)); l.ey = l.y; });
    for (let n = 1; n < labs.length; n++) if (labs[n].y - labs[n - 1].y < 25) labs[n].y = labs[n - 1].y + 25;
    const over = labs.length ? labs[labs.length - 1].y - (y1 - 10) : 0; if (over > 0) labs.forEach((l) => { l.y -= over; });
    const LX = x1 + 22, LW = W - 24 - LX;
    labs.forEach((l) => { const c = CL[l.i % CL.length]; g.strokeStyle = c; g.globalAlpha = .45; g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(l.x + 4, l.ey); g.lineTo(x1 + 8, l.ey); g.lineTo(LX, l.y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      g.fillStyle = c; g.beginPath(); g.arc(l.x, l.ey, 3.5, 0, 7); g.fill();
      let fs = 14; g.font = `900 ${fs}px ${LJ}`; while (fs > 11 && g.measureText(l.t).width + 14 > LW) { fs--; g.font = `900 ${fs}px ${LJ}`; }
      const w = Math.min(LW, g.measureText(l.t).width + 14); g.fillStyle = 'rgba(5,11,20,.92)'; rr(LX, l.y - 11, w, 22, 5); g.fill(); g.strokeStyle = l.br ? RD : c; g.lineWidth = 1.3; g.stroke(); lt(g, l.t, LX + 7, l.y + 5, { s: fs, w: 900, c }); }); }
  shockNow(g, X, Y, y0, y1, { days: d.cur.p, unit: d.unit }, en, false);
  const lg2 = [[CY, (en ? 'Now (low ' : '今回（底 ') + (Hm ? d.lowHm : new Date(d.lowT).toISOString().slice(0, 10)) + (en ? ')' : '）'), 5, null], ['rgba(160,180,210,.6)', en ? 'older times (thin)' : 'さらに前の回（細線）', 1.6, null], [RD, en ? '× = broke the low · label = result' : (Hm ? '×＝安値を割った時・札＝結果' : '×＝前の底を割った日・札＝結果'), 2.4, [6, 4]]];
  lg2.forEach(([c, l, w, da], i) => { const xx = 40 + i * 380, y = 656; g.strokeStyle = c; g.lineWidth = w; g.setLineDash(da || []); g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + 34, y); g.stroke(); g.setLineDash([]); lt(g, l, xx + 42, y + 5, { s: 14, w: 800, c: '#e8f0fb' }); });
  g.strokeStyle = '#2a4466'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 708); g.lineTo(W - 36, 708); g.stroke();
  lt(g, en ? `Broke the low within ${ul}${ue}: ${d.brkN} of ${N} · held: ${ok}${d.a30Med != null ? ` (${ul}${ue} later, median ${sg(d.a30Med)})` : ''}` : `${ul}${Hm ? '時間' : '日'}以内に${Hm ? '安値' : '前の底'}を割った ${d.brkN}/${N}回・割らなかった ${ok}回${d.a30Med != null ? `（${ul}${Hm ? '時間' : '日'}後 中央値 ${sg(d.a30Med)}）` : ''}`, 40, 744, { s: en ? 17 : 19, w: 900 });
  lt(g, Hm ? (en ? `Drop = from the 24h high to the low after it. ${ul}h counted from the hour the bounce reached ${d.B}%. BTC: Binance BTCUSDT 1h.` : `下げ＝直近24時間の高値から、その後の安値まで。72時間は、安値から${d.B}%戻した時から数える。BTC＝Binance BTCUSDT 1時間足。`) : en ? `Low = lowest daily low in the last 21 days. Drop = from the 30-day high before the low. 30 days counted from the day the bounce reached ${d.B}%. BTC: Binance BTCUSDT daily.` : `底＝直近21日の日足の最安値。下げ＝底の前30日の高値から。30日は、底から${d.B}%戻した日から数える。BTC＝Binance BTCUSDT 日足。`, 40, 770, { s: 12, w: 700, c: M });
  lt(g, (en ? 'Past record. Not a forecast.' : '過去の記録で、今回も同じとは限りません') + ' · @csa_archive', W - 36, 792, { s: 12, w: 800, c: '#ff9a9a', a: 'right' });
}
// v318: この形、今年◯回目。0日目＝今日と同じ形だった日。その日の終値＝0%。前30日と後60日
function drawLike(g, d, lg) {
  const en = lg === 'en', CY = '#2ee6ff', CL = ['#ff8c1a', '#b28cff', '#19d3a2'], M = '#7f93ad', rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); }, sg = (v) => v == null ? '—' : (v > 0 ? '+' : '') + (+v).toFixed(1) + '%';
  const md = (t) => { const z = new Date(t); return `${z.getUTCFullYear()}/${z.getUTCMonth() + 1}/${z.getUTCDate()}`; }, mo = (t) => new Date(t).getUTCMonth() + 1, B = 30, AF = 60;
  shockFrame(g, lg, 'BTC / SAME SHAPE AGAIN');
  lt(g, 'BTC ' + (en ? d.fe : d.fj), 38, 80, { s: 22, w: 900, c: '#ff5c72' });   // v320: まず今の数字
  lt(g, en ? d.he : d.hj, 36, 132, { s: en ? 30 : 46, w: 900 });
  const FX = d.fixed != null;   // v324: 初回の日を0日目に固定して続ける版
  lt(g, FX ? (en ? `Day 0 = ${new Date(d.now.t).toISOString().slice(0, 10)}${d.noteEn ? ' (' + d.noteEn + ')' : ''}` : `0日目＝${new Date(d.now.t).toISOString().slice(0, 10)}${d.noteJa ? '（' + d.noteJa + '）' : ''}`) : en ? `Closest of ${d.N.toLocaleString('en-US')} days since 2017, on 6 measures` : `2017年以降の${d.N.toLocaleString('en-US')}日から、6つの物差しで今に近い日を探した`, 40, 162, { s: 15, w: 700, c: '#cfe0f2' });
  lt(g, FX ? (en ? 'For the past ones, day 0 = the day with the same shape. Close on day 0 = 0%' : '過去の回は、同じ形だった日を0日目に。0日目の終値＝0%') : en ? 'Day 0 = the matching day (now = today). That day\'s close = 0%' : '0日目＝同じ形だった日(今回＝今日)。その日の終値＝0%', 40, 184, { s: 13, w: 700, c: M });
  shockTop(g, d.rc.map((x, i) => [640 + i * 165, en ? `${md(x.t)} · day 60` : `${mo(x.t)}月型・60日後`, sg(x.a60), CL[i % CL.length], 30]), 0, en, en ? 'What came next' : 'その後');
  const all = [0].concat(...d.rc.map((x) => x.p.map((q) => q[1])), d.cur.map((q) => q[1]));
  const vmax = Math.ceil((Math.max(...all) + 3) / 10) * 10, vmin = Math.floor((Math.min(...all) - 3) / 10) * 10;
  const x0 = 100, x1 = 880, y0 = 200, y1 = 600, X = (dd) => x0 + (dd + B) / (B + AF) * (x1 - x0), Y = (v) => y0 + (vmax - Math.min(vmax, Math.max(vmin, v))) / (vmax - vmin) * (y1 - y0);
  g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(x0, y0, X(0) - x0, y1 - y0);
  for (let v = vmin; v <= vmax; v += 10) { g.strokeStyle = v ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.setLineDash(v ? [] : [6, 5]); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + v + '%', x0 - 12, Y(v) + 5, { s: 15, w: 800, f: LN, c: v ? M : '#fff', a: 'right' }); }
  for (let dd = -30; dd <= AF; dd += 15) { g.strokeStyle = 'rgba(255,255,255,.03)'; g.beginPath(); g.moveTo(X(dd), y0); g.lineTo(X(dd), y1); g.stroke(); lt(g, dd === 0 ? (en ? 'Day 0' : '0日目') : (dd > 0 ? '+' : '') + dd + (en ? 'd' : '日'), X(dd), y1 + 26, { s: 15, w: 800, c: dd === 0 ? '#fff' : '#cfe0f2', a: 'center' }); }
  lt(g, en ? 'the 30 days to day 0' : '0日目までの30日', (x0 + X(0)) / 2, y0 + 22, { s: 14, w: 800, c: M, a: 'center' }); lt(g, en ? 'what came next' : 'その後', (X(0) + x1) / 2, y0 + 22, { s: 14, w: 800, c: M, a: 'center' });
  const clip = [x0, y0 - 4, x1 - x0 + 8, y1 - y0 + 8];
  d.rc.forEach((x, i) => { shockLine(g, x.p.filter((q) => q[0] <= 0), CL[i % CL.length], 2.4, null, X, Y, clip); shockLine(g, x.p.filter((q) => q[0] >= 0), CL[i % CL.length], 3, [7, 5], X, Y, clip);
    if (x.lowD) { const q = x.p.find((z) => z[0] === x.lowD); if (q) { g.fillStyle = CL[i % CL.length]; g.beginPath(); g.arc(X(q[0]), Y(q[1]), 5, 0, 7); g.fill(); lt(g, (en ? 'low ' : '底') + sg(x.low), X(q[0]), Y(q[1]) + 22, { s: 13, w: 900, c: CL[i % CL.length], a: 'center' }); } } });
  { const labs = d.rc.map((x, i) => { const e = x.p[x.p.length - 1], res = x.rec === 0 ? (en ? 'never below' : '下回らず') : x.rec == null ? (en ? 'not back in 365d' : '365日内に戻らず') : (en ? `back in ${x.rec}d` : `${x.rec}日で元値`);
      return { i, x: X(e[0]), y: Y(e[1]), ey: Y(e[1]), t: (en ? md(x.t) : `${mo(x.t)}月型 ${md(x.t)}`), t2: `#${x.rank} · ${res}` }; }).sort((a, b) => a.y - b.y);
    labs.forEach((l) => { l.y = Math.max(y0 + 20, Math.min(y1 - 20, l.y)); }); for (let q = 1; q < labs.length; q++) if (labs[q].y - labs[q - 1].y < 50) labs[q].y = labs[q - 1].y + 50;
    const LX = x1 + 22, LW = W - 24 - LX;
    labs.forEach((l) => { const c = CL[l.i % CL.length]; g.strokeStyle = c; g.globalAlpha = .5; g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(l.x + 4, l.ey); g.lineTo(LX, l.y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      g.fillStyle = 'rgba(5,11,20,.92)'; rr(LX, l.y - 22, LW, 44, 6); g.fill(); g.strokeStyle = c; g.lineWidth = 1.5; g.stroke(); lt(g, l.t, LX + 9, l.y - 3, { s: 15, w: 900, c }); lt(g, (en ? '' : (l.t2.replace('#', '').replace(' · ', '位・'))) || l.t2, LX + 9, l.y + 16, { s: 13, w: 800, c: '#cfe0f2' }); }); }
  shockNow(g, X, Y, y0, y1, { days: d.cur }, en, false);
  const lg2 = [[CY, (en ? 'Now (day 0 = ' : '今回（0日目＝') + new Date(d.now.t).toISOString().slice(0, 10) + (en ? ')' : '）'), 5, null], ['#cfe0f2', en ? 'dashed = what came next · dot = the low' : '点線＝その後・点＝底', 2.4, [6, 4]]];
  lg2.forEach(([c, l, w, da], i) => { const xx = 40 + i * 420, y = 656; g.strokeStyle = c; g.lineWidth = w; g.setLineDash(da || []); g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + 34, y); g.stroke(); g.setLineDash([]); lt(g, l, xx + 42, y + 5, { s: 14, w: 800, c: '#e8f0fb' }); });
  g.strokeStyle = '#2a4466'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 708); g.lineTo(W - 36, 708); g.stroke();
  if (FX) lt(g, en ? `Now: day ${d.fixed}, ${d.fe}. ` + d.rc.map((x) => `${md(x.t)} type on day ${d.fixed}: ${sg(x.atN)}`).join(' · ') : `今回：${d.fixed}日目、${d.fj}。` + d.rc.map((x) => `${mo(x.t)}月型の同じ${d.fixed}日目 ${sg(x.atN)}`).join('・'), 40, 744, { s: en ? 16 : 18, w: 900 }); else
  lt(g, en ? `Now: 30 days ${sg(d.now.r30)} · ${sg(d.now.dd)} from ATH · Fear & Greed ${d.now.fng ?? '—'}${d.oth ? ` · (#${d.oth.rank}: ${md(d.oth.t)}, day 60 ${sg(d.oth.a60)})` : ''}` : `今回：30日 ${sg(d.now.r30)}・最高値から ${sg(d.now.dd)}・恐怖指数 ${d.now.fng ?? '—'}${d.oth ? `（${d.oth.rank}位は ${md(d.oth.t)}・60日後 ${sg(d.oth.a60)}）` : ''}`, 40, 744, { s: en ? 16 : 18, w: 900 });
  if (FX) lt(g, en ? 'Picked on 2026-11-17 by 6 measures (30-day shape, 30-day change, distance from ATH, 7-day shape, 14-day range, Fear & Greed). BTC: Binance BTCUSDT daily.' : '比べる回は、11/17に6つの物差し(1か月の形・30日の上げ下げ幅・最高値からの位置・1週間の形・14日の値幅・恐怖指数)の総合で選んだもの。BTC＝Binance BTCUSDT 日足。', 40, 770, { s: 12, w: 700, c: M }); else
  lt(g, en ? `6 measures: ${['30-day shape', '30-day change', 'distance from ATH', '7-day shape', '14-day range', 'Fear & Greed'].join(', ')}. Ranked on each, averaged. BTC: Binance BTCUSDT daily.` : `物差し＝${d.M.join('・')}。物差しごとの順位を平均。BTC＝Binance BTCUSDT 日足。恐怖指数＝alternative.me。`, 40, 770, { s: 12, w: 700, c: M });
  lt(g, (en ? 'Past record. Not a forecast.' : '過去の記録で、今回も同じとは限りません') + ' · @csa_archive', W - 36, 792, { s: 12, w: 800, c: '#ff9a9a', a: 'right' });
}
// v341: ニュース×相関。見出しはニュース(手入力)、数字と線は CSA の記録(24時間相関の7日分)。作り物の線は描かない
function drawNewsCorr(g, d, lg) {
  const en = lg === 'en', CY = '#2ee6ff', M = '#8ea2bf', sg = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2), rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const jd = (ms) => { const z = new Date(ms + 9 * 3600e3); return `${z.getUTCMonth() + 1}/${z.getUTCDate()} ${z.getUTCHours()}${en ? ':00 JST' : '時'}`; };
  shockFrame(g, lg, en ? 'NEWS × BTC / S&P 500' : 'NEWS × BTC / S&P 500');
  // 見出し(2行まで。入らなければ小さく)
  const head = en ? d.he : d.hj, wrap = (txt, fs) => { g.font = `900 ${fs}px ${LJ}`; const out = []; let cur = ''; for (const ch of [...txt]) { if (g.measureText(cur + ch).width > W - 90) { out.push(cur); cur = ch; } else cur += ch; } if (cur) out.push(cur); return out; };
  let fs = en ? 50 : 60, lines = wrap(head, fs); while (lines.length > 2 && fs > 32) { fs -= 4; lines = wrap(head, fs); }
  lines.slice(0, 3).forEach((l, k) => lt(g, l, 44, 112 + k * (fs + 10), { s: fs, w: 900 }));
  let y = 112 + Math.min(3, lines.length) * (fs + 10) - 6;
  const sub = (en ? d.sube : d.subj) || (en ? `BTC vs S&P 500: 24h correlation ${sg(d.ago)} → ${sg(d.now)}` : `BTCとS&P500の24時間相関、${sg(d.ago)} → ${sg(d.now)}`);
  lt(g, '— ' + sub + ' —', 46, y + 8, { s: 22, w: 800, c: CY }); y += 36;
  // 24時間前 → 今
  const bx = (x, lab, v, hi) => { g.fillStyle = hi ? 'rgba(46,230,255,.08)' : 'rgba(255,255,255,.04)'; rr(x, y, 330, 138, 12); g.fill(); g.strokeStyle = hi ? CY : '#2a4466'; g.lineWidth = hi ? 2 : 1.5; g.stroke();
    lt(g, lab, x + 165, y + 34, { s: 20, w: 800, c: '#cfe0f2', a: 'center' }); if (hi) { g.save(); g.shadowColor = CY; g.shadowBlur = 8; } lt(g, sg(v), x + 165, y + 100, { s: 64, w: 900, f: LN, c: hi ? CY : '#fff', a: 'center' }); if (hi) g.restore();
    lt(g, en ? '24h correlation' : '24時間相関', x + 165, y + 128, { s: 15, w: 700, c: M, a: 'center' }); };
  bx(44, d.ta ? jd(d.ta) : (en ? '24h ago' : '24時間前'), d.ago, false);
  g.fillStyle = CY; g.beginPath(); g.moveTo(410, y + 52); g.lineTo(446, y + 69); g.lineTo(410, y + 86); g.closePath(); g.fill();
  bx(470, jd(d.tn), d.now, true);
  lt(g, en ? '7-day range' : '直近7日の幅', 862, y + 40, { s: 18, w: 800, c: '#cfe0f2' }); lt(g, `${sg(d.lo)} 〜 ${sg(d.hi)}`, 862, y + 84, { s: 34, w: 900, f: LN });
  lt(g, en ? '1 = move together · 0 = unrelated' : '1＝同じ向き・0＝無関係・−1＝逆向き', 862, y + 116, { s: 13, w: 700, c: M });
  y += 168;
  // 24時間相関の7日分(CSA の記録)
  const x0 = 96, x1 = W - 60, y0 = y + 10, y1 = 700, n = d.r.length, X = (k) => x0 + k / Math.max(1, n - 1) * (x1 - x0), Y = (v) => y0 + (1 - v) / 2 * (y1 - y0);
  [1, 0.5, 0, -0.5, -1].forEach((v) => { g.strokeStyle = v === 0 ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.07)'; g.setLineDash(v === 0 || Math.abs(v) === 1 ? [] : [4, 6]); g.lineWidth = 1; g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + v, x0 - 12, Y(v) + 5, { s: 14, w: 700, f: LN, c: M, a: 'right' }); });
  for (let k = 0; k < n; k += 24) { const tt = d.t[k]; if (tt == null) continue; const z = new Date(tt + 9 * 3600e3); lt(g, `${z.getUTCMonth() + 1}/${z.getUTCDate()}`, X(k), y1 + 22, { s: 14, w: 700, c: M, a: 'center' }); }
  g.save(); g.shadowColor = CY; g.shadowBlur = 6; g.strokeStyle = CY; g.lineWidth = 2.6; g.beginPath(); let pen = false; d.r.forEach((v, k) => { if (v == null) { pen = false; return; } if (!pen) { g.moveTo(X(k), Y(v)); pen = true; } else g.lineTo(X(k), Y(v)); }); g.stroke(); g.restore();
  const mark = (k, v, c2, lab) => { if (k < 0 || v == null) return; g.fillStyle = c2; g.beginPath(); g.arc(X(k), Y(v), 6, 0, 7); g.fill(); lt(g, lab, X(k), Y(v) - 14, { s: 15, w: 900, f: LN, c: c2, a: 'center' }); };
  mark(d.i - 24, d.ago, '#ffffff', sg(d.ago)); mark(d.i, d.now, CY, sg(d.now));
  lt(g, en ? 'BTC × S&P 500, 24h correlation (hourly, 7 days) — CSA record' : 'BTC × S&P500 の24時間相関（1時間ごと・7日分）— CSAの記録', x0, y0 - 4, { s: 14, w: 800, c: '#cfe0f2' });
  // 下の段
  g.strokeStyle = '#2a4466'; g.lineWidth = 1; g.beginPath(); g.moveTo(36, 742); g.lineTo(W - 36, 742); g.stroke();
  lt(g, 'CSA', 44, 784, { s: 34, w: 900, f: LN }); g.fillStyle = '#2a4466'; g.fillRect(124, 756, 1.5, 34); g.font = `700 15px ${LN}`; g.fillStyle = '#cfe0f2'; g.letterSpacing = '4px'; g.fillText('CRYPTO SIGNAL ARCHIVE', 142, 779); g.letterSpacing = '0px';
  lt(g, en ? 'Correlation is not causation.' : '※相関は因果関係を示すものではありません。', W - 40, 766, { s: 13, w: 700, c: '#ff9a9a', a: 'right' });
  lt(g, (en ? 'Source: ' : '出典：') + ((en ? d.srce : d.src) ? (en ? d.srce : d.src) + (en ? '; ' : '、') : '') + (en ? 'CSA record (Pacifica 1h: BTC, S&P 500)' : 'CSAの記録（BTC・S&P500 1時間足）'), W - 40, 788, { s: 13, w: 700, c: M, a: 'right' });
}
// v342: ナイアガラ(縦長 1200×1500)。生のローソク足だけを大きく、下に「過去の同じ急落の答え」を1段
function drawNiagara(g, d, lg) {
  const en = lg === 'en', HH = 1500, UP = '#0ecb81', DN = '#f6465d', M = '#848e9c', $ = (v) => '$' + Math.round(v).toLocaleString('en-US');
  g.fillStyle = '#0b0e11'; g.fillRect(0, 0, W, HH);
  const b = d.bars, n = b.length, x0 = 40, x1 = W - 130, y0 = 330, y1 = 1170;
  const hi = Math.max(...b.map((x) => x[2])), lo = Math.min(...b.map((x) => x[3])), pad = (hi - lo) * 0.04, top = hi + pad, bot = lo - pad, Y = (v) => y0 + (top - v) / (top - bot) * (y1 - y0);
  const stp = (x1 - x0) / n, bw = Math.max(2, stp * 0.68);
  // 目盛り(右の価格)
  const rough = (top - bot) / 6, mag = Math.pow(10, Math.floor(Math.log10(rough))), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rough);
  for (let v = Math.ceil(bot / step) * step; v <= top; v += step) { g.strokeStyle = 'rgba(132,142,156,.10)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, Math.round(v).toLocaleString('en-US'), x1 + 12, Y(v) + 6, { s: 18, w: 600, f: LN, c: M }); }
  for (let k = 0; k < n; k++) { const [t, o, h, l, c] = b[k], up = c >= o, cx = x0 + stp * (k + 0.5); g.strokeStyle = g.fillStyle = up ? UP : DN; g.lineWidth = Math.max(1.2, bw * 0.14);
    g.beginPath(); g.moveTo(cx, Y(h)); g.lineTo(cx, Y(l)); g.stroke(); const yt = Y(Math.max(o, c)), yb = Y(Math.min(o, c)); g.fillRect(cx - bw / 2, yt, bw, Math.max(1.5, yb - yt)); }
  // 今の値段の札
  const yc = Y(d.now); g.setLineDash([3, 4]); g.strokeStyle = DN; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, yc); g.lineTo(x1, yc); g.stroke(); g.setLineDash([]);
  g.fillStyle = DN; g.fillRect(x1 + 4, yc - 16, 118, 32); lt(g, Math.round(d.now).toLocaleString('en-US'), x1 + 63, yc + 8, { s: 19, w: 800, f: LN, c: '#fff', a: 'center' });
  // 左上: 大きな下げ幅
  lt(g, 'BTC / USDT', 44, 70, { s: 26, w: 800, f: LN, c: '#eaecef' }); lt(g, (en ? d.tf + ' candles · Binance' : d.tf.replace('m', '分足').replace('1h', '1時間足') + ' · Binance'), 44, 104, { s: 18, w: 600, c: M });
  g.save(); g.shadowColor = 'rgba(246,70,93,.45)'; g.shadowBlur = 18; lt(g, (d.drop > 0 ? '+' : '') + d.drop.toFixed(1) + '%', 40, 232, { s: 132, w: 900, f: LN, c: d.drop < 0 ? DN : UP }); g.restore();
  const dur = d.durH < 1 ? Math.round(d.durH * 60) + (en ? 'm' : '分') : (Math.round(d.durH * 10) / 10) + (en ? 'h' : '時間');
  lt(g, `${$(d.hi)} → ${$(d.now)}   ·   ${en ? 'in ' + dur : dur + 'で'}`, 46, 290, { s: 28, w: 800, f: LN, c: '#eaecef' });
  const jt = new Date(d.nowT + 9 * 3600e3); lt(g, en ? new Date(d.nowT).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : `${jt.getUTCMonth() + 1}/${jt.getUTCDate()} ${String(jt.getUTCHours()).padStart(2, '0')}:${String(jt.getUTCMinutes()).padStart(2, '0')} 日本時間`, W - 44, 70, { s: 20, w: 700, c: M, a: 'right' });
  // 下の段: 過去の同じ急落
  g.fillStyle = '#12161c'; g.fillRect(0, 1200, W, 300); g.fillStyle = '#2ee6ff'; g.fillRect(0, 1200, W, 3);
  const st = d.st;
  if (st && st.N) { const pct = st.back / st.N;
    lt(g, en ? `${st.N} past drops of ${-st.TH}%+ within ${st.D}h (since ${st.y0})` : `${st.y0}年以降、${st.D}時間以内に${-st.TH}%以上下げた過去${st.N}回`, 44, 1256, { s: 26, w: 800, c: '#cfe0f2' });
    lt(g, en ? 'Won back half the drop within 24h' : '24時間以内に、下げ幅の半分を戻した', 44, 1312, { s: 30, w: 900, c: '#fff' });
    lt(g, `${st.back}`, 44, 1404, { s: 96, w: 900, f: LN, c: UP }); g.font = `900 96px ${LN}`; const w1 = g.measureText(`${st.back}`).width;
    lt(g, ` / ${st.N}${en ? '' : '回'}`, 44 + w1, 1404, { s: 44, w: 800, f: LN, c: '#cfe0f2' });
    const bx = 470, bw2 = W - 44 - bx; g.fillStyle = 'rgba(246,70,93,.35)'; g.fillRect(bx, 1350, bw2, 30); g.fillStyle = UP; g.fillRect(bx, 1350, bw2 * pct, 30);
    lt(g, en ? `won back ${st.back}` + (st.backMed != null ? ` (median ${st.backMed}h)` : '') : `戻した ${st.back}回` + (st.backMed != null ? `（中央値${st.backMed}時間）` : ''), bx, 1338, { s: 18, w: 800, c: UP });
    lt(g, en ? `didn't ${st.N - st.back}` : `戻さなかった ${st.N - st.back}回`, W - 44, 1338, { s: 18, w: 800, c: DN, a: 'right' }); }
  lt(g, (en ? 'Past record. Not a forecast.' : '過去の記録で、今回も同じとは限りません'), 44, 1470, { s: 16, w: 700, c: '#ff9a9a' });
  g.font = `700 13px ${LN}`; g.letterSpacing = '3px'; const tw = g.measureText('CRYPTO SIGNAL ARCHIVE').width; g.fillStyle = '#cfe0f2'; g.fillText('CRYPTO SIGNAL ARCHIVE', W - 44 - tw, 1468); g.letterSpacing = '0px'; lt(g, 'CSA', W - 56 - tw, 1474, { s: 30, w: 900, f: LN, a: 'right' });
}
export async function drawPost(p, lg) {
  await loadFonts(JSON.stringify(p.img) + 'イベント前後今日週来変動発表日本時間予定なしほか件翌年月日このあと前回指標重要度順同じ時間の変化米国市場外相関足強中程度弱逆連動無係時間前後直近' + '暗号資産ブーム危機歴史全体時価総額対数目盛り塗り輪盗まれ失われ面積波各テーマ資金量最大推定含主な時点数字並べ原因示直近月預かり資産貸し出しステーブル発行額取引高日ごと範囲一覧百万記録大きな終値今回年' + '強制決済買い売り証拠金足りなくなったポジション取引所強制的に決済されること銘柄別価格取得できませんでした下げたところで上げたまとめて清算された多かった最大時間ごと上下合算全市場' + '米中間選挙投票日年間最安確定伸びます例影響判断前後時間足終値破産申請' + '相関推移左軸右軸価格変化率同方向逆方向現在直近傾向関係はっきりした計算騰落率ぶん使って出来事原因影響向き分かりませんデータ不足流出急変動' + 'ショック後発生前日終値並べる比較同じ目今回前回水準戻るまで最安連鎖破綻崩壊上昇相場途中被害規模約倍ちがう基金全額補償発表出金停止週間足推計当時万億' + '定期更新区切り次動いたら' + '凍結未凍結保有積み上げ交換回数時間ごとアドレス持つ方向売る件現況独自追跡記録確認合計預けた別含まないウォレット出金大きさ量四角今回取得できず数字すべて入金売却証拠ではありません出典前回から発生替え日本' + '❄🔒🧊最初受取先残っている行き先時系列日本時間刻送り先コントラクトへ' + '過去最大の流出今回発生から12時間資金動き確定疑い未確認新しい送金先数今ここ凍結億ドルのまま約万上記録交換分散移動別小分け以内' + '巨額清算額直近銘柄別ロングショート記録は途中からの最大1件全市場ではありません公開清算ストリームの合算' + '今のBTCがなぞっている過去実況一致率点線＝その後予測月火水木金土日〜予定これまでの投稿同じ日主要な指標はありませんほか件資金はどこへ送金新しい送金先交換コントラクトへ件数最初追跡終わり方残存段数上限未追跡確定オンチェーン記録証拠大型ハッキング流出疑い未確認発生声明まで、あと戻るのか同じような前の価格に戻った以内中央値形が近かった回復日予測記録直近急落急騰その後下げた上げた回中以上水色今回点線時間半分今回に最も似た重ねる各回の発表前形状比較は返信へ①②③確率ではありません上昇下落結果並べ残り選定使計算基準価格騰落率' + '平常日比直前中央値取り直し数時間のみを含む次の清算経済指標発表を含む反応棒今回過去各回太線細線倍率平均因果示すものではありませんの合算1時間足あたり' + '元値超さらに細線新しい札結果まだ戻っていない目底割れ割らず後前安値戻した日足最直近数える今形年回探物差型位下上方時間急落議事要旨崩金融融議論無関係逆向因果示記録出典足分以内半分戻'  + '恐怖指数極度中立以上なった初めて水準ほか推定' + '戻るまで目分からない' + '最高値半値割れいまそれぞれ底前下げ相場以下最安' + '連続米国価格下回る始まった終了終わった後異なる除外ずれ' + '大量清算の後山積み上がったまだ戻る' + 'ランキング推移' + '時期のうち位今回下回近かった' + '平常時倍番目順位多かった' + '多さ位真ん中最も少ない棒ごと' + '年以降すべての日変化ロング清算建玉匹敵する回前後終値割合倍条件入る少ないため差小さい順合計無期限記録上' + '事件疑惑中後' + 'AI暗号資産主要企業トップ突然退いた日今ここ選び方性質それぞれ違います破産解任司法取引辞任伝えられた氏' + '今回の下げと形が最も近い過去当時この先はまだ分からない米大きな流出破綻同じ時期に起きたことで原因とは限りません出来事記録すべて日前目後' + '参考直前細い点線左うち' + '同じだけここから最も近い形差最小予想ではありませんそろえた前線' + '下げた後回その後日間どうだったか今回より上下幅底をつけるまで中央値最大半分入る帯すべて範囲届いた初めて変化あける足終値安値点古い順そこから' + '今日同じ形をした過去日直近いま一致率窓始まり差小さい順選離右側終わり変化相関確率' + '反発歴史下げた後各回中央値直近最大始値終値以下続き数える範囲超えた線端切っています上戻った' + '大型上場日どう動いたか前後今夜終値いまここから先週間後過去記録今回同じとは限りません時期原因示米国市場取引開始時間分足金との相関線何なのか日足直近いま上から来た回年持ちこたえた割り込んだ付安値後線からに入った終値下底サイン点灯定義先固定判定週足連続安高値極度恐怖資金調達率建玉急減指数平均不可以降全部中央値新回うち最安価格出典強欲史上最大つ同じ値段だったそのとき週ほぼ前回道重ねると横縦目先記録だけ安値凡例日で度目のパニック売りまで戻った清算億ドル超約今夜時間足報道週足が以上続けて下げた時期年以降で回今を含む薄い赤連続終わって後暫定月曜始まり重ねると前の終値横は週天井そこから底いま下げ幅を戻した分足刻日本直近' + p[lg]);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const g = cv.getContext('2d');
  if (p.sr === 'ipo' && p.img && p.img.ipo) { cv.width = W; cv.height = 1500; drawIpo(g, p.img.ipo, lg); return cv; }   // v343: 大型上場の日
  if (p.sr === 'bounce' && p.img && p.img.bounce) { cv.width = W; cv.height = 1350; drawBounce(g, p.img.bounce, lg); return cv; }   // v359: 天井→底→いま
  if (p.sr === 'streak' && p.img && p.img.streak) { cv.width = W; cv.height = 1350; drawStreak(g, p.img.streak, lg); return cv; }   // v355: 週足の連続安
  if (p.sr === 'panic' && p.img && p.img.panic) { cv.width = W; cv.height = 1350; drawPanic(g, p.img.panic, lg); return cv; }   // v352: パニック売り
  if (p.sr === 'twin' && p.img && p.img.twin) { cv.width = W; cv.height = 1350; drawTwin(g, p.img.twin, lg); return cv; }   // v350: 2つの上場
  if (p.sr === 'sig' && p.img && p.img.sig) { cv.width = W; cv.height = 1500; drawSig(g, p.img.sig, lg); return cv; }   // v349: 底のサイン
  if (p.sr === 'line' && p.img && p.img.line) { cv.width = W; cv.height = 1500; drawLine(g, p.img.line, lg); return cv; }   // v348: 価格の線
  if (p.sr === 'niagara' && p.img && p.img.nia) { cv.width = W; cv.height = 1500; drawNiagara(g, p.img.nia, lg); return cv; }   // v342: 縦長
  if (p.sr === 'histw' && p.img && p.img.hist) { cv.width = 1440; cv.height = 1300; drawHistW(g, p.img.hist, lg); return cv; }   // v273
  if (p.sr === 'histm' && p.img && p.img.month) { cv.width = 1440; cv.height = 1100; drawHistM(g, p.img.month, lg); return cv; }   // v273
  if (p.sr === 'history' && p.img && p.img.src) {   // v272: 出来上がった画像を読み込むだけ(年表)
    const im = new Image(); im.src = p.img.src[lg] || p.img.src.ja; await new Promise((r, j) => { im.onload = r; im.onerror = j; });
    cv.width = im.naturalWidth; cv.height = im.naturalHeight; g.drawImage(im, 0, 0); return cv;
  }
  // v203: 色(上の帯・背景)を中身で決める。上げ = 緑・下げ = 赤・予定やまとめ = 青・値動きの大きさ = 金・清算の反応 = 紫
  const im = p.img || {}, sgn = (v) => v == null ? TONES.blue : v < 0 ? TONES.red : TONES.green;
  TONE = p.sr === 'pat' ? sgn(im.q && im.q.chg) : p.sr === 'spike' ? sgn(im.coins && im.coins.BTC) : p.sr === 'arch' ? sgn(im.coins && im.coins.BTC ? im.coins.BTC.c60 : im.chg)
    : p.sr === 'week' ? sgn(im.coins && im.coins.BTC ? im.coins.BTC.chg : null) : p.sr === 'vol' ? TONES.gold : p.sr === 'liq' || p.sr === 'liqday' ? TONES.red : p.sr === 'liqimp' ? TONES.purple : TONES.blue;
  const LV = p.img && p.img.live && p.img.live[lg];   // v204: 毎朝・夜は BTC実況の画像
  if (p.sr === 'fng' && p.img && p.img.fng) { cv.height = LH; drawFng(g, p.img.fng, lg); }   // v305
  else if (p.sr === 'vreb' && p.img && p.img.vreb) { cv.height = LH; drawVreb(g, p.img.vreb, lg); }   // v313
  else if (p.sr === 'like' && p.img && p.img.like) { cv.height = LH; drawLike(g, p.img.like, lg); }   // v318
  else if (p.sr === 'newscorr' && p.img && p.img.nc) { cv.height = LH; drawNewsCorr(g, p.img.nc, lg); }   // v341
  else if (p.sr === 'half' && p.img && p.img.half) { cv.height = LH; drawHalf(g, p.img.half, lg); }   // v303
  else if (p.sr === 'cbprem' && p.img && p.img.cb) { cv.height = LH; drawCbPrem(g, p.img.cb, lg); }   // v302
  else if (p.sr === 'liqshock' && p.img && p.img.ls) { cv.height = LH; drawLiqShock(g, p.img.ls, lg); }   // v299
  else if (p.sr === 'liqcmp' && p.img && p.img.lq) { cv.height = LH; drawLiqCmp(g, p.img.lq, lg); }   // v289
  else if (p.sr === 'ceo' && p.img && p.img.ceo) { cv.height = LH; drawCeo(g, p.img.ceo, lg); }   // v286
  else if (p.sr === 'dropcmp' && p.img && p.img.cmp) { cv.height = LH; drawDropCmp(g, p.img.cmp, lg); }   // v285
  else if (p.sr === 'drop' && p.img && p.img.drop) { cv.height = LH; drawDrop(g, p.img.drop, lg); }   // v284
  else if (p.sr === 'samepath' && p.img && p.img.same) { cv.height = LH; drawSame(g, p.img.same, lg); }   // v279
  else if (p.sr === 'rebound' && p.img && p.img.reb) { cv.height = LH; drawReb(g, p.img.reb, lg); }   // v279
  else if (p.sr === 'midterm' && p.img && p.img.mid) { cv.height = LH; drawMidterm(g, p.img.mid, lg); }   // v260
  else if (p.sr === 'corrts' && p.img && p.img.corr) { cv.height = LH; drawCorrTs(g, p.img.corr, lg); }   // v259
  else if (p.sr === 'shockbn' && p.img && p.img.shock) { cv.height = LH; drawShockBn(g, p.img.shock, lg); }   // v243
  else if (p.sr === 'shockcmp' && p.img && p.img.shock) { cv.height = LH; drawShockCmp(g, p.img.shock, lg); }   // v243
  else if (p.sr === 'bnstatus' && p.img && p.img.bn) { cv.height = LH; drawBnStatus(g, p.img.bn, p.img.ch, lg); }   // v237
  else if (p.sr === 'chainflow' && p.img && p.img.chainflow) { cv.height = LH; drawChainFlow(g, p.img.chainflow, lg); }   // v227
  else if (p.sr === 'chaincmp' && p.img && p.img.chaincmp) { cv.height = LH; drawChainCmp(g, p.img.chaincmp, lg); }   // v226
  else if (p.sr === 'chain') return null;   // v224: 資金の追跡の画像は、実データを見てから決めた形(時系列の帯・木の図)で作る。それまでは本文だけ
  else if (LV && LV.kind === 'hack') { cv.height = LH; drawHack(g, LV, lg); }   // v221
  else if (LV && LV.top && LV.top.length) { cv.height = LH; drawLive(g, LV, lg); }   // v206: 全ての種類で使う
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
  else if ((p.sr === 'liq' || p.sr === 'liqday') && p.img && p.img.px) { cv.height = LH; drawLiq2(g, p.img, lg); }   // v278: BTC の価格がある時は新しい画像
  else if (p.sr === 'liq' || p.sr === 'liqday') drawLiq(g, p.img, lg);   // v152
  else if (p.sr === 'liqimp') drawLiqImp(g, p.img, lg);   // v171
  else return null;
  return cv;
}
export { W, Hh, loadFonts };
// v344→v345: 大型上場の日 × BTC(縦長 1200×1500)。取引開始＝0%で1枚に重ねる。過去は光る線(15分足の終値)、今回は15分足のローソク(ナイアガラと同じ密度)
function drawIpo(g, d, lg) {
  const en = lg === 'en', HH = 1500, UP = '#0ecb81', DN = '#f6465d', M = '#848e9c', OR = '#f7931a', H1 = 36e5, $ = (v) => '$' + Math.round(v).toLocaleString('en-US'), sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const LC = { coin: '#4c8dff', spcx: '#e8e8f0' };
  g.fillStyle = '#040507'; g.fillRect(0, 0, W, HH);
  lt(g, 'BIG LISTING DAYS × BTC', 44, 62, { s: 20, w: 800, f: LN, c: OR });
  lt(g, en ? 'BTC on big listing days' : '大型上場の日、BTCはどう動いたか', 44, 124, { s: 50, w: 900, c: '#f2f4f8' });
  lt(g, en ? 'US market open on listing day (NY 9:30) = 0% · BTC/USDT 15m · Binance' : '上場日の米国市場の取引開始（NY 9:30）＝0%・BTC/USDT 15分足・Binance', 44, 166, { s: 18, w: 600, c: M });
  const S = d.evs.map((e) => { const st = e.st, base = st.base; return { e, st, b: base ? (e.bars || []).map(([t, o, h, l, c]) => [(t - st.t0) / H1, (o / base - 1) * 100, (h / base - 1) * 100, (l / base - 1) * 100, (c / base - 1) * 100]).filter((r) => r[0] >= -IPO_PRE && r[0] < IPO_POST) : [] }; });
  const all = S.flatMap((x) => x.st.live ? x.b.flatMap((r) => [r[2], r[3]]) : x.b.map((r) => r[4])); if (!all.length) return;
  let hi = Math.max(...all, 0.5), lo = Math.min(...all, -0.5); const pd = (hi - lo) * 0.06; hi += pd; lo -= pd;
  const x0 = 50, x1 = W - 140, y0 = 220, y1 = 1200, N = IPO_PRE + IPO_POST, stp = (x1 - x0) / (N * H1 / IPO_STEP), X = (h) => x0 + (h + IPO_PRE) / N * (x1 - x0) + stp / 2, Y = (v) => y0 + (hi - v) / (hi - lo) * (y1 - y0);
  const rough = (hi - lo) / 8, mag = Math.pow(10, Math.floor(Math.log10(rough))), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rough);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { const z = Math.abs(v) < 1e-9; g.strokeStyle = z ? 'rgba(247,147,26,.55)' : 'rgba(132,142,156,.10)'; g.lineWidth = z ? 1.5 : 1; g.setLineDash(z ? [6, 6] : []); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + (+v.toFixed(2)) + '%', x1 + 14, Y(v) + 6, { s: 17, w: 700, f: LN, c: z ? OR : M }); }
  g.strokeStyle = 'rgba(247,147,26,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(0) - stp / 2, y0); g.lineTo(X(0) - stp / 2, y1); g.stroke();
  for (const h of [-24, -12, 0, 12, 24]) lt(g, h === 0 ? (en ? 'market open' : '取引開始') : (h > 0 ? '+' : '−') + Math.abs(h) + (en ? 'h' : '時間'), h === 24 ? x1 : X(h) - stp / 2, y1 + 32, { s: 17, w: h === 0 || h === 24 ? 900 : 700, c: h === 0 ? OR : h === 24 ? '#cfe0f2' : M, a: h === 24 ? 'right' : h === -24 ? 'left' : 'center' });
  for (const x of S.filter((q) => !q.st.live)) { const c = LC[x.e.k] || '#ccc'; g.save(); g.globalAlpha = .8; g.shadowColor = c; g.shadowBlur = 6; g.strokeStyle = c; g.lineWidth = 2.4; g.lineJoin = 'round'; g.beginPath(); x.b.forEach((r, j) => j ? g.lineTo(X(r[0]), Y(r[4])) : g.moveTo(X(r[0]), Y(r[4]))); g.stroke(); g.restore();
    const L = x.b[x.b.length - 1]; if (L && x.st.h24 != null) { const v = x.st.h24; g.fillStyle = '#040507'; g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.arc(X(L[0]), Y(v), 8, 0, 7); g.fill(); g.stroke();
      const ty = Y(v) + (v >= 0 ? -16 : 36); g.font = `900 28px ${LN}`; const tw2 = g.measureText(sg(v)).width; g.fillStyle = 'rgba(4,5,7,.88)'; g.fillRect(X(L[0]) - tw2 - 14, ty - 26, tw2 + 10, 34); lt(g, sg(v), X(L[0]) - 9, ty, { s: 28, w: 900, f: LN, c, a: 'right', glow: c, b: 8 }); } }
  const cur = S.find((q) => q.st.live); if (cur) { const bw = Math.max(2, stp * 0.66);
    for (const [k, o, h, l, c] of cur.b) { const cx = X(k), up = c >= o; g.strokeStyle = g.fillStyle = up ? UP : DN; g.lineWidth = Math.max(1.2, bw * 0.16);
      g.beginPath(); g.moveTo(cx, Y(h)); g.lineTo(cx, Y(l)); g.stroke(); const yt = Y(Math.max(o, c)), yb = Y(Math.min(o, c)); g.fillRect(cx - bw / 2, yt, bw, Math.max(1.5, yb - yt)); }
    const lk = cur.b[cur.b.length - 1]; if (lk) { const yc = Y(lk[4]); g.setLineDash([3, 4]); g.strokeStyle = OR; g.lineWidth = 1; g.beginPath(); g.moveTo(X(lk[0]), yc); g.lineTo(x1, yc); g.stroke(); g.setLineDash([]); g.fillStyle = OR; g.fillRect(x1 + 4, yc - 16, 128, 32); lt(g, Math.round(cur.st.last).toLocaleString('en-US'), x1 + 68, yc + 8, { s: 19, w: 800, f: LN, c: '#000', a: 'center' }); }
    const xs = Math.max(X(0) - stp / 2, lk ? X(lk[0]) + stp : 0); g.setLineDash([5, 7]); g.strokeStyle = 'rgba(247,147,26,.35)'; g.lineWidth = 1.2; g.strokeRect(xs + 10, y0 + 10, x1 - xs - 20, 200); g.setLineDash([]);
    lt(g, '?', (xs + x1) / 2, y0 + 136, { s: 110, w: 900, f: LN, c: OR, a: 'center', glow: 'rgba(247,147,26,.7)', b: 14 }); lt(g, en ? 'Anthropic: from here' : 'Anthropic：ここから先', (xs + x1) / 2, y0 + 186, { s: 20, w: 800, c: '#d8b07a', a: 'center' }); }
  g.fillStyle = '#0c0e13'; g.fillRect(0, 1262, W, 238); g.fillStyle = OR; g.fillRect(0, 1262, W, 2);
  S.forEach((x, i) => { const yy = 1308 + i * 52, c = x.st.live ? OR : LC[x.e.k];
    if (x.st.live) { g.fillStyle = UP; g.fillRect(44, yy - 22, 10, 24); g.fillStyle = DN; g.fillRect(58, yy - 16, 10, 18); } else { g.save(); g.shadowColor = c; g.shadowBlur = 8; g.fillStyle = c; g.fillRect(44, yy - 12, 26, 5); g.restore(); }
    lt(g, (en ? x.e.en : x.e.ja) + '  ' + x.e.d.replace(/-/g, '.'), 88, yy, { s: 24, w: 900, c: '#f2f4f8' });
    const r = x.st.live ? (en ? `now ${$(x.st.last)} · opens tonight` : `いま ${$(x.st.last)}・今夜取引開始`) : (en ? `open ${$(x.st.open)}` : `取引開始 ${$(x.st.open)}`) + (x.st.h24 != null ? (en ? `  →  24h ${sg(x.st.h24)}` : `  →  24時間後 ${sg(x.st.h24)}`) : '');
    lt(g, r, W - 44, yy, { s: 22, w: 800, f: LN, c, a: 'right' }); });
  lt(g, en ? 'Past record. Not a forecast. Same-period moves, not causes.' : '過去の記録で、今回も同じとは限りません（同じ時期の動きで、原因は示しません）', 44, HH - 30, { s: 15, w: 700, c: '#ff9a9a' });
  g.font = `700 13px ${LN}`; g.letterSpacing = '3px'; const tw = g.measureText('CRYPTO SIGNAL ARCHIVE').width; g.fillStyle = '#cfe0f2'; g.fillText('CRYPTO SIGNAL ARCHIVE', W - 44 - tw, HH - 32); g.letterSpacing = '0px'; lt(g, 'CSA', W - 56 - tw, HH - 26, { s: 30, w: 900, f: LN, a: 'right' });
}
// v348: 価格の線の過去(縦長 1200×1500)。直近360日の3日足ローソク＋光る水平線、上から来た回に番号、下に過去の回の表
function drawLine(g, d, lg) {
  const en = lg === 'en', HH = 1500, UP = '#0ecb81', DN = '#f6465d', M = '#848e9c', OR = '#f7931a', CY = '#2ee6ff', $ = (v) => '$' + Math.round(v).toLocaleString('en-US');
  g.fillStyle = '#040507'; g.fillRect(0, 0, W, HH);
  lt(g, 'BTC / PRICE LINE / RECORD', 44, 62, { s: 20, w: 800, f: LN, c: CY });
  lt(g, en ? `What is the ${$(d.L)} line?` : `${$(d.L)}の線は、何なのか`, 44, 124, { s: 52, w: 900, c: '#f2f4f8' });
  lt(g, en ? `BTC/USDT 3-day candles · last 360 days · now ${$(d.now)} · Binance` : `BTC/USDT 3日足・直近360日・いま ${$(d.now)}・Binance`, 44, 166, { s: 18, w: 600, c: M });
  const b = d.bars; if (!b.length) return;
  let hi = Math.max(...b.map((x) => x[2])), lo = Math.min(...b.map((x) => x[3]), d.L * 0.97); const pd = (hi - lo) * 0.05; hi += pd; lo -= pd;
  const x0 = 44, x1 = W - 150, y0 = 210, y1 = 940, stp = (x1 - x0) / b.length, bw = Math.max(2, stp * 0.66), X = (i) => x0 + stp * (i + 0.5), Y = (v) => y0 + (hi - v) / (hi - lo) * (y1 - y0);
  const rough = (hi - lo) / 7, mag = Math.pow(10, Math.floor(Math.log10(rough))), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rough);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { g.strokeStyle = 'rgba(132,142,156,.10)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, Math.round(v).toLocaleString('en-US'), x1 + 12, Y(v) + 6, { s: 16, w: 600, f: LN, c: M }); }
  g.fillStyle = 'rgba(46,230,255,.07)'; g.fillRect(x0, Y(d.L * 1.015), x1 - x0, Y(d.L * 0.985) - Y(d.L * 1.015));
  for (let i = 0; i < b.length; i++) { const [, o, h, l, c] = b[i], cx = X(i), up = c >= o; g.strokeStyle = g.fillStyle = up ? UP : DN; g.lineWidth = Math.max(1.2, bw * 0.16); g.beginPath(); g.moveTo(cx, Y(h)); g.lineTo(cx, Y(l)); g.stroke(); const yt = Y(Math.max(o, c)), yb = Y(Math.min(o, c)); g.fillRect(cx - bw / 2, yt, bw, Math.max(1.5, yb - yt)); }
  g.save(); g.shadowColor = CY; g.shadowBlur = 12; g.strokeStyle = CY; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x0, Y(d.L)); g.lineTo(x1, Y(d.L)); g.stroke(); g.restore();
  g.fillStyle = CY; g.fillRect(x1 + 4, Y(d.L) - 17, 136, 34); lt(g, Math.round(d.L).toLocaleString('en-US'), x1 + 72, Y(d.L) + 8, { s: 20, w: 900, f: LN, c: '#000', a: 'center' });
  const t0 = b[0][0], i3 = (t) => Math.floor((t - t0) / (3 * 864e5)), nums = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'], shown = d.ev.slice(-9);
  shown.forEach((e, k) => { const i = i3(e.t); if (i < 0 || i >= b.length) return; const c = e.live ? OR : e.broke ? DN : UP; g.fillStyle = c; g.beginPath(); g.moveTo(X(i), Y(d.L) + 14); g.lineTo(X(i) - 9, Y(d.L) + 30); g.lineTo(X(i) + 9, Y(d.L) + 30); g.fill(); lt(g, nums[k], X(i), Y(d.L) + 58, { s: 24, w: 900, c, a: 'center' }); });
  const mo = (t) => { const z = new Date(t); return en ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][z.getUTCMonth()] + (z.getUTCMonth() ? '' : ' ' + z.getUTCFullYear()) : (z.getUTCMonth() ? '' : z.getUTCFullYear() + '年') + (z.getUTCMonth() + 1) + '月'; };
  for (let i = 0, lm = -1; i < b.length; i++) { const m = new Date(b[i][0]).getUTCMonth(); if (m !== lm && i > 0 && m % 2 === 0) lt(g, mo(b[i][0]), X(i), y1 + 30, { s: 15, w: 700, c: M, a: 'center' }); lm = m; }
  g.fillStyle = '#0a0d12'; g.fillRect(0, 990, W, 510); g.fillStyle = CY; g.fillRect(0, 990, W, 2);
  lt(g, en ? `Visits to this line from above (${d.yrs} years)` : `上からこの線に来た回（${d.yrs}年）`, 44, 1036, { s: 24, w: 900, c: '#f2f4f8' });
  const tot = d.n || 1, bwid = W - 88; g.fillStyle = UP; g.fillRect(44, 1056, bwid * d.held / tot, 30); g.fillStyle = DN; g.fillRect(44 + bwid * d.held / tot, 1056, bwid * d.broke / tot, 30);
  lt(g, (en ? 'Held ' : '持ちこたえた ') + d.held, 54, 1080, { s: 20, w: 900, c: '#04120b' }); if (d.broke) lt(g, (en ? 'Broke ' : '割り込んだ ') + d.broke, W - 54, 1080, { s: 20, w: 900, c: '#1a0508', a: 'right' });
  const fd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '.'), rows = shown.slice(-6);
  [[44, en ? 'Date' : '日付'], [330, en ? 'Next 30 days' : 'その後30日'], [620, en ? 'Low' : '安値'], [880, en ? '30d later vs line' : '30日後（線から）']].forEach(([x, l]) => lt(g, l, x, 1130, { s: 16, w: 700, c: M }));
  rows.forEach((e, r) => { const yy = 1170 + r * 40, k = shown.indexOf(e), c = e.live ? OR : e.broke ? DN : UP;
    lt(g, nums[k] + ' ' + fd(e.t), 44, yy, { s: 21, w: 800, f: LN, c: '#e8ecf2' });
    lt(g, e.live ? (en ? 'now' : 'いま') : e.broke ? (en ? 'broke' : '割り込んだ') : (en ? 'held' : '持ちこたえた'), 330, yy, { s: 21, w: 900, c });
    lt(g, $(e.low), 620, yy, { s: 21, w: 800, f: LN, c: '#cfd6e0' }); lt(g, e.d30 == null ? '—' : (e.d30 >= 0 ? '+' : '') + e.d30 + '%', 880, yy, { s: 21, w: 900, f: LN, c: e.d30 == null ? M : e.d30 >= 0 ? UP : DN }); });
  lt(g, en ? 'Visit = daily low enters ±1.5% after 10 days above it (with a close 3%+ above). Broke = a daily close 3%+ below within 30 days.' : '来た回＝直前10日は線より上（終値が3%上の日あり）で、安値が線の±1.5%に入った日。割り込んだ＝30日以内に終値が線の3%下。', 44, HH - 58, { s: 14, w: 600, c: M });
  lt(g, en ? 'Past record. Not a forecast.' : '過去の記録で、今回も同じとは限りません', 44, HH - 30, { s: 15, w: 700, c: '#ff9a9a' });
  g.font = `700 13px ${LN}`; g.letterSpacing = '3px'; const tw = g.measureText('CRYPTO SIGNAL ARCHIVE').width; g.fillStyle = '#cfe0f2'; g.fillText('CRYPTO SIGNAL ARCHIVE', W - 44 - tw, HH - 32); g.letterSpacing = '0px'; lt(g, 'CSA', W - 56 - tw, HH - 26, { s: 30, w: 900, f: LN, a: 'right' });
}
// v349: 底のサイン点灯数(縦長 1200×1500)。上に5つのランプと今の値、中に直近360日の3日足と4つ以上点灯した日の印、下に過去の回の表と「90日後 上/下」の帯
function drawSig(g, d, lg) {
  const en = lg === 'en', HH = 1500, UP = '#0ecb81', DN = '#f6465d', M = '#848e9c', OR = '#f7931a', LT = '#ffd84d', $ = (v) => '$' + Math.round(v).toLocaleString('en-US'), sg = (v, f = 1) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(f) + '%';
  g.fillStyle = '#040507'; g.fillRect(0, 0, W, HH);
  const nw = d.now; lt(g, 'BTC / BOTTOM SIGNALS', 44, 62, { s: 20, w: 800, f: LN, c: LT });
  lt(g, en ? `Bottom signals: ${nw.lit} of 5 lit` : `底のサイン、いま ${nw.lit}/5`, 44, 126, { s: 56, w: 900, c: '#f2f4f8' });
  lt(g, en ? `Definitions fixed in advance · daily close (UTC) · now ${$(nw.c)}` : `定義は先に固定・日足の終値（UTC）で判定・いま ${$(nw.c)}`, 44, 168, { s: 18, w: 600, c: M });
  const nm = en ? ['Weekly streak', '30%+ off high', 'Extreme fear', 'Funding ≤ 0', 'OI flush'] : ['週足の連続安', '高値から-30%', '極度の恐怖', '資金調達率≤0', '建玉の急減'];
  const vv = [nw.v[0] + (en ? ' wks' : '週連続'), sg(nw.v[1]), nw.v[2] == null ? '—' : (en ? 'F&G ' : '指数 ') + nw.v[2], nw.v[3] == null ? '—' : (en ? '7d avg ' : '7日平均 ') + (nw.v[3] >= 0 ? '+' : '') + nw.v[3].toFixed(4) + '%', nw.v[4] == null ? '—' : (en ? '14d ' : '14日 ') + sg(nw.v[4])];
  const cw = (W - 88 - 4 * 14) / 5;
  nm.forEach((t, i) => { const x = 44 + i * (cw + 14), on = nw.s[i] === true, na = nw.s[i] == null; g.fillStyle = on ? '#1a1606' : '#0b0d11'; g.fillRect(x, 196, cw, 150); g.strokeStyle = on ? LT : '#1d222b'; g.lineWidth = on ? 2 : 1; g.strokeRect(x, 196, cw, 150);
    g.save(); if (on) { g.shadowColor = LT; g.shadowBlur = 14; } g.fillStyle = on ? LT : na ? '#2a2f38' : '#252a33'; g.beginPath(); g.arc(x + cw / 2, 236, 16, 0, 7); g.fill(); g.restore();
    lt(g, t, x + cw / 2, 290, { s: 19, w: 900, c: on ? '#f8f2d8' : '#8a929e', a: 'center' }); lt(g, na ? (en ? 'n/a' : '判定不可') : vv[i], x + cw / 2, 324, { s: 16, w: 700, f: LN, c: on ? LT : M, a: 'center' }); });
  const b = d.bars; if (b.length) {
    let hi = Math.max(...b.map((x) => x[2])), lo = Math.min(...b.map((x) => x[3])); const pd = (hi - lo) * 0.05; hi += pd; lo -= pd;
    const x0 = 44, x1 = W - 140, y0 = 390, y1 = 900, stp = (x1 - x0) / b.length, bw = Math.max(2, stp * 0.66), X = (i) => x0 + stp * (i + 0.5), Y = (v) => y0 + (hi - v) / (hi - lo) * (y1 - y0);
    const rough = (hi - lo) / 6, mag = Math.pow(10, Math.floor(Math.log10(rough))), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rough);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { g.strokeStyle = 'rgba(132,142,156,.10)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, Math.round(v).toLocaleString('en-US'), x1 + 12, Y(v) + 6, { s: 16, w: 600, f: LN, c: M }); }
    for (let i = 0; i < b.length; i++) { const [, o, h, l, c] = b[i], cx = X(i), up = c >= o; g.strokeStyle = g.fillStyle = up ? UP : DN; g.lineWidth = Math.max(1.2, bw * 0.16); g.beginPath(); g.moveTo(cx, Y(h)); g.lineTo(cx, Y(l)); g.stroke(); const yt = Y(Math.max(o, c)), yb = Y(Math.min(o, c)); g.fillRect(cx - bw / 2, yt, bw, Math.max(1.5, yb - yt)); }
    const t0 = b[0][0]; for (const e of d.ev) { const i = Math.floor((e.t - t0) / (3 * 864e5)); if (i < 0 || i >= b.length) continue; g.save(); g.shadowColor = LT; g.shadowBlur = 10; g.fillStyle = LT; g.beginPath(); g.moveTo(X(i), Y(b[i][3]) + 12); g.lineTo(X(i) - 9, Y(b[i][3]) + 28); g.lineTo(X(i) + 9, Y(b[i][3]) + 28); g.fill(); g.restore(); }
    for (let i = 0, lm = -1; i < b.length; i++) { const z = new Date(b[i][0]), m = z.getUTCMonth(); if (m !== lm && i > 0 && m % 2 === 0) lt(g, en ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m] + (m ? '' : ' ' + z.getUTCFullYear()) : (m ? '' : z.getUTCFullYear() + '年') + (m + 1) + '月', X(i), y1 + 30, { s: 15, w: 700, c: M, a: 'center' }); lm = m; }
    lt(g, en ? '▲ 4+ signals lit' : '▲ 4つ以上点灯した日', x0, y0 - 8, { s: 15, w: 800, c: LT }); }
  g.fillStyle = '#0a0d12'; g.fillRect(0, 950, W, 550); g.fillStyle = LT; g.fillRect(0, 950, W, 2);
  const yr = new Date(d.from).getUTCFullYear(); lt(g, en ? `Every time 4+ were lit (since ${yr})` : `4つ以上点灯した回（${yr}年以降・全部）`, 44, 994, { s: 24, w: 900, c: '#f2f4f8' });
  const tot = d.n || 1, bwid = W - 88; g.fillStyle = UP; g.fillRect(44, 1012, bwid * d.up / tot, 30); g.fillStyle = DN; g.fillRect(44 + bwid * d.up / tot, 1012, bwid * d.dn / tot, 30);
  lt(g, (en ? '90d later higher ' : '90日後に上 ') + d.up, 54, 1036, { s: 19, w: 900, c: '#04120b' }); if (d.dn) lt(g, (en ? 'lower ' : '下 ') + d.dn, W - 54, 1036, { s: 19, w: 900, c: '#1a0508', a: 'right' });
  if (d.med != null) lt(g, (en ? 'median 90d ' : '90日後の中央値 ') + sg(d.med), W - 44, 994, { s: 20, w: 800, f: LN, c: d.med >= 0 ? UP : DN, a: 'right' });
  const rows = d.ev.slice(-8), fd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '.');
  [[44, en ? 'Date' : '日付'], [290, en ? 'Lit' : '点灯'], [420, en ? 'Price' : '価格'], [640, en ? '30d' : '30日後'], [800, en ? '90d' : '90日後'], [980, en ? 'Low in 90d' : '90日内の最安']].forEach(([x, l]) => lt(g, l, x, 1084, { s: 16, w: 700, c: M }));
  rows.forEach((e, r) => { const yy = 1120 + r * 36; lt(g, fd(e.t), 44, yy, { s: 20, w: 800, f: LN, c: '#e8ecf2' }); lt(g, e.lit + '/' + e.av, 290, yy, { s: 20, w: 800, f: LN, c: LT }); lt(g, $(e.c), 420, yy, { s: 20, w: 700, f: LN, c: '#cfd6e0' });
    [[640, e.d30], [800, e.d90]].forEach(([x, v]) => lt(g, v == null ? (en ? 'pending' : 'まだ') : sg(v), x, yy, { s: 20, w: 900, f: LN, c: v == null ? M : v >= 0 ? UP : DN })); lt(g, sg(e.dd), 980, yy, { s: 20, w: 800, f: LN, c: DN }); });
  if (d.ev.length > 8) lt(g, en ? `(latest 8 of ${d.ev.length})` : `（${d.ev.length}回のうち新しい8回）`, W - 44, 1084, { s: 14, w: 600, c: M, a: 'right' });
  lt(g, en ? 'Signals: 6+ weekly losses · close 30%+ below 365d high · Fear&Greed ≤ 20 · 7d avg funding ≤ 0 · OI −15% in 14d. Sources: Binance, alternative.me' : 'サイン：週足6週以上連続安・365日高値から-30%・恐怖と強欲≤20・資金調達率7日平均≤0・建玉14日で-15%。出典：Binance・alternative.me', 44, HH - 58, { s: 13, w: 600, c: M });
  lt(g, en ? 'Past record. Not a forecast.' : '過去の記録で、今回も同じとは限りません', 44, HH - 30, { s: 15, w: 700, c: '#ff9a9a' });
  g.font = `700 13px ${LN}`; g.letterSpacing = '3px'; const tw = g.measureText('CRYPTO SIGNAL ARCHIVE').width; g.fillStyle = '#cfe0f2'; g.fillText('CRYPTO SIGNAL ARCHIVE', W - 44 - tw, HH - 32); g.letterSpacing = '0px'; lt(g, 'CSA', W - 56 - tw, HH - 26, { s: 30, w: 900, f: LN, a: 'right' });
}
// v351: 「前回の道を、今回に重ねる」(1200×1350)。横軸 = 上場日からの日数、縦軸 = 取引開始の価格からの%。今回はローソク足、前回は光る線
function drawTwin(g, d, lg) {
  const en = lg === 'en', HH = 1350, UP = '#0ecb81', DN = '#f6465d', M = '#7d8590', CY = '#2ee6ff', OR = '#f7931a', sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  g.fillStyle = '#030406'; g.fillRect(0, 0, W, HH);
  lt(g, 'CSA / SAME ROAD?', 44, 58, { s: 18, w: 800, f: LN, c: CY });
  lt(g, en ? 'The last mega IPO, laid over this one' : '前回の道を、今回に重ねると', 44, 120, { s: 52, w: 900, c: '#f4f6fa' });
  lt(g, en ? 'BTC · x = days from listing day · y = vs price at the NY open' : 'BTC・横＝上場日からの日数・縦＝上場日のNY取引開始からの%', 44, 160, { s: 18, w: 600, c: M });
  const all = [...d.ga.map((r) => r[4]), ...d.gb.flatMap((r) => [r[2], r[3]])]; if (!all.length) return;
  let hi = Math.max(...all, 2), lo = Math.min(...all, -2); const pd = (hi - lo) * 0.07; hi += pd; lo -= pd;
  const x0 = 44, x1 = W - 120, y0 = 210, y1 = 1180, N = TWIN.pre + TWIN.post + 1, stp = (x1 - x0) / N, X = (k) => x0 + stp * (k + TWIN.pre + 0.5), Y = (v) => y0 + (hi - v) / (hi - lo) * (y1 - y0);
  const rough = (hi - lo) / 7, mag = Math.pow(10, Math.floor(Math.log10(rough))), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rough);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { const z = Math.abs(v) < 1e-9; g.strokeStyle = z ? 'rgba(255,255,255,.28)' : 'rgba(132,142,156,.09)'; g.lineWidth = 1; g.setLineDash(z ? [5, 6] : []); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, (v > 0 ? '+' : '') + (+v.toFixed(1)) + '%', x1 + 12, Y(v) + 6, { s: 16, w: 700, f: LN, c: z ? '#fff' : M }); }
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(0), y0); g.lineTo(X(0), y1); g.stroke();
  for (const k of [-14, 0, 30, 60, 90]) lt(g, k === 0 ? (en ? 'listing day' : '上場日') : (k > 0 ? '+' : '−') + Math.abs(k) + (en ? 'd' : '日'), X(k), y1 + 32, { s: 17, w: k === 0 ? 900 : 700, c: k === 0 ? '#fff' : M, a: 'center' });
  // 今日より先(前回だけが描かれる場所)を少し暗く
  const xt = X(d.dayB) + stp / 2; g.fillStyle = 'rgba(46,230,255,.035)'; g.fillRect(xt, y0, x1 - xt, y1 - y0); lt(g, en ? 'beyond today: last time only' : 'ここから先は前回の記録だけ', xt + 14, y0 + 26, { s: 16, w: 700, c: '#7fbccc' });
  // 前回: 光る線
  g.save(); g.shadowColor = CY; g.shadowBlur = 12; g.strokeStyle = CY; g.lineWidth = 3.2; g.lineJoin = 'round'; g.beginPath(); d.ga.forEach((r, j) => j ? g.lineTo(X(r[0]), Y(r[4])) : g.moveTo(X(r[0]), Y(r[4]))); g.stroke(); g.restore();
  const LA = d.ga[d.ga.length - 1]; if (LA) { g.fillStyle = CY; g.beginPath(); g.arc(X(LA[0]), Y(LA[4]), 7, 0, 7); g.fill(); const lab = (en ? 'last time, day ' : '前回 ') + LA[0] + (en ? ': ' : '日目 ') + sg(LA[4]); g.font = `900 26px ${LJ}`; const tw = g.measureText(lab).width; lt(g, lab, Math.min(X(LA[0]) - 10, x1 - 6), Y(LA[4]) + (LA[4] >= 0 ? -20 : 40), { s: 26, w: 900, c: CY, a: 'right', glow: 'rgba(46,230,255,.5)', b: 8 }); }
  if (d.lo) { const yl = Y(d.lo.v); g.strokeStyle = CY; g.lineWidth = 2; g.beginPath(); g.arc(X(d.lo.d), yl, 7, 0, 7); g.stroke(); lt(g, (en ? 'low, day ' : '安値 ') + d.lo.d + (en ? '' : '日目'), X(d.lo.d), yl + 34, { s: 18, w: 800, c: '#9fdbe8', a: 'center' }); }
  // 今回: ローソク足
  const bw = Math.max(3, stp * 0.62);
  for (const [k, o, h, l, c] of d.gb) { const cx = X(k), up = c >= o; g.strokeStyle = g.fillStyle = up ? UP : DN; g.lineWidth = Math.max(1.4, bw * 0.16); g.beginPath(); g.moveTo(cx, Y(h)); g.lineTo(cx, Y(l)); g.stroke(); const yt = Y(Math.max(o, c)), yb = Y(Math.min(o, c)); g.fillRect(cx - bw / 2, yt, bw, Math.max(1.5, yb - yt)); }
  // 凡例
  const ly = 1260; g.save(); g.shadowColor = CY; g.shadowBlur = 8; g.fillStyle = CY; g.fillRect(44, ly - 10, 34, 5); g.restore(); lt(g, en ? 'SpaceX listing (Jun 12, 2026)' : '前回：SpaceX上場（2026/6/12）', 90, ly, { s: 22, w: 800, c: '#dff6fb' });
  g.fillStyle = UP; g.fillRect(620, ly - 20, 9, 22); g.fillStyle = DN; g.fillRect(633, ly - 14, 9, 16); lt(g, en ? 'Anthropic listing (Nov 19, 2026)' : '今回：Anthropic上場（2026/11/19）', 654, ly, { s: 22, w: 800, c: '#f4f6fa' });
  lt(g, en ? 'Past record, not a forecast. Daily candles (UTC), Binance BTC/USDT.' : '過去の記録で、今回も同じとは限りません・日足（UTC）・Binance BTC/USDT', 44, HH - 26, { s: 15, w: 700, c: '#ff9a9a' });
  g.font = `700 13px ${LN}`; g.letterSpacing = '3px'; const tw2 = g.measureText('CRYPTO SIGNAL ARCHIVE').width; g.fillStyle = '#cfe0f2'; g.fillText('CRYPTO SIGNAL ARCHIVE', W - 44 - tw2, HH - 28); g.letterSpacing = '0px'; lt(g, 'CSA', W - 56 - tw2, HH - 22, { s: 30, w: 900, f: LN, a: 'right' });
}
// v352: パニック売りの回数(1200×1350)。見出し＝答え、4時間足、①②③の印と安値を図に直接
function drawPanic(g, d, lg) {
  const en = lg === 'en', HH = 1350, UP = '#16c784', DN = '#ea3943', M = '#6b7280', OR = '#f7931a', $ = (v) => '$' + Math.round(v).toLocaleString('en-US');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, HH);
  lt(g, 'BTC / PANIC SELLING', 60, 72, { s: 20, w: 900, f: LN, c: DN });
  if (en) { lt(g, 'The 3rd panic', 60, 150, { s: 72, w: 900 }); lt(g, 'sell-off in 9 days', 60, 230, { s: 72, w: 900, c: DN, glow: 'rgba(234,57,67,.45)', b: 10 }); }
  else { lt(g, '9日で', 60, 160, { s: 84, w: 900 }); g.font = `900 84px ${LJ}`; const w1 = g.measureText('9日で').width; lt(g, '3度目', 60 + w1, 160, { s: 84, w: 900, c: DN, glow: 'rgba(234,57,67,.45)', b: 10 }); const w2 = g.measureText('3度目').width; lt(g, 'の', 60 + w1 + w2, 160, { s: 84, w: 900 }); lt(g, 'パニック売り', 60, 256, { s: 84, w: 900 }); }
  const b = d.bars; if (!b.length) return;
  let hi = Math.max(...b.map((x) => x[2])), lo = Math.min(...b.map((x) => x[3])); const pd = (hi - lo) * 0.06; hi += pd; lo -= pd;
  const x0 = 50, x1 = W - 130, y0 = 320, y1 = 990, stp = (x1 - x0) / b.length, bw = Math.max(3, stp * 0.64), X = (i) => x0 + stp * (i + 0.5), Y = (v) => y0 + (hi - v) / (hi - lo) * (y1 - y0);
  const ix = (t) => { let k = 0; for (let i = 0; i < b.length; i++) if (b[i][0] <= t) k = i; return k; };
  const rough = (hi - lo) / 5, mag = Math.pow(10, Math.floor(Math.log10(rough))), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rough);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { const big = Math.abs(v - 60000) < 1; g.strokeStyle = big ? 'rgba(247,147,26,.6)' : 'rgba(132,142,156,.10)'; g.lineWidth = big ? 1.6 : 1; g.setLineDash(big ? [6, 6] : []); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); lt(g, Math.round(v).toLocaleString('en-US'), x1 + 12, Y(v) + 6, { s: 17, w: big ? 900 : 600, f: LN, c: big ? OR : M }); }
  for (const p of d.ev) { const a = ix(p.a), z = p.b === Infinity ? b.length - 1 : ix(p.b - 1); g.fillStyle = p.k === 3 ? 'rgba(234,57,67,.13)' : 'rgba(234,57,67,.07)'; g.fillRect(X(a) - stp / 2, y0, (z - a + 1) * stp, y1 - y0); }
  for (let i = 0; i < b.length; i++) { const [, o, h, l, c] = b[i], cx = X(i), up = c >= o; g.strokeStyle = g.fillStyle = up ? UP : DN; g.lineWidth = Math.max(1.4, bw * 0.16); g.beginPath(); g.moveTo(cx, Y(h)); g.lineTo(cx, Y(l)); g.stroke(); const yt = Y(Math.max(o, c)), yb = Y(Math.min(o, c)); g.fillRect(cx - bw / 2, yt, bw, Math.max(1.5, yb - yt)); }
  const num = ['①', '②', '③'];
  for (const p of d.ev) { if (!p.lo) continue; const cx = X(ix(p.lo.t)), cy = Y(p.lo.v), last = p.k === 3; g.save(); g.shadowColor = DN; g.shadowBlur = last ? 12 : 6; g.fillStyle = DN; g.beginPath(); g.arc(cx, cy, last ? 10 : 8, 0, 7); g.fill(); g.restore();
    const sx = [210, 600, 990][p.k - 1], sy = 1080;   // ラベルは図の下の決まった場所に並べ、点から線で結ぶ(重ならない)
    g.setLineDash([3, 5]); g.strokeStyle = 'rgba(234,57,67,.7)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx, cy + 12); g.lineTo(cx, y1 + 6); g.lineTo(sx, sy - 40); g.stroke(); g.setLineDash([]);
    lt(g, num[p.k - 1] + ' ' + (en ? p.en : p.ja), sx, sy, { s: 30, w: 900, c: last ? '#fff' : '#f3f4f6', a: 'center' }); lt(g, $(p.lo.v), sx, sy + 40, { s: 28, w: 900, f: LN, c: DN, a: 'center', glow: last ? 'rgba(234,57,67,.5)' : null, b: 8 }); if (p.liqJa) lt(g, en ? p.liqEn : p.liqJa, sx, sy + 74, { s: 20, w: 700, c: '#9ca3af', a: 'center' }); }
  if (d.reb) { const cx = X(ix(d.reb.t)), cy = Y(d.reb.v); g.fillStyle = UP; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill(); lt(g, en ? `bounced to ${$(d.reb.v)}` : `${$(d.reb.v)}まで戻った`, cx, cy - 22, { s: 24, w: 900, c: UP, a: 'center', glow: 'rgba(22,199,132,.4)', b: 8 }); }
  lt(g, en ? 'BTC/USDT 4h · Binance · liquidations as reported · past record, not a forecast' : 'BTC/USDT 4時間足・Binance・清算額は報道の値・過去の記録で、今回も同じとは限りません', 60, HH - 70, { s: 16, w: 600, c: M });
  g.font = `700 13px ${LN}`; g.letterSpacing = '3px'; const tw = g.measureText('CRYPTO SIGNAL ARCHIVE').width; g.fillStyle = '#cfe0f2'; g.fillText('CRYPTO SIGNAL ARCHIVE', W - 60 - tw, HH - 32); g.letterSpacing = '0px'; lt(g, 'CSA', W - 72 - tw, HH - 26, { s: 30, w: 900, f: LN, a: 'right' });
}
// v355→v356: 週足の連続安(1200×1350・R2)。連続安が始まる前の週の終値＝0%として、新しい3回を線で重ねる。今回は赤い太線と下へ薄くなる面、過去は白とグレーの細線
function drawStreak(g, d, lg) {
  const en = lg === 'en', HH = 1350, RED = '#ff3b4f', M = '#4b5260', sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(0) + '%';
  g.fillStyle = '#000'; g.fillRect(0, 0, W, HH);
  const rows = d.S.slice(-3), cur = rows.find((x) => x.live), past = rows.filter((x) => !x.live), PC = past.length === 2 ? ['#6b7079', '#d6d9de'] : ['#d6d9de'];
  const ym = (t) => { const z = new Date(t); return en ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][z.getUTCMonth()]} ${z.getUTCFullYear()}` : `${z.getUTCFullYear()}年${z.getUTCMonth() + 1}月`; };
  const path = (x) => { const b = d.kw[x.s - 1][4], v = [0]; for (let i = x.s; i <= x.e; i++) v.push((d.kw[i][4] / b - 1) * 100); return v; };
  const L = rows.map((x) => ({ x, v: path(x) })), all = L.flatMap((q) => q.v);
  lt(g, en ? 'Weekly losing streaks,' : '週足の連続安、', 60, 110, { s: 58, w: 900 }); lt(g, en ? `${rows.length} of them overlaid` : `${rows.length}回を重ねると`, 60, 184, { s: 58, w: 900 });
  lt(g, en ? 'Close of the week before each streak = 0% · x = weeks' : '連続安が始まる前の週の終値＝0%・横は週', 60, 236, { s: 26, w: 700, c: '#8b939e' });
  const N = Math.max(9, ...rows.map((x) => x.len)) + 3, lo = Math.floor((Math.min(...all) - 6) / 10) * 10, hi = 5, x0 = 80, x1 = 1040, y0 = 300, y1 = 1180, X = (w) => x0 + (x1 - x0) * w / N, Y = (v) => y0 + (hi - v) / (hi - lo) * (y1 - y0);
  for (let v = 0; v >= lo; v -= 10) { g.strokeStyle = v === 0 ? '#3a3f47' : '#14171b'; g.lineWidth = v === 0 ? 2 : 1; g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); lt(g, (v ? v : 0) + '%', x1 + 14, Y(v) + 8, { s: 22, w: 700, f: LN, c: v === 0 ? '#9aa3ae' : M }); }
  for (let w = 0; w <= N; w += 3) lt(g, w + (en ? 'w' : '週'), X(w), y1 + 38, { s: 22, w: 700, c: M, a: 'center' });
  const cq = L.find((q) => q.x.live);
  if (cq) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, 'rgba(255,59,79,.32)'); gr.addColorStop(1, 'rgba(255,59,79,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(X(0), Y(lo)); cq.v.forEach((v, i) => g.lineTo(X(i), Y(v))); g.lineTo(X(cq.v.length - 1), Y(lo)); g.closePath(); g.fill(); }
  const labs = [];
  L.filter((q) => !q.x.live).forEach((q, k) => { const c = PC[k] || '#d6d9de'; g.strokeStyle = c; g.lineWidth = 3; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); q.v.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke(); const n = q.v.length - 1; g.fillStyle = c; g.beginPath(); g.arc(X(n), Y(q.v[n]), 6, 0, 7); g.fill();
    labs.push({ x: X(n) + 16, y: Y(q.v[n]) + 8, c, big: 0, t: ym(q.x.t0), sub: (en ? `${q.x.len}w ${sg(q.x.drop)}` : `${q.x.len}週 ${sg(q.x.drop)}`) + (q.x.aft == null ? '' : (en ? ` · 4w after ${sg(q.x.aft)}` : `・4週後 ${sg(q.x.aft)}`)) }); });
  if (cq) { g.save(); g.shadowColor = 'rgba(255,59,79,.6)'; g.shadowBlur = 6; g.strokeStyle = RED; g.lineWidth = 6; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); cq.v.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke(); g.restore(); const n = cq.v.length - 1; g.fillStyle = RED; g.beginPath(); g.arc(X(n), Y(cq.v[n]), 9, 0, 7); g.fill();
    labs.push({ x: X(n) + 16, y: Y(cq.v[n]) + 8, c: RED, big: 1, t: en ? 'Now' : '今', sub: (en ? `${cq.x.len}w ${sg(cq.x.drop)} (week not closed)` : `${cq.x.len}週 ${sg(cq.x.drop)}（今週は暫定）`) }); }
  labs.sort((a, b) => a.y - b.y); for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 76) labs[k].y = labs[k - 1].y + 76;   // ラベルが重ならないように
  for (const l of labs) { g.font = `700 21px ${LN}`; const bw2 = Math.max(g.measureText(l.sub).width, l.t.length * 30) + 16; g.fillStyle = 'rgba(0,0,0,.78)'; g.fillRect(l.x - 8, l.y - (l.big ? 34 : 28), bw2, l.big ? 80 : 70);
    lt(g, l.t, l.x, l.y, { s: l.big ? 34 : 26, w: 900, c: l.c }); lt(g, l.sub, l.x, l.y + (l.big ? 36 : 32), { s: 21, w: 700, f: LN, c: l.big ? '#e5e7eb' : '#7d8590' }); }
  lt(g, en ? 'Binance BTC/USDT weekly · past record, not a forecast' : 'Binance BTC/USDT 週足・過去の記録で、今回も同じとは限りません', 60, HH - 40, { s: 18, w: 600, c: '#6b7280' });
  lt(g, 'CSA', W - 60, HH - 36, { s: 30, w: 900, f: LN, a: 'right' });
}
// v359: 天井→底→いま(1200×1350)。ローソク足に天井・底・いまの3点、右に下げ(赤)と戻り(緑)の幅
function drawBounce(g, d, lg) {
  const en = lg === 'en', HH = 1350, UP = '#16c784', DN = '#ff3b4f', M = '#6b7280', $ = (v) => '$' + Math.round(v).toLocaleString('en-US'), s2 = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + '%';
  const hm = (t) => { const z = new Date(t + (en ? 0 : 9 * 36e5)); return `${z.getUTCHours()}:${String(z.getUTCMinutes()).padStart(2, '0')}`; };
  g.fillStyle = '#000'; g.fillRect(0, 0, W, HH);
  lt(g, en ? `BTC · LAST ${d.hrs} HOURS` : `BTC・直近${d.hrs}時間`, 60, 70, { s: 22, w: 900, f: LN, c: '#9ca3af' });
  lt(g, en ? 'From the high' : '天井から', 60, 146, { s: 56, w: 900 }); g.font = `900 56px ${LJ}`; const w1 = g.measureText(en ? 'From the high ' : '天井から').width;
  lt(g, s2(d.dn), 60 + w1, 146, { s: 56, w: 900, f: LN, c: DN, glow: 'rgba(255,59,79,.45)', b: 8 });
  lt(g, en ? 'then off the low' : 'そこから', 60, 222, { s: 56, w: 900 }); g.font = `900 56px ${LJ}`; const w2 = g.measureText(en ? 'then off the low ' : 'そこから').width;
  lt(g, s2(d.up), 60 + w2, 222, { s: 56, w: 900, f: LN, c: UP, glow: 'rgba(22,199,132,.45)', b: 8 });
  const b = d.bars; let hi = Math.max(...b.map((x) => x[2])), lo = Math.min(...b.map((x) => x[3])); const pd = (hi - lo) * 0.1; hi += pd; lo -= pd;
  const x0 = 60, x1 = W - 290, y0 = 300, y1 = 1150, stp = (x1 - x0) / b.length, bw = Math.max(3, stp * 0.64), X = (i) => x0 + stp * (i + 0.5), Y = (v) => y0 + (hi - v) / (hi - lo) * (y1 - y0);
  const ix = (t) => { let k = 0; for (let i = 0; i < b.length; i++) if (b[i][0] <= t) k = i; return k; };
  for (let i = 0; i < b.length; i++) { const [, o, h, l, c] = b[i], cx = X(i), up = c >= o; g.strokeStyle = g.fillStyle = up ? UP : DN; g.lineWidth = Math.max(1.3, bw * 0.16); g.beginPath(); g.moveTo(cx, Y(h)); g.lineTo(cx, Y(l)); g.stroke(); const yt = Y(Math.max(o, c)), yb = Y(Math.min(o, c)); g.fillRect(cx - bw / 2, yt, bw, Math.max(1.5, yb - yt)); }
  const dash = (y, c) => { g.setLineDash([5, 6]); g.strokeStyle = c; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1 + 40, y); g.stroke(); g.setLineDash([]); };
  const yP = Y(d.P), yT = Y(d.T), yC = Y(d.C); dash(yP, 'rgba(255,255,255,.35)'); dash(yT, 'rgba(255,59,79,.5)'); dash(yC, 'rgba(22,199,132,.5)');
  const dot = (t, y, c) => { g.save(); g.shadowColor = c; g.shadowBlur = 8; g.fillStyle = c; g.beginPath(); g.arc(X(ix(t)), y, 8, 0, 7); g.fill(); g.restore(); };
  dot(d.pT, yP, '#fff'); dot(d.tT, yT, DN); dot(b[b.length - 1][0], yC, UP);
  lt(g, (en ? 'High ' : '天井 ') + $(d.P), X(ix(d.pT)), yP - 18, { s: 24, w: 900, c: '#fff', a: 'center' }); lt(g, hm(d.pT), X(ix(d.pT)), yP - 46, { s: 18, w: 700, f: LN, c: M, a: 'center' });
  lt(g, (en ? 'Low ' : '底 ') + $(d.T), X(ix(d.tT)), yT + 40, { s: 24, w: 900, c: DN, a: 'center' }); lt(g, hm(d.tT), X(ix(d.tT)), yT + 66, { s: 18, w: 700, f: LN, c: M, a: 'center' });
  const bx = x1 + 46; g.lineWidth = 5; g.strokeStyle = DN; g.beginPath(); g.moveTo(bx, yP); g.lineTo(bx, yT); g.stroke(); g.strokeStyle = UP; g.beginPath(); g.moveTo(bx + 30, yT); g.lineTo(bx + 30, yC); g.stroke();
  let ly1 = (yP + yT) / 2 + 10, ly2 = (yT + yC) / 2 + 10; if (Math.abs(ly1 - ly2) < 44) ly1 = ly2 - 44;   // 重ならないように
  lt(g, s2(d.dn), bx + 48, ly1, { s: 30, w: 900, f: LN, c: DN }); lt(g, s2(d.up), bx + 48, ly2, { s: 30, w: 900, f: LN, c: UP });
  lt(g, (en ? 'Now ' : 'いま ') + $(d.C), X(b.length - 1) - 16, yC - 18, { s: 24, w: 900, c: UP, a: 'right' });
  lt(g, en ? `${d.back}% of the drop won back` : `下げ幅の${d.back}%を戻した`, 60, 1210, { s: 30, w: 900, c: '#e5e7eb' });
  lt(g, en ? `Binance BTC/USDT ${d.step}m · times in UTC` : `Binance BTC/USDT ${d.step}分足・時刻は日本時間`, 60, HH - 40, { s: 18, w: 600, c: M });
  lt(g, 'CSA', W - 60, HH - 36, { s: 30, w: 900, f: LN, a: 'right' });
}
