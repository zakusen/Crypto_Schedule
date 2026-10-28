/* AIコーチ v66.3 — 予定タブの週カレンダー（v66.5：月表示を追加）
・普通のカレンダーのように、1週間を時間軸のグリッドで見る。授業コマ（時間割）・試験・予定したタスクを同じ週に入れる
・月表示は1か月をマス目で見渡す（各マスに主要な予定の要約）
・予定タブの表示切替（日リスト／週カレンダー）を足すだけ。日リストの描画（schedule.js）はそのまま
・週は月曜始まり。日の見出しやコマを押すと、その日の日リストへ移る */
(function(){
'use strict';
var H0=6, H1=24, HH=44; // 6:00〜24:00、1時間 = 44px
var mode='day'; try{ mode=localStorage.getItem('ac_calMode')||'day';}catch(e){}
var weekStart=null; // 表示中の週の月曜（YYYY-MM-DD）
var hm=s=>{ var m=/^(\d{1,2}):(\d{2})$/.exec(String(s||'')); return m?(+m[1])*60+(+m[2]):null;};
var subj=t=>String(t||'').replace(/\s*[\[［]*[\]］】]\s*/g,' ').replace(/\s*[(（]\s*\d+\s*[)）].*$/,'').replace(/\s+/g,' ').trim();
function mondayOf(d){ var x=new Date(d+'T00:00'), day=(x.getDay()+6)%7; return addDays(d,-day);}
function days(){ var out=[]; for(var i=0;i<7;i++) out.push(addDays(weekStart,i)); return out;}

/* 1日のコマ：時間割ブロック＋予定タスク。重なりはレーンで横に分ける */
function blocksOf(d){
var out=[];
(window.schedBlocksOf?schedBlocksOf(d):[]).forEach(function(b){
var s=hm(b.s), e=hm(b.e); if(s==null||e==null) return;
out.push({s:s,e:e,kind:b.k||'other',title:b.k==='study'?'自宅学習':subj(b.t)||b.t||'',sub:''});
});
tasks.filter(function(t){ return t.status==='active'&&t.planDate===d&&hm(t.planStart)!=null;}).forEach(function(t){
var s=hm(t.planStart); out.push({s:s,e:s+(+t.planMin||60),kind:'task',title:t.title,sub:''});
});
out.sort(function(a,b){ return a.s-b.s||a.e-b.e;});
/* レーン割り当て（重なるコマ同士で横幅を分ける） */
var lanes=[];
out.forEach(function(b){
var li=0; while(lanes[li]&&lanes[li]>b.s) li++;
lanes[li]=b.e; b.lane=li;
});
out.forEach(function(b){
var n=1; out.forEach(function(o){ if(o!==b&&o.s<b.e&&o.e>b.s) n=Math.max(n,o.lane+1);});
b.lanes=Math.max(n,b.lane+1);
});
return out;
}
function examsOf(d){ return (window.schedExams?schedExams():[]).filter(function(x){ return x.date===d;});}

function gridHTML(){
var ds=days(), td=today(), nm=new Date().getHours()*60+new Date().getMinutes();
var head='<div class="cal-head"><div class="cal-gut"></div>'+ds.map(function(d){
var x=new Date(d+'T00:00'), note=window.schedNoteOf?schedNoteOf(d):'';
return '<button class="cal-dh'+(d===td?' today':'')+'" data-cal-day="'+d+'"><small>'+'月火水木金土日'[ (x.getDay()+6)%7]+'</small><b>'+x.getDate()+'</b>'+(note?'<span class="cal-note">'+esc(note)+'</span>':'')+'</button>';
}).join('')+'</div>';
var hours=''; for(var h=H0;h<H1;h++) hours+='<div class="cal-hr" style="top:'+((h-H0)*HH)+'px"><span>'+h+':00</span></div>';
var cols=ds.map(function(d){
var ex=examsOf(d).map(function(x){ return '<div class="cal-exam">試験：'+esc(x.subject)+'</div>';}).join('');
var bl=blocksOf(d).map(function(b){
var top=Math.max(0,(b.s-H0*60)/60*HH), hgt=Math.max(16,(Math.min(b.e,H1*60)-b.s)/60*HH);
var w=100/b.lanes, left=b.lane*w;
return '<div class="cal-bl k-'+esc(b.kind)+'" style="top:'+top+'px;height:'+hgt+'px;left:calc('+left+'% + 1px);width:calc('+w+'% - 2px)" data-cal-day="'+d+'" title="'+esc(b.title)+'">'+
'<b>'+esc(b.title)+'</b><small>'+esc(min2hmOf(b.s))+'–'+esc(min2hmOf(b.e))+'</small></div>';
}).join('');
var now=(d===td&&nm>=H0*60&&nm<H1*60)?'<div class="cal-now" style="top:'+((nm-H0*60)/60*HH)+'px"></div>':'';
return '<div class="cal-col'+(d===td?' today':'')+'">'+ex+bl+now+'</div>';
}).join('');
return head+'<div class="cal-body"><div class="cal-gut cal-hours" style="height:'+((H1-H0)*HH)+'px">'+hours+'</div><div class="cal-cols" style="height:'+((H1-H0)*HH)+'px">'+cols+'</div></div>';
}
function min2hmOf(n){ return p2(Math.floor(n/60))+':'+p2(n%60);}

function paint(){
var box=$('calBox'); if(!box) return;
if(!weekStart) weekStart=mondayOf(today());
var ds=days(), x0=new Date(ds[0]+'T00:00'), x1=new Date(ds[6]+'T00:00');
box.innerHTML='<div class="sc-ch"><span class="mono">WEEK · '+(x0.getMonth()+1)+'/'+x0.getDate()+'〜'+(x1.getMonth()+1)+'/'+x1.getDate()+'</span>'+
'<span class="cal-nav"><button id="calPrev" aria-label="前の週">‹</button><button id="calThis">今週</button><button id="calNext" aria-label="次の週">›</button></span></div>'+
'<div class="cal-legend"><span class="k-class">授業</span><span class="k-study">自宅学習</span><span class="k-exam">試験</span><span class="k-task">予定タスク</span></div>'+
'<div class="cal-scroll">'+gridHTML()+'</div>'+
'<p class="mu cal-help">日の見出しやコマを押すと、その日のリストへ移ります。授業コマは時間割、予定タスクは「予定」に入れたものです。</p>';
$('calPrev').onclick=function(){ weekStart=addDays(weekStart,-7); paint();};
$('calNext').onclick=function(){ weekStart=addDays(weekStart,7); paint();};
$('calThis').onclick=function(){ weekStart=mondayOf(today()); paint();};
box.querySelectorAll('[data-cal-day]').forEach(function(el){ el.onclick=function(){ goDay(el.dataset.calDay);};});
var sc=box.querySelector('.cal-scroll'), td=today();
if(ds.indexOf(td)>=0){ var nm=new Date().getHours()*60+new Date().getMinutes(); sc.scrollTop=Math.max(0,(Math.min(Math.max(nm,H0*60+60),H1*60)-H0*60)/60*HH-120);}
}
/* ---- v66.5：月表示。1か月をマス目で見渡す。各マスは日付＋主要な予定の要約。押すとその日のリストへ ---- */
var monthCur=null;   // 表示中の月 'YYYY-MM'
function paintMonth(){
var box=$('calBox'); if(!box) return;
if(!monthCur) monthCur=today().slice(0,7);
var y=+monthCur.slice(0,4), mo=+monthCur.slice(5,7);
var first=monthCur+'-01', start=mondayOf(first);
var cells=[]; for(var i=0;i<42;i++) cells.push(addDays(start,i));
var rows='';
for(var r=0;r<6;r++){
rows+='<div class="calm-row">'+cells.slice(r*7,r*7+7).map(function(d){
var x=new Date(d+'T00:00'), inM=(x.getMonth()+1)===mo, td=today();
var bl=blocksOf(d), ex=examsOf(d), note=window.schedNoteOf?schedNoteOf(d):'';
var main=bl.filter(function(b){ return b.kind!=='study'; });
var lines='', shownMain=Math.min(main.length,ex.length?1:2);
if(ex.length) lines+='<span class="calm-l k-exam">試験：'+esc(ex[0].subject)+'</span>';
main.slice(0,shownMain).forEach(function(b){ lines+='<span class="calm-l k-'+esc(b.kind)+'">'+esc(min2hmOf(b.s))+' '+esc(b.title)+'</span>'; });
var rest=(main.length-shownMain)+Math.max(0,ex.length-1);
if(rest>0) lines+='<span class="calm-more">+'+rest+'件</span>';
if(note) lines+='<span class="calm-note">'+esc(note)+'</span>';
return '<button class="calm-cell'+(inM?'':' out')+(d===td?' today':'')+'" data-cal-day="'+d+'"><span class="calm-d">'+x.getDate()+'</span>'+lines+'</button>';
}).join('')+'</div>';
}
box.innerHTML='<div class="sc-ch"><span class="mono">MONTH · '+y+'年'+mo+'月</span>'+
'<span class="cal-nav"><button id="calMPrev" aria-label="前の月">‹</button><button id="calMThis">今月</button><button id="calMNext" aria-label="次の月">›</button></span></div>'+
'<div class="cal-legend"><span class="k-class">授業</span><span class="k-study">自宅学習</span><span class="k-exam">試験</span><span class="k-task">予定タスク</span></div>'+
'<div class="calm-head">'+'月火水木金土日'.split('').map(function(c){ return '<span>'+c+'</span>'; }).join('')+'</div>'+
'<div class="calm-grid">'+rows+'</div>'+
'<p class="mu cal-help">マスを押すと、その日のリストへ移ります。自宅学習だけの日は空けてあります（詳しくは日リストで）。</p>';
var shift=function(n){ var x=new Date(y,mo-1+n,1); monthCur=x.getFullYear()+'-'+p2(x.getMonth()+1); paintMonth(); };
$('calMPrev').onclick=function(){ shift(-1); };
$('calMNext').onclick=function(){ shift(1); };
$('calMThis').onclick=function(){ monthCur=today().slice(0,7); paintMonth(); };
box.querySelectorAll('[data-cal-day]').forEach(function(el){ el.onclick=function(){ goDay(el.dataset.calDay); }; });
}
function goDay(d){
mode='day'; try{ localStorage.setItem('ac_calMode','day');}catch(e){}
if(window.v64SetPlanDay) v64SetPlanDay(d);
if(window.planPaint) planPaint(true);
}
/* 予定タブが描かれるたびに、切替とカレンダーを差し込む */
function mount(){
var v=$('vPlan'); if(!v||v.classList.contains('hide')) return;
var nav=v.querySelector('.sc-daynav'); if(!nav) return;
if(!v.querySelector('[data-cal-toggle]')){
var t=document.createElement('div'); t.className='cal-toggle'; t.setAttribute('data-cal-toggle','1');
t.innerHTML='<button data-m="day" class="'+(mode==='day'?'on':'')+'">日リスト</button><button data-m="week" class="'+(mode==='week'?'on':'')+'">週カレンダー</button><button data-m="month" class="'+(mode==='month'?'on':'')+'">月カレンダー</button>';
nav.parentNode.insertBefore(t,nav);
t.querySelectorAll('[data-m]').forEach(function(b){ b.onclick=function(){
mode=b.dataset.m; try{ localStorage.setItem('ac_calMode',mode);}catch(e){}
if(window.planPaint) planPaint(true);
};});
} else {
v.querySelectorAll('[data-cal-toggle] [data-m]').forEach(function(b){ b.classList.toggle('on',b.dataset.m===mode);});
}
var card=$('schedBox');
if(mode==='week'||mode==='month'){
if(card) card.style.display='none';
if(!weekStart) weekStart=mondayOf(today());
var box=$('calBox');
if(!box){ box=document.createElement('section'); box.className='sc-card'; box.id='calBox'; if(card&&card.parentNode) card.parentNode.insertBefore(box,card.nextSibling);}
box.style.display=''; if(mode==='week') paint(); else paintMonth();
} else {
if(card) card.style.display='';
var box2=$('calBox'); if(box2) box2.style.display='none';
}
}
window.calMount=mount;
var _pp=window.planPaint;
if(typeof _pp==='function'&&!_pp.__calWrapped){ var w=function(f){ _pp(f); mount();}; w.__calWrapped=true; window.planPaint=w;}
var mo=new MutationObserver(function(){ mount();});
function watch(){ var v=$('vPlan'); if(v) mo.observe(v,{childList:true}); else setTimeout(watch,900);}
watch();
})();
