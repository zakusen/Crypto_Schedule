/* AIコーチ v45 — ログタブ：AIの記録の貼り付け・記録係（一言で直す）・日記・記録の管理（app-v30/ が元。build_v30.py で1ファイル版・bundle を作る） */
/* ---- 記録タブ：コーチメモ ---- */
function memoStatusText(){
  if(memKV===true) return memSyncAt?'クラウドに同期中（最終同期 '+p2(new Date(memSyncAt).getHours())+':'+p2(new Date(memSyncAt).getMinutes())+'）':'クラウドに同期中…';
  return '記憶の保存先：この端末のみ'+(memErr?'（同期できませんでした）':'');
}
function paintMemoStatus(){document.querySelectorAll('[data-mst]').forEach(e=>{e.textContent=memoStatusText();e.classList.toggle('on',memKV===true);});}
function paintMemoMeta(){
  const p=$('mCtx');if(p&&p.closest('details').open)p.textContent=buildContext();
}
function recentSums(n){const o=[];for(let i=n;i>=1;i--){const d=dayStr(i),l=dayLine(d);if(l)o.push(d+': '+l);}return o;}   // v28: アプリが作る1行


/* ---- 今日の記録：v18 で記録係（記録タブ）に移した ---- */
function renderRecCard(){
  if($('gType')) $('gType').textContent=tname(typeOf(today()));
  if(activeAppTab==='log'&&!ob) renderRecMore();
}

/* ===== v18: 記録係（コーチとは別のAI。事実を記録して、覚えておく担当） =====
   ac_recchat = {日付:[{role:'ai'|'me'|'card'|'mem', ...}]}  …記録係とのやりとり（コーチの会話とは別） */
let recChat=L('recchat',{});
let recDay=null;          // null＝今日。履歴から過去の日を開いた時だけ日付が入る
let recWait=false;        // 記録係の応答待ち
let draftBusy={};         // 日付ごとの下書き作成中フラグ
let ob=null, obSkip=false;// 最初の聞き取り
const recD=()=>recDay||today();
const RES_ICON={done:'✓',partial:'△',not:'×',pending:'？'};
const RES_CLS={done:'ok',partial:'pt',not:'ng',pending:''};
const RX_FIELDS=['action','minutes','result','sat','note'];
const MEMO_FIELD_LABEL={goal:'目標',deadline:'期限',prefs:'好み',patterns:'パターン',notes:'その他'};
const z2h=s=>String(s||'').replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));
function recThread(d){return recChat[d]||(recChat[d]=[]);}
function recSave(){const lim=dayStr(45);Object.keys(recChat).forEach(k=>{if(k<lim)delete recChat[k];});S('recchat',recChat);}
function lastCardIdx(d){const t=recChat[d]||[];for(let i=t.length-1;i>=0;i--)if(t[i].role==='card')return i;return -1;}
function draftNorm(x){
  x=x||{};
  const mn=Math.round(+x.minutes);
  return {action:cut(x.action||'',60),minutes:mn>=0&&mn<=600?mn:0,minSrc:String(x.minSrc||''),
    result:RES_ICON[x.result]?x.result:'pending',sat:clamp5(x.sat,3),note:cut(x.note||'',60)};
}
async function recApi(body){
  const r=await fetch(API('/api/recorder'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({pass:appPass},body))});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.error) throw new Error(j.error||('HTTP '+r.status));
  return j;
}

/* ---- v28: 記録係が直せるのは「自分について」の事実（目標・期限・本人の発言）だけ。好み・パターン（解釈）はもう覚えない ---- */
function memoApply(op){
  const m=mem.memo,f=op&&op.field,now=Date.now();
  if(!['goal','deadline','notes'].includes(f)) return null;
  const recEvidence=()=>{const d=recD(),th=recChat[d]||[];for(let i=th.length-1;i>=0;i--)if(th[i].role==='me')return {date:d,sourceRef:'recchat.'+d+'.'+i};return {date:d,sourceRef:'memoApply'};};
  const v=cut(op.value,120);
  if(f==='notes'){
    const same=x=>x.type==='statement'&&x.sourceRef==='self'&&x.status==='active'&&x.value===v;
    if(op.op==='remove'){const x=mem.facts.find(same);if(!x)return null;x.status='retracted';x.updatedAt=now;return {op:'remove',field:f,value:v};}
    if(!v||mem.facts.some(same)) return null;
    mem.facts.push({id:'fact_self_'+stableHash(v+'|'+now),type:'statement',value:v,date:recD(),source:'user_said',sourceRef:'self',status:'active',verification:'confirmed',createdAt:now,updatedAt:now});
    return {op:'add',field:f,value:v};
  }
  if(op.op==='remove'){if(!m[f])return null;const prev=m[f];mem.facts.filter(x=>x.type===f&&x.value===prev&&x.status==='active').forEach(x=>{x.status='corrected';x.updatedAt=now;});m[f]='';return {op:'set',field:f,value:'',prev};}
  if(!v||m[f]===v) return null;
  const prev=m[f];m[f]=v;const ev=recEvidence();
  const olds=mem.facts.filter(x=>x.type===f&&x.value!==v&&x.status==='active');
  olds.forEach(x=>{x.status='corrected';x.updatedAt=now;});
  const id='fact_memo_'+f+'_'+stableHash(v),ex=mem.facts.find(x=>x.id===id);
  const item={id,type:f,value:v,date:ev.date,source:'recorder_ai',sourceRef:ev.sourceRef,status:'active',verification:'unconfirmed',createdAt:ex&&ex.createdAt||now,updatedAt:now};
  if(olds[0]){item.corrects=olds[0].id;item.prevValue=olds[0].value;}
  if(ex)Object.assign(ex,item);else mem.facts.push(item);
  return {op:'set',field:f,value:v,prev};
}
function memoApplyAll(ops){
  const done=(ops||[]).map(memoApply).filter(Boolean);
  if(done.length){memoCap();memChanged();}
  return done;
}
const catToField=cat=>{const e=MEMO_CATS.find(c=>c[0]===cat);return e&&e[1];};

/* ---- 下書き（オンラインは /api/recorder、オフラインはルール） ---- */
const RX_PARTIAL=/少し|すこし|ちょっと|半分|一部|途中まで|あまり|あんまり|ちょっとだけ/;
const RX_NOT=/できなかった|できませんでした|出来なかった|無理だった|やってない|やってません|やれなかった|手をつけられなかった|進まなかった|サボ/;
const RX_DONE=/できた|出来た|終わった|やった|できました|終わりました|やりました|完了|達成/;
function resultOf(t){
  t=String(t||'');
  if(RX_PARTIAL.test(t)&&(RX_DONE.test(t)||RX_NOT.test(t)||/進んだ|進まな/.test(t))) return 'partial';
  if(RX_NOT.test(t)) return 'not';
  if(RX_DONE.test(t)) return 'done';
  if(RX_PARTIAL.test(t)) return 'partial';
  return null;
}
function satOf(t){
  t=z2h(t);let m;
  if((m=t.match(/(?:★|星|手ごたえ|手応え|満足度?)\s*([1-5])/)))return +m[1];
  if((m=t.match(/(★+)/)))return Math.min(5,m[1].length);
  if(/疲れ|だめ|ダメ|しんど|最悪|眠/.test(t))return 2;
  if(/よかった|良かった|集中|捗|はかど|調子がいい|いい感じ/.test(t))return 4;
  return null;
}
function minutesOf(t){
  t=z2h(t);let m,n=null;
  if((m=t.match(/(\d+(?:\.\d+)?)\s*時間\s*半/)))n=Math.round(+m[1]*60+30);
  else if((m=t.match(/(\d+(?:\.\d+)?)\s*時間(?:\s*(\d+)\s*分)?/)))n=Math.round(+m[1]*60+(+m[2]||0));
  else if((m=t.match(/(\d+)\s*分/)))n=+m[1];
  return n!==null&&n>=0&&n<=600?n:null;
}
function ruleDraft(d){   // v35：今日のタスクと集中（事実）から。会話からは作らない
  const ex=recs[d]||null,f=focusSummary(d),fm=focusMinOf(d);
  const action=(ex&&ex.action)||cut(f.tasks.map(x=>x.title).join('、'),60);
  const minutes=fm||(ex&&+ex.minutes)||0;
  return {action,minutes,minSrc:fm&&minutes===fm?'timer':'',result:(ex&&ex.result)||'pending',sat:(ex&&ex.sat)||3,note:cut((ex&&ex.note)||'',40)};
}
function makeDraft(d){
  if(draftBusy[d]) return;
  const dr=draftNorm(ruleDraft(d));
  const th=recThread(d);
  th.push({role:'ai',text:(d===today()?'今日':mdw(d))+'のタスクと集中から、下書きを作りました。AIの記録があれば上に貼り付けてください。違う所は一言で直せます。'});
  th.push({role:'card',draft:dr,label:'下書き',changed:[]});
  recSave();
}
function ensureRecCard(d){   // 開いた日に、カードが無ければ用意する
  const lc=lastCardIdx(d);
  if(lc>=0){const c=recChat[d][lc];   // v35：手を入れていない下書きは、いまのタスクと集中で作り直す
    if(!ob&&!c.saved&&c.label==='下書き'&&!recs[d]){const nd=draftNorm(ruleDraft(d));if(JSON.stringify(nd)!==JSON.stringify(draftNorm(c.draft))){c.draft=nd;recSave();}}
    return;}
  if(ob||draftBusy[d]) return;
  const r=recs[d];
  if(r){
    const th=recThread(d);
    th.push({role:'ai',text:(d===today()?'今日':mdw(d))+'の記録です。直したい所があれば、一言でどうぞ。'});
    th.push({role:'card',draft:draftNorm(r),label:'記録済み',changed:[],saved:true});
    recSave(); return;
  }
  makeDraft(d);
}

