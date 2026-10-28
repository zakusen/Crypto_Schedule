#!/usr/bin/env node
// X への自動投稿(v94)。GitHub Actions「X post」が動かす(Cloudflare の Worker が投稿時刻に合図を送る)。
//  - 投稿時刻を過ぎた(3時間以内の)自動投稿の下書きを、英語 → 日本語の順に投稿する(画像つき・URLなし)
//    対象: 発表後の値動き・週間記録・毎朝の予定(AUTO_DAILY_FROM 以降。それまでは手で予約済み)
//  - 投稿できたら下書きに「済み」の印を付け、Worker が見張る予定(x:due)を書き直す
// X の公式 API(使った分だけ払う方式)。認証は OAuth 1.0a(自分のアカウントの鍵 4つ)。
// 必要: RX_ADMIN_KEY、X_API_KEY・X_API_SECRET・X_ACCESS_TOKEN・X_ACCESS_SECRET
// X_DRY=1 で投稿しない(文面と画像を x_out/ に書き出すだけ。Actions の成果物で確認できる)
// --check: 投稿するものがあるかだけ調べて GITHUB_OUTPUT に need=true/false を書く(ブラウザの用意を省くため)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { loadBtc5m } from './pattern.mjs';
import { weekMatch, liveMatch, liveLine, fomcMatch, fomcHist } from './weekmatch.mjs';   // v204: BTC実況。v206: 全ての投稿で期間を変えて使う
const here = path.dirname(fileURLToPath(import.meta.url));
const L = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(here, '..', 'public', 'xpost-lib.js'))).toString('base64'));
const SITE = (process.env.SITE_URL || 'https://crypto-schedule.signalarchive.workers.dev').replace(/\/+$/, '');
const KEY = process.env.RX_ADMIN_KEY || '';
const DRY = process.env.X_DRY === '1';
const CHECK = process.argv.includes('--check');
const X = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
const MAX_POSTS = 6;                      // 1回の実行で出す上限(不具合で連投しないように)
const NOW = Date.now();

if (!KEY) { console.log('[post] RX_ADMIN_KEY が未設定'); process.exit(0); }
async function site(p, opt = {}) {
  const r = await fetch(SITE + p, { ...opt, headers: { 'User-Agent': 'signal-archive-x-post/1.0', 'x-admin-key': KEY, ...(opt.headers || {}) }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(p.split('?')[0] + ' HTTP ' + r.status);
  return r;
}

// ---- 投稿するもの ----
const store = await (await site('/api/admin/posts')).json();
const posts = store.posts || [];
const todo = [];
for (const p of posts.filter((p) => L.isAuto(p) && p.due && !p.upd))   // v173: 言語ごとの投稿時刻(dues)と出す言語(langs)
  for (const lg of L.langsOf(p)) { const d = L.dueOf(p, lg); if (!(p.done && p.done[lg]) && d <= NOW && NOW - d < L.winOf(p)) todo.push({ p, lg, d }); }
todo.sort((a, b) => a.d - b.d || (a.p.parent ? 1 : 0) - (b.p.parent ? 1 : 0));   // v187: 返信(parent あり)は親の後
if (DRY && !todo.length) {                 // 試しの時、投稿時刻のものが無ければ、種類ごとに一番近い下書きを1つずつ使う(文面と画像の確認用)
  for (const sr of ['daily', 'arch', 'week']) { const p = posts.filter((x) => x.sr === sr && x.due).sort((a, b) => Math.abs(a.due - NOW) - Math.abs(b.due - NOW))[0]; if (p) for (const lg of ['en', 'ja']) todo.push({ p, lg }); }
}
console.log(`[post] 投稿するもの ${todo.length}件${todo.length ? ' (' + todo.map((t) => t.p.id + ':' + t.lg).join(', ') + ')' : ''}${DRY ? ' / DRY' : ''}`);
if (CHECK) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `need=${todo.length ? 'true' : 'false'}\n`);
  if (!DRY && !todo.length) await writeDue();   // v209: 投稿が無い回も Worker の予定(x:due)を書き直す(反映直後に新しい種類の投稿を予定に入れるため)
  process.exit(0);
}
if (!todo.length) { await writeDue(); process.exit(0); }
if (!DRY && !(X.key && X.secret && X.token && X.tokenSecret)) { console.log('[post] X の鍵(X_API_KEY など4つ)が未設定のため投稿しません'); process.exit(0); }

