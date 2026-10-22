/* v196: 似ている過去の値動き(清算カードの下)。/api/pat を読むだけ。
   直近の急変動(2時間 ±2% など)の形と大きさが近い過去を、2017年以降の BTC 5分足から DTW で探した結果。
   「同じ時間帯」は同時に起きた事実で、原因は示さない。未来の方向も示さない。 */
(() => {
  const box = document.getElementById('patCard'); if (!box) return;
  const EN = () => !window.CSA_LANG || CSA_LANG() === 'en', TL = (j, e) => EN() ? e : j;
  const sg = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%';
  const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');
  const fdt = (t, y) => new Intl.DateTimeFormat(EN() ? 'en-US' : 'ja-JP', { timeZone: EN() ? 'UTC' : 'Asia/Tokyo', ...(y ? { year: 'numeric' } : {}), month: EN() ? 'short' : 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t)) + (EN() ? ' UTC' : '');
  const usdM = (v) => v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + Math.round(v / 1e6) + 'M' : '$' + Math.round(v / 1e3) + 'K';
  const REG = { US: ['米', 'US'], JP: ['日本', 'Japan'], EU: ['ユーロ圏', 'Euro'] };
  const evn = (e) => EN() ? `${(REG[e.c] || ['', e.c])[1]} ${e.s}` : (/FOMC|日銀|ECB|短観/.test(e.s) ? e.s : (REG[e.c] || [''])[0] + e.s);
  const COL = ['#69c7d6', '#c99a45', '#9b8cd8'];
  const css = `<style>
#patCard{padding:16px 18px}
#patCard .ph{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
#patCard .pt{font-size:11px;letter-spacing:.14em;color:var(--muted,#7f8a99);font-weight:700}
#patCard .pu{font-size:11px;color:var(--muted,#7f8a99)}
#patCard .lead{margin-top:8px;font-size:14px}
#patCard .lead b{font:700 24px "IBM Plex Mono",ui-monospace,monospace;margin-right:6px}
#patCard .pg{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;margin-top:10px}
#patCard canvas{width:100%;height:220px;display:block}
#patCard .m{border:1px solid var(--line,#202a36);border-radius:10px;padding:9px 11px;margin-bottom:7px;background:rgba(255,255,255,.02);font-size:12px}
#patCard .m .d{font-weight:700;font-size:13px}#patCard .m i{display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
#patCard .m ul{margin:4px 0 0;padding-left:16px;color:var(--muted,#9aa4b2)}
#patCard .note{margin-top:8px;font-size:10.5px;color:var(--dim,#4e5968);line-height:1.5}
@media(max-width:760px){#patCard .pg{grid-template-columns:1fr}}
</style>`;
  let D = null;
  function draw() {
    if (!D || !D.q) { box.innerHTML = css + `<div class="ph"><span class="pt">${TL('似ている過去の値動き · 5分足', 'SIMILAR PAST MOVES · 5M')}</span></div><div class="pu" style="margin-top:8px">${TL('次の急変動(BTC 2時間で ±2% など)で作られます', 'Created at the next sharp move (e.g. BTC ±2% in 2h)')}</div>`; return; }
    const q = D.q, up = q.chg > 0;
    box.innerHTML = css + `<div class="ph"><span class="pt">${TL('似ている過去の値動き · 5分足', 'SIMILAR PAST MOVES · 5M')}</span><span class="pu">${fdt(q.t1)} · ${TL('2017年以降から検索', 'searched since 2017')}</span></div>
      <div class="lead"><b style="color:${up ? '#6ccaa0' : '#d87878'}">${sg(q.chg)}</b>${TL(`${D.win}時間で`, `in ${D.win}h`)} ${usd(q.p0)} → ${usd(q.p1)}</div>
      <div class="pg"><div><canvas id="patCv"></canvas></div><div>${D.top.map((m, i) => `<div class="m"><div class="d"><i style="background:${COL[i]}"></i>${fdt(m.t0, 1)}</div>
        <ul><li>${TL('同じ時間帯: ', 'Same window: ')}${m.ev && m.ev.length ? m.ev.map(evn).join(' · ') + TL(' の発表', ' release') : TL('指標の発表なし', 'no scheduled release')}</li>
        ${m.liq ? `<li>${TL('清算: ', 'Liquidations: ')}${TL('ロング ', 'long ')}${usdM(m.liq.l)} / ${TL('ショート ', 'short ')}${usdM(m.liq.s)}</li>` : ''}</ul>
        <div style="margin-top:3px">${TL('その後24時間: ', '24h after: ')}<b style="color:${m.after24 > 0 ? '#6ccaa0' : m.after24 < 0 ? '#d87878' : 'inherit'}">${sg(m.after24)}</b></div></div>`).join('')}</div></div>
      <div class="note">${TL(`2017年以降の BTC 5分足から、向きと大きさが近く形(始まりを0%にそろえた道のり)が似た過去の${D.win}時間を DTW で探した結果。「同じ時間帯」は同時に起きた事実で、原因を示すものではありません。似た形でも未来の方向は分かりません。`, `Past ${D.win}h moves since 2017 (BTC 5m) with the same direction, similar size and the closest shape (DTW on the % path). "Same window" lists what happened at the same time, not causes. A similar shape does not tell the future direction.`)}${D.after && D.n > 1 ? TL(` 似た過去${D.n}件のその後24時間: ${sg(D.after.min)}〜${sg(D.after.max)}(中央値 ${sg(D.after.med)})。`, ` All ${D.n} similar cases, 24h after: ${sg(D.after.min)} to ${sg(D.after.max)} (median ${sg(D.after.med)}).`) : ''}</div>`;
    chart();
  }
  function chart() {
    const cv = document.getElementById('patCv'); if (!cv) return;
    const W = cv.clientWidth, Hh = cv.clientHeight, dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = Hh * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const q = D.q, N = q.path.length - 1, L = N * 2, top = D.top.slice(0, 3);
    const vals = [...q.path, ...top.flatMap((m) => m.path)], mx = Math.max(...vals) + .3, mn = Math.min(...vals) - .3;
    const X = (i) => 34 + i / L * (W - 42), Y = (v) => 8 + (mx - v) / (mx - mn || 1) * (Hh - 30);
    g.font = '10px system-ui'; g.strokeStyle = 'rgba(140,160,190,.15)'; g.lineWidth = 1;
    for (let v = Math.ceil(mn); v <= Math.floor(mx); v++) { g.beginPath(); g.moveTo(34, Y(v)); g.lineTo(W - 8, Y(v)); g.stroke(); g.fillStyle = '#7f8a99'; g.fillText((v > 0 ? '+' : '') + v + '%', 2, Y(v) + 3); }
    g.strokeStyle = 'rgba(232,235,240,.5)'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(X(N), 4); g.lineTo(X(N), Hh - 22); g.stroke(); g.setLineDash([]); g.fillStyle = '#e8ebf0'; g.fillText(TL('今', 'now'), X(N) + 4, 14);
    top.forEach((m, k) => { g.strokeStyle = COL[k]; g.globalAlpha = .9; g.lineWidth = 1.5; g.beginPath(); m.path.forEach((v, i) => { if (i === N + 1) { g.stroke(); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(N), Y(m.path[N])); } i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); }); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; });
    g.strokeStyle = '#f7931a'; g.lineWidth = 3; g.beginPath(); q.path.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke();
    g.fillStyle = '#7f8a99'; g.fillText(TL(`−${D.win}時間`, `−${D.win}h`), 34, Hh - 6); g.fillText(TL(`+${D.win}時間(過去の点線 = その後)`, `+${D.win}h (dotted = what came next)`), X(N) + 4, Hh - 6);
  }
  fetch('/api/pat').then((r) => r.json()).then((j) => { D = j; draw(); }).catch(() => draw());
  window.addEventListener('csa-lang', draw); window.addEventListener('resize', () => D && D.q && chart());
  draw();
})();
