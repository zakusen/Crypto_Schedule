/* v56 日記：観測日誌。1日を「観測シート」1枚として見せる（表示だけ。データ・Worker・保存の形は変えない）。
   ・台紙（日付・シート番号・状態・台帳の読込状態）
   ・見方の切り替え：一覧（時刻順）／分解（層ごと）／計器（24時間の文字盤）。キー 1・2・3、前回の見方を覚える
   ・円弧の位置と長さは、台帳の時刻・タイマーの区間から計算する。時刻が無い記録は「時刻なし」に分け、時刻を作らない
   ・日付を変えると、観測シートが回って入れ替わる */
const OB_VIEWS=[['list','一覧'],['split','分解'],['dial','計器']];
/* PC（幅1000px以上・マウス）は、アプリの 1〜4 キーが下のタブの切り替えなので、見方は Q・W・E。それ以外は 1・2・3 */
const obPC=()=>{try{return matchMedia('(min-width:1000px) and (hover:hover) and (pointer:fine)').matches;}catch(e){return false;}};
const obKeys=()=>obPC()?['q','w','e']:['1','2','3'];
const OB_SRC={chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini',ai:'AI',manual:'自分',aicoach:'アプリ',other:'その他'};
let obView=(function(){const v=L('obView','list');return OB_VIEWS.some(x=>x[0]===v)?v:'list';})();
let obBusy=false,obPendingIn=0,obTick=null;
const obReduce=()=>{try{return matchMedia('(prefers-reduced-motion:reduce)').matches;}catch(e){return false;}};
const obDay0=d=>Date.parse(d+'T00:00:00+09:00');
const obMin=(t,d)=>(t-obDay0(d))/60000;               // その日の0時（JST）からの分
const obHMm=m=>p2(Math.floor(m/60))+':'+p2(Math.floor(m%60));

/* ---- 出来事を、元の事実のまま構造化する（円弧・合計は全部ここから計算） ---- */
function obSesSegs(s,d){
  const t0=obDay0(d),t1=t0+864e5,segs=[];
  const add=(a,b)=>{a=Math.max(+a,t0);b=Math.min(+b,t1);if(b>a)segs.push([a,b]);};
  (s.intervals||[]).forEach(([a,b])=>add(a,b));
  if(s.state==='running'&&s.runningSince)add(s.runningSince,Math.max(+s.runningSince,nowMs()));
  return segs;
}
function obEvents(d,data){
  const x=data||{},ev=[];
  (x.activities||[]).filter(a=>a.status==='active').forEach(a=>ev.push({key:'a:'+a.id,id:a.id,kind:'act',layer:'rec',src:a.source||'other',t:dyEventTime(a.occurredAt,d),label:a.did||'（やったこと未記入）',min:a.minutes!=null?+a.minutes:null}));
  sessions.filter(s=>sesLive(s)&&(sesDayMap(s)[d]||0)>0).forEach(s=>{
    const segs=obSesSegs(s,d);
    ev.push({key:'s:'+s.id,id:s.id,kind:'timer',layer:'timer',src:'timer',t:segs.length?segs[0][0]:null,segs,label:taskTitle(s),min:Math.round(sesDayMap(s)[d]/60000)});
  });
  if(x.study)ev.push({key:'study',kind:'study',layer:'study',src:'study',t:dyEventTime(x.study.occurredAt,d),label:'演習ログ',ok:x.study.correct,all:x.study.answered});
  dyNotes(d).forEach(f=>ev.push({key:'n:'+f.id,id:f.id,kind:'memo',layer:'memo',src:'memo',t:dyEventTime(+f.createdAt,d),label:f.value}));
  return ev;
}
function obSheetNo(d){
  const days=dyDays();const first=days[0];if(!first||d<first)return null;
  return Math.round((obDay0(d)-obDay0(first))/864e5)+1;
}

/* ---- 台紙 ---- */
/* v59 その日のクリスタル：今日タブと同じ元データ（集中タイマー＋旧タイマーの秒）と同じ式（crysTierOf）。保存は増やさず、毎回計算する。
   集中が1分に満たない日は「—」（氷晶を付けない） */
function obCrysModel(d){const ms=dayFocusMs(d)+(+fS[d]||0)*1000,m=mins(ms);return m>0?{m:m,st:crysTierOf(ms)}:{m:0,st:-1};}
function obCrysHTML(d){
  const c=obCrysModel(d),on=c.st>=0,t=on?CRYS_TIERS[c.st]:null,live=d===today();
  const tm=c.m>=60?Math.floor(c.m/60)+'時間'+(c.m%60)+'分':c.m+'分';
  return '<div class="ob-crys'+(on?'':' off')+'" data-k="'+c.st+':'+c.m+'"'+(live?' data-ob-now="crys"':'')+(on?' style="--ct:'+t[1]+'"':'')+
    ' role="img" aria-label="'+(on?'この日のクリスタル：'+t[0]+'（集中'+tm+'）':'この日のクリスタル：なし（集中の記録なし）')+'">'+
    '<i class="ob-cdot"></i>'+(on?'<b>'+t[0]+'</b><span class="mono">'+tm+'</span>':'<span>クリスタル —</span>')+'</div>';
}
function obHeadHTML(d){
  const no=obSheetNo(d),isToday=d===today();
  return '<div class="ob-head"><div class="ob-kick">観測日誌 ／ OBSERVATION LOG</div>'+
    '<div class="ob-row"><h2 class="ob-title">'+esc(dyMD(d))+'</h2><span class="ob-state '+(isToday?'now':'past')+'">'+(isToday?'<i></i>観測中':'記録済み')+'</span></div>'+
    obCrysHTML(d)+
    '<div class="ob-meta mono"><span>SHEET '+esc(d)+(no?' / No. '+String(no).padStart(4,'0'):'')+'</span><span id="obLedger">台帳 読込中…</span></div></div>';
}
function obLedgerStatus(c){
  const e=$('obLedger');if(!e)return;
  let t='台帳 読込中…',cls='';
  if(typeof online!=='undefined'&&!online&&!(c&&c.data)){t='オフライン（端末の分だけ）';cls='warn';}
  else if(c&&c.error){t='台帳を読めず（端末の分だけ）';cls='warn';}
  else if(c&&c.data){t='台帳 読込済み';}
  e.textContent=t;e.className=cls;
}
function obTabsHTML(){
  return '<div class="ob-tabs" role="tablist" aria-label="見方">'+OB_VIEWS.map((v,i)=>'<button role="tab" data-ob-view="'+v[0]+'" aria-selected="'+(obView===v[0])+'" class="'+(obView===v[0]?'on':'')+'">'+v[1]+'<kbd>'+obKeys()[i].toUpperCase()+'</kbd></button>').join('')+'</div>';
}
const obColor=e=>e.kind==='act'?'var(--ob-s-'+(OB_SRC[e.src]?e.src:'other')+')':'var(--ob-'+e.kind+')';
const obLabel=e=>e.kind==='act'?(OB_SRC[e.src]||e.src):e.kind==='timer'?'計測':e.kind==='study'?'演習ログ':'メモ';
const obAria=e=>obLabel(e)+' '+(e.t?dyHM(e.t):'時刻なし')+' '+cut(e.label||'',24);

/* ---- 計器（24時間の文字盤） ---- */
const OB_C=200,OB_R=172,OB_RING={timer:146,rec:118,study:92,memo:68};
function obPolar(r,m){const a=m/1440*2*Math.PI-Math.PI/2;return [OB_C+r*Math.cos(a),OB_C+r*Math.sin(a)];}
function obArc(r,m1,m2){const p=obPolar(r,m1),q=obPolar(r,m2);return 'M'+p[0].toFixed(2)+' '+p[1].toFixed(2)+' A'+r+' '+r+' 0 '+((m2-m1)>720?1:0)+' 1 '+q[0].toFixed(2)+' '+q[1].toFixed(2);}
function obDialHTML(d,ev,st){
  let s='<svg viewBox="-24 -24 448 448" role="group" aria-label="24時間の文字盤"><defs><radialGradient id="obDisc" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#0f2236"/><stop offset="1" stop-color="#050b16"/></radialGradient></defs><circle class="ob-disc" cx="'+OB_C+'" cy="'+OB_C+'" r="'+(OB_R+6)+'"/>';
  for(let m=0;m<1440;m+=60){const h=m/60,maj=h%6===0,p=obPolar(OB_R,m),q=obPolar(OB_R-(maj?14:7),m);s+='<line class="ob-tick'+(maj?' m':'')+'" x1="'+p[0].toFixed(1)+'" y1="'+p[1].toFixed(1)+'" x2="'+q[0].toFixed(1)+'" y2="'+q[1].toFixed(1)+'"/>';if(maj){const l=obPolar(OB_R+16,m);s+='<text class="ob-dl" x="'+l[0].toFixed(1)+'" y="'+l[1].toFixed(1)+'">'+h+'</text>';}}
  Object.values(OB_RING).forEach(r=>{s+='<circle class="ob-ring" cx="'+OB_C+'" cy="'+OB_C+'" r="'+r+'"/>';});
  ev.filter(e=>e.t!=null).forEach(e=>{
    const a=' tabindex="0" role="button" data-ob="'+esc(e.key)+'" aria-label="'+esc(obAria(e))+'"';
    if(e.kind==='timer'){e.segs.forEach(([a1,b1])=>{const m1=obMin(a1,d),m2=Math.max(obMin(b1,d),m1+6);s+='<path class="ob-arc"'+a+' d="'+obArc(OB_RING.timer,m1,Math.min(m2,1440))+'" stroke="'+obColor(e)+'"/>';});}
    else{const p=obPolar(OB_RING[e.layer],obMin(e.t,d));s+='<g class="ob-pt"'+a+'><circle cx="'+p[0].toFixed(2)+'" cy="'+p[1].toFixed(2)+'" r="6" fill="'+obColor(e)+'"/></g>';}
  });
  if(d===today())s+='<line class="ob-hand" data-ob-now="hand" x1="'+OB_C+'" y1="'+OB_C+'" x2="'+OB_C+'" y2="'+(OB_C-OB_R+4)+'"/><circle cx="'+OB_C+'" cy="'+OB_C+'" r="3" class="ob-hub"/>';
  s+='</svg>';
  return '<div class="ob-dial">'+s+'<div class="ob-ctr"><div class="ob-big mono" id="obWork">'+st.work+'<small>分</small></div><div class="ob-lbl">取り組んだ分</div>'+
    '<div class="ob-sub"><span><b class="mono">'+st.n+'</b>記録</span><span><b class="mono">'+st.study+'</b>演習 正答</span></div>'+
    (d===today()?'<div class="ob-nowt mono" data-ob-now="text"></div>':'')+'</div></div>'+
    '<div class="ob-legend"><span style="--c:var(--ob-timer)">外周＝計測</span><span style="--c:var(--ob-s-claude)">記録＝台帳の時刻</span><span style="--c:var(--ob-study)">演習ログ＝最初の解答</span><span style="--c:var(--ob-memo)">内側＝メモ</span></div>';
}

/* ---- 分解（層ごとに分けて縦に並べる） ---- */
function obSplitHTML(d,ev){
  const L4=[['rec','記録（台帳）','--ob-s-claude'],['timer','計測','--ob-timer'],['study','演習ログ','--ob-study'],['memo','メモ','--ob-memo']];
  return '<div class="ob-layers">'+L4.map((g,i)=>{
    const its=ev.filter(e=>e.layer===g[0]);const tm=its.filter(e=>e.t!=null);
    const bars=tm.map(e=>{
      const segs=e.kind==='timer'?e.segs:[[e.t,e.t]];
      return segs.map(([a,b])=>{const m1=obMin(a,d),m2=e.kind==='timer'?Math.max(obMin(b,d),m1+6):m1;const w=Math.max((m2-m1)/14.4,1.2);
        return '<button class="ob-bar" data-ob="'+esc(e.key)+'" aria-label="'+esc(obAria(e))+'" style="left:'+Math.min(m1/14.4,100-w).toFixed(2)+'%;width:'+w.toFixed(2)+'%;--c:'+obColor(e)+'"></button>';}).join('');}).join('');
    return '<section class="ob-layer" style="--i:'+i+';--c:var('+g[2]+')"><h3>'+g[1]+'<span>'+its.length+'件</span></h3>'+
      (tm.length?'<div class="ob-strip">'+bars+(d===today()?'<i class="ob-stk" data-ob-now="strip"></i>':'')+'</div><div class="ob-axis mono"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>':'<div class="ob-none">時刻つきの出来事はありません</div>')+'</section>';
  }).join('')+'</div>';
}
function obNoTimeHTML(ev){
  const its=ev.filter(e=>e.t==null);
  return '<div class="ob-notime"><h3>時刻なし <small>出来事の時刻は不明（時刻を補っていません）</small></h3>'+(its.length?its.map(e=>'<button class="ob-nt" data-ob="'+esc(e.key)+'"><span class="ob-tag" style="--c:'+obColor(e)+'">'+esc(obLabel(e))+'</span><span class="ob-ntx">'+esc(cut(e.label||'',40))+'</span>'+(e.min!=null?'<span class="mono ob-ntm">申告値 '+e.min+'分</span>':'')+'</button>').join(''):'<div class="ob-none">なし</div>')+'</div>';
}
function obHonestHTML(){
  return '<p class="ob-honest"><b>数字の出どころ</b> 取り組んだ分＝<b>計測値</b>（タイマー）と<b>申告値</b>（台帳）の大きい方。足していません。円弧の位置と長さは、台帳の時刻とタイマーの区間から計算しています。時刻が無い記録は文字盤に置いていません。</p>';
}
function obStats(d,c){
  const x=c&&c.data||{},r=dyRecOf(d),timer=focusMinOf(d),self=Math.max(+x.selfReportMinutes||0,+(r&&r.minutes)||0);
  return {work:Math.max(timer,self),n:c&&c.data?(x.activities||[]).filter(a=>a.status==='active').length:'—',study:c&&c.data?(x.study?x.study.correct+'/'+x.study.answered:'0/0'):'—'};
}
function obViewHTML(d,c){
  const ev=obEvents(d,c&&c.data),st=obStats(d,c);
  if(obView==='list')return '<div class="dy-timeline" aria-label="その日の出来事">'+dyTimelineHTML(d,c&&c.data)+'</div>';
  return (obView==='dial'?obDialHTML(d,ev,st):obSplitHTML(d,ev))+obNoTimeHTML(ev)+obHonestHTML();
}

/* ---- 操作 ---- */
function obSetView(v){
  if(!OB_VIEWS.some(x=>x[0]===v)||v===obView)return;
  obView=v;S('obView',v);
  if(typeof dySel!=='undefined'&&$('dyLedger'))lgFillDiary(dySel);
}
function obOpen(key){
  const d=dySel;
  if(key.indexOf('a:')===0)return lgOpenAct(key.slice(2),d);
  if(key.indexOf('s:')===0)return openDySessions(d);
  obSetView('list');   // 演習ログ・メモは、一覧の中でそのまま見られる
  const el=document.querySelector('[data-event-key="'+key.replace(/"/g,'')+'"]');
  if(el){el.scrollIntoView({block:'center',behavior:obReduce()?'auto':'smooth'});el.classList.add('ob-flash');setTimeout(()=>el.classList.remove('ob-flash'),1600);}
}
function obBind(box){
  box.querySelectorAll('[data-ob-view]').forEach(b=>b.onclick=()=>obSetView(b.dataset.obView));
  box.querySelectorAll('[data-ob]').forEach(b=>{b.onclick=()=>obOpen(b.dataset.ob);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();obOpen(b.dataset.ob);}};});
  obStartHand();
}
/* 今日だけ、針と「今」の表示を毎秒動かす（全体の再描画はしない） */
function obStartHand(){
  clearInterval(obTick);obTick=null;
  if(!document.querySelector('[data-ob-now]'))return;
  const go=()=>{
    const els=document.querySelectorAll('[data-ob-now]');
    if(!els.length||dySel!==today()){clearInterval(obTick);obTick=null;return;}
    const m=obMin(nowMs(),today()),dt=new Date(nowMs());
    els.forEach(e=>{const k=e.dataset.obNow;
      if(k==='hand'){const p=obPolar(OB_R-2,m);e.setAttribute('x2',p[0].toFixed(2));e.setAttribute('y2',p[1].toFixed(2));}
      else if(k==='strip')e.style.left=Math.min(m/14.4,100)+'%';
      else if(k==='crys'){const h=obCrysHTML(today()),mk=h.match(/data-k="([^"]*)"/);if(mk&&e.dataset.k!==mk[1])e.outerHTML=h;}   // v59：分が変わった時だけ差し替え
      else e.textContent='NOW '+p2(dt.getHours())+':'+p2(dt.getMinutes())+':'+p2(dt.getSeconds());});
  };
  go();obTick=setInterval(go,1000);
}

