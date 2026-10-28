/* AIコーチ v35 — 今日タブ（TeamDev「Focus」を移植）：タスク一覧・集中枠（最大3つ）・タスクごとの開始／一時停止／終了・今日の合計・育つクリスタル
   クリスタル：TeamDev の shared-crystal（Three.js）を /app/crystal/ から必要な時だけ読み込む。読めない時（1ファイル版など）は軽いSVGの代替を出す */
const CRYS_TIERS=[['氷晶','#9cddf6'],['蒼晶','#568deb'],['紫晶','#ad8aea'],['金晶','#f0b94a'],['虹晶','#c3e9e6']];
const crysTierOf=ms=>Math.min(4,Math.floor(Math.max(0,ms)/(100*MIN_MS)));   // v59：その日の集中（ミリ秒）→ 段階0〜4。100分ごとに1段階。今日タブと日記が同じ式を使う
const hms=ms=>{const s=Math.max(0,Math.floor(ms/1000));return (s>=3600?Math.floor(s/3600)+':':'')+p2(Math.floor(s/60)%60)+':'+p2(s%60);};
const mins=ms=>Math.floor(Math.max(0,ms)/MIN_MS);
let fzEdit=null, fzMenuOpen=false, fzTick=null, crysView=null, crysLoading=false, crysFailed=false, crysLastMs=-1, crysLastAt=0;

function fzShellHTML(){
  return '<div class="fz">'+
   '<div class="fz-head"><div><div class="eyebrow">TODAY · FOCUS</div><h1>今日</h1><p id="fzDate"></p></div><button class="fz-hand" id="fzHand" aria-label="今日のプロンプトをコピー">AIに渡す ↗</button></div>'+
   '<div class="fz-grid">'+
    '<section class="fz-crys" aria-label="今日の集中クリスタル"><div class="fz-zone" id="fzZone"><div class="fz-host" id="fzHost"></div><div class="fz-fall" id="fzFall" aria-hidden="true">'+crysFallbackSVG()+'</div></div>'+
     '<div class="fz-total"><div><span class="mono">TODAY</span><b id="fzTot">0分</b></div><div class="fz-tier"><i id="fzTierDot"></i><span id="fzTier">氷晶</span><small id="fzNext"></small></div></div></section>'+
    '<section class="fz-slots fz-card" aria-label="集中枠"><div class="fz-ch"><span class="mono">FOCUS · 最大3つ</span><span id="fzRunN" class="mono"></span></div>'+
     '<div class="fz-legend mono">▶ 開始・再開　Ⅱ 一時停止　■ 終了（そのタスクだけ）</div><div id="fzSlots"></div></section>'+
    '<section class="fz-tasks fz-card" aria-label="タスク"><div class="fz-ch"><span class="mono">TASKS</span><span class="mono" id="fzTaskN"></span></div>'+
     '<div class="fz-add"><input id="fzNew" maxlength="100" placeholder="タスクを足す（例：問題集を1ページ）" autocomplete="off" aria-label="新しいタスク"><button class="p" id="fzAddBtn">追加</button></div>'+
     '<div id="fzList"></div><div id="fzDone"></div><div class="fz-sync"><span data-dsync class="memo-st"></span></div></section>'+
   '</div>'+
   '<section class="fz-ai fz-card" aria-label="今日のプロンプト"><div class="fz-ch"><span class="mono">TODAY\'S PROMPT · AIに渡す</span><span class="mono" id="fzAiCoach"></span></div>'+
    '<p class="fz-ai-p">いまのコーチの設定と、今日のタスク・集中・直近の記録をまとめた文章です。Claude / ChatGPT の新しいチャットに貼るだけで始められます。</p>'+
    '<div class="fz-ai-b"><button class="p" id="fzPrompt">今日のプロンプトをコピー<small>新しいチャット用・全部入り</small></button><button id="fzStatus">状況だけコピー<small>続きの会話用・短い版</small></button></div>'+
    '<details class="fz-ai-v" id="fzAiV"><summary>中身を見る</summary><pre id="fzAiPre"></pre></details>'+
    '<div class="fz-ai-n">終わりにAIが出す記録は「ログ」で取り込みます（JSONファイル・貼り付け）。</div></section>'+
   '</div>';
}
function crysFallbackSVG(){   // WebGLが使えない時の代替：3Dの結晶と同じ見た目の静止画（v36〜）
  return '<img class="fz-fbimg" alt="クリスタル（静止の代替表示）" src="data:image/webp;base64,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">';
}