/* ---- 一言で直す ---- */
function ruleEdit(cur,text){
  let t=z2h(text).replace(/^(あと|それと|それから|あ、)[、,\s]*/,'').trim();
  const dr=Object.assign({},cur),ops=[];let m;
  if((m=t.match(/目標(?:を|は)\s*(.+?)\s*(?:に(?:変えて|変更|して|する|します|したい)|です|$)/))){ops.push({op:'set',field:'goal',value:m[1].replace(/[。、]$/,'')});}
  else if((m=t.match(/期限(?:を|は)\s*(.+?)\s*(?:に(?:変えて|変更|して|する)|です|まで|$)/))){ops.push({op:'set',field:'deadline',value:m[1].replace(/[。、]$/,'')});}
  else if((m=t.match(/(?:覚えて(?:おいて)?|メモして)[:：、\s]*(.+)/))){ops.push({op:'add',field:'notes',value:m[1]});}
  else if((m=t.match(/^(.+?)(?:って|と)(?:覚えて|メモして)/))){ops.push({op:'add',field:'notes',value:m[1]});}
  if(ops.length) return {reply:'「自分について」を直しました。',draft:dr,memoOps:ops};
  const mn=minutesOf(t);if(mn!==null){dr.minutes=mn;dr.minSrc='edit';}
  const rs=resultOf(t);if(rs)dr.result=rs;
  const st=satOf(t);if(st)dr.sat=st;
  if((m=t.match(/(?:やったこと|内容)(?:は|を)?[:：\s]*(.+?)(?:に(?:して|変えて)|です|$)/))) dr.action=cut(m[1],60);
  else if((m=t.match(/ひとこと(?:は|を)?[:：\s]*(.+?)(?:に(?:して|変えて)|$)/))) dr.note=cut(m[1],60);
  else {
    let rest=t.replace(/[0-9.]+\s*(?:時間\s*半|時間(?:\s*\d+\s*分)?|分)(?:だけ|くらい|ほど|ぐらい)?/,'').replace(/★+|星\s*[1-5]|手ごたえ\s*[1-5]/,'').replace(/^[、。,.\s]+|[、。,.\s]+$/g,'');
    if(rest&&!(rest.length<=8&&rs&&!st)) dr.note=cut(rest,40);
  }
  const changed=RX_FIELDS.filter(k=>dr[k]!==cur[k]);
  return {reply:changed.length?'分かりました。こう直しました。':'うまく読み取れませんでした。「30分」「少しできた」「★2」のように書いてみてください。',draft:dr};
}
async function recSend(){
  const inp=$('rxInp'),t=inp.value.trim();
  if(!t||recWait) return;
  inp.value='';
  if(ob){obText(t);return;}
  const d=recD(),th=recThread(d);
  th.push({role:'me',text:t});recSave();
  const ci=lastCardIdx(d);
  const cur=ci>=0?draftNorm(th[ci].draft):draftNorm(ruleDraft(d));
  let res=null;
  if(online){
    recWait=true;renderRecThread();
    try{res=await recApi({op:'edit',date:d,draft:cur,text:t,memo:memoForRecorder()});}catch(e){res=null;}
    recWait=false;
  }
  if(!res) res=ruleEdit(cur,t);
  const nd=draftNorm(Object.assign({},cur,res.draft||{}));
  if(nd.minutes!==cur.minutes) nd.minSrc='edit'; else nd.minSrc=cur.minSrc;
  const changed=RX_FIELDS.filter(k=>nd[k]!==cur[k]);
  const done=memoApplyAll(Array.isArray(res.memoOps)?res.memoOps:[]);
  let reply=String(res.reply||'').trim();
  if(!reply) reply=changed.length?'分かりました。こう直しました。':done.length?'「自分について」を直しました。':'分かりました。';
  if(done.length&&!changed.length&&/直しました|変えました/.test(reply)===false) reply='「自分について」を直しました。';
  th.push({role:'ai',text:reply});
  if(changed.length) th.push({role:'card',draft:nd,label:'修正',changed});
  recSave();renderRecorder();
}
function recConfirm(ci){
  const d=recD(),th=recThread(d),c=th[ci];if(!c||c.role!=='card')return;
  const first=!recs[d],dr=draftNorm(c.draft);
  recs[d]=Object.assign({},recs[d]||{},{date:d,at:(recs[d]&&recs[d].at)||Date.now(),type:typeOf(d),action:dr.action||'（未入力）',result:dr.result,sat:dr.sat,minutes:dr.minutes,note:dr.note,
    summary:dr.note||''});
  S('recs',recs);syncAppFacts();mem.updatedAt=Date.now();S('mem',mem);if(memKV===true)memPush();
  th.forEach(x=>{if(x.role==='card')x.saved=false;});
  c.saved=true;
  let ok=0;for(let i=0;i<5;i++){const r=recs[dayStr(i)];if(r&&r.result==='done')ok++;}
  th.push({role:'ai',text:first?('記録しました。'+(ok?'直近5日で「できた」は'+ok+'日です。':'')+'おつかれさまでした。'):'記録を直しました。'});
  recSave();renderRecorder();toast('記録しました');
  archiveSoon(d,1200);   // v24: 確定した記録を R2 に保管（v28: AIの要約は作らない）
  if(recBackTo===d){recBackTo=null;recDay=null;dySel=d;setRvMode('diary',false);toast(dyMDs(d)+'の記録をつけました');}   // v28: 日記から来た時は、その日のページに戻る
}

