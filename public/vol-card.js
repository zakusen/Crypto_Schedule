/* v192: BTC ボラティリティ・モニター(トップの BTC チャートのすぐ上)。/api/vol を読むだけ。
   過去の実際の値動き(事実)と GARCH(1,1) の見積もり(参考値)を分けて表示する。方向の予測はしない。 */
(() => {
  const box = document.getElementById('volCard'); if (!box) return;
  const EN = () => !window.CSA_LANG || CSA_LANG() === 'en', TL = (j, e) => EN() ? e : j;
  const pc = (v) => v == null || !isFinite(v) ? '—' : '±' + v.toFixed(2) + '%';
  const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');
  const fdt = (t) => new Intl.DateTimeFormat(EN() ? 'en-US' : 'ja-JP', { timeZone: EN() ? 'UTC' : 'Asia/Tokyo', month: EN() ? 'short' : 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t)) + (EN() ? ' UTC' : '');
  const css = `<style>
#volCard{padding:16px 18px;margin-bottom:14px}
#volCard .vh{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
#volCard .vt{font-size:11px;letter-spacing:.14em;color:var(--muted,#7f8a99);font-weight:700}
#volCard .vu{font-size:11px;color:var(--muted,#7f8a99)}
#volCard .vtop{display:grid;grid-template-columns:minmax(150px,220px) 1fr;gap:18px;align-items:center;margin-top:10px}
#volCard .vbig{font:700 44px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:-.02em}
#volCard .vbig small{font-size:18px;margin-left:2px}
#volCard .vst{margin-top:6px;font-size:13px;font-weight:700}
#volCard .vsub{font-size:11px;color:var(--muted,#7f8a99);margin-top:2px}
#volCard canvas{width:100%;height:120px;display:block}
#volCard .vgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
#volCard .vbox{border:1px solid var(--line,#202a36);border-radius:10px;padding:10px 12px;background:rgba(255,255,255,.02)}
#volCard .vbox b{display:block;font-size:11px;color:var(--muted,#7f8a99);font-weight:600}
#volCard .vbox .n{font:700 20px/1.2 "IBM Plex Mono",ui-monospace,monospace;margin-top:2px}
#volCard .vbox .m{font-size:11px;color:var(--cyan,#69c7d6);margin-top:2px}
#volCard .vline{margin-top:12px;font-size:12px;line-height:1.6}
#volCard .vnote{margin-top:8px;font-size:10.5px;color:var(--dim,#4e5968);line-height:1.5}
#volCard a{color:inherit}
@media(max-width:640px){#volCard .vtop{grid-template-columns:1fr}#volCard .vbig{font-size:38px}#volCard .vbox .n{font-size:16px}#volCard .vbox{padding:8px}}
</style>`;
  let D = null;
  const level = (r) => r == null ? ['—', 'var(--muted,#7f8a99)'] : r >= 2 ? [TL('普段より大きく動いています', 'Moving much more than usual'), '#e4b96a'] : r >= 1.3 ? [TL('普段よりやや大きめ', 'Somewhat above usual'), '#e4b96a'] : r >= 0.7 ? [TL('普段どおり', 'About usual'), 'var(--text,#e8ebf0)'] : [TL('普段より小さい', 'Quieter than usual'), 'var(--cyan,#69c7d6)'];
  function draw() {
    if (!D || !D.available) { box.innerHTML = css + `<div class="vh"><span class="vt">${TL('BTC 値動きの大きさ', 'BTC VOLATILITY')}</span></div><div class="vsub" style="margin-top:8px">${TL('準備中(1時間ごとに更新)', 'Preparing (updated hourly)')}</div>`; return; }
    const [st, col] = level(D.ratio), g = D.garch || {}, H = ['1', '6', '24'], HL = { 1: TL('1時間', '1 hour'), 6: TL('6時間', '6 hours'), 24: TL('24時間', '24 hours') }, gk = { 1: '1h', 6: '6h', 24: '24h' };
    const nx = D.next, acc = D.acc || { n: 0, hit: 0 };
    box.innerHTML = css + `<div class="vh"><span class="vt">${TL('BTC 値動きの大きさ', 'BTC VOLATILITY')}</span><span class="vu">${TL('更新 ', 'Updated ')}${fdt(D.end)}</span></div>
      <div class="vtop"><div><div class="vbig" style="color:${col}">${D.ratio != null ? D.ratio.toFixed(1) : '—'}<small>×</small></div>
        <div class="vst" style="color:${col}">${st}</div>
        <div class="vsub">${TL('直近24時間の1時間ごとの変動 ', 'Last 24h avg 1h move ')}${pc(D.now1)} / ${TL('過去30日 ', '30-day normal ')}${pc(D.typ[1])}</div>
        <div class="vsub">${TL('24時間の値幅 ', '24h range ')}${D.range24 ? D.range24.pct + '% (' + usd(D.range24.lo) + '–' + usd(D.range24.hi) + ')' : '—'}</div></div>
        <canvas id="volCv"></canvas></div>
      <div class="vgrid">${H.map((k) => `<div class="vbox"><b>${HL[k]}${TL('の普段の幅', ' normal move')}</b><div class="n">${pc(D.typ[k])}</div><div class="m">${TL('モデル ', 'Model ')}${pc(g[gk[k]])}</div></div>`).join('')}</div>
      ${nx ? `<div class="vline">${TL('次の主要指標: ', 'Next major release: ')}<b>${EN() ? nx.en : nx.ja}</b> · ${fdt(nx.ts)}${nx.avg != null && nx.n ? `<br>${TL(`過去${nx.n}回の発表から1時間のBTC: 平均 ±${nx.avg.toFixed(2)}%`, `BTC 1h after the last ${nx.n} releases: avg ±${nx.avg.toFixed(2)}%`)}${D.typ[1] ? TL(`(普段の1時間の${(nx.avg / D.typ[1]).toFixed(1)}倍)`, ` (${(nx.avg / D.typ[1]).toFixed(1)}x a normal hour)`) : ''}` : ''}</div>` : ''}
      <div class="vline" style="color:var(--muted,#7f8a99)">${acc.n >= 3 ? TL(`モデルの答え合わせ: 直近${acc.n}回中${acc.hit}回、24時間の実際の変化が見積もり(±1σ)の範囲内(目安は約68%)`, `Model check: ${acc.hit} of the last ${acc.n} days stayed within the 24h estimate (±1σ; ~68% expected)`) : TL('モデルの答え合わせ: 記録をためています', 'Model check: collecting data')}</div>
      <div class="vnote">${TL('「普段の幅」は過去30日の実際の値動き(1時間足の対数変化の二乗平均平方根)。「モデル」は GARCH(1,1) による見積もりで参考値。どちらも上げ下げの向きは示しません。予測や売買の助言ではありません。', '"Normal move" = actual moves over the past 30 days (RMS of 1h log returns). "Model" = GARCH(1,1) estimate, for reference only. Neither indicates direction. Not a forecast or advice.')} <a href="/garch.html">GARCH →</a></div>`;
    chart();
  }
  function chart() {
    const cv = document.getElementById('volCv'); if (!cv || !D.px || D.px.length < 5) return;
    const W = cv.clientWidth, Hh = cv.clientHeight, dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = Hh * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const px = D.px, t0 = px[0][0], t1 = D.end, s1 = D.typ[1] / 100;
    const i0 = px.findIndex((p) => p[0] >= t1 - 864e5), base = px[Math.max(0, i0 - 1)];   // 24時間前の価格から広がる「普段の幅」(±1σ√時間)
    const env = []; for (let k = 0; k <= 24; k++) { const t = base[0] + k * 36e5, w = s1 * Math.sqrt(k); env.push([t, base[1] * Math.exp(w), base[1] * Math.exp(-w)]); }
    const vals = [...px.map((p) => p[1]), ...env.map((e) => e[1]), ...env.map((e) => e[2])], mx = Math.max(...vals), mn = Math.min(...vals);
    const X = (t) => 4 + (t - t0) / (t1 - t0) * (W - 8), Y = (v) => 6 + (mx - v) / (mx - mn || 1) * (Hh - 18);
    g.fillStyle = 'rgba(105,199,214,.14)'; g.beginPath(); env.forEach((e, i) => i ? g.lineTo(X(e[0]), Y(e[1])) : g.moveTo(X(e[0]), Y(e[1]))); for (let i = env.length - 1; i >= 0; i--) g.lineTo(X(env[i][0]), Y(env[i][2])); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(105,199,214,.55)'; g.lineWidth = 1; g.setLineDash([3, 3]); for (const j of [1, 2]) { g.beginPath(); env.forEach((e, i) => i ? g.lineTo(X(e[0]), Y(e[j])) : g.moveTo(X(e[0]), Y(e[j]))); g.stroke(); } g.setLineDash([]);
    g.strokeStyle = '#f7931a'; g.lineWidth = 2; g.beginPath(); px.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.stroke();
    g.fillStyle = 'rgba(127,138,153,.9)'; g.font = '10px system-ui'; g.fillText(TL('48時間 · 帯 = 24時間前からの普段の幅', '48h · band = normal range from 24h ago'), 4, Hh - 2);
  }
  fetch('/api/vol').then((r) => r.json()).then((j) => { D = j; draw(); }).catch(() => draw());
  window.addEventListener('csa-lang', draw); window.addEventListener('resize', () => D && chart());
  draw();
})();
