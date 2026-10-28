/* AIコーチ v35 — タスクと集中セッション（事実）／端末間の同期（Cloudflare R2：/api/data）
   ・タスク {id,title,status:active|done|archived,slot:null|0|1|2,date,src,createdAt,updatedAt,history[]}
   ・集中セッション {id,taskId,title,start,end,state:running|paused|ended,intervals[[a,b]],runningSince,status:active|retracted,updatedAt,dev}
     「数え続けるカウンター」は持たない。始めた時刻だけを持つので、アプリを閉じても・別の端末でも、動いているタイマーがそのまま見える
   ・日付は日本時間（JST）の0時で分ける（TeamDev core.py split_interval と同じ考え方）
   ・消さない：完了・しまう は status、名前の変更は history に残す。R2 では id ごとに新しい方（updatedAt）を残す */
const JST_OFF=9*3600e3, MIN_MS=60000, FOCUS_SLOTS=3;
const jstDay=ms=>new Date(ms+JST_OFF).toISOString().slice(0,10);
const jstMonth=ms=>jstDay(ms).slice(0,7);
function jstNextMidnight(ms){const d=new Date(ms+JST_OFF);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1)-JST_OFF;}
function splitInterval(a,b){   // [a,b) を JST の0時で区切る → {日付: ミリ秒}
  const out={};a=+a;b=+b;if(!(b>a))return out;
  let c=a;while(c<b){const s=Math.min(jstNextMidnight(c),b),k=jstDay(c);out[k]=(out[k]||0)+s-c;c=s;}
  return out;
}
let dataSkew=+L('dataSkew',0)||0;   // サーバー時刻との差（端末の時計のずれを吸収）
const nowMs=()=>Date.now()+dataSkew;
let tasks=L('tasks',[]), sessions=L('sessions',[]), dataSettings=L('dataSettings',{claudeUrl:'',chatgptUrl:'',updatedAt:0});
if(!Array.isArray(tasks))tasks=[]; if(!Array.isArray(sessions))sessions=[];
let dataQ=L('dataQ',{tasks:[],sessions:[],settings:false}); if(!dataQ||!Array.isArray(dataQ.tasks))dataQ={tasks:[],sessions:[],settings:false};
const devId=L('devId','')||(()=>{const v='d'+Math.random().toString(36).slice(2,8);S('devId',v);return v;})();
const rid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const taskById=id=>tasks.find(t=>t.id===id);
const taskTitle=s=>{const t=taskById(s.taskId);return (t&&t.title)||s.title||'（タスク）';};
const sesLive=s=>s&&s.status!=='retracted';
const sesActive=s=>sesLive(s)&&s.state!=='ended';
const activeSessionOf=taskId=>sessions.find(s=>s.taskId===taskId&&sesActive(s))||null;

/* ---- 時間の計算（確定した区間＋動いている区間） ---- */
function sesElapsed(s,t){t=t==null?nowMs():t;let n=0;(s.intervals||[]).forEach(([a,b])=>{n+=Math.max(0,b-a);});if(s.state==='running'&&s.runningSince)n+=Math.max(0,t-s.runningSince);return n;}
function sesDayMap(s,t){
  t=t==null?nowMs():t;const out={};
  const add=m=>Object.keys(m).forEach(k=>{out[k]=(out[k]||0)+m[k];});
  (s.intervals||[]).forEach(([a,b])=>add(splitInterval(a,b)));
  if(s.state==='running'&&s.runningSince)add(splitInterval(s.runningSince,Math.max(s.runningSince,t)));
  return out;
}
function dayFocusMs(d,t){let n=0;sessions.forEach(s=>{if(sesLive(s))n+=sesDayMap(s,t)[d]||0;});return n;}   // 同時に動いた分は、タスクごとに足す
function taskDayMs(taskId,d,t){let n=0;sessions.forEach(s=>{if(sesLive(s)&&s.taskId===taskId)n+=sesDayMap(s,t)[d]||0;});return n;}
const focusMinOf=d=>Math.round(((+fS[d]||0)*1000+dayFocusMs(d))/MIN_MS);   // 旧タイマー（v34まで）の秒も足す
function focusSummary(d,t){   // その日のタスクと分（事実の要約。アプリが計算）
  t=t==null?nowMs():t;const per=new Map();let running=false;
  sessions.forEach(s=>{if(!sesLive(s))return;const ms=sesDayMap(s,t)[d]||0;if(ms<=0)return;
    const k=s.taskId;const o=per.get(k)||{taskId:k,title:taskTitle(s),ms:0,running:false};o.ms+=ms;if(s.state==='running'&&jstDay(t)===d){o.running=true;running=true;}per.set(k,o);});
  const list=[...per.values()].sort((a,b)=>b.ms-a.ms).map(o=>({title:o.title,minutes:Math.round(o.ms/MIN_MS),running:o.running}));
  const ms=dayFocusMs(d,t);
  return {minutes:Math.round(ms/MIN_MS),ms,tasks:list,running};
}
function focusLines(d){const f=focusSummary(d);return f.tasks.map(x=>x.title+' '+x.minutes+'分'+(x.running?'（計測中）':''));}
const sesDays=()=>{const s=new Set();sessions.forEach(x=>{if(sesLive(x))Object.keys(sesDayMap(x)).forEach(d=>s.add(d));});return s;};