/* ---- 最初の聞き取り（3問） ---- */
const OB_GOALS=['資格試験の合格','習慣をつくる','仕事の成果'];
const OB_DL=['1か月以内','3か月以内','半年以内','決めていない'];
const OB_STUCK=['やることが多すぎる','時間がない','続かない','何からやるか迷う','計画が崩れる'];
const OB_PAT={'やることが多すぎる':'やることを抱えすぎて、手が止まりがち','時間がない':'時間が取れないと感じやすい','続かない':'始めても続かず、途切れがち','何からやるか迷う':'何から始めるかで迷いやすい','計画が崩れる':'立てた計画が崩れやすい'};
function needsOnboard(){return false;}   // v38：最初の聞き取りは廃止（目標・期限は「自分について」で）
function obInit(name){ob={goal:'',deadline:'',dlMode:false,stuck:[],free:[],name:name||activeChar().name,busy:false,pending:''};recDay=null;}
function startOnboarding(name){
  obInit(name); rvMode='input';
  if(activeAppTab!=='log') showView('log'); else renderRecorder();
}
function obInputHint(){
  if(!ob) return;
  const i=$('rxInp');
  i.placeholder=ob.pending==='goal'?'例：統計検定2級に合格':ob.pending==='dl'?'例：11月22日の試験まで':ob.pending==='stuck'?'例：スマホを見てしまう':'自由に書いてもOK';
}
function obText(t){
  if(!ob.goal||ob.pending==='goal'){ob.goal=cut(t,80);ob.pending='';}
  else if(!ob.deadline||ob.pending==='dl'){ob.deadline=cut(t,40);ob.dlMode=true;ob.pending='';}
  else {const v=cut(t,60);if(!ob.free.includes(v))ob.free.push(v);ob.pending='';}
  renderRecorder();
}
function addMonths(n){const x=new Date();x.setMonth(x.getMonth()+n);return (x.getMonth()+1)+'月'+(x.getDate()<=10?'上旬':x.getDate()<=20?'中旬':'下旬');}
function ruleOnboard(a){
  const dlm={'1か月以内':1,'3か月以内':3,'半年以内':6}[a.deadline];
  return {goal:a.goal,deadline:a.deadline==='決めていない'?'':dlm?a.deadline+'（'+addMonths(dlm)+'まで）':a.deadline,
    patterns:a.stuck.map(s=>OB_PAT[s]||s),reply:'ありがとうございます。コーチメモを作りました。'};
}
async function obFinish(){
  if(!ob||!ob.goal||ob.busy) return;
  ob.busy=true;renderRecorder();
  const a={goal:ob.goal,deadline:ob.deadline,stuck:ob.stuck.concat(ob.free),coach:ob.name,today:today()};
  S('obAnswers',{date:today(),goal:a.goal,deadline:a.deadline,stuck:a.stuck});   // v24: 本人の答え（事実）として保管
  let r=null;
  if(online){try{r=await recApi({op:'onboard',answers:a});}catch(e){r=null;}}
  if(!r) r=ruleOnboard(a);
  const m=mem.memo;
  m.goal=cut(r.goal||a.goal,80); m.deadline=cut(r.deadline||'',40);
  {const now=Date.now();
   if(m.goal)mem.facts.push({id:'fact_memo_goal_'+stableHash(m.goal),type:'goal',value:m.goal,date:today(),source:'user_said',sourceRef:'onboarding',status:'active',verification:'confirmed',createdAt:now,updatedAt:now});
   if(m.deadline)mem.facts.push({id:'fact_memo_deadline_'+stableHash(m.deadline),type:'deadline',value:m.deadline,date:today(),source:'user_said',sourceRef:'onboarding',status:'active',verification:'confirmed',createdAt:now,updatedAt:now});
   a.stuck.slice(0,6).forEach((s,i)=>{s=cut(s,60);if(s)mem.facts.push({id:'fact_self_'+stableHash('止まっていること：'+s),type:'statement',value:'止まっていること：'+s,date:today(),source:'user_said',sourceRef:'self',status:'active',verification:'confirmed',createdAt:now+i,updatedAt:now+i});});}
  mem.onboarded=true; memoCap(); memChanged();
  if(!cfg.goal){cfg.goal=m.goal;S('cfg',cfg);}
  ob=null;
  const th=recThread(today());
  th.push({role:'ai',text:'ありがとうございます。答えを「自分について」に残しました。',sub:'目標：'+m.goal+(m.deadline?' ／ 期限：'+m.deadline:'')});
  th.push({role:'ai',text:'これからは毎日、会話とタイマーから記録の下書きをここに用意します。違う時は一言で直すだけです。'});
  recSave(); toast('「自分について」に残しました'); renderRecorder();
}
function obHTML(){
  const q=(t)=>'<div class="msg ai">'+t+'</div>';
  const me=t=>'<div class="msg me">'+esc(t)+'</div>';
  const nAns=(ob.goal?1:0)+(ob.deadline?1:0)+((ob.stuck.length||ob.free.length)?1:0);
  let h='<div class="rx-prog">'+[0,1,2].map(i=>'<i class="'+(i<nAns?'d':'')+'"></i>').join('')+'<button data-ob="skip">あとで</button></div>';
  h+=q('「'+esc(ob.name)+'」に決まりました。最初に3つだけ聞かせてください。<br><b>① 何を目指していますか？</b>');
  if(!ob.goal) h+='<div class="rx-chips">'+OB_GOALS.map(g=>'<button data-obg="'+esc(g)+'">'+esc(g)+'</button>').join('')+'<button data-ob="goalw" class="'+(ob.pending==='goal'?'sel':'')+'">✎ 自分で書く</button></div>';
  else {
    h+=me(ob.goal);
    h+=q('<b>② いつまでに？</b>');
    h+='<div class="rx-chips">'+OB_DL.map(g=>'<button data-obd="'+esc(g)+'" class="'+(ob.deadline===g?'sel':'')+'">'+esc(g)+'</button>').join('')+
      '<button data-ob="dlw" class="'+(ob.pending==='dl'||ob.dlMode?'sel':'')+'">日付を書く</button></div>';
    if(ob.dlMode&&ob.deadline) h+=me(ob.deadline);
    if(ob.deadline){
      h+=q('<b>③ いま一番止まっていることは？</b>（いくつでも）');
      h+='<div class="rx-chips">'+OB_STUCK.map(g=>'<button data-obs="'+esc(g)+'" class="'+(ob.stuck.includes(g)?'sel':'')+'">'+esc(g)+'</button>').join('')+
        ob.free.map((g,i)=>'<button data-obf="'+i+'" class="sel">'+esc(g)+' ✕</button>').join('')+
        '<button data-ob="stw" class="'+(ob.pending==='stuck'?'sel':'')+'">✎ 自分で書く</button></div>';
      h+='<button class="rx-go" data-ob="go"'+(ob.busy?' disabled':'')+'>'+(ob.busy?'コーチメモを作っています…':'これでコーチメモを作る →')+'</button>';
    }
  }
  return h;
}
function bindOb(box){
  box.querySelectorAll('[data-obg]').forEach(b=>b.onclick=()=>{ob.goal=b.dataset.obg;ob.pending='';renderRecorder();});
  box.querySelectorAll('[data-obd]').forEach(b=>b.onclick=()=>{ob.deadline=b.dataset.obd;ob.dlMode=false;ob.pending='';renderRecorder();});
  box.querySelectorAll('[data-obs]').forEach(b=>b.onclick=()=>{const v=b.dataset.obs,i=ob.stuck.indexOf(v);if(i<0)ob.stuck.push(v);else ob.stuck.splice(i,1);renderRecorder();});
  box.querySelectorAll('[data-obf]').forEach(b=>b.onclick=()=>{ob.free.splice(+b.dataset.obf,1);renderRecorder();});
  box.querySelectorAll('[data-ob]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.ob;
    if(k==='skip'){ob=null;obSkip=true;renderRecorder();toast('あとで「自分について」から書けます');return;}
    if(k==='go'){obFinish();return;}
    ob.pending=k==='goalw'?'goal':k==='dlw'?'dl':'stuck';
    renderRecorder();$('rxInp').focus();
  });
}

