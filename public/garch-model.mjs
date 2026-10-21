// Zero-mean Gaussian GARCH(1,1), variance targeting and bounded grid QMLE.
// Inputs are closed 5-minute OHLCV bars. No future bars enter estimation.
export function estimateGarch(input, now = Date.now()) {
  const step = 300;
  const bars = (Array.isArray(input) ? input : []).filter(b => Array.isArray(b) && Number.isFinite(b[0]) && b[0] + step <= now / 1000).sort((a,b) => a[0]-b[0]);
  const unavailable = reason => ({ available: false, reason, model: 'GARCH(1,1)' });
  if (bars.length < 61) return unavailable('insufficient_data');
  if (now / 1000 - (bars.at(-1)[0] + step) > 900) return unavailable('stale_data');
  const r = [];
  for (let i=0; i<bars.length; i++) {
    if (!Number.isFinite(bars[i][4]) || bars[i][4] <= 0 || (i && bars[i][0]-bars[i-1][0] !== step)) return unavailable('invalid_or_gapped_data');
    if (i) r.push(100 * Math.log(bars[i][4]/bars[i-1][4]));
  }
  const variance = r.reduce((s,x)=>s+x*x,0)/r.length;
  if (!(variance > 1e-12) || !Number.isFinite(variance)) return unavailable('flat_or_invalid_data');
  let best = null;
  for (const alpha of [0.03,0.05,0.1,0.15,0.2]) for (const beta of [0.5,0.7,0.8,0.9,0.94]) {
    if (alpha+beta >= 0.995) continue;
    const omega = variance*(1-alpha-beta);
    let h=variance, loss=0;
    for (const x of r) { loss += Math.log(h)+x*x/h; h=omega+alpha*x*x+beta*h; }
    if (!best || loss<best.loss) best={omega,alpha,beta,h,loss};
  }
  const forecasts={};
  let h=best.h, total=0;
  for(let i=1;i<=288;i++) {
    total+=h;
    if ([1,12,72,288].includes(i)) forecasts[({1:'5m',12:'1h',72:'6h',288:'24h'})[i]]=Math.sqrt(total);
    h=best.omega+(best.alpha+best.beta)*h;
  }
  return {available:true,model:'GARCH(1,1)',method:'variance-targeted grid QMLE; zero mean',experimental:true,samples:r.length,as_of:new Date((bars.at(-1)[0]+step)*1000).toISOString(),parameters:{omega:best.omega,alpha:best.alpha,beta:best.beta},sigma_pct:forecasts};
}