/* ---- 集中枠（最大3つ） ---- */
function slotsView(){   // [task|null ×3]。端末間でぶつかった時も3つに収める
  const out=[null,null,null],act=tasks.filter(t=>t.status==='active');
  const want=act.filter(t=>t.slot!=null&&t.slot>=0&&t.slot<FOCUS_SLOTS).sort((a,b)=>(+a.updatedAt||0)-(+b.updatedAt||0));
  const rest=[];want.forEach(t=>{if(!out[t.slot])out[t.slot]=t;else rest.push(t);});
  act.filter(t=>(t.slot==null||t.slot<0)&&activeSessionOf(t.id)).forEach(t=>rest.push(t));   // 動いているのに枠に無いタスクも見せる
  rest.forEach(t=>{const i=out.indexOf(null);if(i>=0)out[i]=t;});
  return out;
}
const inSlots=id=>slotsView().some(t=>t&&t.id===id);
const todayTasks=()=>slotsView().filter(Boolean);   // v49：「今日のタスク」は FOCUS 枠で選んだもの（タスク登録の全件ではない）

/* ---- 操作（すべて事実として残す） ---- */
function touch(kind,o){o.updatedAt=nowMs();o.dev=devId;dataQueue(kind,o.id);}
function saveData(){S('tasks',tasks);S('sessions',sessions);}
function taskAdd(title,src,extra){
  title=cut(title,100);if(!title)return null;
  const t=nowMs(),o=Object.assign({id:rid('t_'),title,status:'active',slot:null,date:jstDay(t),src:src||'user',createdAt:t,updatedAt:t,history:[]},extra||{});
  tasks.push(o);touch('tasks',o);saveData();dataChanged();return o;
}
function taskRename(id,title){
  const o=taskById(id);title=cut(title,100);if(!o||!title||title===o.title)return false;
  (o.history=o.history||[]).push({t:nowMs(),kind:'rename',from:o.title,to:title});o.title=title;
  touch('tasks',o);saveData();dataChanged();return true;
}
function taskSetStatus(id,st){
  const o=taskById(id);if(!o||o.status===st||!['active','done','archived'].includes(st))return false;
  if(st!=='active'){const s=activeSessionOf(id);if(s)timerEnd(id,true);o.slot=null;}
  (o.history=o.history||[]).push({t:nowMs(),kind:'status',from:o.status,to:st});o.status=st;
  touch('tasks',o);saveData();dataChanged();return true;
}
function slotAssign(id,at){
  const o=taskById(id);if(!o||o.status!=='active')return false;
  const v=slotsView();if(v.some(t=>t&&t.id===id))return true;
  let i=at!=null&&!v[at]?at:v.indexOf(null);if(i<0)return false;
  o.slot=i;touch('tasks',o);saveData();dataChanged();return true;
}
function slotRemove(id){
  const o=taskById(id);if(!o)return false;
  if(activeSessionOf(id))timerEnd(id,true);
  o.slot=null;touch('tasks',o);saveData();dataChanged();return true;
}
function timerToggle(taskId){   // 未開始→開始／動いている→一時停止／一時停止→再開（そのタスクだけ）
  const o=taskById(taskId);if(!o)return null;
  const t=nowMs();let s=activeSessionOf(taskId);
  if(!s){
    if(!inSlots(taskId)&&!slotAssign(taskId))return null;
    s={id:rid('s_'),taskId,title:o.title,start:t,end:null,state:'running',intervals:[],runningSince:t,status:'active',updatedAt:t,dev:devId};
    sessions.push(s);
  } else if(s.state==='running'){s.intervals.push([s.runningSince,Math.max(s.runningSince,t)]);s.runningSince=null;s.state='paused';}
  else {s.runningSince=t;s.state='running';}
  touch('sessions',s);saveData();dataChanged(s);return s;
}
function timerEnd(taskId,quiet){
  const s=activeSessionOf(taskId);if(!s)return null;
  const t=nowMs();
  if(s.state==='running'&&s.runningSince){s.intervals.push([s.runningSince,Math.max(s.runningSince,t)]);s.runningSince=null;}
  s.state='ended';s.end=t;touch('sessions',s);saveData();if(!quiet)dataChanged(s);return s;
}
function sessionRetract(id,back){   // 取り消し（消さない）。戻すこともできる
  const s=sessions.find(x=>x.id===id);if(!s)return false;
  if(!back&&s.state!=='ended'){if(s.state==='running'&&s.runningSince){s.intervals.push([s.runningSince,nowMs()]);s.runningSince=null;}s.state='ended';s.end=nowMs();}
  s.status=back?'active':'retracted';touch('sessions',s);saveData();dataChanged(s);return true;
}
function setChatUrls(c,g){
  const ok=u=>!u||/^https:\/\/[^\s<>"']+$/.test(u);
  c=String(c||'').trim();g=String(g||'').trim();
  if(!ok(c)||!ok(g))return false;
  dataSettings={claudeUrl:c,chatgptUrl:g,updatedAt:nowMs()};S('dataSettings',dataSettings);dataQ.settings=true;S('dataQ',dataQ);dataSoon();return true;
}

/* ---- 変わった時：画面・R2の日ごと保管 ---- */
let dataArcT=null;
function dataChanged(s){
  if(typeof fzPaint==='function')fzPaint(true);
  if(typeof dashPaint==='function')dashPaint();
  const days=new Set([today()]);
  if(s){days.add(jstDay(s.start||nowMs()));if(s.end)days.add(jstDay(s.end));}
  if(typeof archiveSoon==='function')days.forEach(d=>archiveSoon(d,4000));
}

/* ---- 同期：R2（/api/data）。押すのは少し待ってまとめて、読むのは開いた時と30秒ごと ---- */
let dataOldWorker=false, dataPullAgain=false, dataR2=null, dataBusy=false, dataTimer=null, dataLastSync=0, dataErr=false, dataPollT=null;
function dataQueue(kind,id){if(!dataQ[kind].includes(id))dataQ[kind].push(id);S('dataQ',dataQ);dataSoon();}
function dataSoon(ms){clearTimeout(dataTimer);dataTimer=setTimeout(dataPush,ms==null?1200:ms);}
async function dataApi(body){
  const r=await fetch(API('/api/data'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({pass:appPass},body))});
  const j=await r.json().catch(()=>({}));
  if(r.status===404){dataOldWorker=true;return {r2:false};}   // Worker が v34 以前（/api/data が無い）
  if(!r.ok) throw new Error(j.error||('HTTP '+r.status));
  return j;
}
function mergeList(local,remote,kind){   // id ごとに updatedAt の新しい方
  const map=new Map(local.map(x=>[x.id,x]));let changed=false;
  (remote||[]).forEach(r=>{if(!r||!r.id)return;const l=map.get(r.id);
    if(!l||(+r.updatedAt||0)>(+l.updatedAt||0)){map.set(r.id,r);changed=true;const qi=dataQ[kind].indexOf(r.id);if(qi>=0&&l&&(+r.updatedAt||0)>(+l.updatedAt||0))dataQ[kind].splice(qi,1);}
    else if((+l.updatedAt||0)>(+r.updatedAt||0)&&!dataQ[kind].includes(l.id))dataQ[kind].push(l.id);});
  return {list:[...map.values()],changed};
}
function dataApplyRemote(j){
  const a=mergeList(tasks,j.tasks,'tasks'),b=mergeList(sessions,j.sessions,'sessions');
  let c=false;
  if(j.settings&&(+j.settings.updatedAt||0)>(+dataSettings.updatedAt||0)){dataSettings=Object.assign({claudeUrl:'',chatgptUrl:''},j.settings);S('dataSettings',dataSettings);c=true;}
  else if((+dataSettings.updatedAt||0)>(+(j.settings&&j.settings.updatedAt)||0))dataQ.settings=true;
  tasks=a.list;sessions=b.list;saveData();S('dataQ',dataQ);
  return a.changed||b.changed||c;
}
async function dataPush(){
  if(!online||dataR2===false)return;
  if(dataBusy){dataSoon(1500);return;}
  const tq=dataQ.tasks.slice(),sq=dataQ.sessions.slice(),st=!!dataQ.settings;
  if(!tq.length&&!sq.length&&!st)return;
  const sentT=tasks.filter(x=>tq.includes(x.id)).map(x=>JSON.parse(JSON.stringify(x)));
  const sentS=sessions.filter(x=>sq.includes(x.id)).map(x=>JSON.parse(JSON.stringify(x)));
  dataBusy=true;
  try{
    const body={op:'put',tasks:sentT,sessions:sentS};if(st)body.settings=dataSettings;
    const j=await dataApi(body);
    if(j.r2===false){dataR2=false;}
    else{dataR2=true;dataErr=false;dataLastSync=Date.now();
      // 送った後に変わっていないものだけ、送った印をつける
      const same=(list,sent)=>new Set(sent.filter(x=>{const c=list.find(y=>y.id===x.id);return c&&(+c.updatedAt||0)===(+x.updatedAt||0);}).map(x=>x.id));
      const ds=same(tasks,sentT),dss=same(sessions,sentS);
      dataQ.tasks=dataQ.tasks.filter(id=>!ds.has(id));dataQ.sessions=dataQ.sessions.filter(id=>!dss.has(id));if(st)dataQ.settings=false;S('dataQ',dataQ);
      if(+j.now)dataSetSkew(+j.now);
    }
  }catch(e){dataErr=true;}
  dataBusy=false;paintSync();
  if(dataPullAgain){dataPullAgain=false;setTimeout(dataPull,50);}
  if(dataR2&&(dataQ.tasks.length||dataQ.sessions.length||dataQ.settings)&&!dataErr)dataSoon(800);
}
function dataSetSkew(serverNow){const k=serverNow-Date.now();if(Math.abs(k-dataSkew)>1500&&Math.abs(k)<36e5*12){dataSkew=k;S('dataSkew',dataSkew);}}
async function dataPull(){
  if(!online||dataR2===false)return false;
  if(dataBusy){dataPullAgain=true;return false;}   // 送っている途中なら、終わってから読む
  dataBusy=true;let changed=false;
  try{
    const t0=Date.now(),to=jstMonth(nowMs()),from=jstMonth(nowMs()-62*864e5);
    const j=await dataApi({op:'get',from,to});
    if(j.r2===false){dataR2=false;}
    else{dataR2=true;dataErr=false;dataLastSync=Date.now();if(+j.now)dataSetSkew(+j.now+(Date.now()-t0)/2);changed=dataApplyRemote(j);}
  }catch(e){dataErr=true;}
  dataBusy=false;paintSync();
  if(dataPullAgain){dataPullAgain=false;setTimeout(dataPull,50);}
  if(changed){if(typeof fzPaint==='function')fzPaint(true);if(typeof dashPaint==='function')dashPaint();}
  if(dataQ.tasks.length||dataQ.sessions.length||dataQ.settings)dataSoon(300);
  return changed;
}
function dataSyncText(){
  if(!online) return 'タスクと集中：この端末のみ（オフライン）';
  if(dataR2===null) return 'タスクと集中：同期を確認中…';
  if(dataR2===false) return dataOldWorker?'タスクと集中：この端末のみ（Worker を v35 に更新すると端末間で同期します）':'タスクと集中：この端末のみ（R2未設定）';
  const t=dataLastSync?new Date(dataLastSync):null,q=dataQ.tasks.length+dataQ.sessions.length;
  return 'タスクと集中：R2で端末間同期'+(t?'（最終 '+p2(t.getHours())+':'+p2(t.getMinutes())+'）':'')+(q?' ・未送信 '+q+'件':'')+(dataErr?' ※通信できなかった分はあとで送ります':'');
}
function paintSync(){document.querySelectorAll('[data-dsync]').forEach(e=>{e.textContent=dataSyncText();e.classList.toggle('on',dataR2===true);});}
function dataBoot(){
  paintSync();
  if(!online){dataR2=false;paintSync();return;}
  dataPull();
  clearInterval(dataPollT);dataPollT=setInterval(()=>{if(document.visibilityState==='visible')dataPull();},30000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')dataPull();else dataPush();});
  window.addEventListener('online',()=>dataPush());
}