/* ---- 画面 ---- */
let rxOpen={};   // 下の折りたたみの開閉
let recBackTo=null;   // v28: 日記から開いた日（確定したら、その日の日記に戻る）
function rxCardHTML(c,i,live){
  const dr=draftNorm(c.draft),ch=c.changed||[],hl=k=>ch.includes(k)?' hl':'';
  const d=recD(),lbl=(d===today()?'TODAY':mdw(d))+' · '+(c.label||'下書き');
  const mn=dr.minutes?dr.minutes+'分'+(dr.minSrc==='timer'?'（タイマー）':''):'—';
  return '<div class="rx-card'+(live||c.saved?'':' old')+'" data-card="'+i+'"><div class="t mono">'+esc(lbl)+'</div>'+
    '<div class="rx-row'+hl('action')+'"><span>やったこと</span><span>'+esc(dr.action||'（未入力）')+'</span></div>'+
    '<div class="rx-row'+hl('minutes')+'"><span>集中</span><span>'+esc(mn)+'</span></div>'+
    '<div class="rx-row'+hl('result')+'"><span>結果</span><span><em class="rx-pl '+dr.result+'">'+RN[dr.result]+'</em></span></div>'+
    '<div class="rx-row'+hl('sat')+'"><span>手ごたえ</span><span class="rx-stars" aria-label="手ごたえ '+dr.sat+'/5">'+'★'.repeat(dr.sat)+'☆'.repeat(5-dr.sat)+'</span></div>'+
    '<div class="rx-row'+hl('note')+'"><span>ひとこと</span><span>'+esc(dr.note||'—')+'</span></div>'+
    (live?'<div class="rx-live mono" style="font-size:10px;color:#8ee7f2;margin-top:8px;letter-spacing:.08em">↓ 下の「✓ この内容で記録する」で確定</div>':'')+
    (c.saved?'<div class="rx-saved"><span>✓ 記録しました</span><button data-rx="reopen" data-ci="'+i+'">直す</button></div>':'')+
    '</div>';
}
function renderRecThread(){
  const box=$('rxThread');if(!box)return;
  if(ob){box.innerHTML=obHTML();bindOb(box);paintRxHead();obInputHint();scrollRx();return;}
  const d=recD(),th=recChat[d]||[],lc=lastCardIdx(d);
  box.innerHTML=th.map((m,i)=>{
    if(m.role==='card') return rxCardHTML(m,i,i===lc&&!m.saved);
    if(m.role==='mem') return '';   // v28: 「🧠 覚えました」は出さない
    return '<div class="msg '+(m.role==='me'?'me':'ai')+'">'+esc(m.text)+(m.sub?'<span class="sub">'+esc(m.sub)+'</span>':'')+'</div>';
  }).join('')+(recWait?'<div class="rx-typing"><i></i><i></i><i></i>記録係が書いています</div>':'');
  box.querySelectorAll('[data-rx]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.rx;
    if(k==='ok') recConfirm(+b.dataset.ci);
    else if(k==='reopen'){const c=th[+b.dataset.ci];c.saved=false;c.label='直す';recSave();renderRecorder();$('rxInp').focus();}
    else {$('rxInp').placeholder='例：30分だけ、疲れてた';$('rxInp').focus();}
  });
  $('rxInp').placeholder=lc>=0?'一言で直す・伝える':'一言で直す（例：30分だけ、疲れてた）';
  paintRxHead();scrollRx();
}
function scrollRx(){
  const sc=$('rxScroll'),box=$('rxThread');if(!sc||!box)return;
  const last=box.lastElementChild;
  if(!last){sc.scrollTop=0;return;}
  const y=last.offsetTop+last.offsetHeight-sc.clientHeight+24;
  sc.scrollTop=Math.max(0,y);
}
function paintRxHead(){
  const d=recD(),lc=lastCardIdx(d),th=recChat[d]||[];
  const sub=$('rxSub'),pill=$('rxPill');if(!sub)return;
  sub.textContent=ob?'はじめに3つだけ教えてください':'事実を記録する担当';
  let p='',amb=false;
  if(ob) p='1分で終わります';
  else if(recWait&&lc<0) p='下書き中…';
  else if(lc>=0&&th[lc].saved) p='記録済み';
  else if(lc>=0){p=th[lc].label==='下書き'?'自動で下書き済み':'確認待ち';amb=th[lc].label!=='下書き';}
  pill.textContent=p;pill.classList.toggle('amb',amb);
  paintDraftBar();
}
/* ---- v28: 記録の管理 ＞ 自分について（目標・期限・本人の発言。事実だけ。✎で直すと訂正の履歴が残る） ---- */
let selfEdit=null;
function selfRowHTML(key,label,f){
  const old=factHist(f);
  const hint=old.length?'<button class="dp-hint" data-shist="'+esc(key)+'">訂正済み（元：'+esc(cut(old[0].value,24))+'）</button>':'';
  if(selfEdit===key) return '<div class="dp-row ed">'+(label?'<span class="k">'+label+'</span>':'')+'<div class="dp-editor"><input id="selfIn" maxlength="120" value="'+esc(f?f.value:'')+'" aria-label="'+esc(label||'本人の発言')+'"><div class="dp-eb"><button class="p" id="selfSave">保存</button><button id="selfX">やめる</button></div></div></div>';
  return '<div class="dp-row">'+(label?'<span class="k">'+label+'</span>':'')+'<span class="v">'+(f?esc(f.value):'<span class="mu">未設定</span>')+hint+'</span><button class="dp-ed" data-sed="'+esc(key)+'" aria-label="'+esc(label||'本人の発言')+'を直す">✎</button>'+
    (key.indexOf('s:')===0?'<button class="dp-rt" data-srt="'+esc(key.slice(2))+'">取り消し</button>':'')+'</div>';
}
function selfHTML(){
  const st=selfStatements();
  return '<div class="mu" style="font-size:11.5px;margin-bottom:6px">あなたが話した・書いた事実だけ。AIに渡す内容に入ります。直しても元の値は履歴に残ります。</div>'+
    '<div class="self-box">'+selfRowHTML('g:goal','目標',selfCur('goal'))+selfRowHTML('g:deadline','期限',selfCur('deadline'))+
    '<div class="self-k">本人の発言</div>'+(st.length?st.map(f=>selfRowHTML('s:'+f.id,'',f)).join(''):'<div class="mu" style="font-size:12px;padding:6px 0">まだありません。</div>')+
    '<div class="dp-add-row"><input id="selfAdd" maxlength="120" placeholder="例：平日は夜しか時間がない" aria-label="本人の発言を足す"><button class="p" id="selfAddBtn">足す</button></div></div>';
}
function selfFactOf(key){return key==='g:goal'?selfCur('goal'):key==='g:deadline'?selfCur('deadline'):mem.facts.find(f=>f.id===key.slice(2));}
function selfSave(key,v){
  v=cut(v,120);
  if(!v){toast('空にはできません');return;}
  const f=selfFactOf(key);
  if(f&&f.value===v){selfEdit=null;renderRecMore();return;}
  if(key.indexOf('g:')===0){
    const type=key.slice(2),olds=mem.facts.filter(x=>x.type===type&&x.status==='active');
    factReplace(olds,{type,value:v,date:today(),sourceRef:'memo_editor',idPrefix:'fact_memo_'+type});
    mem.memo[type]=v; if(type==='goal'){cfg.goal=v;S('cfg',cfg);}
  } else if(f) factReplace([f],{type:'statement',value:v,date:f.date||today(),sourceRef:'self',idPrefix:'fact_self',uniq:true});
  selfEdit=null; memChanged(); archiveSoon(today(),600); toast('直しました（元の値も残しています）'); renderRecMore();
}
function bindSelf(box){
  box.querySelectorAll('[data-sed]').forEach(b=>b.onclick=()=>{selfEdit=b.dataset.sed;renderRecMore();const i=$('selfIn');if(i){i.focus();i.select&&i.select();}});
  box.querySelectorAll('[data-srt]').forEach(b=>b.onclick=()=>{const f=mem.facts.find(x=>x.id===b.dataset.srt);if(!f)return;f.status='retracted';f.updatedAt=Date.now();memChanged();archiveSoon(f.date||today(),600);toast('取り消しました');renderRecMore();});
  box.querySelectorAll('[data-shist]').forEach(b=>b.onclick=()=>openFactHistSheet(selfFactOf(b.dataset.shist),'text'));
  const si=$('selfIn');
  if(si){si.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)selfSave(selfEdit,si.value);if(e.key==='Escape'){selfEdit=null;renderRecMore();}};
    $('selfSave').onclick=()=>selfSave(selfEdit,si.value);$('selfX').onclick=()=>{selfEdit=null;renderRecMore();};}
  const add=()=>{const i=$('selfAdd'),v=cut(i.value,120);if(!v)return;const now=Date.now();
    mem.facts.push({id:'fact_self_'+stableHash(v+'|'+now),type:'statement',value:v,date:today(),source:'user_confirmed',sourceRef:'self',status:'active',verification:'confirmed',createdAt:now,updatedAt:now});
    memChanged();archiveSoon(today(),600);toast('足しました');renderRecMore();};
  $('selfAddBtn').onclick=add;$('selfAdd').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)add();};
}
function renderRecMore(){
  const box=$('rxMore');if(!box)return;
  box.innerHTML='<div class="rx-more">'+
    '<details data-k="self"'+(rxOpen.self?' open':'')+'><summary>自分について（目標・期限など）</summary><div class="in">'+selfHTML()+'</div></details>'+
    '<details id="mCtxD" data-k="ctx"'+(rxOpen.ctx?' open':'')+'><summary>AIに渡す内容のもとを見る</summary><div class="in"><div class="mu" style="font-size:11px">「今日の状況をAIに渡す」で使う、事実とアプリの集計です。解釈やAIの要約は入れません。</div><pre id="mCtx"></pre></div></details>'+
    '<div class="rx-st"><span data-mst class="memo-st"></span></div>'+
    '<div class="rx-st"><span data-dsync class="memo-st"></span></div>'+
    '<div class="rx-st"><span data-ast class="memo-st"></span></div>'+
    '<div class="rx-arc hide" data-arcbtns><button id="arcMd">今月の記録をMDで見る</button><button id="arcNow">いますぐ保管</button></div>'+
    '</div>';
  box.querySelectorAll('details[data-k]').forEach(dt=>dt.ontoggle=()=>{rxOpen[dt.dataset.k]=dt.open;if(dt.id==='mCtxD'&&dt.open)$('mCtx').textContent=buildContext();});
  if(rxOpen.ctx) $('mCtx').textContent=buildContext();
  bindSelf(box);
  $('arcMd').onclick=openMdSheet; $('arcNow').onclick=()=>archiveNow($('arcNow'));
  paintMemoStatus(); paintArc(); paintSync();
}
function openRecDay(d){
  recDay=d===today()?null:d;
  if(ob){ob=null;obSkip=true;}
  renderRecorder();
}
function openScopedRec(d){   // v38：日記から → その日の日付で取り込む（v53：取り込み後はこの日の日記に戻れる）
  aiDefDate=d; window.aiOrigin={kind:'diary',date:d}; recBackTo=null; recDay=null;
  rvMode='input'; rvApply(); renderRecorder(); window.scrollTo(0,0);
}
function renderRecorder(){   // v38：入力モードは「JSONファイル」「貼り付け」の取り込みだけ
  if(!$('aiImpBox')) return;
  renderAiImport();
  renderRecMore();
  if(activeAppTab==='log'&&rvMode==='diary') renderDiary();
}
/* ===== v28: 記録タブ ＝ 入力モード（記録係）／日記モード（その日の事実を見る・直す・足す） =====
   アプリが持つのは事実だけ。AIは話すだけ。日記は1日1ページ。訂正は消さずに履歴に残す（R2 にも保管）。 */