/* ---- 日付を変えると、観測シートが回って入れ替わる ---- */
function obGo(d){
  const pg=$('dyPage');
  if(!pg||obBusy||obReduce()||d===dySel)return false;
  const dir=d>dySel?1:-1;obBusy=true;
  document.querySelectorAll('[data-week-day]').forEach(b=>{const on=b.dataset.weekDay===d;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});   // キーが先に沈む
  pg.style.setProperty('--d',dir);pg.classList.add('ob-out');
  setTimeout(()=>{dySel=d;dyEdit=null;dyNoteOpen=false;dyNoteDraft='';obPendingIn=dir;obBusy=false;renderDiary();},190);
  return true;
}
function obAfterRender(){
  const pg=$('dyPage');
  if(pg&&obPendingIn&&!obReduce()){pg.style.setProperty('--d',obPendingIn);pg.classList.add('ob-in');}
  obPendingIn=0;
}
document.addEventListener('keydown',e=>{
  if(typeof activeAppTab==='undefined'||activeAppTab!=='log'||rvMode!=='diary'||!$('dyPage'))return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target&&e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT')return;
  if($('sheet')&&!$('sheet').classList.contains('hide'))return;
  const ki=obKeys().indexOf(String(e.key).toLowerCase());
  if(ki>=0)obSetView(OB_VIEWS[ki][0]);
  else if(e.key==='ArrowLeft'){dyGo(addDays(dySel,-1));}
  else if(e.key==='ArrowRight'&&dySel<today()){dyGo(addDays(dySel,1));}
});
/* スマホ：シートを左右に払うと前後の日へ */
(function(){
  let x0=null,y0=0;
  document.addEventListener('touchstart',e=>{x0=null;if(!e.target.closest||!e.target.closest('#dyPage'))return;if(e.target.closest('input,select,textarea,.ob-strip,details[open]'))return;const t=e.touches[0];x0=t.clientX;y0=t.clientY;},{passive:true});
  document.addEventListener('touchend',e=>{if(x0===null)return;const t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;x0=null;
    if(Math.abs(dx)>80&&Math.abs(dx)>Math.abs(dy)*2.2&&typeof dySel!=='undefined'){if(dx<0){if(dySel<today())dyGo(addDays(dySel,1));}else dyGo(addDays(dySel,-1));}},{passive:true});
})();
