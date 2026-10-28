/* AIコーチ v62 — ふわの付箋（提案カード）。v62：1日の予定案（day_plan）を出せるようになった
   役割：AIコーチの「今日」画面の一番上に、外部エージェント「ふわ」からの提案を1枚だけ出す。
   原則：
   - ふわは事実（タスク・記録）を勝手に書き換えない。出せるのは「提案」だけ。
   - 提案が実行されるのは、ユーザーが「入れる／開く」を押した時だけ（既存の taskAdd / slotAssign / showView を使う）。
   - 「いらない」を押した提案は、その日は二度と出ない（localStorage に保存）。
   提案の届け方（2通り）：
   1) /app/fuwa-notes.json … ふわ（Muse）がアプリ更新の仕組みで置けるJSON。形式は fuwa-notes.sample.json を参照。
      { "notes": [ { "id":"2026-10-27-morning", "date":"2026-10-27", "label":"朝",
                     "text":"…", "action":{ "type":"add_task", "title":"場合の数ドリル 15分" } } ] }
      action.type は add_task（新しいタスクを足して集中枠へ）/ slot_task（タイトルの一致する既存タスクを枠へ）/ open_log（ログを開く）/ none
   2) JSONが無い・今日の分が無い時は、この端末の事実（昨日の集中・枠の外のタスク）から、その場で小さな提案を組み立てる。
*/
(function(){
  'use strict';
  var POLL_MS=800, started=false, gateAt=0;

  function dismissed(){ try{return L('fuwaDismissed',[]);}catch(e){return [];} }
  function dismiss(id){
    try{ var d=dismissed(); if(d.indexOf(id)<0){ d.push(id); S('fuwaDismissed',d.slice(-60)); } }catch(e){}
  }
  function accepted(){ try{return L('fuwaAccepted',[]);}catch(e){return [];} }
  function markAccepted(id){
    try{ var a=accepted(); if(a.indexOf(id)<0){ a.push(id); S('fuwaAccepted',a.slice(-60)); } }catch(e){}
  }

  /* ---- 端末の事実から組み立てる提案 ---- */
  function localNote(){
    var d=today(), h=new Date().getHours();
    var yMin=0, yTasks=[];
    try{ var f=focusSummary(dayStr(1)); yMin=f.minutes||0; yTasks=f.tasks||[]; }catch(e){}
    var inSlot={}; try{ slotsView().filter(Boolean).forEach(function(t){ inSlot[t.id]=1; }); }catch(e){}
    var outside=[]; try{ outside=tasks.filter(function(t){ return t.status==='active' && !inSlot[t.id]; }); }catch(e){}
    var tMin=0; try{ tMin=(focusSummary(d).minutes||0); }catch(e){}

    /* v62：今日スタディーアワーの空きがあり、試験が近ければ「1日の予定案」を最優先で出す */
    if(h<18 && typeof schedBlocksOf==='function' && typeof schedExams==='function'){
      try{
        /* v63：もう過ぎた時間には入れない。いま入っている枠は、今から（5分単位で切り上げ）。残りが30分未満の枠は使わない */
        var nm=new Date().getHours()*60+new Date().getMinutes(), nm5=Math.ceil(nm/5)*5;
        var hm=function(s){return +s.slice(0,2)*60+(+s.slice(3,5));}, fm=function(n){return p2(Math.floor(n/60))+':'+p2(n%60);};
        var study=schedBlocksOf(d).filter(function(b){return b.k==='study' && hm(b.e)-Math.max(hm(b.s),nm5)>=30;});
        var already=tasks.some(function(x){return x.status==='active'&&x.planDate===d;});
        var exams=schedExams().filter(function(x){return x.date>=d;});
        if(study.length&&exams.length&&!already){
          var blocks=study.map(function(b,i){
            var sm=Math.max(hm(b.s),nm5), em=hm(b.e);
            return {start:fm(sm), min:em-sm, title:exams[i%exams.length].subject+'：試験対策'};
          });
          var first=exams[0], daysLeft=Math.round((new Date(first.date+'T00:00')-new Date(d+'T00:00'))/864e5);
          return { id:'local-'+d+'-dayplan', label:(h<11?'朝':'日中'), local:true,
            text:'今日の自宅学習の時間に、試験対策を組んでおいたよ。最初の試験（'+first.subject+'）まであと'+daysLeft+'日。この並びで入れておく？',
            action:{type:'day_plan', blocks:blocks}, primary:'この予定でいく' };
        }
      }catch(e){}
    }
    if(h>=18){
      var hasRec=false; try{ hasRec=!!(recs && recs[d]); }catch(e){}
      if(!hasRec){
        return { id:'local-'+d+'-night', label:'夜', local:true,
          text:'今日の記録、まだみたい。'+(tMin?('今日は '+tMin+'分 集中したね。'):'')+'一言だけでも残すと、明日の私が続きを読めます。',
          action:{type:'open_log'}, primary:'ログを開く' };
      }
      return null;
    }
    if(outside.length){
      var t=outside[0];
      return { id:'local-'+d+'-slot-'+t.id, label:(h<11?'朝':'日中'), local:true,
        text:(yMin?('昨日は '+yMin+'分 集中できたね。'):'')+'まだ枠の外にある「'+t.title+'」、今日の1枠に入れておく？',
        action:{type:'slot_task', id:t.id, title:t.title}, primary:'入れる' };
    }
    if(h<11){
      return { id:'local-'+d+'-morning-first', label:'朝', local:true,
        text:(yMin?('昨日は '+yMin+'分 集中できたね。'):'おはよう。')+'今日の最初の一歩に、「ふりかえりを書く（5分）」を1枠入れておく？',
        action:{type:'add_task', title:'ふりかえりを書く（5分）'}, primary:'入れる' };
    }
    return null;
  }

  /* ---- 外部（ふわ）から届いた提案を読む ---- */
  function fetchNotes(cb){
    try{
      fetch('/app/fuwa-notes.json',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; })
      .then(function(j){
        var list=(j && (Array.isArray(j)?j:j.notes))||[];
        var d=today(), dis=dismissed(), acc=accepted();
        var hit=list.filter(function(n){ return n && n.id && (n.date===d || n.date==='always') && dis.indexOf(n.id)<0 && acc.indexOf(n.id)<0; })[0]||null;
        cb(hit);
      }).catch(function(){ cb(null); });
    }catch(e){ cb(null); }
  }

  /* ---- 実行（ユーザーが押した時だけ） ---- */
  function runAction(note){
    var a=note.action||{type:'none'};
    try{
      if(a.type==='slot_task'){
        var t=(a.id && typeof taskById==='function' && taskById(a.id)) || (typeof tasks!=='undefined' ? tasks.filter(function(x){return x.title===a.title && x.status==='active';})[0] : null);
        if(!t){ toast('そのタスクが見つかりませんでした'); return false; }
        if(!slotAssign(t.id)){ toast('集中枠がいっぱいです（最大3つ）'); return false; }
        toast('集中枠に入れました');
      } else if(a.type==='add_task'){
        var title=String(a.title||'').trim(); if(!title) return false;
        var ex=(typeof tasks!=='undefined') ? tasks.filter(function(x){return x.title===title && x.status==='active';})[0] : null;
        var o=ex || taskAdd(title,'fuwa');
        if(!o){ toast('タスクを足せませんでした'); return false; }
        if(!slotAssign(o.id)){ toast('タスクは足しましたが、集中枠がいっぱいです'); }
        else toast('集中枠に入れました');
      } else if(a.type==='day_plan'){
        var blocks=Array.isArray(a.blocks)?a.blocks:[]; if(!blocks.length) return false;
        var n=0;
        blocks.forEach(function(b){
          var title=String(b.title||'').trim(); if(!title) return;
          var task=(typeof schedFindOrCreateTask==='function') ? schedFindOrCreateTask(title,'fuwa')
                   : (tasks.filter(function(x){return x.title===title&&x.status==='active';})[0] || taskAdd(title,'fuwa'));
          if(!task) return;
          if(typeof schedSetPlan==='function') schedSetPlan(task, String(b.start||'09:20'), +b.min||60);
          else { task.planDate=today(); task.planStart=String(b.start||'09:20'); task.planMin=+b.min||60; touch('tasks',task); }
          n++;
        });
        saveData(); toast(n+'件を今日の予定に入れました（「予定」タブで見られます）');
      } else if(a.type==='open_log'){
        showView('log'); return true;
      }
      if(typeof fzPaint==='function') fzPaint();
      return true;
    }catch(e){ toast('うまくできませんでした'); return false; }
  }

  /* ---- 表示 ---- */
  function paint(note){
    var host=document.querySelector('#vToday .fz'); if(!host || document.getElementById('fuwaNote')) return;
    var grid=host.querySelector('.fz-grid');
    var el=document.createElement('section');
    el.id='fuwaNote'; el.className='fuwa-note'; el.setAttribute('aria-label','ふわからの提案');
    el.innerHTML=
      '<div class="fuwa-head"><span class="fuwa-from">ふわ から</span><span class="fuwa-when">'+esc(note.label||'')+'</span>'+
      '<a class="fuwa-talk" href="https://muse.ai" target="_blank" rel="noopener">ふわと話す ↗</a></div>'+
      '<p class="fuwa-text">'+esc(note.text||'')+'</p>'+
      ((note.action && note.action.type==='day_plan' && Array.isArray(note.action.blocks)) ?
        '<div class="fuwa-blocks">'+note.action.blocks.map(function(b){return '<div><span class="mono">'+esc(b.start||'')+'</span> '+esc(b.title||'')+'（'+(+b.min||60)+'分）</div>';}).join('')+'</div>' : '')+
      '<div class="fuwa-btns">'+
        ((note.action && note.action.type!=='none') ? '<button class="fuwa-main" id="fuwaOk">'+esc(note.primary||'入れる')+'</button>' : '')+
        '<button class="fuwa-sub" id="fuwaNo">いらない</button>'+
      '</div>';
    if(grid) host.insertBefore(el,grid); else host.appendChild(el);
    var ok=document.getElementById('fuwaOk');
    if(ok) ok.onclick=function(){ if(runAction(note)){ markAccepted(note.id); el.remove(); } };
    document.getElementById('fuwaNo').onclick=function(){ dismiss(note.id); el.remove(); toast('ふわの提案を閉じました'); };
  }

  function tryStart(){
    if(started) return;
    var shell=document.getElementById('fzSlots'), gate=document.getElementById('gate');
    if(!shell || (gate && !gate.classList.contains('hide'))) return;
    if(!gateAt) gateAt=Date.now();
    if(typeof schedLoad==='function' && !window.schedReady && Date.now()-gateAt<6000) return;   // v63：時間割を読み終えてから（最大6秒待つ）
    started=true;
    fetchNotes(function(hit){   // v61：出す提案が無い時は何も出さない（v60 はここで止まっていた）。「いらない」「入れた」端末の提案も、その日は出さない
      var n=hit || localNote(); if(!n) return;
      if(dismissed().indexOf(n.id)>=0 || accepted().indexOf(n.id)>=0) return;
      paint(n);
    });
  }
  setInterval(tryStart, POLL_MS);
  tryStart();
})();