let rvMode=null;                 // 'input' | 'diary'
let dySel=null, dyEdit=null, dyNoteOpen=false, dyNoteDraft='', dyCalM=null;
let dyR2=null, dyR2Busy=false, dyLoaded={}, dyLoading={}, dyTX=null, dyTY=null;
const DY_DATE=/^\d{4}-\d\d-\d\d$/;
const DY_SKIP=new Set(['goal','deadline']);   // 目標・期限は「その日の出来事」ではない
const DY_W='日月火水木金土';
const dyJP=d=>{const x=new Date(d+'T00:00');return x.getFullYear()+'年'+(x.getMonth()+1)+'月'+x.getDate()+'日（'+DY_W[x.getDay()]+'）';};
const dyMD=d=>{const x=new Date(d+'T00:00');return (x.getMonth()+1)+'月'+x.getDate()+'日（'+DY_W[x.getDay()]+'）';};
const dyMDs=d=>(+d.slice(5,7))+'月'+(+d.slice(8))+'日';
const dyHM=t=>{const x=new Date(+t);return (!+t||isNaN(x))?'':p2(x.getHours())+':'+p2(x.getMinutes());};
const dyWhen=t=>{const x=new Date(+t);return (!+t||isNaN(x))?'':(x.getMonth()+1)+'/'+x.getDate()+' '+p2(x.getHours())+':'+p2(x.getMinutes());};
const dyMin=d=>{const s=+fS[d]||0;return s>0?Math.round(s/60):0;};
const dyNotes=d=>mem.facts.filter(f=>f.date===d&&f.status==='active'&&(f.sourceRef==='diary_note'||(f.type==='statement'&&f.sourceRef==='self'))).sort((a,b)=>(+a.createdAt||0)-(+b.createdAt||0));
const DY_FIELDS=[['action','やったこと','action','text'],['minutes','時間','duration','min'],['result','結果','result','res'],['sat','手ごたえ','rating','sat'],['note','ひとこと','statement','text']];

function rvShellHTML(){
  return '<div class="rv">'+
  '<section class="head"><div><div class="eyebrow">YOUR LOG · FACTS ONLY</div><h1>ログ</h1><p>AIの記録を取り込んで残す。過去の事実を見て、直して、足す。</p></div></section>'+
  '<div class="record-tabs" role="tablist" aria-label="記録モード">'+
    '<button id="rvTabIn" role="tab" aria-selected="true" class="active"><span class="tab-icon">✎</span><span class="tab-copy"><b>入力モード</b><small>JSONファイル・貼り付けで取り込む</small></span></button>'+
    '<button id="rvTabDy" role="tab" aria-selected="false"><span class="tab-icon">▤</span><span class="tab-copy"><b>日記モード</b><small>事実を見る・直す・足す</small></span></button>'+
  '</div>'+
  '<section class="today-record" id="rvInput">'+
    '<div id="aiImpBox"></div>'+
    '<div class="today-footer"><span>過去の日も、日記から見て直せます。</span><button id="rvToDiary">日記を開く　→</button></div>'+
  '</section>'+
  '<section class="dp-wrap" id="dyWork"></section>'+
  '<details class="rv-manage" id="rvManage"><summary>記録の管理 <small>自分について・AIに渡す内容・保管・アプリの更新</small></summary><div id="rxMore"></div></details>'+
  '</div>';
}
function rvBind(){
  $('rvTabIn').onclick=()=>{recBackTo=null;recDay=null;setRvMode('input',true);};
  $('rvTabDy').onclick=()=>setRvMode('diary',true);
  $('rvToDiary').onclick=()=>setRvMode('diary',true);
  const md=$('rvManage');md.open=!!rxOpen.manage;md.ontoggle=()=>{rxOpen.manage=md.open;};
  // 日記：左右に払うと日が変わる（右へ払う＝前の日、左へ払う＝次の日）
  const w=$('dyWork');
  w.addEventListener('touchstart',e=>{if(e.target.closest('input,.dp-editor')){dyTX=null;return;}const t=e.changedTouches[0];dyTX=t.clientX;dyTY=t.clientY;},{passive:true});
  w.addEventListener('touchend',e=>{if(dyTX===null)return;const t=e.changedTouches[0],dx=t.clientX-dyTX,dy=t.clientY-dyTY;dyTX=null;
    if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){if(dx>0)dyGo(addDays(dySel,-1));else dyGo(addDays(dySel,1));}},{passive:true});
}
function paintDraftBar(){
  const tx=$('rvDraftTx'),st=$('rvDraftSt'),sv=$('rvSave');if(!tx)return;
  const d=recD(),th=recChat[d]||[],lc=lastCardIdx(d);
  if(ob||lc<0){
    tx.textContent=recWait?'下書きを作っています…':'まだ下書きはありません。あったことを一言どうぞ。';
    st.textContent='下書き中';st.classList.remove('ok');sv.disabled=true;sv.textContent='✓ この内容で記録する';return;
  }
  const c=th[lc],dr=draftNorm(c.draft);
  tx.textContent=[dr.action||'（未入力）',dr.minutes?dr.minutes+'分'+(dr.minSrc==='timer'?'（タイマー）':''):'',RN[dr.result],'手ごたえ'+'★'.repeat(dr.sat),dr.note?'「'+dr.note+'」':''].filter(Boolean).join(' · ');
  st.textContent=c.saved?'確認済み':'確認待ち';st.classList.toggle('ok',!!c.saved);
  sv.disabled=!!c.saved||recWait;sv.textContent=c.saved?'✓ 記録済み':'✓ この内容で記録する';
}
function rvDefaultMode(){
  const s=L('recMode',null);
  if(s==='input'||s==='diary') return s;
  return recs[today()]?'diary':'input';
}
function rvEnter(){
  if(!rvMode) rvMode=rvDefaultMode();
  if(ob||(needsOnboard()&&!obSkip)) rvMode='input';
  if(rvMode==='diary'&&!dySel) dySel=today();
  rvApply();
  renderRecorder();
}
function setRvMode(m,save){
  rvMode=m; if(save) S('recMode',m);
  if(m==='diary'){if(!dySel)dySel=today();dyEdit=null;}
  rvApply();
  if(m==='diary') renderDiary(); else renderRecorder();
  window.scrollTo(0,0);
}
function rvApply(){
  const v=$('vLog');if(!v)return;
  const dy=rvMode==='diary';
  v.classList.toggle('diary-mode',dy);
  $('rvTabIn').classList.toggle('active',!dy);$('rvTabDy').classList.toggle('active',dy);
  $('rvTabIn').setAttribute('aria-selected',String(!dy));$('rvTabDy').setAttribute('aria-selected',String(dy));
}

