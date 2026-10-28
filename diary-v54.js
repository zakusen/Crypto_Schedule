/* v54 日記：事実のタイムライン。取込時刻を出来事の時刻として扱わない。 */
let dyLedgerDays={},dyWeekLoaded={},dyWeekBusy={};
function dyWeekHTML(d){
  const start=mondayOf(d),local=new Set(dyDays());
  return '<nav class="dy-week" aria-label="週の日付">'+Array.from({length:7},(_,i)=>{const day=addDays(start,i),has=local.has(day)||dyLedgerDays[day];return '<button data-week-day="'+day+'" class="'+(day===d?'selected ':'')+(has?'has-record':'')+'" aria-pressed="'+(day===d)+'"'+(day>today()?' disabled':'')+'><small>'+'月火水木金土日'[i]+'</small><b>'+Number(day.slice(8))+'</b><i aria-label="記録あり"></i></button>';}).join('')+'</nav>';
}
async function dyLoadWeek(d){
  const start=mondayOf(d);if(!online||dyWeekBusy[start]||Date.now()-(dyWeekLoaded[start]||0)<30000)return;
  dyWeekBusy[start]=true;
  try{const j=await lgApi({op:'days',from:start,to:addDays(start,6)});Object.assign(dyLedgerDays,j.days);dyWeekLoaded[start]=Date.now();
    document.querySelectorAll('[data-week-day]').forEach(b=>b.classList.toggle('has-record',!!dyLedgerDays[b.dataset.weekDay]||dyLocalHas(b.dataset.weekDay)));
  }catch(e){}finally{delete dyWeekBusy[start];}
}
function dyEventTime(value,d){
  if(!value)return null;
  const t=typeof value==='number'?value:Date.parse(value);
  return Number.isFinite(t)&&jstDay(t)===d?t:null;
}
function dyTimelineHTML(d,data){
  const x=data||{},acts=x.activities||[],maybe=new Set((x.maybeCorrections||[]).flat()),events=[];
  acts.filter(a=>a.status==='active').forEach(a=>events.push({key:'a:'+a.id,t:dyEventTime(a.occurredAt,d),html:lgActRow(a,maybe.has(a.id))}));
  sessions.filter(s=>sesLive(s)&&(sesDayMap(s)[d]||0)>0).forEach(s=>{
    const t=Math.max(+s.start||0,Date.parse(d+'T00:00:00+09:00'));
    events.push({key:'s:'+s.id,t:dyEventTime(t,d),html:'<details class="dy-event-detail"><summary><span class="lg-src">タイマー</span><b>'+esc(taskTitle(s))+'</b><small>'+Math.round(sesDayMap(s)[d]/60000)+'分（計測）</small></summary><p>開始 '+esc(dyHM(s.start))+(s.end?' ／ 終了 '+esc(dyHM(s.end)):'')+'</p><button data-session-details>集中の記録を1件ずつ見る</button></details>'});
  });
  if(x.study)events.push({key:'study',t:dyEventTime(x.study.occurredAt,d),html:lgStudyHTML(x.study)});
  dyNotes(d).forEach(f=>events.push({key:'n:'+f.id,t:dyEventTime(+f.createdAt,d),html:'<div class="dy-note-event"><span class="lg-src">自分</span>'+dyRowHTML('n:'+f.id,'','text',f.value,dyHintHTML(factHist(f),'text','n:'+f.id),'<button class="dp-rt" data-rt="'+esc(f.id)+'">取り消し</button>')+'</div>'}));
  events.sort((a,b)=>(a.t==null?Infinity:a.t)-(b.t==null?Infinity:b.t)||a.key.localeCompare(b.key));
  let untimed=false;
  return events.map(e=>{let head='';if(e.t==null&&!untimed){untimed=true;head='<h4 class="dy-no-time">時刻なし</h4>';}
    return head+'<div class="dy-event" data-event-key="'+esc(e.key)+'" data-event-time="'+(e.t||'')+'"><time>'+(e.t?esc(dyHM(e.t)):'—')+'</time><div class="dy-event-body">'+e.html+'</div></div>';
  }).join('')||'<p class="mu dp-empty">この日の出来事はまだありません。</p>';
}
function lgFillDiary(d){
  const box=$('dyLedger');if(!box||box.dataset.d!==d)return;
  const c=lgCache[d],x=c&&c.data||{},r=dyRecOf(d),timer=focusMinOf(d),self=Math.max(+x.selfReportMinutes||0,+(r&&r.minutes)||0);
  const sum=$('dySummary');if(sum)sum.textContent='取り組んだ分 '+Math.max(timer,self)+'分（タイマー '+timer+'／自己申告 '+self+'） · 活動 '+(c&&c.data?(x.activities||[]).filter(a=>a.status==='active').length:'—')+'件 · 統計 '+(c&&c.data?(x.study?x.study.correct+'/'+x.study.answered:'0/0'):'—')+'問'+(c&&c.data?'':'（台帳未取得）');
  const tmp=document.createElement('div');tmp.innerHTML=lgDayHTML(d,c);
  tmp.querySelectorAll('.lg-act:not(.off),.lg-study,.lg-sum').forEach(e=>e.remove());
  box.querySelector('.lg-body').innerHTML=obTabsHTML()+obViewHTML(d,c)+'<div class="dy-ledger-controls">'+tmp.innerHTML+'</div>';   // v56：見方の切り替え（一覧／分解／計器）
  obLedgerStatus(c);obBind(box);
  box.querySelectorAll('[data-lgact]').forEach(b=>b.onclick=()=>lgOpenAct(b.dataset.lgact,d));
  box.querySelectorAll('[data-lgre]').forEach(b=>b.onclick=()=>{lgInvalidate(d);lgDiary(d);});
  box.querySelectorAll('[data-lgsup]').forEach(b=>b.onclick=()=>lgAction({action:'supersede',id:b.dataset.lgsup,by:b.dataset.lgby},d,'置き換えました（元の記録も残っています）'));
  box.querySelectorAll('[data-lgkeep]').forEach(b=>b.onclick=()=>lgAction({action:'keep_both',id:b.dataset.lgkeep,with:b.dataset.lgwith},d,'両方を別の活動として残しました'));
  box.querySelectorAll('[data-session-details]').forEach(b=>b.onclick=()=>openDySessions(d));
  dyBind();dyBindWeek();
}
function dyBindWeek(){
  document.querySelectorAll('[data-week-day]').forEach(b=>b.onclick=()=>dyGo(b.dataset.weekDay));
  const list=$('dyList');if(list)list.ontoggle=()=>S('dyTimeOpen',list.open);
  dyLoadWeek(dySel);
}
async function lgDiary(d){
  lgFillDiary(d);
  if(!online){const box=$('dyLedger');if(box)box.querySelector('.dy-ledger-controls').innerHTML='<p class="mu">オフラインです。端末の記録を表示しています。</p>';obLedgerStatus(null);return;}
  await lgLoadDay(d);lgFillDiary(d);
}