function crysEnsure(ms){
  if(crysView||crysLoading||crysFailed||!$('fzHost'))return;
  if(!/^https?:$/.test(location.protocol)){crysFail('no_http');return;}
  crysLoading=true;
  import('/app/crystal/shared-crystal.js?v='+APP_VERSION).then(m=>{
    if(!$('fzHost'))return;
    crysView=m.createCrystalView({host:$('fzHost'),totalMs:ms,dailyMs:ms,floating:true,quality:window.innerWidth<700?'medium':'high',
      onStatus:d=>{const z=$('fzZone');if(z){z.dataset.mode=d.mode;z.dataset.stage=String(d.colorStage);}}});
    crysLastMs=ms;crysLastAt=Date.now();$('fzZone').classList.add('gl');
  }).catch(()=>crysFail('import_failed')).finally(()=>{crysLoading=false;});
}
function crysFail(why){crysFailed=true;const z=$('fzZone');if(z){z.classList.add('nogl');z.dataset.mode='css-fallback';z.dataset.reason=why;}}
function crysUpdate(ms,force){
  const z=$('fzZone');if(!z)return;
  const st=crysTierOf(ms);z.style.setProperty('--ct',CRYS_TIERS[st][1]);z.dataset.tier=String(st);
  if(!crysView){crysEnsure(ms);return;}
  // 成長は分単位で十分。動いている間は5秒ごと、操作した時はすぐ
  if(force||Math.floor(ms/MIN_MS)!==Math.floor(crysLastMs/MIN_MS)||Date.now()-crysLastAt>5000){crysLastMs=ms;crysLastAt=Date.now();try{crysView.update({totalMs:ms,dailyMs:ms});}catch(e){}}
}