/* ---- 日記：どの日に事実があるか（端末＋R2 の facts/） ---- */
function dyLocalHas(d){return !!(recs[d]||(chats[d]||[]).some(m=>m&&m.text)||(+fS[d]||0)>0||(imports[d]||[]).length||dayFocusMs(d)>0||mem.facts.some(f=>f.date===d&&f.status==='active'&&!DY_SKIP.has(f.type)));}
function dyDays(){
  const s=new Set(),td=today();
  Object.keys(recs||{}).forEach(d=>{if(recs[d])s.add(d);});
  Object.keys(chats||{}).forEach(d=>{if((chats[d]||[]).some(m=>m&&m.text))s.add(d);});
  Object.keys(fS||{}).forEach(d=>{if((+fS[d]||0)>0)s.add(d);});
  Object.keys(imports||{}).forEach(d=>{if((imports[d]||[]).length)s.add(d);});
  sesDays().forEach(d=>s.add(d));
  mem.facts.forEach(f=>{if(f.date&&f.status==='active'&&!DY_SKIP.has(f.type))s.add(f.date);});
  if(dyR2) dyR2.forEach(d=>s.add(d));
  return Array.from(s).filter(d=>DY_DATE.test(d)&&d<=td).sort();
}
function dyOnArc(){
  if(arcR2===true&&online&&dyR2===null&&!dyR2Busy&&activeAppTab==='log'&&rvMode==='diary') dyFetchList();
}
async function dyFetchList(){
  if(dyR2Busy) return; dyR2Busy=true;
  try{const j=await arcApi({op:'list',prefix:'facts/'});
    if(j.r2!==false) dyR2=new Set((j.keys||[]).map(k=>String(k).slice(6,16)).filter(d=>DY_DATE.test(d)&&d<=today()));}
  catch(e){}
  dyR2Busy=false;
  if(activeAppTab==='log'&&rvMode==='diary'&&!dyEdit&&!dyNoteOpen) renderDiary();
}
const dyHasRaw=d=>!!(recs[d]||(chats[d]||[]).some(m=>m&&m.text)||(+fS[d]||0)>0||(imports[d]||[]).length);
function dyNeedsFetch(d){return !!(d&&online&&arcR2===true&&dyR2&&dyR2.has(d)&&!dyLoaded[d]&&!dyHasRaw(d));}
function dyRecOf(d){   // 端末に recs が無くても、同期された事実（recs.日付.*）から行動記録を組み立てる
  if(recs[d]) return recs[d];
  const fs=mem.facts.filter(f=>f.date===d&&f.status==='active'&&String(f.sourceRef||'').startsWith('recs.'+d+'.'));
  if(!fs.length) return null;
  const g=k=>{const f=fs.find(x=>x.sourceRef==='recs.'+d+'.'+k);return f?f.value:'';};
  return {action:g('action'),result:g('result')||'pending',minutes:+g('duration')||0,sat:+g('rating')||0,note:g('statement'),fromFacts:true};
}
async function dyEnsureDay(d){
  if(!dyNeedsFetch(d)||dyLoading[d]) return;
  dyLoading[d]=true;
  try{
    const o=await arcApi({op:'get_day',date:d});
    if(o&&o.r2!==false){
      arcRestoreDay(d,o);   // 端末に無いものだけ足す（上書きしない）
      S('recs',recs);S('chats',chats);S('imports',imports);
      arcHash[d]=stableHash(JSON.stringify(archivePayload(d)));S('archiveHash',arcHash);
      mem.updatedAt=Date.now();S('mem',mem);memPush();
    }
    dyLoaded[d]=true;
  }catch(e){dyLoaded[d]=true;}
  dyLoading[d]=false;
  if(activeAppTab==='log'&&rvMode==='diary'&&dySel===d&&!dyEdit) renderDiary();
}

/* ---- 日記：1ページ ---- */
function dyFmt(kind,v){
  if(kind==='min') return +v?v+'分':'—';
  if(kind==='res') return RN[v]||'—';
  if(kind==='sat'){const n=Math.max(0,Math.min(5,+v||0));return n?'★'.repeat(n)+'☆'.repeat(5-n):'—';}
  return v?String(v):'—';
}
function dyHintHTML(old,kind,key){
  if(!old.length) return '';
  return '<button class="dp-hint" data-hist="'+esc(key)+'">訂正済み（元：'+esc(cut(dyFmt(kind,old[0].value),24))+'）</button>';
}
function dyEditorHTML(kind,val){
  let inp;
  if(kind==='min') inp='<span class="dp-num"><input id="dyEdIn" type="number" inputmode="numeric" min="0" max="600" value="'+(+val||0)+'" aria-label="分"><span>分</span></span>';
  else if(kind==='res') inp='<div class="dp-chips">'+['done','partial','not'].map(k=>'<button data-edv="'+k+'" class="'+(val===k?'sel':'')+'">'+RN[k]+'</button>').join('')+'</div>';
  else if(kind==='sat') inp='<div class="dp-stars">'+[1,2,3,4,5].map(n=>'<button data-edv="'+n+'" class="'+(n<=(+val||0)?'on':'')+'" aria-label="手ごたえ '+n+'">★</button>').join('')+'</div>';
  else inp='<input id="dyEdIn" maxlength="200" value="'+esc(val==null?'':val)+'" aria-label="直す内容">';
  return '<div class="dp-editor">'+inp+'<div class="dp-eb"><button class="p" id="dyEdSave">保存</button><button id="dyEdX">やめる</button></div></div>';
}
function dyRowHTML(key,label,kind,val,hint,extra){
  if(dyEdit&&dyEdit.key===key) return '<div class="dp-row ed">'+(label?'<span class="k">'+label+'</span>':'')+dyEditorHTML(kind,dyEdit.val)+'</div>';
  return '<div class="dp-row" data-row="'+esc(key)+'">'+(label?'<span class="k">'+label+'</span>':'')+'<span class="v">'+esc(dyFmt(kind,val))+hint+'</span>'+
    '<button class="dp-ed" data-ed="'+esc(key)+'" aria-label="'+esc(label||'メモ')+'を直す">✎</button>'+(extra||'')+'</div>';
}
function renderDiary(){
  const w=$('dyWork');if(!w)return;
  if(dyR2===null&&online&&arcR2===true&&!dyR2Busy) dyFetchList();
  const td=today();
  if(!dySel||dySel>td) dySel=td;
  const d=dySel; dyEnsureDay(d);
  const loading=!!(dyLoading[d]||dyNeedsFetch(d));
  const r=dyRecOf(d),sec=+fS[d]||0,cs=(chats[d]||[]).filter(m=>m&&m.text),me=cs.filter(m=>m.role==='me'),notes=dyNotes(d);
  const retr=mem.facts.filter(f=>f.date===d&&f.status==='retracted');
  let body='';
  if(r) body+='<section class="dp-sec"><h3>日の記録 <small class="mu">アプリ（v52までの取り込みを含む）</small></h3>'+DY_FIELDS.map(([k,lb,ft,kind])=>dyRowHTML('r:'+k,lb,kind,r[k],dyHintHTML(factHistBy('recs.'+d+'.'+ft),kind,'r:'+k))).join('')+'</section>';
  const fsm=focusSummary(d),rses=sessions.filter(x=>x.status==='retracted'&&(sesDayMap(x)[d]||0)>0);
  if(fsm.tasks.length||rses.length) body+='<section class="dp-sec"><button class="dp-link" id="dySes">集中の記録・取り消した集中を見る ›</button></section>';
  if(sec>0) body+='<section class="dp-sec"><h3>集中（v34までのタイマー）</h3>'+dyRowHTML('t','計測','min',dyMin(d)||(sec>0?1:0),dyHintHTML(factHistBy('fS.'+d),'min','t'))+'</section>';
  const im=imports[d]||[];
  if(im.length) body+='<section class="dp-sec"><h3>会話の原文（AIから取り込み）</h3>'+im.map(x=>'<details class="dp-raw"><summary>'+(x.t?esc(dyHM(x.t))+' · ':'')+esc(cut(x.text,40))+'</summary><pre>'+esc(x.text)+'</pre></details>').join('')+'</section>';
  if(cs.length) body+='<section class="dp-sec"><h3>会話の原文（v34までのアプリ内の会話）</h3>'+(me.length?me.slice(0,3).map(m=>'<p class="dp-q">'+(m.t?'<em>'+dyHM(m.t)+'</em>':'')+'「'+esc(cut(m.text,42))+'」</p>').join(''):'<p class="dp-q">（コーチの発言だけ）</p>')+
    '<button class="dp-link" id="dyChatAll">全文を見る ›</button></section>';
  body=body?'<details class="dy-legacy"'+(dyEdit&&dyEdit.key.indexOf('n:')!==0?' open':'')+'><summary>以前の記録</summary>'+body+'</details>':'';
  body=obHeadHTML(d)+'<p class="dy-summary" id="dySummary" role="status"></p>'+lgSectionHTML(d)+body;
  body+=dyNoteOpen?'<div class="dp-add-row"><input id="dyNoteIn" maxlength="200" placeholder="この日のメモ（1行）" aria-label="この日のメモ" value="'+esc(dyNoteDraft)+'"><button class="p" id="dyNoteSave">足す</button><button id="dyNoteX" aria-label="やめる">✕</button></div>'
    :'<button class="dp-add" id="dyNoteBtn">＋ メモを足す</button>';
  if(retr.length) body+='<button class="dp-retr" id="dyRetr">取り消した記録 '+retr.length+'件</button>';
  w.innerHTML='<div class="dp-top"><button class="dp-nav" id="dyPrev" aria-label="前の日">‹</button>'+
    '<button class="dp-date" id="dyCal" aria-label="'+esc(dyJP(d))+'（カレンダーを開く）">'+esc(dyMD(d))+'<i>▾</i></button>'+
    '<button class="dp-nav" id="dyNext" aria-label="次の日"'+(d>=td?' disabled':'')+'>›</button></div>'+
    dyWeekHTML(d)+'<article class="dp-page" id="dyPage" data-day="'+d+'">'+body+'</article>'+dyListHTML();
  dyBind();dyBindWeek();obAfterRender();
  if(typeof lgDiary==='function') lgDiary(d);
}
function dyGo(d){
  if(!d||!DY_DATE.test(d)||d>today()) return;
  if(typeof obGo==='function'&&obGo(d)) return;   // v56：シートが回って入れ替わる（動きを減らす設定では、そのまま切り替える）
  dySel=d;dyEdit=null;dyNoteOpen=false;dyNoteDraft='';
  renderDiary();
}
function dyCurVal(key){
  const d=dySel,r=dyRecOf(d);
  if(key.indexOf('r:')===0) return r?r[key.slice(2)]:'';
  if(key==='t') return dyMin(d);
  const f=mem.facts.find(x=>x.id===key.slice(2));return f?f.value:'';
}
const dyKindOf=key=>key==='t'?'min':key.indexOf('r:')===0?(DY_FIELDS.find(x=>x[0]===key.slice(2))||[])[3]:'text';
function dyBind(){
  const d=dySel,pg=$('dyPage');
  $('dyPrev').onclick=()=>dyGo(addDays(d,-1));
  $('dyNext').onclick=()=>dyGo(addDays(d,1));
  $('dyCal').onclick=()=>openDyCalendar(d.slice(0,7));
  pg.querySelectorAll('[data-ed]').forEach(b=>b.onclick=()=>{const k=b.dataset.ed;dyEdit={key:k,kind:dyKindOf(k),val:dyCurVal(k)};dyNoteOpen=false;renderDiary();const i=$('dyEdIn');if(i){i.focus();if(i.select)i.select();}});
  pg.querySelectorAll('[data-hist]').forEach(b=>b.onclick=()=>dyOpenHist(b.dataset.hist));
  pg.querySelectorAll('[data-rt]').forEach(b=>b.onclick=()=>dyRetract(b.dataset.rt));
  pg.querySelectorAll('[data-recfix]').forEach(b=>b.onclick=()=>openScopedRec(d));
  if(dyEdit){
    pg.querySelectorAll('[data-edv]').forEach(b=>b.onclick=()=>{dyEdit.val=dyEdit.kind==='sat'?+b.dataset.edv:b.dataset.edv;
      pg.querySelectorAll('[data-edv]').forEach(x=>{if(dyEdit.kind==='sat')x.classList.toggle('on',+x.dataset.edv<=dyEdit.val);else x.classList.toggle('sel',x===b);});});
    const i=$('dyEdIn');
    if(i){i.oninput=()=>{dyEdit.val=i.value;};i.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)dySaveEdit();if(e.key==='Escape'){dyEdit=null;renderDiary();}};}
    $('dyEdSave').onclick=dySaveEdit;
    $('dyEdX').onclick=()=>{dyEdit=null;renderDiary();};
  }
  const ca=$('dyChatAll');if(ca)ca.onclick=()=>openDyChat(d);
  const ss=$('dySes');if(ss)ss.onclick=()=>openDySessions(d);
  const st=$('dyStart');if(st)st.onclick=()=>openScopedRec(d);
  const rt=$('dyRetr');if(rt)rt.onclick=()=>openDyRetracted(d);
  const nb=$('dyNoteBtn');if(nb)nb.onclick=()=>{dyNoteOpen=true;dyEdit=null;renderDiary();const i=$('dyNoteIn');if(i)i.focus();};
  const ni=$('dyNoteIn');
  if(ni){
    ni.oninput=()=>{dyNoteDraft=ni.value;};
    ni.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)dyAddNote(d,ni.value);if(e.key==='Escape'){dyNoteOpen=false;dyNoteDraft='';renderDiary();}};
    $('dyNoteSave').onclick=()=>dyAddNote(d,ni.value);
    $('dyNoteX').onclick=()=>{dyNoteOpen=false;dyNoteDraft='';renderDiary();};
  }
  dyListBind();
}


