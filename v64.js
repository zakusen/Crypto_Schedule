/* AIコーチ v64 — 今日の「現在地」（今日タブのいちばん上）
   ・いまの時刻と、24時間の目盛りの上での現在地。今日の流れ（時間割＋予定したタスク）を時刻順に
   ・いまの時間帯を金色で強調し、その場で「集中する」（既存の slotAssign + timerToggle）
   ・「＋ 自分で追加」：タスクと時刻を自分で入れる（schedSetPlan）
   ・「✦ AIに組んでもらう」：/api/knowledge op:plan で今日の空き時間に最大3つの案。点線で表示し、本人が「まとめて入れる」を押した時だけ入る
   ・時刻を作り出さない：予定時刻が無いタスクは流れに入れない（タスク一覧にそのまま残る）
   ・「今日のプロンプト」は折りたたんで最後に（中身と操作は今まで通り）
   ・v65：「AIに組んでもらう」は新規タスクも提案できる。材料（今日の授業科目・直近の試験・全タスク名）を送り、
     新規の案は「新規タスク」と表示。「まとめて入れる」を押した時だけ schedFindOrCreateTask(title,'ai') で実タスク化する */
(function(){
  'use strict';
  const STUDY_END=23*60+30;   // 生活グランドデザイン：夜の学習は 23:30 で切り上げ
  const hm2min=s=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||''));return m?(+m[1])*60+(+m[2]):null;};
  const min2hm=n=>{n=Math.max(0,Math.min(1440,n));return n===1440?'24:00':p2(Math.floor(n/60))+':'+p2(n%60);};
  const nowMin=()=>{const x=new Date();return x.getHours()*60+x.getMinutes();};
  const KIND={class:'授業',exam:'試験',study:'自宅学習',other:'予定',task:'学習',ai:'AIの案'};
  let aiDraft=null, aiBusy=false, aiErr='', formOpen=false, lastMin=-1;

  function items(){
    const d=today(), out=[];
    const blocks=(typeof schedBlocksOf==='function')?schedBlocksOf(d):[];
    blocks.forEach(b=>{const s=hm2min(b.s),e=hm2min(b.e);if(s!=null&&e!=null)out.push({s,e,kind:b.k||'other',title:b.k==='study'?'自宅学習の時間':b.t,sub:b.k==='study'?'登校なし・この時間に学習を入れられます':''});});
    tasks.filter(t=>t.status==='active'&&t.planDate===d&&hm2min(t.planStart)!=null).forEach(t=>{const s=hm2min(t.planStart);out.push({s,e:Math.min(1440,s+(+t.planMin||60)),kind:'task',title:t.title,task:t});});
    if(aiDraft&&aiDraft.date===d) aiDraft.blocks.forEach(b=>{const s=hm2min(b.start);out.push({s,e:Math.min(1440,s+b.min),kind:'ai',title:b.title,ai:b,sub:(aiDraft.rule?'ルールの案':'AIの案')+(b.isNew?' · 新規タスク（「まとめて入れる」で作られます）':'')});});
    return out.sort((a,b)=>a.s-b.s||(a.kind==='task'?-1:1));
  }
  function focusTarget(list,nm){
    const tk=list.filter(x=>x.kind==='task');
    return tk.find(x=>x.s<=nm&&nm<x.e)||tk.find(x=>x.s>nm&&x.s-nm<=90)||null;
  }
  function whereText(list,nm){
    if(nm>=STUDY_END) return '学習の切り上げ時刻（23:30）を過ぎました。記録をつけて、休みましょう';
    const cur=list.filter(x=>x.kind!=='ai'&&x.s<=nm&&nm<x.e).sort((a,b)=>(a.kind==='task'?-1:1))[0], nx=list.find(x=>x.kind!=='ai'&&x.s>nm);
    if(cur) return '<b>いま</b> '+esc(cur.title)+'<span>あと'+(cur.e-nm)+'分</span>';
    if(nx) return '<b>空き時間</b><span>次は '+min2hm(nx.s)+' '+esc(nx.title)+'（あと'+(nx.s-nm)+'分）</span>';
    if(nm<6*60+30) return '<b>睡眠の時間</b><span>起床の目安 6:30</span>';
    return '<b>この後の予定はありません</b><span>23:30 に学習を切り上げ</span>';
  }
  function barHTML(list,nm){
    const pc=n=>(n/1440*100).toFixed(3)+'%';
    let h='<div class="nw-seg sleep" style="left:0;width:'+pc(390)+'" title="睡眠 0:00〜6:30"></div><div class="nw-seg sleep" style="left:'+pc(STUDY_END)+';width:'+pc(1440-STUDY_END)+'" title="切り上げ 23:30〜"></div>';
    list.forEach(x=>{h+='<div class="nw-seg k-'+x.kind+'" style="left:'+pc(x.s)+';width:'+pc(Math.max(4,x.e-x.s))+'" title="'+esc(min2hm(x.s)+'–'+min2hm(x.e)+' '+x.title)+'"></div>';});
    h+='<div class="nw-past" style="width:'+pc(nm)+'"></div><div class="nw-now" id="nwNow" style="left:'+pc(nm)+'"><i></i></div>';
    return '<div class="nw-bar" role="img" aria-label="24時間の中の現在地：'+min2hm(nm)+'">'+h+'</div><div class="nw-scale mono" aria-hidden="true">'+[0,6,12,18,24].map(n=>'<span style="left:'+pc(n*60)+'">'+n+'</span>').join('')+'</div>';
  }
  function rowHTML(x,nm,tgt){
    const past=x.e<=nm&&x.kind!=='ai', cur=x.s<=nm&&nm<x.e&&x.kind!=='ai';
    let act='';
    if(x.kind==='task'){
      const s=activeSessionOf(x.task.id),run=s&&s.state==='running';
      if(tgt&&tgt.task&&tgt.task.id===x.task.id) act='<button class="nw-go'+(run?' run':'')+'" data-nw-go="'+esc(x.task.id)+'">'+(run?'Ⅱ 一時停止':s?'▶ 再開する':'▶ 集中する')+'</button>';
      else act='<button class="nw-mini" data-nw-go="'+esc(x.task.id)+'" aria-label="'+esc(x.title)+'を'+(run?'一時停止':'開始')+'">'+(run?'Ⅱ':'▶')+'</button>';
      act+='<button class="nw-x" data-nw-un="'+esc(x.task.id)+'" aria-label="'+esc(x.title)+'の予定を外す">✕</button>';
    }
    return '<div class="nw-row k-'+x.kind+(past?' past':'')+(cur?' cur':'')+'"><span class="nw-t mono">'+min2hm(x.s)+'<small>–'+min2hm(x.e)+'</small></span>'+
      '<div class="nw-m"><b>'+esc(x.title)+'</b><small>'+(cur?'<em>いま</em>':'')+(x.kind==='ai'?'':esc(KIND[x.kind]||''))+(x.sub?(x.kind==='ai'?'':' · ')+esc(x.sub):'')+'</small></div><div class="nw-a">'+act+'</div></div>';
  }
  function flowHTML(list,nm){
    const tgt=focusTarget(list,nm), past=list.filter(x=>x.e<=nm&&x.kind!=='ai'), rest=list.filter(x=>!(x.e<=nm&&x.kind!=='ai'));
    let h='';
    if(past.length) h+='<details class="nw-done"><summary>済み・過ぎた時間 '+past.length+'件</summary>'+past.map(x=>rowHTML(x,nm,tgt)).join('')+'</details>';
    h+=rest.length?rest.map(x=>rowHTML(x,nm,tgt)).join(''):'<div class="nw-empty">'+(list.length?'この後の予定はありません。':'今日の予定はまだありません。')+'下のボタンから入れられます。</div>';
    if(aiDraft&&aiDraft.date===today()) h+=aiDraft.blocks.length?'<div class="nw-aibar"><span>'+(aiDraft.rule?'ルールの案 ':'AIの案 ')+aiDraft.blocks.length+'件（点線）。まだ入っていません'+(aiDraft.dropped&&aiDraft.dropped.length?'（入らない案 '+aiDraft.dropped.length+'件は外しました）':'')+(aiDraft.note?' ― '+esc(aiDraft.note):'')+'</span><button class="nw-ok" id="nwAiOk">まとめて入れる</button><button class="nw-ghost" id="nwAiNo">やめる</button></div>'
      :'<div class="nw-aibar"><span>'+esc(aiDraft.note||'今日の空き時間に入る案はありませんでした')+'</span><button class="nw-ghost" id="nwAiNo">閉じる</button></div>';
    if(aiErr) h+='<div class="nw-err" role="alert">'+esc(aiErr)+'</div>';
    return h;
  }
  function formHTML(){
    const free=tasks.filter(t=>t.status==='active'&&t.planDate!==today());
    const st=min2hm(Math.min(23*60,Math.ceil((nowMin()+5)/15)*15));
    return '<div class="nw-form" id="nwForm">'+
      (free.length?'<select id="nwPick" aria-label="タスクを選ぶ"><option value="">新しいタスク（下に名前）</option>'+free.slice(0,40).map(t=>'<option value="'+esc(t.id)+'">'+esc(t.title)+'</option>').join('')+'</select>':'')+
      '<input id="nwTitle" maxlength="100" placeholder="やること（例：時系列の復習）" aria-label="やること">'+
      '<div class="nw-fr"><label>開始 <input id="nwStart" type="time" value="'+st+'"></label><label>長さ <select id="nwMin"><option>25</option><option>45</option><option selected>60</option><option>90</option></select> 分</label></div>'+
      '<div class="nw-fr"><button class="nw-ok" id="nwSave">予定に入れる</button><button class="nw-ghost" id="nwCancel">やめる</button></div></div>';
  }
  function paint(){
    const host=document.querySelector('#vToday .fz'); if(!host) return;
    let box=$('nowBox');
    if(!box){ box=document.createElement('section'); box.id='nowBox'; box.className='nw'; box.setAttribute('aria-label','今日の現在地と流れ');
      const head=host.querySelector('.fz-head'); if(head&&head.nextSibling) host.insertBefore(box,head.nextSibling); else host.prepend(box); }
    const a=document.activeElement; if(formOpen&&a&&box.contains(a)&&/INPUT|SELECT/.test(a.tagName)) { tick(); return; }
    const nm=nowMin(), list=items(), x=new Date();
    lastMin=nm;
    box.innerHTML='<div class="nw-top"><div class="nw-clock"><b class="mono" id="nwClock">'+min2hm(nm)+'</b><span>'+(x.getMonth()+1)+'月'+x.getDate()+'日（'+'日月火水木金土'[x.getDay()]+'）</span></div>'+
      '<div class="nw-where" id="nwWhere">'+whereText(list,nm)+'</div></div>'+barHTML(list,nm)+
      '<div class="nw-ch"><span class="mono">TODAY · 今日の流れ</span><button class="nw-link" id="nwPlanTab">予定タブ ›</button></div>'+
      '<div class="nw-flow" id="nwFlow">'+flowHTML(list,nm)+'</div>'+
      (formOpen?formHTML():'')+
      '<div class="nw-acts"><button class="nw-add" id="nwAdd" aria-expanded="'+formOpen+'">＋ 自分で追加</button><button class="nw-ai" id="nwAI">✦ ルールで組む</button></div>';
    bind(box);
  }
  function tick(){   // 時計と針だけ（1分ごとに全体も描き直す）
    const nm=nowMin(); if(nm!==lastMin){ if(!(formOpen&&document.activeElement&&$('nowBox')&&$('nowBox').contains(document.activeElement))) return paint(); }
    const c=$('nwClock'); if(c) c.textContent=min2hm(nm);
  }
  function bind(box){
    box.querySelectorAll('[data-nw-go]').forEach(b=>b.onclick=()=>{
      const t=taskById(b.dataset.nwGo); if(!t) return;
      if(!inSlots(t.id)&&!slotAssign(t.id)){ toast('集中枠がいっぱいです（最大3つ）。枠を1つ空けてください'); return; }
      const s=timerToggle(t.id); toast(s?(s.state==='running'?'集中を始めました':'一時停止しました'):'開始できませんでした');
      if(typeof fzPaint==='function') fzPaint(); else paint();
    });
    box.querySelectorAll('[data-nw-un]').forEach(b=>b.onclick=()=>{ const t=taskById(b.dataset.nwUn); if(!t) return;
      delete t.planDate; delete t.planStart; delete t.planMin; touch('tasks',t); saveData(); dataChanged(); toast('予定から外しました（タスクは残ります）'); paint(); });
    $('nwPlanTab').onclick=()=>{ if(window.v64SetPlanDay) v64SetPlanDay(today()); showView('plan'); };
    $('nwAdd').onclick=()=>{ formOpen=!formOpen; paint(); if(formOpen){ const i=$('nwPick')||$('nwTitle'); if(i) i.focus(); } };
    $('nwAI').onclick=rulePlan;
    if($('nwAiOk')) $('nwAiOk').onclick=acceptAI;
    if($('nwAiNo')) $('nwAiNo').onclick=()=>{ aiDraft=null; aiErr=''; paint(); };
    if(formOpen){
      const pick=$('nwPick'); if(pick) pick.onchange=()=>{ $('nwTitle').disabled=!!pick.value; if(pick.value) $('nwTitle').value=''; };
      $('nwCancel').onclick=()=>{ formOpen=false; paint(); };
      $('nwTitle').onkeydown=e=>{ if(e.key==='Enter'&&!e.isComposing) $('nwSave').click(); };
      $('nwSave').onclick=()=>{
        const id=pick&&pick.value, title=$('nwTitle').value.trim();
        const t=id?taskById(id):(title?schedFindOrCreateTask(title,'user'):null);
        if(!t){ toast('タスクを選ぶか、名前を入れてください'); return; }
        schedSetPlan(t,$('nwStart').value||'20:00',+$('nwMin').value||60,today());
        formOpen=false; toast('予定に入れました'); if(typeof fzPaint==='function') fzPaint(); else paint();
      };
    }
  }
  async function askAI(){
    if(aiBusy) return;
    const d=today(), nm=nowMin();
    const cand=tasks.filter(t=>t.status==='active'&&!(t.planDate===d&&t.planStart));
    if(!online||!appPass){ aiErr='AIに頼むには通信が必要です'; paint(); return; }
    const occ=[];
    ((typeof schedBlocksOf==='function')?schedBlocksOf(d):[]).forEach(b=>{ if(b.k!=='study'){ const s=hm2min(b.s),e=hm2min(b.e); if(s!=null&&e!=null) occ.push({start:s,end:e,what:b.t}); } });
    tasks.filter(t=>t.status==='active'&&t.planDate===d&&hm2min(t.planStart)!=null).forEach(t=>{ const s=hm2min(t.planStart); occ.push({start:s,end:s+(+t.planMin||60),what:t.title}); });
    occ.push({start:STUDY_END,end:1440,what:'学習の切り上げ（23:30）'});
    aiBusy=true; aiErr=''; aiDraft=null; paint();
    try{
      const exams=(typeof schedExams==='function')?schedExams():[];
      // v65.1：AIに渡すのは科目名だけ。時間割の「(10) 中村」のような回数・先生の名前、［試験］などの印は送らない。自宅学習（スタディーアワー）は科目ではないので外す
      const subjName=t=>String(t||'').replace(/\s*[\[［【][^\]］】]*[\]］】]\s*/g,' ').replace(/\s*[(（]\s*\d+\s*[)）].*$/,'').replace(/\s+/g,' ').trim();
      const subjects=[...new Set(((typeof schedBlocksOf==='function')?schedBlocksOf(d):[]).filter(b=>b.k!=='study').map(b=>subjName(b.t)).filter(Boolean))];
      const allTitles=tasks.filter(t=>t.status==='active').map(t=>t.title);
      const r=await fetch(API('/api/knowledge'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:appPass,op:'plan',date:d,now:nm,tasks:cand.map(t=>({id:t.id,title:t.title,planDate:t.planDate||'',planStart:t.planStart||''})),blocks:occ,exams,subjects,allTitles})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok||j.error||!Array.isArray(j.blocks)) throw new Error(r.status===404||(r.ok&&!Array.isArray(j.blocks))?'Worker を v65 に更新してください':(j.error||('HTTP '+r.status)));
      const blocks=(j.blocks||[]).filter(b=>((b.isNew&&b.title)||taskById(b.id))&&hm2min(b.start)!=null&&hm2min(b.start)>=nm);   // 念のため、過ぎた時刻と消えたタスクは落とす（新規の案は残す）
      aiDraft={date:d,blocks,note:j.note||''};
    }catch(e){ aiErr='AIの予定案を作れませんでした：'+e.message; }
    aiBusy=false; paint();
  }
  function acceptAI(){
    if(!aiDraft) return; let n=0;
    aiDraft.blocks.forEach(b=>{ let t=null;
      if(b.taskId) t=taskById(b.taskId);
      else if(b.isNew&&b.title&&typeof schedFindOrCreateTask==='function') t=schedFindOrCreateTask(b.title,'ai');
      else t=taskById(b.id);
      if(t&&t.status==='active'){ schedSetPlan(t,b.start,b.min,aiDraft.date); n++; } });
    aiDraft=null;
    toast(n+'件を今日の予定に入れました'); if(typeof fzPaint==='function') fzPaint(); else paint();
  }
  /* ---- v66.6：「ふわに頼む」を廃止。代わりにルールで組む
     候補＝まだ今日に置いていないタスク。配置は v64BuildPlan（優先度順・空き時間・23:30まで）が行う。
     その場で完結するので、待ち時間もトークンも不要 ---- */
  function rulePlan(){
    const d=today();
    const cands=tasks.filter(t=>t.status==='active'&&!(t.planDate===d&&hm2min(t.planStart)!=null))
      .map(t=>({taskId:t.id,title:t.title,min:60,priority:3}));
    if(!cands.length){ toast('今日に入れるタスクがありません（タスクを作ると、ここから自動で組めます）'); return; }
    const r=window.v64BuildPlan(cands,d);
    if(!r.blocks.length){ toast('今日の空き時間には入りませんでした'+(r.dropped.length?'（'+r.dropped[0]+'）':'')); return; }
    aiDraft={date:d,blocks:r.blocks,dropped:r.dropped,rule:true,note:'未配置のタスクを空き時間へ自動配置'};
    paint();
  }
  /* ふわの案を確かめる（入らない案は理由つきで外す）：過ぎた時刻・授業や入れた予定・23:30以降と重なる・無いタスク・同じ名前の新規・同じタスク2回 */
  const normT=s=>String(s||'').replace(/[\s　・：:／/、，]/g,'');
  window.v64CheckBlocks=function(raw,date){
    const d=date||today(), nm=d===today()?nowMin():0, out=[], dropped=[];
    const occ=[]; ((typeof schedBlocksOf==='function')?schedBlocksOf(d):[]).forEach(b=>{ if(b.k!=='study'){ const s=hm2min(b.s),e=hm2min(b.e); if(s!=null&&e!=null) occ.push({start:s,end:e}); } });
    tasks.filter(t=>t.status==='active'&&t.planDate===d&&hm2min(t.planStart)!=null).forEach(t=>{ const s=hm2min(t.planStart); occ.push({start:s,end:s+(+t.planMin||60)}); });
    occ.push({start:STUDY_END,end:1440});
    const seen=new Set(tasks.filter(t=>t.status==='active').map(t=>normT(t.title))), used=new Set();
    (raw||[]).slice(0,8).forEach(b=>{
      const s=hm2min(b.start), n=Math.round(+b.min), name=b.title||'?';
      if(out.length>=5){ dropped.push(name+'：5件より多い'); return; }
      if(s==null||!(n>=5&&n<=480)){ dropped.push(name+'：時刻か長さが読めない'); return; }
      if(s<nm){ dropped.push(name+'：もう過ぎた時刻'); return; }
      if(s+n>1440||occ.some(o=>o.start<s+n&&o.end>s)){ dropped.push(name+'：空いていない時間'); return; }
      if(b.taskId){ const t=taskById(b.taskId); if(!t||t.status!=='active'){ dropped.push(name+'：そのタスクが見つからない'); return; } if(used.has(t.id)){ dropped.push(t.title+'：同じタスクが2回'); return; } used.add(t.id); out.push({id:t.id,taskId:t.id,title:t.title,start:min2hm(s),min:n}); }
      else { const nt=normT(name); if(nt.length<2||seen.has(nt)){ dropped.push(name+'：今あるタスクとほぼ同じ名前'); return; } seen.add(nt); out.push({isNew:true,title:String(name).slice(0,60),start:min2hm(s),min:n}); }
      occ.push({start:s,end:s+n});
    });
    return {blocks:out,dropped};
  };
  /* ---- v66.2：ルールベース配置。ふわの候補（何を・何分・優先度）を、空き時間へ機械的に配置する
     ・優先度が高い候補から、入る空き枠へ置く。startHint があれば、空いている範囲で優先する
     ・1件は25〜90分に収める（候補の min は目安として丸める）。最大5件、23:30（STUDY_END）まで
     ・置けない候補は理由つきで dropped に返す（無いタスク・重複名・空き不足） ---- */
  window.v64BuildPlan=function(raw,date){
    const d=date||today(), nm=d===today()?nowMin():0, out=[], dropped=[];
    const occ=[]; ((typeof schedBlocksOf==='function')?schedBlocksOf(d):[]).forEach(b=>{ if(b.k!=='study'){ const s=hm2min(b.s),e=hm2min(b.e); if(s!=null&&e!=null) occ.push({start:s,end:e}); } });
    tasks.filter(t=>t.status==='active'&&t.planDate===d&&hm2min(t.planStart)!=null).forEach(t=>{ const s=hm2min(t.planStart); occ.push({start:s,end:s+(+t.planMin||60)}); });
    occ.sort((a,b)=>a.start-b.start);
    let gaps=[], cur=Math.ceil(nm/5)*5;
    for(const o of occ){ if(o.end<=cur) continue; if(o.start>cur) gaps.push({s:cur,e:Math.min(o.start,STUDY_END)}); cur=Math.max(cur,o.end); if(cur>=STUDY_END){ cur=STUDY_END; break; } }
    if(cur<STUDY_END) gaps.push({s:cur,e:STUDY_END});
    gaps=gaps.filter(g=>g.e-g.s>=15);
    const seen=new Set(tasks.filter(t=>t.status==='active').map(t=>normT(t.title))), used=new Set();
    const cands=(raw||[]).map((b,i)=>Object.assign({},b,{_i:i})).sort((a,b)=>(((+b.priority)||3)-((+a.priority)||3))||(a._i-b._i));
    cands.forEach(b=>{
      const name=b.title||'?';
      if(out.length>=5){ dropped.push(name+'：5件より多い'); return; }
      let t=null, title=String(name).slice(0,60);
      if(b.taskId){ t=taskById(b.taskId); if(!t||t.status!=='active'){ dropped.push(name+'：そのタスクが見つからない'); return; } if(used.has(t.id)){ dropped.push(t.title+'：同じタスクが2回'); return; } title=t.title; }
      else { const nt=normT(name); if(nt.length<2||seen.has(nt)){ dropped.push(name+'：今あるタスクとほぼ同じ名前'); return; } }
      const min=Math.max(25,Math.min(90,Math.round(+b.min)||60));
      let at=-1, gi=-1;
      const hint=hm2min(b.startHint||b.start);
      if(hint!=null){ gi=gaps.findIndex(g=>hint>=g.s&&hint+min<=g.e); if(gi>=0) at=hint; }
      if(at<0){ gi=gaps.findIndex(g=>g.e-g.s>=min); if(gi>=0) at=gaps[gi].s; }
      if(at<0){ dropped.push(title+'：入る空きがない'); return; }
      const g=gaps[gi], rest=[];
      if(at>g.s) rest.push({s:g.s,e:at});
      if(at+min<g.e) rest.push({s:at+min,e:g.e});
      gaps.splice(gi,1,...rest.filter(x=>x.e-x.s>=15));
      if(t) used.add(t.id); else seen.add(normT(title));
      out.push(t?{id:t.id,taskId:t.id,title:t.title,start:min2hm(at),min}:{isNew:true,title,start:min2hm(at),min});
    });
    out.sort((a,b)=>hm2min(a.start)-hm2min(b.start));
    return {blocks:out,dropped};
  };
  /* v66：ふわの提案インボックス（inbox.js）から下書きを差し込む入口 */
  window.v64SetAiDraft=d=>{ aiDraft=d; paint(); };
  window.v64HasAiDraft=()=>!!aiDraft;
  /* 今日のプロンプト：見出しだけ出して折りたたむ（中身と操作は今まで通り） */
  function foldPrompt(){
    const ai=document.querySelector('#vToday .fz-ai'); if(!ai||ai.dataset.v64) return; ai.dataset.v64='1';
    let open=false; try{ open=localStorage.getItem('ac_v64PromptOpen')==='1'; }catch(e){}
    ai.classList.toggle('v64-fold',!open);
    const ch=ai.querySelector('.fz-ch'); if(!ch) return;
    const b=document.createElement('button'); b.className='v64-foldbtn'; b.type='button'; b.setAttribute('aria-expanded',String(open)); b.textContent=open?'閉じる':'開く';
    b.onclick=()=>{ open=!open; ai.classList.toggle('v64-fold',!open); b.setAttribute('aria-expanded',String(open)); b.textContent=open?'閉じる':'開く'; try{localStorage.setItem('ac_v64PromptOpen',open?'1':'0');}catch(e){} };
    ch.appendChild(b);
    const lab=ch.querySelector('.mono'); if(lab) lab.textContent='外部AIへの引き継ぎ · TODAY\'S PROMPT';
  }
  /* 今日画面が描かれるたびに（毎秒の時計更新は除く） */
  const _fz=window.fzPaint;
  if(typeof _fz==='function') window.fzPaint=function(full){ _fz(full); try{ foldPrompt(); if(full!==false) paint(); else tick(); }catch(e){ console.error(e); } };
  window.v64TodayRefresh=()=>{ if(typeof activeAppTab!=='undefined'&&activeAppTab==='today') paint(); };
  window.v64Paint=paint;
})();