function fzSlotRowHTML(t,i){
  if(!t) return '<div class="fz-row empty" data-slot="'+i+'"><output class="fz-clk mono">--:--</output><button class="fz-empty" data-pick="'+i+'">＋ ここにタスクを追加</button></div>';
  const s=activeSessionOf(t.id),st=s?s.state:'idle',d=jstDay(nowMs());
  const lbl=st==='running'?'集中中':st==='paused'?'一時停止':'未開始';
  return '<div class="fz-row" data-slot="'+i+'" data-state="'+st+'" data-task="'+esc(t.id)+'">'+
    '<output class="fz-clk mono" data-clk="'+esc(t.id)+'">'+hms(s?sesElapsed(s):0)+'</output>'+
    '<div class="fz-nm"><b title="'+esc(t.title)+'">'+esc(t.title)+'</b><small><i class="fz-lamp"></i>'+lbl+' · 今日 <span data-tday="'+esc(t.id)+'">'+mins(taskDayMs(t.id,d))+'</span>分</small></div>'+
    '<button class="fz-tg" data-tg="'+esc(t.id)+'" aria-label="'+esc(t.title)+'を'+(st==='running'?'一時停止':st==='paused'?'再開':'開始')+'">'+(st==='running'?'Ⅱ':'▶')+'</button>'+
    '<button class="fz-end" data-end="'+esc(t.id)+'"'+(s?'':' disabled')+' aria-label="'+esc(t.title)+'を終了">■</button>'+
    '<button class="fz-out" data-out="'+esc(t.id)+'" aria-label="'+esc(t.title)+'を枠から外す">✕</button></div>';
}
function fzTaskRowHTML(t,slotIds){
  const d=jstDay(nowMs()),on=slotIds.has(t.id),m=mins(taskDayMs(t.id,d)),run=activeSessionOf(t.id);
  if(fzEdit===t.id) return '<div class="fz-task ed"><input id="fzEdIn" maxlength="100" value="'+esc(t.title)+'" aria-label="タスク名を直す"><button class="p" id="fzEdSave">保存</button><button id="fzEdX">やめる</button></div>';
  return '<div class="fz-task'+(on?' on':'')+'" data-tid="'+esc(t.id)+'">'+
    '<button class="fz-sel" data-sel="'+esc(t.id)+'" aria-pressed="'+on+'" aria-label="'+esc(t.title)+(on?'を集中枠から外す':'を集中枠に入れる')+'">'+(on?'◉':'○')+'</button>'+
    '<span class="fz-tt"><b>'+esc(t.title)+'</b>'+(run?'<em class="fz-run">'+(run.state==='running'?'計測中':'一時停止')+'</em>':'')+(t.src==='ai_import'?'<em class="fz-src">AIの記録から</em>':'')+'</span>'+
    '<span class="fz-tm mono">'+(m?m+'分':'')+'</span>'+
    '<button class="fz-ic" data-ren="'+esc(t.id)+'" aria-label="'+esc(t.title)+'の名前を直す">✎</button>'+
    '<button class="fz-ic" data-tm="'+esc(t.id)+'" aria-label="'+esc(t.title)+'のメニュー">⋯</button></div>';
}
function fzPaint(full){
  if(!$('fzSlots'))return;
  const t=nowMs(),d=jstDay(t),ms=dayFocusMs(d,t)+(+fS[d]||0)*1000;
  if(full!==false){
    const keep=$('fzEdIn')?{v:$('fzEdIn').value,f:document.activeElement===$('fzEdIn')}:null;
    const v=slotsView(),ids=new Set(v.filter(Boolean).map(x=>x.id));
    $('fzSlots').innerHTML=v.map(fzSlotRowHTML).join('');
    const act=tasks.filter(x=>x.status==='active').sort((a,b)=>(+a.createdAt||0)-(+b.createdAt||0));
    $('fzList').innerHTML=act.length?act.map(x=>fzTaskRowHTML(x,ids)).join(''):'<div class="fz-none">まだタスクがありません。上の欄から足してください。</div>';
    const old=tasks.filter(x=>x.status!=='active').sort((a,b)=>(+b.updatedAt||0)-(+a.updatedAt||0));
    $('fzDone').innerHTML=old.length?'<details class="fz-old"'+(fzMenuOpen?' open':'')+'><summary>完了・しまったタスク（'+old.length+'）</summary>'+old.slice(0,40).map(x=>'<div class="fz-task old"><span class="fz-st">'+(x.status==='done'?'✓ 完了':'しまった')+'</span><span class="fz-tt"><b>'+esc(x.title)+'</b></span><button class="fz-back" data-back="'+esc(x.id)+'">戻す</button></div>').join('')+'</details>':'';
    $('fzTaskN').textContent=act.length+'件';
    try{$('fzAiCoach').textContent=activeChar().name;if($('fzAiV').open)$('fzAiPre').textContent=todayPromptText();}catch(e){}
    fzBind();
    if(keep&&$('fzEdIn')){$('fzEdIn').value=keep.v;if(keep.f)$('fzEdIn').focus();}
    const dt=new Date(t+JST_OFF);$('fzDate').textContent=(dt.getUTCMonth()+1)+'月'+dt.getUTCDate()+'日（'+'日月火水木金土'[dt.getUTCDay()]+'）· 日本時間で0時に切り替わります';
    paintSync();
  } else {
    document.querySelectorAll('[data-clk]').forEach(e=>{const s=activeSessionOf(e.dataset.clk);e.textContent=hms(s?sesElapsed(s,t):0);});
    document.querySelectorAll('[data-tday]').forEach(e=>{e.textContent=mins(taskDayMs(e.dataset.tday,d,t));});
  }
  const runN=sessions.filter(s=>sesLive(s)&&s.state==='running').length;
  $('fzRunN').textContent=runN?runN+'つ計測中':'';
  const st=crysTierOf(ms),m=mins(ms);
  $('fzTot').textContent=(m>=60?Math.floor(m/60)+'時間'+(m%60)+'分':m+'分');
  $('fzTier').textContent=CRYS_TIERS[st][0];$('fzTierDot').style.background=CRYS_TIERS[st][1];
  $('fzNext').textContent=st<4?'次の色まで '+(100*(st+1)-m)+'分':'400分以上';
  crysUpdate(ms,full!==false);
}
function fzBind(){
  const box=$('vToday');
  box.querySelectorAll('[data-tg]').forEach(b=>b.onclick=()=>{const s=timerToggle(b.dataset.tg);if(!s)toast('集中枠がいっぱいです（最大3つ）');else toast(s.state==='running'?'開始しました':'一時停止しました');});
  box.querySelectorAll('[data-end]').forEach(b=>b.onclick=()=>{const s=timerEnd(b.dataset.end);if(s)toast('終了しました（'+mins(sesElapsed(s))+'分を記録）');});
  box.querySelectorAll('[data-out]').forEach(b=>b.onclick=()=>{const id=b.dataset.out;if(activeSessionOf(id)&&!confirm('計測を終了して、枠から外しますか？'))return;slotRemove(id);});
  box.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>fzPicker(+b.dataset.pick));
  box.querySelectorAll('[data-sel]').forEach(b=>b.onclick=()=>{const id=b.dataset.sel;
    if(inSlots(id)){if(activeSessionOf(id)&&!confirm('計測を終了して、枠から外しますか？'))return;slotRemove(id);}
    else if(!slotAssign(id))toast('集中枠がいっぱいです（最大3つ）');});
  box.querySelectorAll('[data-ren]').forEach(b=>b.onclick=()=>{fzEdit=b.dataset.ren;fzPaint();const i=$('fzEdIn');if(i){i.focus();i.select();}});
  box.querySelectorAll('[data-tm]').forEach(b=>b.onclick=()=>fzTaskMenu(b.dataset.tm));
  box.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>{taskSetStatus(b.dataset.back,'active');toast('戻しました');});
  const od=box.querySelector('.fz-old');if(od)od.ontoggle=()=>{fzMenuOpen=od.open;};
  const ei=$('fzEdIn');
  if(ei){const save=()=>{const v=ei.value.trim();if(!v){toast('空にはできません');return;}taskRename(fzEdit,v);fzEdit=null;fzPaint();toast('直しました（前の名前も残しています）');};
    ei.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)save();if(e.key==='Escape'){fzEdit=null;fzPaint();}};
    $('fzEdSave').onclick=save;$('fzEdX').onclick=()=>{fzEdit=null;fzPaint();};}
}
function fzAdd(){const i=$('fzNew'),v=i.value.trim();if(!v)return;const o=taskAdd(v,'user');if(o){i.value='';toast('足しました');}i.focus();}
function fzPicker(slot){
  const ids=new Set(slotsView().filter(Boolean).map(x=>x.id)),list=tasks.filter(t=>t.status==='active'&&!ids.has(t.id));
  $('sheetBody').innerHTML='<div class="dy-sh"><div class="lb">集中枠 '+(slot+1)+' に入れるタスク</div>'+
    (list.length?list.map(t=>'<button class="fz-pk" data-pk="'+esc(t.id)+'">'+esc(t.title)+'</button>').join(''):'<div class="mu">枠に入っていないタスクはありません。</div>')+
    '<div class="dp-add-row"><input id="fzPkNew" maxlength="100" placeholder="新しいタスクを足して入れる" aria-label="新しいタスク"><button class="p" id="fzPkAdd">足す</button></div>'+
    '<button class="dy-close" id="fzPkX">閉じる</button></div>';
  $('sheet').classList.remove('hide');
  $('sheetBody').querySelectorAll('[data-pk]').forEach(b=>b.onclick=()=>{slotAssign(b.dataset.pk,slot);closeSheet();});
  const add=()=>{const v=$('fzPkNew').value.trim();if(!v)return;const o=taskAdd(v,'user');if(o)slotAssign(o.id,slot);closeSheet();};
  $('fzPkAdd').onclick=add;$('fzPkNew').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)add();};
  $('fzPkX').onclick=closeSheet;
}
function fzTaskMenu(id){
  const t=taskById(id);if(!t)return;
  const h=(t.history||[]).filter(x=>x.kind==='rename');
  $('sheetBody').innerHTML='<div class="dy-sh"><div class="lb">'+esc(t.title)+'</div>'+
    '<button class="wide p" id="fzMDone">✓ 完了にする</button><button class="wide" id="fzMArc">しまう（一覧から外す）</button>'+
    '<div class="mu" style="font-size:11.5px;margin:10px 0">消しません。下の「完了・しまったタスク」から戻せます。記録した集中の分もそのまま残ります。</div>'+
    (h.length?'<div class="lb" style="margin-top:14px">名前の履歴</div>'+h.map(x=>'<div class="dy-row"><span>'+esc(dyWhen(x.t))+'</span><span class="dy-old">'+esc(x.from)+' → '+esc(x.to)+'</span></div>').join(''):'')+
    '<button class="dy-close" id="fzMX">閉じる</button></div>';
  $('sheet').classList.remove('hide');
  $('fzMDone').onclick=()=>{taskSetStatus(id,'done');closeSheet();toast('完了にしました');};
  $('fzMArc').onclick=()=>{taskSetStatus(id,'archived');closeSheet();toast('しまいました');};
  $('fzMX').onclick=closeSheet;
}
function setupToday(){
  if($('fzSlots'))return;
  $('vToday').innerHTML=fzShellHTML();
  $('fzAddBtn').onclick=fzAdd;
  $('fzNew').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)fzAdd();};
  $('fzHand').onclick=copyTodayPrompt;
  $('fzPrompt').onclick=copyTodayPrompt;
  $('fzStatus').onclick=copyTodayStatus;
  $('fzAiV').ontoggle=()=>{if($('fzAiV').open)$('fzAiPre').textContent=todayPromptText();};
  clearInterval(fzTick);
  fzTick=setInterval(()=>{if(activeAppTab==='today'&&document.visibilityState==='visible')fzPaint(false);if(activeAppTab==='dash')dashPaint();},1000);
  fzPaint();
}