/* ---- v45：日ごとの勉強時間（一覧＋プルダウン。0.5時間刻み。記録の「時間」に入る） ---- */
let dyListN=14;   // 一覧に出す日数（「もっと前の日」で14日ずつ増やす）
const dyHrOpts=(function(){const a=[];for(let m=0;m<=600;m+=30)a.push(m);return a;})();   // 0〜10時間
const dyHrLabel=m=>(m/60)+'時間';   // 30→0.5時間、60→1時間
function dyListHTML(){
  const td=today(),rows=[];
  for(let i=0;i<dyListN;i++){
    const d=addDays(td,-i),r=dyRecOf(d),cur=r?(Math.round(+r.minutes)||0):null,tm=(focusSummary(d).minutes)||dyMin(d)||0;
    let opts=(cur==null?'<option value=\"\" selected>—</option>':'')+dyHrOpts.map(m=>'<option value=\"'+m+'\"'+(cur===m?' selected':'')+'>'+dyHrLabel(m)+'</option>').join('');
    if(cur!=null&&dyHrOpts.indexOf(cur)<0) opts+='<option value=\"'+cur+'\" selected>'+cur+'分</option>';   // 30分刻みでない値は、そのまま残す
    rows.push('<div class=\"dy-lr\"><button class=\"dy-ld\" data-go=\"'+d+'\">'+esc(dyMD(d))+(i===0?' · 今日':'')+'</button>'+'<span class=\"dy-lt\">計測 '+tm+'分</span>'+
      '<select data-hr=\"'+d+'\" aria-label=\"'+esc(dyMD(d))+'の勉強時間\">'+opts+'</select></div>');
  }
  return '<details class=\"dy-ls\" id=\"dyList\"'+(L('dyTimeOpen',false)?' open':'')+'><summary>勉強時間（日ごと）</summary><p>選ぶと日の記録の時間に入ります。台帳・タイマーと重なる分は足さず、大きい方を使います。</p>'+rows.join('')+'<button class=\"dy-more\" id=\"dyMore\">もっと前の日を表示</button></details>';
}
function dyListBind(){
  const L=$('dyList');if(!L) return;
  L.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{dyGo(b.dataset.go);window.scrollTo(0,0);});
  L.querySelectorAll('[data-hr]').forEach(s=>s.onchange=async()=>{
    const d=s.dataset.hr,m=Math.round(+s.value);
    if(s.value===''||!(m>=0&&m<=600)) return;
    if(dyNeedsFetch(d)) await dyEnsureDay(d);   // クラウドにだけある日は、先に読み込んでから書く
    if(dyApplyFix(d,'r:minutes',m)){memChanged();archiveSoon(d,300);toast(dyMDs(d)+'：'+dyHrLabel(m)+' にしました');}
    renderDiary();
  });
  const mo=$('dyMore');if(mo)mo.onclick=()=>{dyListN+=14;renderDiary();};
}

/* ---- ✎で直す（古い事実は corrected で残し、新しい事実を足す → その日を R2 に保管） ---- */
function dySaveEdit(){
  if(!dyEdit) return;
  const d=dySel,key=dyEdit.key,kind=dyEdit.kind;let v=dyEdit.val;
  const i=$('dyEdIn'); if(i) v=i.value;
  if(kind==='min'){v=Math.round(+z2h(String(v)));if(!(v>=0&&v<=600)){toast('0〜600分で入れてください');return;}}
  else if(kind==='sat'){v=clamp5(v,0);if(!v){toast('星を選んでください');return;}}
  else if(kind==='res'){if(!RN[v]){toast('結果を選んでください');return;}}
  else {v=cut(v,key.indexOf('n:')===0?200:60);if(!v&&key!=='r:note'){toast('空にはできません');return;}}
  const ch=dyApplyFix(d,key,v);
  dyEdit=null;
  if(ch){memChanged();archiveSoon(d,300);toast('直しました（元の記録も残しています）');}
  renderDiary();
}
function dyApplyFix(d,key,v){
  if(key.indexOf('r:')===0){
    const k=key.slice(2),def=DY_FIELDS.find(x=>x[0]===k);if(!def) return false;
    const base=Object.assign({date:d,type:typeOf(d)},recs[d]||dyRecOf(d)||{});delete base.fromFacts;
    const prev=base[k];if(String(prev==null?'':prev)===String(v)) return false;
    const ref='recs.'+d+'.'+def[2],olds=mem.facts.filter(f=>f.sourceRef===ref&&f.status==='active');
    recs[d]=Object.assign({},base,{[k]:v},k==='note'?{summary:v}:{});
    if(v!=='') factReplace(olds,{type:def[2],value:v,date:d,sourceRef:ref,idPrefix:'fact_rec_'+d+'_'+def[2],prev});
    else olds.forEach(f=>{f.status='corrected';f.updatedAt=Date.now();});
    S('recs',recs);syncAppFacts();
    const th=recChat[d],ci=lastCardIdx(d);if(th&&ci>=0&&th[ci].saved){th[ci].draft=draftNorm(recs[d]);recSave();}
    return true;
  }
  if(key==='t'){
    const prev=dyMin(d);if(prev===v) return false;
    const ref='fS.'+d,olds=mem.facts.filter(f=>f.sourceRef===ref&&f.status==='active');
    fS[d]=v*60;S('focus',fS);
    factReplace(olds,{type:'duration',value:v,unit:'minutes',date:d,sourceRef:ref,idPrefix:'fact_timer_'+d,prev});
    syncAppFacts();if(typeof fzPaint==='function')fzPaint();
    return true;
  }
  const f=mem.facts.find(x=>x.id===key.slice(2));if(!f||f.value===v) return false;
  factReplace([f],{type:f.type,value:v,date:f.date||d,sourceRef:f.sourceRef,idPrefix:f.sourceRef==='self'?'fact_self':'fact_note_'+d,uniq:true});
  return true;
}
function dyRetract(id){
  const f=mem.facts.find(x=>x.id===id);if(!f) return;
  f.status='retracted';f.updatedAt=Date.now();
  memChanged();archiveSoon(f.date||dySel,300);
  toast('取り消しました（「取り消した記録」から戻せます）');renderDiary();
}

