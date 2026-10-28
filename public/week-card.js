/* v204: BTC実況カード(トップ)。/api/week を読み、X の毎朝・夜の投稿と同じ画像(xpost-draw.js の renderLive)を描く。
   今週の BTC と、同じ時点までの形が近い過去の週 TOP3(一致率 = 相関係数×100)。点線は過去の事実の記録で、予測ではない。 */
(() => {
  const box = document.getElementById('weekCard'); if (!box) return;
  if (!document.querySelector('link[data-live-font]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.liveFont = '1'; l.href = 'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@700;900&family=Space+Grotesk:wght@500;700&family=Noto+Sans+JP:wght@400;700&display=swap'; document.head.appendChild(l); }
  const EN = () => !window.CSA_LANG || CSA_LANG() === 'en';
  let D = null, M = null;
  const css = '<style>#weekCard{padding:0;overflow:hidden;margin-bottom:14px}#weekCard img{display:block;width:100%;height:auto}#weekCard .wn{padding:8px 14px 10px;font-size:10.5px;color:var(--dim,#4e5968);line-height:1.5}</style>';
  async function draw() {
    const lv = D && (EN() ? D.en || D.ja : D.ja || D.en);
    if (!lv || !lv.top || !lv.top.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    try {
      M = M || await import('/xpost-draw.js');
      const cv = await M.renderLive(lv, EN() && D.en ? 'en' : 'ja');
      box.innerHTML = css + `<img alt="BTC" src="${cv.toDataURL('image/png')}"><div class="wn">${EN()
        ? `This week's BTC path (every 30 min, from Monday 00:00 UTC) compared with every past week since 2017 up to the same point. Match = correlation × 100. Dotted lines are what actually happened next in those weeks — not a forecast.`
        : '今週の BTC の道のり(30分ごと・月曜0時から)を、2017年以降の過去の週の同じ時点までと比べた結果。一致率 = 相関係数×100。点線はその週に実際に起きたその後で、予測ではありません。'}</div>`;
    } catch (e) { box.style.display = 'none'; }
  }
  fetch('/api/week').then((r) => r.json()).then((j) => { D = j; draw(); }).catch(() => {});
  window.addEventListener('csa-lang', draw);
})();