// ---- OAuth 1.0a の署名(本文は署名に含めない: JSON の送信) ----
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function oauth(method, url) {
  const o = { oauth_consumer_key: X.key, oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: X.token, oauth_version: '1.0' };
  const u = new URL(url), all = { ...o }; u.searchParams.forEach((v, k) => { all[k] = v; });
  const base = [method, enc(u.origin + u.pathname), enc(Object.keys(all).sort().map((k) => enc(k) + '=' + enc(all[k])).join('&'))].join('&');
  o.oauth_signature = crypto.createHmac('sha1', enc(X.secret) + '&' + enc(X.tokenSecret)).update(base).digest('base64');
  return 'OAuth ' + Object.keys(o).map((k) => `${enc(k)}="${enc(o[k])}"`).join(', ');
}
async function xapi(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { authorization: oauth('POST', url), 'content-type': 'application/json', 'user-agent': 'signal-archive-x-post/1.0' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  if (!r.ok) throw new Error(`${url.replace('https://api.x.com', '')} HTTP ${r.status} ${t.slice(0, 300)}`);
  return j;
}

// ---- 画像(サイトの /render.html を裏のブラウザで開いて描く。/posts.html と同じ見た目) ----
let browser = null, page = null;
async function render(p, lg) {
  try {
    if (!page) {
      const { chromium } = await import('playwright');
      browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(SITE + '/render.html', { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForFunction(() => window.renderReady === true, null, { timeout: 30000 });
    }
    const url = await page.evaluate(([q, l]) => window.renderPost(q, l), [p, lg]);
    return url ? Buffer.from(url.split(',')[1], 'base64') : null;
  } catch (e) { console.log('[post] 画像を作れませんでした(文だけで投稿します):', String(e.message || e).slice(0, 200)); return null; }
}

// ---- 投稿 ----
const OUT = path.join(process.cwd(), 'x_out');
if (DRY) fs.mkdirSync(OUT, { recursive: true });

// v202: 日誌スレッド(毎朝の予定を親に、その日の自動投稿を返信でつなぐ)
const THREAD_SR = new Set(['pre', 'arch', 'spike', 'liq', 'liqday', 'liqimp', 'vol', 'sum', 'week', 'pat']);
const latestRoot = (lg) => posts.filter((x) => x.sr === 'daily' && x.tw && x.tw[lg] && x.done && x.done[lg] && Date.now() - x.done[lg] < 26 * 36e5).sort((a, b) => b.done[lg] - a.done[lg])[0] || null;
let n = 0, S5 = null, EVL = null;
const LIVE_SR = new Set(['daily', 'sum', 'pre', 'arch', 'spike', 'liq']), FOMC_SR = new Set(['fomc', 'fomcc', 'fomcres']), FCACHE = new Map();
const M5 = 300000, HR = 3600000, FLAG = { US: '🇺🇸', JP: '🇯🇵', EU: '🇪🇺' };
const SG = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%', COL = (v) => v < 0 ? '#ff4d66' : '#3cff9a', CCOL = (v) => v < 0 ? '#ff8a9a' : '#6fe3a8';
const nameOf = (t, lg) => { const e = (EVL || []).find((x) => Math.abs(x.t - t) < 60000); return e ? `${FLAG[e.c] || '📅'} ${e[lg]}` : null; };
const hmOf = (t, lg) => { const d = new Date(t + (lg === 'en' ? 0 : 9 * HR)); return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const mdOf = (t, lg) => { const d = new Date(t + (lg === 'en' ? 0 : 9 * HR)); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
// 投稿の種類ごとの期間と、見出し・真ん中の欄(事実の数字だけ)。v207: 種類ごとに見出しを主役にした形
let VOL1 = undefined;
const usdL = (v, lg) => lg === 'en' ? L.usdS(v) : '$' + L.jaUsd(v).replace('ドル', '');
const at5 = (t) => { let lo = 0, hi = S5.t.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S5.t[m] <= t) lo = m; else hi = m - 1; } return S5.c[lo]; };
async function liveFor(p, lg, now) {
  const en = lg === 'en', im = p.img || {};
  if (p.sr === 'daily' || p.sr === 'sum') { const r = weekMatch(S5, now, lg, EVL); return r && { ...r, kind: 'daily' }; }
  if (p.sr === 'pre') {   // 発表の前後1日(15分刻み)
    const E = +String(p.id).split(':')[1], nm = nameOf(E, lg) || p[lg].split('\n')[0].split(' · ')[0], pc = im.coins && im.coins.BTC ? im.coins.BTC.c60 : null;
    if (VOL1 === undefined) { VOL1 = null; try { const j = await (await fetch(SITE + '/api/vol', { signal: AbortSignal.timeout(20000) })).json(); if (j && j.typ && j.typ[1] != null) VOL1 = j.typ[1]; } catch (_) {} }
    const lv = liveMatch(S5, now, { ws: E - 24 * HR, N: 192, st: 15 * 60000, shift: HR, lang: lg }); if (!lv) return null;
    const sameDay = mdOf(E, lg) === mdOf(now, lg);
    return { ...lv, kind: 'pre', hl: { t0: E, ja: nm, en: nm },
      stat: { name: nm, t: E, whenTxt: (sameDay ? (en ? 'today ' : '今日') : mdOf(E, lg) + ' ') + hmOf(E, lg) + (en ? ' UTC' : ''), lastDate: im.t ? mdOf(im.t, lg) : null, big: SG(pc), col: pc == null ? '#ffffff' : '#ffffff', typ: VOL1 != null ? '±' + VOL1.toFixed(2) + '%' : null } };
  }
  if (p.sr === 'arch') {   // 発表の1時間前〜2時間後(5分刻み)
    const E = im.t || +String(p.id).split(':')[1], c = im.coins || {}, b = c.BTC ? c.BTC.c60 : im.chg, nm = nameOf(E, lg) || `${im.icon || ''} ${im[lg] || ''}`.trim();
    const lv = liveMatch(S5, now, { ws: E - HR, N: 36, st: M5, shift: HR, lang: lg }); if (!lv) return null;
    return { ...lv, kind: 'arch', tone: b == null ? null : COL(b), hl: { t0: E, t1: E + HR, ja: `${nm} ${hmOf(E, lg)}`, en: `${nm} ${hmOf(E, lg)}` },
      stat: { name: nm, big: SG(b), col: b == null ? '#ffffff' : (b < 0 ? '#ff6b7d' : '#3cff9a'), range: `${hmOf(E, lg)} → ${hmOf(E + HR, lg)}`, coins: ['BTC', 'ETH', 'SOL', 'BNB'].filter((k) => c[k] && c[k].c60 != null).map((k) => ({ k, v: c[k].c60 })) } };
  }
  if (p.sr === 'spike') {   // 前後3時間(5分刻み)
    const t0 = im.t0, t1 = im.t1, c = im.coins || {}, b = c.BTC, w = im.win || 1;
    const lv = liveMatch(S5, now, { ws: t1 - 3 * HR, N: 72, st: M5, shift: HR, lang: lg }); if (!lv) return null;
    const info = (EVL || []).filter((e) => e.t >= t0 - 15 * 60000 && e.t <= t1).slice(0, 1).map((e) => `${e[lg]} ${hmOf(e.t, lg)}`);
    if (im.liq && im.liq.l + im.liq.s > 0) info.push(`${en ? 'Liq' : '清算'} ${usdL(im.liq.l + im.liq.s, lg)}`);
    const p0 = at5(t0), p1 = at5(t1), $ = (v) => '$' + Math.round(v).toLocaleString('en-US');
    return { ...lv, kind: 'spike', tone: b < 0 ? '#ff4d66' : '#3cff9a', hl: { t0, t1, ja: `${w}時間`, en: `${w}h` },
      stat: { head: en ? `BTC ${SG(b)} in ${w}h` : `BTC ${w}時間で ${SG(b)}`, px: p0 && p1 ? `${$(p0)} → ${$(p1)}` : null, info } };
  }
  if (p.sr === 'liq') {   // 終わりの6時間前〜6時間後(5分刻み)
    let l = 0, s2 = 0; for (const k of Object.keys(im.coins || {})) { l += im.coins[k].long || 0; s2 += im.coins[k].short || 0; }
    const lv = liveMatch(S5, now, { ws: im.end - 6 * HR, N: 144, st: M5, shift: 2 * HR, lang: lg }); if (!lv) return null;
    const mins = Math.round((im.end - im.start) / 60000), dur = mins >= 90 ? (en ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 60)}時間`) : (en ? `${mins} min` : `${mins}分`);
    return { ...lv, kind: 'liq', tone: '#b49cff', hl: { t0: im.start, t1: im.end, ja: `清算 ${usdL(l + s2, lg)}`, en: `Liq ${usdL(l + s2, lg)}` },
      stat: { head: en ? `Liquidated in ${dur}` : `${dur}の清算`, big: usdL(l + s2, lg), long: l, short: s2, longTxt: usdL(l, lg), shortTxt: usdL(s2, lg), mult: null } };
  }
  return null;
}
const LIVE = {};   // v204: サイトのカード用に保存する
const tw = new Map();   // v187: この回に出した投稿のID(返信用)
for (const { p, lg } of todo) {
  if (n >= MAX_POSTS && !p.parent) { console.log('[post] 1回の上限に達したので残りは次回'); break; }   // v188: 返信は上限でも親と一緒に出す(親だけ出て返信が捨てられるのを防ぐ)
  // v187: 返信は、この回に親を出した時だけ(親の投稿IDが要る)。親が前の回に出ていたら返信は出さずに済みにする
  let reply = null;
  if (p.parent) {
    reply = tw.get(p.parent + ':' + lg) || null;
    if (!reply && !DRY) {
      const par = posts.find((x) => x.id === p.parent);
      if (par && par.done && par.done[lg]) { await site('/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mark: { id: p.id, lang: lg, v: true } }) }); console.log('[post] 親が前の回に出ているので返信は出しません', p.id + ':' + lg); }
      continue;
    }
  }
  // v202: 日誌スレッド。毎朝の予定(daily)をその日の親にして、ほかの自動投稿はその日の最新の投稿への返信としてつなぐ。番号「10/26 · #3」を最後に付ける
  let no = null;
  if (!p.parent && (THREAD_SR.has(p.sr) || p.sr === 'daily')) {
    const root = p.sr === 'daily' ? null : latestRoot(lg);
    if (p.sr === 'daily') no = 1;
    else if (root) {
      const mem = posts.filter((x) => x.tw && x.tw[lg] && x.done && x.done[lg] >= root.done[lg] && x.id !== root.id);
      const last = [root, ...mem].sort((a, b) => b.done[lg] - a.done[lg])[0];
      reply = (tw.get(last.id + ':' + lg)) || last.tw[lg]; no = 1 + mem.filter((x) => !x.parent).length + 1;
    }
  }
  let text = p[lg];
  // v208: FOMC の親子ポスト。本文と画像を投稿する時に作る(発表後の親子は出さない。計算できなければ次の回)
  if (FOMC_SR.has(p.sr)) {
    const E = p.img && p.img.t, nowT = Date.now();
    if (!E || (p.sr !== 'fomcres' && nowT >= E)) continue;
    try {
      if (!S5) S5 = await loadBtc5m(nowT, site);
      const key = E + ':' + (p.sr === 'fomcres' ? 'res' : p.img.n) + ':' + lg;
      let lv = FCACHE.get(key); if (!lv) { lv = fomcMatch(S5, nowT, E, lg, p.sr === 'fomcres' ? E - L.FOMC_SLOTS[L.FOMC_SLOTS.length - 1] : Math.min(nowT, E - L.FOMC_SLOTS[p.img.n - 1])); if (lv) FCACHE.set(key, lv); }   // 選ぶ時点は予定の時刻にそろえる(親・子・結果で同じ TOP3)
      if (!lv || (p.sr === 'fomcres' && lv.a1 == null)) { console.log('[post] FOMC: まだ計算できないので次の回', p.id); continue; }
      text = L.fomcText(p.sr, lv, lg, nowT);
      p.img = { ...p.img, live: { ...((p.img && p.img.live) || {}), [lg]: { ...lv, kind: p.sr === 'fomc' ? 'fomc1' : p.sr === 'fomcc' ? 'fomc3' : 'fomcres', now: nowT } } };
      if (p.sr === 'fomcres' && !reply) { const ch = posts.find((x) => x.id === p.img.after), par = posts.find((x) => x.id === String(p.img.after).replace(/:c$/, '')); reply = (ch && ch.tw && ch.tw[lg]) || (par && par.tw && par.tw[lg]) || null; }
    } catch (e) { console.log('[post] FOMC を作れませんでした', p.id, e.message); continue; }
  }
  // v204: 毎朝・夜は BTC実況(7日)。v206: 発表前・発表後・急変動・清算も、期間を変えた BTC実況の画像にする
  if (LIVE_SR.has(p.sr)) {
    try {
      if (!S5) S5 = await loadBtc5m(Date.now(), site);
      if (!EVL) { try { EVL = L.groups(L.pickEvents(await (await site('/api/cal')).json()).filter(L.AUTOEV)).map((g) => ({ t: g[0].ts, ja: L.headName(g, 'ja'), en: L.headName(g, 'en'), c: g[0].c })); } catch (_) { EVL = []; } }
      const lv = await liveFor(p, lg, Date.now());
      if (lv) {
        p.img = { ...(p.img || {}), live: { ...((p.img && p.img.live) || {}), [lg]: lv } };
        if (p.sr === 'daily' || p.sr === 'sum') {
          const ln = liveLine(lv, lg), i = text.lastIndexOf('\n\n#'), t2 = i > 0 ? text.slice(0, i) + '\n\n' + ln + text.slice(i) : text + '\n\n' + ln;
          if (L.xlen(t2) <= 262) text = t2;
          LIVE[lg] = lv;
        }
      }
    } catch (e) { console.log('[post] BTC実況を作れませんでした(いつもの画像で出します):', e.message); }
  }
  if (no) { const d = lg === 'en' ? new Date(Date.now()) : new Date(Date.now() + 9 * 36e5), tag = `🔹 ${lg === 'en' ? ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getUTCMonth()] + ' ' + d.getUTCDate() : (d.getUTCMonth() + 1) + '/' + d.getUTCDate()} · #${no}`; if (L.xlen(text + '\n\n' + tag) <= 280) text += '\n\n' + tag; }
  const png = await render(p, lg), name = `${p.id.replace(/[^a-z0-9-]+/gi, '-')}-${lg}`;
  if (DRY) {
    fs.writeFileSync(path.join(OUT, name + '.txt'), text + `\n\n(${L.xlen(text)}/280)\n`);
    if (png) fs.writeFileSync(path.join(OUT, name + '.png'), png);
    console.log(`==== ${name} (${L.xlen(text)}/280${png ? ', 画像あり' : ', 画像なし'}) ====\n${text}\n`);
    n++; continue;
  }
  try {
    let media = null;
    if (png) {
      try { const m = await xapi('https://api.x.com/2/media/upload', { media: png.toString('base64'), media_category: 'tweet_image' }); media = m && m.data && m.data.id; }
      catch (e) { console.log('[post] 画像のアップロードに失敗(文だけで投稿します):', e.message); }
    }
    const res = await xapi('https://api.x.com/2/tweets', { text, ...(media ? { media: { media_ids: [String(media)] } } : {}), ...(reply ? { reply: { in_reply_to_tweet_id: String(reply) } } : {}) });
    if (res && res.data && res.data.id) tw.set(p.id + ':' + lg, res.data.id);
    if (res && res.data && res.data.id) { p.tw = { ...(p.tw || {}), [lg]: String(res.data.id) }; if (no) p.no = { ...(p.no || {}), [lg]: no }; }
    console.log(`[post] 投稿しました ${p.id}:${lg} → ${res && res.data && res.data.id}${media ? ' (画像つき)' : ''}`);
    await site('/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mark: { id: p.id, lang: lg, v: true, tw: res && res.data && res.data.id, no } }) });
    p.done = p.done || {}; p.done[lg] = Date.now();
    n++;
    await new Promise((r) => setTimeout(r, 3000));
  } catch (e) {
    console.log('[post] 投稿に失敗:', p.id + ':' + lg, e.message);
    if (/HTTP 4(01|02|03)/.test(e.message)) break;   // 鍵・権限・残高の問題は続けても同じなので止める
  }
}
if (browser) await browser.close();
if (!DRY && (LIVE.ja || LIVE.en)) { try { let o = {}; try { o = (await (await site('/api/admin/rx-one?name=wk')).json()) || {}; } catch (_) {} await site('/api/admin/rx-put?name=wk', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ ...o, ...LIVE, at: Date.now() }) }); } catch (e) { console.log('[post] BTC実況をサイトに保存できませんでした', e.message); } }
if (!DRY) await writeDue();
console.log(`[post] ${DRY ? '試し(投稿なし)' : '投稿'} ${n}件`);

// Worker が見張る予定(x:due)を書き直す
async function writeDue() {
  try {
    const cal = await (await site('/api/cal')).json();
    const d = L.dueList(posts, L.pickEvents(cal), Date.now());
    await site('/api/admin/rx-put?name=xd', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(d) });
  } catch (e) { console.log('[post] x:due を書けませんでした:', e.message); }
}