/* ---- メモ（本人の事実として残す） ---- */
function dyAddNote(d,text){
  text=cut(text,200); if(!text||!DY_DATE.test(d||'')) return;
  const now=Date.now();
  mem.facts.push({id:'fact_note_'+d+'_'+stableHash(text+'|'+now),type:'note',value:text,date:d,source:'user_confirmed',sourceRef:'diary_note',status:'active',verification:'confirmed',createdAt:now,updatedAt:now});
  dyNoteOpen=false;dyNoteDraft='';
  memChanged(); archiveSoon(d,600);   // その日の分を R2 に保管（14日より前の日でも）
  toast('この日のメモを足しました');
  renderDiary();
}

/* ---- シート：カレンダー／会話の全文／訂正の履歴／取り消した記録 ---- */
function dySheet(title,inner){
  $('sheetBody').innerHTML='<div class="dy-sh"><div class="lb">'+title+'</div>'+inner+'<button class="dy-close" id="dyClose">閉じる</button></div>';
  $('sheet').classList.remove('hide');$('dyClose').onclick=closeSheet;
}
const dyShiftM=(ym,k)=>{const x=new Date(+ym.slice(0,4),+ym.slice(5,7)-1+k,1);return x.getFullYear()+'-'+p2(x.getMonth()+1);};
function openDyCalendar(ym){
  const td=today();dyCalM=ym||dySel.slice(0,7);
  if(dyCalM>td.slice(0,7)) dyCalM=td.slice(0,7);
  const has=new Set(dyDays()),y=+dyCalM.slice(0,4),mo=+dyCalM.slice(5,7);
  const lead=new Date(y,mo-1,1).getDay(),n=new Date(y,mo,0).getDate();
  let cells=DY_W.split('').map(w=>'<span class="dw">'+w+'</span>').join('');
  for(let i=0;i<lead;i++) cells+='<span></span>';
  for(let i=1;i<=n;i++){const d=dyCalM+'-'+p2(i),fut=d>td;
    cells+='<button data-dycal="'+d+'" class="'+(d===dySel?'sel ':'')+(d===td?'td':'')+'"'+(fut?' disabled':'')+' aria-label="'+esc(dyJP(d))+(has.has(d)?' 記録あり':'')+'">'+i+(has.has(d)?'<i></i>':'')+'</button>';}
  const nx=dyShiftM(dyCalM,1);
  dySheet(y+'年'+mo+'月','<div class="dy-calnav"><button id="dyCalP">‹ 前の月</button><button id="dyCalN"'+(nx>td.slice(0,7)?' disabled':'')+'>次の月 ›</button></div>'+
    '<div class="dy-cal2">'+cells+'</div><div class="mu" style="font-size:11.5px;margin-top:10px">点のある日は事実（記録・会話・計測・メモ）があります。日を選ぶとそのページを開きます。</div>');
  $('dyCalP').onclick=()=>openDyCalendar(dyShiftM(dyCalM,-1));
  $('dyCalN').onclick=()=>openDyCalendar(nx);
  $('sheetBody').querySelectorAll('[data-dycal]').forEach(b=>b.onclick=()=>{closeSheet();dyGo(b.dataset.dycal);});
}
function openDyChat(d){
  const cs=(chats[d]||[]).filter(m=>m&&m.text);
  dySheet('会話の全文（'+esc(dyMD(d))+'）','<div class="mu" style="font-size:12px">コーチとの会話の原文です（読むだけ）。</div>'+
    (cs.length?cs.map(m=>'<div class="dy-msg '+(m.role==='me'?'me':'')+'"><em>'+(m.role==='me'?'あなた':'コーチ'+(m.coach?'（'+esc(m.coach)+'）':''))+(m.t?' · '+dyHM(m.t):'')+'</em>'+esc(m.text)+'</div>').join(''):'<div class="mu">この日の会話はありません。</div>'));
}
function openDySessions(d){   // v35：集中セッションを1件ずつ（取り消し・戻すができる。消さない）
  const list=sessions.filter(x=>(sesDayMap(x)[d]||0)>0).sort((a,b)=>(+a.start||0)-(+b.start||0));
  dySheet('集中の記録（'+esc(dyMD(d))+'）','<div class="mu" style="font-size:12px">タスクごとの開始・終了の時刻と、この日の分です。取り消してもデータは消さず、合計とAIに渡す内容から外すだけです。</div>'+
    (list.length?list.map(x=>{const m=Math.round((sesDayMap(x)[d]||0)/MIN_MS),rt=x.status==='retracted';
      return '<div class="dy-row'+(rt?' rt':'')+'"><span>'+esc(dyHM(x.start))+'〜'+(x.end?esc(dyHM(x.end)):x.state==='running'?'計測中':'一時停止中')+' · '+esc(taskTitle(x))+'</span><span class="mono">'+m+'分</span><button data-srt="'+esc(x.id)+'">'+(rt?'戻す':'取り消し')+'</button></div>';}).join(''):'<div class="mu">ありません。</div>'));
  $('sheetBody').querySelectorAll('[data-srt]').forEach(b=>b.onclick=()=>{const x=sessions.find(y=>y.id===b.dataset.srt);if(!x)return;
    const back=x.status==='retracted';if(!back&&!confirm('この集中の記録を取り消しますか？（あとで戻せます）'))return;
    sessionRetract(x.id,back);toast(back?'戻しました':'取り消しました');openDySessions(d);renderDiary();});
}
function openFactHistSheet(cur,kind,old){
  old=old||factHist(cur);
  dySheet('訂正の履歴','<div class="mu" style="font-size:12px">直しても、元の記録は消さずに残しています（クラウドにも保管）。</div>'+
    old.map(f=>'<div class="dy-row"><span>元の値'+(f.updatedAt?' · '+esc(dyWhen(f.updatedAt))+' に訂正':'')+'</span><span class="dy-old">'+esc(dyFmt(kind,f.value))+'</span></div>').join('')+
    (cur?'<div class="dy-row"><span>いまの値</span><span><b>'+esc(dyFmt(kind,cur.value))+'</b></span></div>':''));
}
function dyOpenHist(key){
  const d=dySel;
  if(key.indexOf('r:')===0){const def=DY_FIELDS.find(x=>x[0]===key.slice(2)),ref='recs.'+d+'.'+def[2];
    openFactHistSheet(mem.facts.find(f=>f.sourceRef===ref&&f.status==='active')||{value:dyCurVal(key)},def[3],factHistBy(ref));return;}
  if(key==='t'){const ref='fS.'+d;openFactHistSheet(mem.facts.find(f=>f.sourceRef===ref&&f.status==='active')||{value:dyMin(d)},'min',factHistBy(ref));return;}
  openFactHistSheet(mem.facts.find(f=>f.id===key.slice(2)),'text');
}
function openDyRetracted(d){
  const list=mem.facts.filter(f=>f.date===d&&f.status==='retracted');
  dySheet('取り消した記録（'+esc(dyMD(d))+'）','<div class="mu" style="font-size:12px">ページとAIには出しませんが、消してはいません。戻すこともできます。</div>'+
    (list.length?list.map(f=>'<div class="dy-row"><span class="dy-old">'+esc(f.value)+'</span><button data-unrt="'+esc(f.id)+'">戻す</button></div>').join(''):'<div class="mu">ありません。</div>'));
  $('sheetBody').querySelectorAll('[data-unrt]').forEach(b=>b.onclick=()=>{const f=mem.facts.find(x=>x.id===b.dataset.unrt);if(!f)return;
    f.status='active';f.updatedAt=Date.now();memChanged();archiveSoon(d,300);toast('戻しました');openDyRetracted(d);renderDiary();});
}

