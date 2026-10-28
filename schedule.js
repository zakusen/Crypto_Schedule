/* AIコーチ v63 — 予定タブ（時間割＋予定したタスク）
   ・v62 は「今日」画面の中に予定を出していた → v63 で「予定」タブに移した
   ・時間割はアプリのファイルに置かない（v62 の schedule-data.js は誰でも読めた）。
     Cloudflare R2 の schedule/ に置き、パスワードが要る /api/schedule からだけ読む。端末には最後に読んだ分を控えとして持つ（オフライン用）
   ・時間割の取り込み：JSONファイル／貼り付け。同じ日付は入れ替え、ほかの日は残す。取り込みのたびに前の版を R2 に残し、戻せる
   ・タスクに予定を持たせる：task.planDate・task.planStart（"HH:MM"）・task.planMin（分）。同期は Worker v62 以降
   ・予定タスクの ▶ は既存の集中タイマー（slotAssign + timerToggle）。▶ は今日の予定だけ */
(function(){
  'use strict';
  const hm2min=s=>{ const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||'')); return m?(+m[1])*60+(+m[2]):null; };
  const min2hm=n=>{ n=((n%1440)+1440)%1440; return p2(Math.floor(n/60))+':'+p2(n%60); };
  const nowMin=()=>{ const x=new Date(); return x.getHours()*60+x.getMinutes(); };

  /* ---- 時間割の控え（R2 が正本） ---- */
  let sched=L('sched',null), schedBusy=false, schedErr='', schedHist=null;
  const KIND_JP={class:'授業 ・ 学校',exam:'試験 ・ 学校',study:'自宅学習',other:'予定'};
  window.schedBlocksOf=d=>(sched&&sched.days&&Array.isArray(sched.days[d]))?sched.days[d]:[];
  window.schedNoteOf=d=>(sched&&sched.notes&&sched.notes[d])||'';
  window.schedExams=()=>(sched&&Array.isArray(sched.exams))?sched.exams:[];
  function schedRange(){ const ks=Object.keys((sched&&sched.days)||{}).sort(); return ks.length?[ks[0],ks[ks.length-1],ks.length]:null; }
  async function scApi(body){
    const r=await fetch(API('/api/schedule'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({pass:appPass},body))});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||j.error||(body.op==='get'&&!('schedule' in j))){
      const old=r.status===404||body.op==='get'&&!j.problems;
      const e=new Error(old?'時間割を読めませんでした。Worker を v63 に更新してください（'+(j.error||('HTTP '+r.status))+'）':(j.error||('HTTP '+r.status))); e.problems=j.problems; throw e; }
    return j;
  }
  async function schedLoad(){
    if(schedBusy||!appPass||!online) return;
    schedBusy=true; schedErr='';
    try{ const j=await scApi({op:'get'}); sched=j.schedule||null; S('sched',sched); }
    catch(e){ schedErr=e.message; }
    schedBusy=false; window.schedReady=true;
    if(window.v64TodayRefresh) window.v64TodayRefresh();
    if(activeAppTab==='plan') planPaint();
  }
  window.schedLoad=schedLoad;
  (function boot(){ const g=$('gate'); if(appPass&&online&&(!g||g.classList.contains('hide'))){ schedLoad(); return; } setTimeout(boot,900); })();

  /* ---- タスクの予定 ---- */
  const plannedOn=d=>tasks.filter(t=>t.status==='active'&&t.planDate===d&&hm2min(t.planStart)!=null).sort((a,b)=>hm2min(a.planStart)-hm2min(b.planStart));
  function setPlan(t,start,min,date){
    t.planDate=date||today(); t.planStart=start; t.planMin=min||60;
    touch('tasks',t); saveData(); dataChanged();
  }
  function clearPlan(t){
    delete t.planDate; delete t.planStart; delete t.planMin;
    touch('tasks',t); saveData(); dataChanged();
  }
  function findOrCreateTask(title,src){
    let t=tasks.filter(x=>x.title===title&&x.status==='active')[0];
    if(!t) t=taskAdd(title,src||'user');
    return t;
  }
  window.schedSetPlan=setPlan;
  window.schedFindOrCreateTask=findOrCreateTask;

  /* ---- 画面 ---- */
  let planDay='';
  const pd=()=>{ if(!planDay||!/^\d{4}-\d\d-\d\d$/.test(planDay)) planDay=today(); return planDay; };
  const mdJP=d=>{ const x=new Date(d+'T00:00'); return (x.getMonth()+1)+'/'+x.getDate()+'（'+'日月火水木金土'[x.getDay()]+'）'; };
  /* v66.2：種類ごとに色（授業＝青・試験＝コーラル・自宅学習＝ティール・自分の予定＝金・生活＝灰）。時刻順に並べ、今日は「いま」の線を入れる */
  const KCLS={class:'k-class',exam:'k-exam',study:'k-study',other:'k-other'};
  const KTAG={class:'授業',exam:'試験',study:'自宅学習',other:'予定'};
  function rowsHTML(d){
    const blocks=schedBlocksOf(d), plans=plannedOn(d), ent=[], isToday=d===today(), nm=nowMin();
    const past=e=>isToday&&hm2min(e)!=null&&hm2min(e)<=nm;
    const inBlock=(t,b)=>{ const s=hm2min(t.planStart); return s!=null&&s>=hm2min(b.s)&&s<hm2min(b.e); };
    const row=(m,cls,time,tag,title,sub,inner)=>ent.push({m,h:'<div class="sc-row '+cls+'"><span class="sc-dot" aria-hidden="true"></span><span class="sc-time mono">'+time+'</span><div class="sc-main">'+(tag?'<span class="sc-tag">'+tag+'</span>':'')+'<b>'+title+'</b>'+(sub?'<small>'+sub+'</small>':'')+(inner||'')+'</div></div>'});
    row(390,'k-life'+(past('06:30')?' past':''),'06:30','','起床','目安');
    const firstClass=blocks.filter(b=>b.k==='class'||b.k==='exam')[0];
    if(firstClass){ const lv=hm2min(firstClass.s)-110; row(lv,'k-life'+(past(min2hm(lv))?' past':''),min2hm(lv),'','家を出る','学校 '+firstClass.s+' に間に合う目安'); }
    const used=new Set();
    blocks.forEach(b=>{
      const mine=plans.filter(t=>inBlock(t,b)); mine.forEach(t=>used.add(t.id));
      const k=KCLS[b.k]?b.k:'other', cur=isToday&&hm2min(b.s)<=nm&&nm<hm2min(b.e);
      row(hm2min(b.s),KCLS[k]+(past(b.e)?' past':'')+(cur?' cur':''),b.s+'–'+b.e,KTAG[k],b.k==='study'?'自宅学習（'+esc(b.t)+'）':esc(b.t),b.k==='study'?'登校は不要。この時間に入れた学習がここに出ます':(b.k==='exam'?'試験 ・ 学校':'授業 ・ 学校'),
        mine.map(t=>planRowHTML(t,d)).join('')+(b.k==='study'&&!past(b.e)?'<button class="sc-add" data-sc-add="'+b.s+'">＋ この時間に学習を入れる</button>':''));
    });
    plans.filter(t=>!used.has(t.id)).forEach(t=>{ const s0=hm2min(t.planStart); ent.push({m:s0,h:'<div class="sc-row k-task free'+(past(min2hm(s0+(+t.planMin||60)))?' past':'')+'"><span class="sc-dot" aria-hidden="true"></span>'+planRowHTML(t,d)+'</div>'}); });
    ent.push({m:1440,h:'<div class="sc-row k-life"><span class="sc-dot" aria-hidden="true"></span><span class="sc-time mono">24:00</span><div class="sc-main"><b>就寝の目安</b><small>0:00〜1:00</small></div></div>'});
    if(isToday) ent.push({m:nm+0.5,h:'<div class="sc-now" id="scNow"><span class="mono">いま '+min2hm(nm)+'</span></div>'});
    ent.sort((a,b)=>a.m-b.m);
    let h=ent.map(e=>e.h).join('');
    const note=schedNoteOf(d);
    if(note) h+='<div class="sc-note">📝 '+esc(note)+'</div>';
    if(!blocks.length&&!note){ const r=schedRange();
      h+='<div class="sc-note">'+(r?'この日の時間割はありません（入っているのは '+mdJP(r[0])+'〜'+mdJP(r[1])+'）。':'時間割はまだ入っていません。下の「時間割」から取り込めます。')+'</div>'; }
    return h;
  }
  /* 週の帯：その週の7日。授業・試験・自宅学習・自分の予定を色の点で */
  const calDay=()=>{ try{ const m=localStorage.getItem('ac_calMode'); return !m||m==='day'; }catch(e){ return true; } };   // 週・月カレンダーの時は、日リスト用の帯と内訳は出さない
  function weekHTML(d){
    if(!calDay()) return '';
    const x=new Date(d+'T00:00'), mon=addDays(d,-((x.getDay()+6)%7)), td=today();
    return '<nav class="sc-week" aria-label="週の日付">'+Array.from({length:7},(_,i)=>{ const day=addDays(mon,i), y=new Date(day+'T00:00'), bs=schedBlocksOf(day);
      const has=k=>bs.some(b=>b.k===k), ex=schedExams().some(e=>e.date===day)||has('exam'), pl=plannedOn(day).length>0;
      return '<button data-sc-day="'+day+'" class="'+(day===d?'sel':'')+(day===td?' today':'')+'" aria-pressed="'+(day===d)+'"><small>'+'日月火水木金土'[y.getDay()]+'</small><b>'+y.getDate()+'</b><i>'+
        (has('class')?'<em class="k-class"></em>':'')+(ex?'<em class="k-exam"></em>':'')+(has('study')?'<em class="k-study"></em>':'')+(pl?'<em class="k-task"></em>':'')+'</i></button>'; }).join('')+'</nav>';
  }
  function summaryHTML(d){
    if(!calDay()) return '';
    const bs=schedBlocksOf(d), c=k=>bs.filter(b=>b.k===k).length, pl=plannedOn(d).length;
    const chips=[[c('class'),'授業','k-class'],[c('exam'),'試験','k-exam'],[c('study'),'自宅学習','k-study'],[pl,'自分の予定','k-task']].filter(x=>x[0]);
    return chips.length?'<div class="sc-chips">'+chips.map(x=>'<span class="sc-chip '+x[2]+'"><i></i>'+x[1]+' <b>'+x[0]+'</b></span>').join('')+'</div>':'';
  }
  function planRowHTML(t,d){
    const isToday=d===today(), s=isToday?activeSessionOf(t.id):null, doneMin=isToday?mins(taskDayMs(t.id,jstDay(nowMs()))):0;
    const st=s?(s.state==='running'?'計測中':'一時停止'):(doneMin?'今日 '+doneMin+'分':'');
    return '<div class="sc-plan" data-sc-plan="'+esc(t.id)+'"><div class="sc-pt"><span class="sc-time mono">'+esc(t.planStart)+'–'+min2hm(hm2min(t.planStart)+(+t.planMin||60))+'</span>'+(st?'<small>'+st+'</small>':'')+'</div>'+
      '<b class="sc-pn">'+esc(t.title)+'</b><div class="sc-pb">'+
      (isToday?'<button class="sc-play" data-sc-play="'+esc(t.id)+'" aria-label="'+esc(t.title)+'を開始">'+(s&&s.state==='running'?'Ⅱ':'▶')+'</button>':'')+
      '<button class="sc-x" data-sc-clear="'+esc(t.id)+'" aria-label="'+esc(t.title)+'の予定を外す">✕</button></div></div>';
  }
  function examsHTML(){
    const td=today(), ex=schedExams().filter(x=>x.date>=td);
    if(!ex.length) return '';
    return '<section class="sc-card" id="scExams"><div class="sc-ch"><span class="mono">EXAMS · これからの試験</span></div>'+
      ex.map(x=>{const n=Math.round((new Date(x.date+'T00:00')-new Date(td+'T00:00'))/864e5);
        return '<div class="sc-ex '+(n<=3?'near':n<=7?'soon':'far')+'"><div class="sc-cd">'+(n?'<small>あと</small><b class="mono">'+n+'</b><small>日</small>':'<b class="mono" style="font-size:20px">今日</b>')+'</div><div class="sc-exm"><b>'+esc(x.subject)+'</b><span class="mono">'+esc(mdJP(x.date))+'</span></div></div>';}).join('')+'</section>';
  }
  function ttHTML(){
    const r=schedRange();
    return '<section class="sc-card" id="scTT"><div class="sc-ch"><span class="mono">TIMETABLE · 時間割</span></div>'+
      '<p class="sc-st">'+(schedErr?'<span class="warn">'+esc(schedErr)+'</span>':r?mdJP(r[0])+'〜'+mdJP(r[1])+'（'+r[2]+'日分）・試験 '+schedExams().length+'件'+(sched.updatedAt?'・更新 '+esc(String(sched.updatedAt).slice(0,10)):''):'まだ入っていません')+'</p>'+
      '<p class="mu sc-help">時間割は Cloudflare（R2）に保存され、パスワードを入れた端末だけが読めます。取り込むと、同じ日付は入れ替え、ほかの日は残します。前の版は自動で残ります。学期の時間割は「曜日パターン（weekly）」でも取り込めます（下の「JSONの形」参照）。学校のPDFをふわに渡せば、この形に直して返します。</p>'+
      '<div class="sc-ttb"><label class="sc-file">JSONファイルを選ぶ<input type="file" id="scFile" accept=".json,application/json"></label><button id="scPasteBtn">貼り付けて取り込む</button><button id="scExport"'+(r?'':' disabled')+'>JSONで書き出す</button></div>'+
      '<div class="sc-paste hide" id="scPaste"><textarea id="scPasteIn" placeholder="時間割のJSONを貼り付け" aria-label="時間割のJSON"></textarea><button class="p" id="scPasteGo">取り込む</button></div>'+
      '<div id="scImpMsg" class="sc-msg" role="status"></div>'+
      '<details class="sc-hist" id="scHistBox"><summary>以前の版</summary><div id="scHist" class="mu">開くと読み込みます</div></details>'+
      '<details class="sc-fmt"><summary>JSONの形</summary><pre>{ "aicoach_schedule": 1,\n  "days": { "2026-11-09": [ { "s":"09:20", "e":"10:50", "t":"授業名", "k":"class" } ] },\n  "notes": { "2026-11-03": "休講日" },\n  "exams": [ { "subject":"科目名", "date":"2026-11-04" } ] }\nk：class 授業／exam 試験／study 自宅学習／other その他\n\n■ 曜日パターン（v66.4〜。学期の時間割はこちらが簡単）\n{ "aicoach_schedule": 1,\n  "weekly": { "from":"2026-11-19", "to":"2027-01-29",\n    "mon": [ { "s":"09:20", "e":"10:50", "t":"授業名", "k":"class" } ],\n    "tue": [ ], "wed": [ ], "thu": [ ], "fri": [ ] },\n  "holidays": [ "2026-12-29" ],\n  "days": { }, "notes": { }, "exams": [ ] }\nweekly は期間中の各曜日に展開されます。holidays の日は外れ、days で書いた日はそちらが優先します。</pre></details></section>';
  }
  function planPaint(force){
    const v=$('vPlan'); if(!v) return;
    if(force&&!sched&&!schedBusy) schedLoad();
    const d=pd(), td=today();
    v.innerHTML='<div class="sc-wrap"><div class="sc-kick mono">PLAN · SCHEDULE</div><h1 class="sc-h1">予定</h1><p class="mu sc-sub">時間割と、自分で入れた学習の予定。▶ で集中タイマーが始まります。</p>'+
      '<div class="sc-daynav"><button id="scPrev" aria-label="前の日">‹</button><b id="scDay">'+esc(mdJP(d))+(d===td?' <span class="sc-today">今日</span>':'')+'</b><button id="scNext" aria-label="次の日">›</button>'+(d!==td?'<button id="scToday" class="sc-tbtn">今日へ</button>':'')+'</div>'+
      weekHTML(d)+summaryHTML(d)+
      '<section class="sc-card" id="schedBox" aria-label="'+esc(mdJP(d))+'の予定"><div class="sc-ch"><span class="mono">'+(d===td?'TODAY':'DAY')+' · '+esc(d)+'</span><button class="sc-newbtn" id="scNew">＋ 予定を足す</button></div>'+
      '<div class="sc-form hide" id="scForm"><input id="scTitle" maxlength="100" placeholder="予定の名前（例：時系列の復習）" aria-label="予定の名前">'+
      '<label>開始 <input id="scStart" type="time" value="'+(d===td?min2hm(Math.min(23*60,Math.ceil((nowMin()+10)/30)*30)):'20:00')+'"></label>'+
      '<label>長さ <select id="scMin"><option>15</option><option>25</option><option>45</option><option selected>60</option><option>90</option></select> 分</label>'+
      '<button class="p" id="scSave">足す</button></div>'+
      '<div class="sc-list">'+rowsHTML(d)+'</div></section>'+examsHTML()+ttHTML()+'</div>';
    planBind(v,d);
  }
  window.planPaint=planPaint;
  window.v64SetPlanDay=d=>{ planDay=d; };
  function planBind(v,d){
    $('scPrev').onclick=()=>{planDay=addDays(d,-1);planPaint();};
    v.querySelectorAll('[data-sc-day]').forEach(b=>b.onclick=()=>{planDay=b.dataset.scDay;planPaint();});
    $('scNext').onclick=()=>{planDay=addDays(d,1);planPaint();};
    if($('scToday')) $('scToday').onclick=()=>{planDay=today();planPaint();};
    v.querySelectorAll('[data-sc-play]').forEach(b=>b.onclick=()=>{
      const t=taskById(b.dataset.scPlay); if(!t) return;
      if(!inSlots(t.id)&&!slotAssign(t.id)){ toast('集中枠がいっぱいです（最大3つ）'); return; }
      const s=timerToggle(t.id);
      toast(s?(s.state==='running'?'開始しました':'一時停止しました'):'開始できませんでした');
      planPaint();
    });
    v.querySelectorAll('[data-sc-clear]').forEach(b=>b.onclick=()=>{ const t=taskById(b.dataset.scClear); if(!t) return; clearPlan(t); toast('予定から外しました（タスクは残ります）'); planPaint(); });
    v.querySelectorAll('[data-sc-add]').forEach(b=>b.onclick=()=>scPickTask(b.dataset.scAdd,d));
    $('scNew').onclick=()=>{ $('scForm').classList.toggle('hide'); $('scTitle').focus(); };
    $('scSave').onclick=()=>{
      const title=$('scTitle').value.trim(); if(!title){ toast('名前を入れてください'); return; }
      const start=$('scStart').value||'20:00', min=+$('scMin').value||60;
      const t=findOrCreateTask(title,'user'); if(!t){ toast('足せませんでした'); return; }
      setPlan(t,start,min,d); toast('予定に入れました'); planPaint();
    };
    $('scTitle').onkeydown=e=>{ if(e.key==='Enter'&&!e.isComposing) $('scSave').click(); };
    /* 時間割 */
    const msg=(h,bad)=>{ const m=$('scImpMsg'); if(m){ m.innerHTML=h; m.classList.toggle('bad',!!bad); } };
    const doImport=async text=>{
      let data; try{ data=JSON.parse(String(text||'').replace(/^﻿/,'')); }catch(e){ msg('JSONを読めませんでした（形を確かめてください）',1); return; }
      msg('取り込んでいます…');
      try{
        const j=await scApi({op:'import',data,mode:'merge'});
        sched=j.schedule; S('sched',sched);
        planPaint();
        msg(j.unchanged?'同じ内容なので、変えませんでした':'取り込みました：'+j.imported.days+'日分・メモ '+j.imported.notes+'件・試験 '+j.imported.exams+'件（前の版は「以前の版」に残しました）');
      }catch(e){ msg(esc(e.message)+(e.problems?'<br>'+e.problems.map(esc).join('<br>'):''),1); }
    };
    $('scFile').onchange=async e=>{ const f=e.target.files&&e.target.files[0]; if(!f) return; if(f.size>2e6){ msg('ファイルが大きすぎます（2MBまで）',1); return; } await doImport(await f.text()); };
    $('scPasteBtn').onclick=()=>{ $('scPaste').classList.toggle('hide'); $('scPasteIn').focus(); };
    $('scPasteGo').onclick=()=>doImport($('scPasteIn').value);
    $('scExport').onclick=()=>{
      if(!sched) return;
      const out=JSON.stringify({aicoach_schedule:1,days:sched.days,notes:sched.notes,exams:sched.exams},null,1);
      try{ const u=URL.createObjectURL(new Blob([out],{type:'application/json'})); const a=document.createElement('a'); a.href=u; a.download='時間割_'+today()+'.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),4000); }
      catch(e){ copyOut(out,'時間割（JSON）'); }
    };
    $('scHistBox').ontoggle=async()=>{
      if(!$('scHistBox').open) return; const h=$('scHist'); h.textContent='読み込んでいます…';
      try{ const j=await scApi({op:'history'}); schedHist=j.items||[];
        h.innerHTML=schedHist.length?schedHist.map(x=>'<div class="sc-hr"><span class="mono">'+esc(x.at.replace(/T(\d\d)-(\d\d)/,' $1:$2').slice(0,16))+'</span><button data-sc-rs="'+esc(x.key)+'">この版に戻す</button></div>').join(''):'まだありません（取り込むと、その前の版がここに残ります）';
        h.querySelectorAll('[data-sc-rs]').forEach(b=>b.onclick=async()=>{ if(!confirm('この版に戻しますか？（いまの時間割も「以前の版」に残ります）')) return;
          try{ const j=await scApi({op:'restore',key:b.dataset.scRs}); sched=j.schedule; S('sched',sched); planPaint(); toast('時間割を戻しました'); }catch(e){ toast(e.message); } });
      }catch(e){ h.textContent=e.message; }
    };
  }
  function scPickTask(start,d){
    const list=tasks.filter(t=>t.status==='active'&&t.planDate!==d);
    $('sheetBody').innerHTML='<div class="dy-sh"><div class="lb">'+esc(mdJP(d))+' '+esc(start)+' からの学習</div>'+
      (list.length?list.slice(0,20).map(t=>'<button class="fz-pk" data-scpk="'+esc(t.id)+'">'+esc(t.title)+'</button>').join(''):'<div class="mu">まだタスクがありません。下から足してください。</div>')+
      '<div class="dp-add-row"><input id="scPkNew" maxlength="100" placeholder="新しい学習を足す" aria-label="新しい学習"><button class="p" id="scPkAdd">足す</button></div>'+
      '<button class="dy-close" id="scPkX">閉じる</button></div>';
    $('sheet').classList.remove('hide');
    const st=(d===today()&&hm2min(start)<nowMin())?min2hm(Math.ceil(nowMin()/5)*5):start;   // 枠の途中なら、今から
    $('sheetBody').querySelectorAll('[data-scpk]').forEach(b=>b.onclick=()=>{ const t=taskById(b.dataset.scpk); if(t){ setPlan(t,st,90,d); } closeSheet(); planPaint(); toast('予定に入れました'); });
    const add=()=>{ const v=$('scPkNew').value.trim(); if(!v) return; const t=findOrCreateTask(v,'user'); if(t) setPlan(t,st,90,d); closeSheet(); planPaint(); toast('予定に入れました'); };
    $('scPkAdd').onclick=add; $('scPkNew').onkeydown=e=>{ if(e.key==='Enter'&&!e.isComposing) add(); };
    $('scPkX').onclick=closeSheet;
  }
  /* 予定タブを開いている間、1分ごとに「過ぎた時間」の表示と ▶ の状態を合わせる（入力中は描き直さない） */
  setInterval(()=>{ if(activeAppTab!=='plan'||document.visibilityState!=='visible') return; const a=document.activeElement;
    if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)) return; if($('scForm')&&!$('scForm').classList.contains('hide')) return; planPaint(); },60000);
})();