/* ---- シート（共通） ---- */
function closeSheet(){ $('sheet').classList.add('hide'); if(activeAppTab==='log'&&!ob) renderRecMore(); }
$('sheet').onclick=e=>{ if(e.target.id==='sheet') closeSheet(); };

/* ---- 上の時計の帯 ---- */
(function(){const z=['Asia/Tokyo','America/New_York','Europe/London','Asia/Singapore'],n=['東京','ニューヨーク','ロンドン','シンガポール'];
  const f=()=>{const t=z.map((x,i)=>n[i]+' '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:x,hour12:false}).format(new Date())).join(' · ')+' · 稼働中 · ';
    $('tk').innerHTML='<span>'+t+t+'</span><span>'+t+t+'</span>';};f();setInterval(f,30000);})();

/* ---- 4つのタブ（v35：今日／ログ／ダッシュボード／コーチ） ---- */
let activeAppTab='today';
const TAB_VIEW={today:'vToday',plan:'vPlan',log:'vLog',dash:'vDash',settings:'vLab'}, TAB_BTN={today:'tToday',plan:'tPlan',log:'tLog',dash:'tDash',settings:'tSettings'};   // v63：予定タブ
function setupTabs(){
  if($('vLog').dataset.ready)return;$('vLog').dataset.ready='1';
  setupToday();
  $('vLog').innerHTML=rvShellHTML();
  rvBind();
  Object.keys(TAB_BTN).forEach(k=>{$(TAB_BTN[k]).onclick=()=>{if(k==='settings'&&(activeAppTab!=='settings'||labScreen!=='chars'))labScreen='chars';showView(k);};});
}
function showView(v){
  setupTabs();
  if(v==='chat')v='log';   // 旧：会話タブ（v35で終了）
  activeAppTab=v;
  Object.keys(TAB_VIEW).forEach(k=>{$(TAB_VIEW[k]).classList.toggle('hide',k!==v);$(TAB_BTN[k]).classList.toggle('on',k===v);});
  document.body.classList.toggle('rec-active',v==='log');
  document.body.classList.toggle('today-active',v==='today');
  document.body.classList.toggle('dash-active',v==='dash');
  if(v==='settings')renderLab(); else document.body.classList.remove('cb-talk');
  if(v==='log'){renderRecCard();rvEnter();}
  if(v==='today'){fzPaint();}
  if(v==='dash')dashPaint(true);
  if(v==='plan'&&typeof planPaint==='function')planPaint(true);
  window.scrollTo(0,0);
}
function setSub(s){showView(s==='log'?'log':'today');}
function goToChat(){showView('log');}
