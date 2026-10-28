/* AIコーチ v35 — 共通：定数・保存・入り口・コーチの本・記憶・事実・同期・R2保管（app-v30/ が元。build_v30.py で1ファイル版・bundle を作る） */

const TYPES={A:'先延ばし',B:'回避',C:'過負荷',D:'不明瞭',E:'効果不出',F:'奇襲',G:'自走'};
const RES=[['done','できた'],['partial','少しできた'],['not','できなかった'],['pending','まだ']];
/* 人格（旧：人格配合の8種）。v12でプロンプトからは外した。保存データの互換のためだけに残す */
const PERSONAS=[
 {k:'L', name:'弱者の戦略（ランチェスター）', desc:'広い目標は無視し、今・この1点だけに絞る。局地戦・接近戦・一点集中。'},
 {k:'F', name:'失敗の本質', desc:'「頑張る」を評価せず行動量だけを見る。現実を曖昧にせず、原因を言語化させる。'},
 {k:'K', name:'孔明型（軍師）', desc:'慌てず一手先を読む。感情を煽らず、静かに選択肢と見立てを示す。'},
 {k:'J', name:'ジョミニ型', desc:'感情論に流されず、今どこに力を集中すべきかを一点、合理的に見極める。ナポレオン期の参謀ジョミニ由来。'},
 {k:'S', name:'ソクラテス式', desc:'答えを与えず、短い問いで本人に前提を点検させる。'},
 {k:'T', name:'TPIE', desc:'望む未来から逆算し、現実に根差したセルフトークを今日の一歩につなげる。'},
 {k:'SP',name:'モルトケ型（大モルトケ／臨機応変の統帥）', desc:'「計画は接触まで」。大枠だけ決め、状況が変わればその場で判断を委ねる。人格否定はしない。'},
 {k:'E', name:'傾聴型（共感傾聴）', desc:'結論を急がず、まず話を受け止めて整理する。'}
];
const W0={L:60,F:40,K:0,J:0,S:0,T:0,SP:0,E:0};   // 初期weight（ラボ初期値）
const wNorm=w=>{const o={};PERSONAS.forEach(p=>o[p.k]=Math.max(0,Math.min(100,Math.round(+(w&&w[p.k])||0))));return o;};
const APP_VERSION='v67';   // このアプリの版（「アプリを更新」で使う）
const CF_WORKER='aicoach';   // CloudflareのWorker名（API設定ページへのリンクに使う）
const CF_SETTINGS_URL='https://dash.cloudflare.com/?to=/:account/workers/services/view/'+CF_WORKER+'/production/settings';
const PASS_OFFLINE='0000';  // Workerに届かない時（ローカルで開いた時など）だけ使う仮パス

const $=id=>document.getElementById(id);
const p2=n=>('0'+n).slice(-2);
const dayStr=off=>{const d=new Date();d.setDate(d.getDate()-off);return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())};
const today=()=>dayStr(0);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const L=(k,d)=>{try{const v=localStorage.getItem('ac_'+k);return v?JSON.parse(v):d}catch(e){return d}};
const S=(k,v)=>{try{localStorage.setItem('ac_'+k,JSON.stringify(v))}catch(e){}};
const apiBase=()=>{const b=L('cfbase','');return typeof b==='string'?b.replace(/\/+$/,''):''};   // 接続先Worker（空＝このアプリを配信しているWorker）
const API=p=>apiBase()+p;
let appPass='', online=false;   // online=true の時だけWorker経由でGeminiに話す
const toast=m=>{const e=$('toast');e.textContent=m;e.classList.add('on');clearTimeout(window._tt);window._tt=setTimeout(()=>e.classList.remove('on'),1800)};

let cfg=L('cfg',{type:'A',weights:W0,polite:'keigo',goal:''});
cfg.weights=wNorm(cfg.weights||W0); delete cfg.persona;   // 旧：簡易プリセット（伴走型など）は廃止
let menu=L('menu',[]);
let recs=L('recs',{});
let chats=L('chats',{});   // v35：アプリ内の会話は終了。v34までの会話（原文）は事実として残して日記に出す
let fS=L('focus',{});      // v34までの集中タイマー（日付→秒）。v35からは集中セッション（data.js）
let imports=L('imports',{});   // v35：Claude / ChatGPT から貼り付けた会話の原文（日付→[{id,t,text,source}]）
const RN={done:'できた',partial:'少しできた',not:'できなかった',pending:'まだ'};
let sums=L('sums',{});
let dayType=L('daytype',{});
let curRes='pending', curSat=0;

const typeOf=d=>dayType[d]||cfg.type;
const tname=k=>k+' '+TYPES[k];

/* ---- 入り口 ---- */
/* v48：tk があれば Cognito のIDトークンで入る（auth.js から呼ぶ）。戻り値：true=入れた / 'denied'=サーバーが受け付けない / false=その他 */
async function unlock(tk){
  const pw=tk||$('pw').value; if(!pw) return false;
  $('pwMsg').textContent='確認中…';
  let r=null;
  try{ r=await fetch(API('/api/auth'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:pw})}); }catch(e){ r=null; }
  if(r&&r.status===401){ $('pwMsg').textContent=tk?'このアカウントでは入れません。別のアカウントで入るには「別のアカウントで入る」を押してください':'パスワードが違います'; return 'denied'; }
  if(r&&r.ok){ online=true; }
  else if(tk){ $('pwMsg').textContent='サーバーに接続できません'; return false; }
  else if(pw!==PASS_OFFLINE){ $('pwMsg').textContent='パスワードが違います'; return false; }
  else { online=false; toast('オフラインのため仮応答で動きます'); }
  appPass=pw; $('pwMsg').textContent='';
  $('gate').classList.add('hide'); init();
  return true;
}
$('pwBtn').onclick=()=>{ unlock(); };
$('pw').onkeydown=e=>{ if(e.key==='Enter') unlock(); };

/* ---- 名著コーチの時間帯コンテキスト ---- */
const LAB_BOOKS={
  lancer:'一点突破コーチ',war:'立て直しコーチ',failure:'失敗から逆算するコーチ',analects:'積み重ねコーチ'
};
const COACH_BOOKS={
    lancer:{name:'ランチェスターの法則（弱者の戦略）',color:'#54f5e8',author:'F.W.ランチェスター（英・航空戦の分析から法則を導いた技術者）の法則を、田岡信夫が「弱者の戦略」として経営・個人の行動に応用',about:'限られた資源をどこに集中すれば、大きな相手や大きな目標にも勝ち筋が生まれるかを考えるための本として扱います。',teachings:['狭い範囲（局地戦）に絞って挑む','接近戦で力の差を縮める','一点に戦力を集中する'],action:'今日いちばん重要な一手をひとつ選び、5分だけ着手する。'},
    war:{name:'戦争論',color:'#ffb86b',author:'カール・フォン・クラウゼヴィッツ（プロイセンの将軍、1780–1831／死後1832年刊行）',about:'不確実な状況でどう判断し行動するかを考えるための本として扱います。',teachings:['目的（何のためか）を先に確認する','予期せぬ「摩擦」が必ず起きる前提で計画する','状況の変化を見て柔軟に調整する'],action:'実行中に出てきた障害をひとつ特定し、次の一手を調整する。'},
    failure:{name:'失敗の本質',color:'#ff6f7d',author:'戸部良一・寺本義也・鎌田伸一・杉之尾孜・村井友秀・野中郁次郎（1984年刊）',about:'太平洋戦争での日本軍の組織的な失敗を分析し、個人や組織の行動改善に活かすための本として扱います。',teachings:['現実（遅れ・停滞）を曖昧にせず事実として直視する','「頑張る」ではなく行動量だけを見る','原因を責めずに言葉にし、次の一手につなげる'],action:'今日の結果を事実で振り返り、明日変える一手をひとつ決める。'},
    analects:{name:'論語',color:'#b7a1ff',author:'孔子（春秋時代の中国、前551頃–前479）の言行を弟子たちがまとめた書',about:'日々のふるまいと学びをどう積み重ねるかを考えるための本として扱います。',teachings:['学んだことを実際の行動につなげる','自分のふるまいを一日の終わりに振り返る','小さなことを誠実に積み重ねる'],action:'今日できたことと、次に改めたいことを一つずつ記録する。'}
};
const COACH_ORDER=['lancer','war','failure','analects'];
/* v13: 本ごとに機能名のコーチ。本は「参考：」として表示（引用はしない） */
Object.assign(COACH_BOOKS.failure,{coach:'失敗から逆算するコーチ',tagline:'組織や個人がつまずくパターンから逆算して、同じ失敗を先回りで防ぐ。',credit:'参考：『失敗の本質』戸部良一ほか（1984）',ref:'『失敗の本質』'});
Object.assign(COACH_BOOKS.lancer,{coach:'一点突破コーチ',tagline:'手を広げすぎた時に、勝てる一点を見つけて力を集める。',credit:'参考：ランチェスターの法則／田岡信夫の「弱者の戦略」',ref:'ランチェスターの法則／田岡信夫の「弱者の戦略」'});
Object.assign(COACH_BOOKS.war,{coach:'立て直しコーチ',tagline:'予定が崩れても、目的に立ち返って次の一手を組み直す。',credit:'参考：クラウゼヴィッツ『戦争論』',ref:'クラウゼヴィッツ『戦争論』'});
Object.assign(COACH_BOOKS.analects,{coach:'積み重ねコーチ',tagline:'学んだことを行動に移し、毎日のふり返りで積み上げる。',credit:'参考：『論語』（孔子と弟子たちの言行録）',ref:'『論語』'});
/* v58：コーチの棚の説明。キーワード（右のパネル・3〜5個）と、くわしい説明（棚の下） */
Object.assign(COACH_BOOKS.failure,{kw:['事実を直視','行動量だけ見る','責めずに言葉に','次の一手'],
  when:['同じところでつまずくのが続いている','「頑張ったのに進んでいない」と感じる','結果を、感情抜きで振り返りたい'],
  sample:{scene:'今日、ほとんど勉強できなかった',reply:'「できなかった」で止めずに、事実だけ並べましょう。机に向かったのは何分？ 手が止まったのは、どの作業の前でしたか。原因探しはそのあとです。そのうえで、明日変える一手をひとつだけ決めましょう。'},
  caution:['気持ちが落ちていて、まず聞いてほしい時','振り返りより先に、手を動かしたい時']});
Object.assign(COACH_BOOKS.lancer,{kw:['一点に絞る','局地戦で勝つ','最初の5分','勝ち筋を探す'],
  when:['やることが多すぎて、手が止まる','手を広げすぎて、どれも中途半端','どこから手を付けるか迷っている'],
  sample:{scene:'課題が5つもあって、どれから手を付けていいか分からない',reply:'全部に勝とうとしないでください。配点が大きく、いま一番近いものを1つだけ選びましょう。残りは「今日はやらない」と決めて、選んだ1つに5分だけ着手してください。'},
  caution:['全体を見渡して整理したい時','絞ることで、大事なものを落としたくない時']});
Object.assign(COACH_BOOKS.war,{kw:['目的に戻る','想定外は前提','柔軟に組み直す','次の一手は小さく'],
  when:['予定が崩れて、立て直し方が分からない','計画どおりに進まず、焦っている','途中で目的を見失ってきた'],
  sample:{scene:'今日は予定が全部崩れてしまった',reply:'まず、今日の目的は何でしたか。予定は手段で、目的ではありません。想定外は起きるものとして、いま残っている時間でできる「次の一手」を、ひとつだけ小さく決め直しましょう。'},
  caution:['最初から細かい計画を立てたい時','静かに気持ちを整理したい時']});
Object.assign(COACH_BOOKS.analects,{kw:['毎日ふり返る','行動に移す','小さく積む','誠実に続ける'],
  when:['続けることに自信がない','学んだことが、行動につながっていない','一日の終わりに、落ち着いて振り返りたい'],
  sample:{scene:'三日坊主になってしまった',reply:'三日続いたことは、記録に残っています。ゼロにはなっていません。今日できたことをひとつ、次に改めたいことをひとつ、書き留めましょう。小さくていいので、明日につなげましょう。'},
  caution:['短時間で結論を出したい時','厳しく詰めてほしい時']});
const COACH_DISCLAIMER='各コーチは、名著の考え方をもとに独自に設計したものです。著者・出版社の公認ではなく、本文の引用も行っていません。';
const coachDiscHTML=()=>'<p class="coach-disc">※ '+esc(COACH_DISCLAIMER)+'</p>';
function coachBookBlock(){
  const c=getCoachSlot(),s=c.slot||{};
  const ids=(s.books||[]).filter(b=>COACH_BOOKS[b]);
  if(!ids.length)return '- （未設定）';
  return ids.map(b=>{const B=COACH_BOOKS[b];const ts=(s.teachings||[]).filter(t=>String(t).indexOf(b+':')===0).map(t=>B.teachings[+String(t).split(':')[1]]).filter(Boolean);
    return '### '+B.name+'\n'+(ts.length?ts:B.teachings).map(t=>'- '+t).join('\n')+'\n今日の一手の例：'+B.action;}).join('\n');
}
function getCoachSlot(){
  const fallback={
    morning:{label:'朝',start:5,end:11,books:['lancer']},
    daytime:{label:'日中',start:11,end:18,books:['war']},
    night:{label:'夜',start:18,end:5,books:['failure','analects']}
  };
  const saved=L('labSchedule',null), over=L('labTodayOverride',null);
  const slots=over&&over.enabled&&over.slots?over.slots:(saved&&saved.slots?saved.slots:fallback);
  const h=new Date().getHours();
  let key='night';
  if(h>=slots.morning.start && h<slots.morning.end)key='morning';
  else if(h>=slots.daytime.start && h<slots.daytime.end)key='daytime';
  const s=slots[key]||fallback[key];
  return {key,label:s.label||fallback[key].label,books:(s.books||fallback[key].books).map(b=>LAB_BOOKS[b]||b),slot:s};
}
function updateCoachContext(){
  const ch=activeChar();
  const text='いまのコーチ：'+ch.name+'（'+COACH_BOOKS[ch.base].coach+'）';
  if($('todayBookContext'))$('todayBookContext').innerHTML='<b>'+esc(text)+'</b>';
}
/* ---- v17: 層構造の記憶（①コーチ設定 ②コーチメモ ③経緯 ④今日） ----
   全ログは送らない。AIに渡すのは buildContext() の要約だけ。 */
const MEMO_MAX=800, CTX_MAX=2500, DAY_MAX=60, WEEK_MAX=150;
const MEMO_CATS=[['目標','goal'],['期限','deadline'],['好み','prefs'],['パターン','patterns'],['その他','notes']];
const MEMO_LIST_LABEL={prefs:'好み・進め方',patterns:'繰り返しやすいパターン',notes:'その他'};
const cut=(s,n)=>{s=String(s||'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
const ymd=dt=>dt.getFullYear()+'-'+p2(dt.getMonth()+1)+'-'+p2(dt.getDate());
const addDays=(d,n)=>{const x=new Date(d+'T00:00');x.setDate(x.getDate()+n);return ymd(x);};
const mondayOf=d=>{const x=new Date(d+'T00:00');x.setDate(x.getDate()-((x.getDay()+6)%7));return ymd(x);};
const mdw=d=>d.slice(5).replace('-','/')+'('+'日月火水木金土'[new Date(d+'T00:00').getDay()]+')';
function stableHash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
function memNorm(m){
  m=(m&&typeof m==='object'&&!Array.isArray(m))?m:{};
  const o=(m.memo&&typeof m.memo==='object')?m.memo:{};
  const arr=a=>Array.isArray(a)?a.map(x=>String(x==null?'':x).trim()).filter(Boolean):[];
  const map=x=>{const r={};if(x&&typeof x==='object')Object.keys(x).forEach(k=>{const v=x[k];if(/^\d{4}-\d\d-\d\d$/.test(k)&&v&&typeof v==='object'){const t=String(v.line||v.text||'').trim();if(t)r[k]=Object.assign({},v,{src:v.src==='ai'?'ai':'auto'});}});return r;};
  const memo={goal:String(o.goal||'').trim(),deadline:String(o.deadline||'').trim(),prefs:arr(o.prefs),patterns:arr(o.patterns),notes:arr(o.notes)};
  const facts=Array.isArray(m.facts)?m.facts.filter(x=>x&&typeof x==='object'&&x.id).map(x=>Object.assign({},x)):[];
  const interpretations=Array.isArray(m.interpretations)?m.interpretations.filter(x=>x&&typeof x==='object'&&x.id).map(x=>Object.assign({status:'active',confirmation:'unconfirmed',confidence:'unknown',evidenceFactIds:[],evidenceRefs:[]},x)):[];
  const factIds=new Set(facts.map(x=>x.id)), interpIds=new Set(interpretations.map(x=>x.id));
  const addFact=(key,value)=>{if(!value)return;const id='fact_legacy_'+key+'_'+stableHash(value);if(factIds.has(id))return;facts.push({id,type:key==='goal'?'goal':'deadline',value,date:'',source:'legacy_unknown',sourceRef:'mem.memo.'+key,status:'active',verification:'unknown',createdAt:0,updatedAt:0});factIds.add(id);};
  addFact('goal',memo.goal);addFact('deadline',memo.deadline);
  const days=map(m.days),weeks=map(m.weeks);
  return {v:2,updatedAt:+m.updatedAt||0,memo,facts,interpretations,migration:Object.assign({from:1,completedAt:Date.now()},m.migration||{}),days,weeks,onboarded:!!m.onboarded,
    chars:(m.chars&&typeof m.chars==='object'&&Array.isArray(m.chars.list)&&m.chars.list.length)?m.chars:null};
}
let mem=memNorm(L('mem',null));
if(!mem.memo.goal&&cfg.goal){mem.memo.goal=String(cfg.goal).trim();S('mem',mem);}
let sumSrc=L('sumsrc',{});   // sums[d] が AI の [[summary]] か、自動の代わりか
let memKV=null, memSyncAt=0, memTimer=null, memErr=false;   // memKV: null=未確認 / false=KVなし / true=クラウド同期

const memoLen=(m=mem.memo)=>m.goal.length+m.deadline.length+m.prefs.concat(m.patterns,m.notes).reduce((a,s)=>a+s.length,0);
function memoCap(){   // v28: 目標・期限の長さだけ整える（保存済みの古いメモは消さない）
  const m=mem.memo;
  if(m.goal.length>200)m.goal=m.goal.slice(0,200);
  if(m.deadline.length>80)m.deadline=m.deadline.slice(0,80);
  return 0;
}
function memChanged(){
  mem.updatedAt=Date.now(); S('mem',mem);
  clearTimeout(memTimer); memTimer=setTimeout(memPush,1500);
  if(typeof archiveSoon==='function') archiveSoon('*');   // v24: 変わった日だけ R2 に保管
  paintMemoStatus(); paintMemoMeta();
}
function memoHas(key,text){
  const m=mem.memo,t=String(text).trim();
  return Array.isArray(m[key])?m[key].includes(t):m[key]===t;
}
function memoAdd(cat,text){
  const e=MEMO_CATS.find(c=>c[0]===cat); if(!e) return false;
  const key=e[1],t=String(text||'').trim(); if(!t) return false;
  if(Array.isArray(mem.memo[key])){ if(!mem.memo[key].includes(t)) mem.memo[key].push(t); }
  else mem.memo[key]=t;
  const dr=memoCap(); memChanged();
  if(dr) toast('800字を超えたため、古いメモを'+dr+'件消しました');
  return true;
}
function memoCatOf(s){
  s=String(s||'').replace(/[〔〕\[\]【】「」\s]/g,'');
  if(/パターン|繰り返/.test(s)) return 'パターン';
  if(/好み|進め方/.test(s)) return '好み';
  if(/期限|締切|〆切/.test(s)) return '期限';
  if(/目標/.test(s)) return '目標';
  if(/その他/.test(s)) return 'その他';
  return null;
}

/* ---- ③④ AIに渡す文脈 ---- */
const dayMins=d=>(recs[d]&&+recs[d].minutes)||focusMinOf(d);   // v18: 記録係で確定した分数を優先（v35：無ければタスクの集中の合計）
function factRecord(id){return mem.facts.find(f=>f.id===id&&f.status==='active');}
function syncAppFacts(){
  if(!Array.isArray(mem.facts))mem.facts=[];
  const up=(f)=>{const i=mem.facts.findIndex(x=>x.id===f.id);if(i<0)mem.facts.push(f);else{const old=mem.facts[i],next=Object.assign({},old,f);if(!f.updatedAt)next.updatedAt=old.updatedAt||0;if(!f.createdAt)next.createdAt=old.createdAt||0;
    if(old.source==='user_corrected'){next.source=old.source;next.verification=old.verification;}   // v28: 本人が直した事実は、そのまま
    mem.facts[i]=next;}};
  const upCurrent=(idPrefix,sourceRef,type,value,date,verification,unit,source)=>{
    const val=String(value),id=idPrefix+'_'+stableHash(val);
    mem.facts.filter(f=>f.sourceRef===sourceRef&&f.status==='active'&&f.value!==val).forEach(f=>{f.status='corrected';f.updatedAt=Date.now();});
    up({id,type,value:val,unit,date,source:source||(verification==='measured'?'timer':'user_confirmed'),sourceRef,status:'active',verification,createdAt:0,updatedAt:0});
  };
  Object.keys(recs||{}).forEach(d=>{const r=recs[d];if(!r||typeof r!=='object')return;
    // v28: ひとことは本人が確定した note だけ（AIの要約は事実にしない）
    [['action','action',r.action],['duration','duration',r.minutes],['result','result',r.result],['rating','rating',r.sat],['statement','statement',r.note]].forEach(([type,key,val])=>{if(val===undefined||val===null||val===''||val==='（会話なし）')return;const ai=r.src==='ai_import';upCurrent('fact_rec_'+d+'_'+key,'recs.'+d+'.'+key,type,val,d,ai?'user_confirmed':'confirmed','',ai?'ai_import':'');});
  });
  Object.keys(fS||{}).forEach(d=>{const sec=+fS[d]||0;if(sec<=0)return;upCurrent('fact_timer_'+d,'fS.'+d,'duration',String(Math.round(sec/60)),d,'measured','minutes');});
}
/* ---- v28: 訂正は消さない。古い事実は corrected にして残し、新しい事実を足す ---- */
function factReplace(olds,o){
  const now=Date.now(),first=olds[0];
  olds.forEach(f=>{f.status='corrected';f.updatedAt=now;});
  const id=o.idPrefix+'_'+stableHash(String(o.value)+(o.uniq?'|'+now:''));
  const ex=mem.facts.find(f=>f.id===id);
  const nf={id,type:o.type,value:String(o.value),date:o.date||'',source:'user_corrected',sourceRef:o.sourceRef,status:'active',verification:'user_confirmed',createdAt:ex&&ex.createdAt||now,updatedAt:now};
  if(o.unit)nf.unit=o.unit;
  if(first){nf.corrects=first.id;nf.prevValue=first.value;}else if(o.prev!=null&&o.prev!=='')nf.prevValue=String(o.prev);
  if(ex)Object.assign(ex,nf);else mem.facts.push(nf);
  return nf;
}
const factT=f=>+f.updatedAt||+f.createdAt||0;
function factHistBy(ref){return mem.facts.filter(f=>f.sourceRef===ref&&f.status==='corrected').sort((a,b)=>factT(a)-factT(b));}
function factHist(f){   // 訂正前の値（古い順）
  if(!f) return [];
  if(/^(recs|fS)\./.test(f.sourceRef||'')) return factHistBy(f.sourceRef);
  if(f.type==='goal'||f.type==='deadline') return mem.facts.filter(x=>x.type===f.type&&x.status==='corrected').sort((a,b)=>factT(a)-factT(b));
  const out=[];let c=f,g=0;
  while(c&&c.corrects&&g++<30){c=mem.facts.find(x=>x.id===c.corrects);if(c)out.unshift(c);}
  return out;
}
/* ---- 本人の事実（目標・期限・本人の発言） ---- */
const isSelfFact=f=>f.type==='goal'||f.type==='deadline'||(f.type==='statement'&&f.sourceRef==='self');
function selfFacts(){return mem.facts.filter(f=>f.status==='active'&&isSelfFact(f)).sort((a,b)=>factT(a)-factT(b));}
function selfCur(type){const fs=selfFacts().filter(f=>f.type===type);return fs.length?fs[fs.length-1]:null;}
function selfStatements(){return selfFacts().filter(f=>f.type==='statement');}

/* ---- v28: アプリが事実だけから作る1行・週の集計（AIは使わない） ---- */
function dayLine(d){
  const r=dyRecOf(d),p=[];
  if(r){
    if(r.action)p.push(r.action);
    if(+r.minutes)p.push(r.minutes+'分');
    if(RN[r.result])p.push(RN[r.result]);
    if(+r.sat)p.push('★'+r.sat);
    if(r.note)p.push('ひとこと「'+cut(r.note,30)+'」');
  }
  const fm=Math.round((+fS[d]||0)/60);
  if(fm&&(!r||+r.minutes!==fm))p.push('タイマー'+fm+'分');
  const fl=focusLines(d);if(fl.length)p.push('集中：'+fl.join('、'));   // v35：タスクごとの集中（アプリが計測）
  dyNotes(d).forEach(f=>p.push('メモ「'+cut(f.value,30)+'」'));
  const n=(chats[d]||[]).filter(m=>m&&m.role==='me'&&m.text).length;
  if(n)p.push('会話'+n+'件');
  const ni=(imports[d]||[]).length;if(ni)p.push('取り込んだ会話'+ni+'件');
  return p.join('／');
}
function weekStats(ws){
  const ds=[];for(let i=0;i<7;i++)ds.push(addDays(ws,i));
  const rs=ds.map(d=>dyRecOf(d)).filter(Boolean);
  const cnt=k=>rs.filter(r=>r.result===k).length;
  const mins=ds.reduce((a,d)=>a+dayMins(d),0);
  const freq={};rs.forEach(r=>{const a=String(r.action||'').trim();if(a&&a!=='（未入力）')freq[a]=(freq[a]||0)+1;});
  const top=Object.keys(freq).sort((a,b)=>freq[b]-freq[a]).slice(0,2).map(a=>a+'（'+freq[a]+'回）');
  return {days:rs.length,done:cnt('done'),partial:cnt('partial'),not:cnt('not'),mins,top};
}
function weekLine(ws){
  const s=weekStats(ws);if(!s.days&&!s.mins)return '';
  return '記録'+s.days+'日／できた'+s.done+'・少しできた'+s.partial+'・できなかった'+s.not+'／合計集中'+s.mins+'分'+(s.top.length?'／よく出た行動：'+s.top.join('、'):'');
}
function selfBlock(){
  const out=['## 本人の事実（目標・期限・本人の発言）'],g=selfCur('goal'),dl=selfCur('deadline'),st=selfStatements().slice(-6);
  if(g)out.push('- 目標：'+cut(g.value,80));
  if(dl)out.push('- 期限：'+cut(dl.value,60));
  st.forEach(f=>out.push('- 本人の発言'+(f.date?'（'+f.date+'）':'')+'：'+cut(f.value,80)));
  if(out.length===1)out.push('（まだありません）');
  return out.join('\n');
}
function recentBlock(){
  const out=['## 直近7日の記録（アプリが事実から作成）'];
  for(let i=6;i>=0;i--){const d=dayStr(i),l=dayLine(d);if(l)out.push('- '+mdw(d)+(i===0?'（今日）':'')+' '+cut(l,140));}
  if(out.length===1)out.push('（まだ記録がありません）');
  return out.join('\n');
}
function weeksBlock(n){
  if(!n) return '';
  const cur=mondayOf(today()),out=[];
  for(let k=n;k>=1;k--){const ws=addDays(cur,-7*k),l=weekLine(ws);if(l)out.push('- '+ws.slice(5).replace('-','/')+'の週：'+l);}
  return out.length?'## 週ごとの集計（アプリが計算・直近4週）\n'+out.join('\n'):'';
}
function factsBlock(){
  const ds=[];for(let i=0;i<7;i++)ds.push(dayStr(i));
  const rs=ds.map(d=>recs[d]).filter(Boolean);
  const cnt=k=>rs.filter(r=>r.result===k).length;
  const tot=ds.reduce((a,d)=>a+dayMins(d),0);
  const streak=k=>{let n=0,i=recs[today()]?0:1;while(i<60&&recs[dayStr(i)]&&recs[dayStr(i)].result===k){n++;i++;}return n;};
  const sats=rs.map(r=>+r.sat||0).filter(n=>n>0);
  const tr=recs[today()];
  const out=['## アプリが計算した集計値（AIは数え直さないこと）',
    '- 直近7日（今日を含む）：記録 '+rs.length+'日／できた '+cnt('done')+'／少しできた '+cnt('partial')+'／できなかった '+cnt('not')+'／まだ '+cnt('pending'),
    '- 直近7日の集中時間 合計 '+tot+'分（今日 '+dayMins(today())+'分）',
    '- 連続で「できた」：'+streak('done')+'日 ／ 連続で「できなかった」：'+streak('not')+'日'];
  if(sats.length) out.push('- 手ごたえの平均（直近7日）：'+(sats.reduce((a,b)=>a+b,0)/sats.length).toFixed(1));
  const act=todayTasks().map(t=>t.title);   // v49：FOCUS 枠のみ
  out.push('- 今日のタスク（FOCUS）：'+(act.length?act.slice(0,3).join(' / '):'（FOCUS未選択）')+(tr&&tr.action?' ／今日の記録：'+tr.action+'（'+RN[tr.result]+'）':''));
  return out.join('\n');
}
function buildContext(){   // v28: 事実とアプリの集計だけ。解釈・AIの要約は渡さない
  syncAppFacts();
  const a=selfBlock(),f=factsBlock();let b=recentBlock(),w=4,c=weeksBlock(w);
  const len=()=>a.length+b.length+c.length+f.length+6;
  while(len()>CTX_MAX&&w>0){w--;c=weeksBlock(w);}
  if(len()>CTX_MAX) b=b.slice(0,Math.max(0,CTX_MAX-a.length-c.length-f.length-8))+'…';
  return [a,b,c,f].filter(Boolean).join('\n\n');
}

/* ---- 同期（Cloudflare KV があれば。失敗しても端末内の記憶で動く） ---- */
async function memApi(body){
  const r=await fetch(API('/api/memory'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({pass:appPass},body))});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||('HTTP '+r.status));
  return j;
}
function memMerge(a,b){
  const [n,o]=(a.updatedAt||0)>=(b.updatedAt||0)?[a,b]:[b,a];
  const r=memNorm(JSON.parse(JSON.stringify(n))); r.chars=null;
  const uni=(x,y)=>{const z=Object.assign({},y,x);Object.keys(y).forEach(k=>{if(x[k]&&x[k].src!=='ai'&&y[k].src==='ai')z[k]=y[k];});return z;};
  r.days=uni(n.days||{},o.days||{});r.weeks=uni(n.weeks||{},o.weeks||{});
  const mergeRecords=(left,right)=>{const map=new Map();[...(right||[]),...(left||[])].forEach(x=>{if(!x||!x.id)return;const prev=map.get(x.id);if(!prev)map.set(x.id,x);else{
      const tx=+x.updatedAt||+x.createdAt||0,tp=+prev.updatedAt||+prev.createdAt||0;
      const newer=tx>tp?x:tp>tx?prev:null;
      const stateRank=v=>v==='dismissed'||v==='rejected'||v==='retracted'?3:v==='superseded'||v==='corrected'?2:1;
      const chosen=newer||(stateRank(x.status)>stateRank(prev.status)?x:stateRank(prev.status)>stateRank(x.status)?prev:x);
      map.set(x.id,Object.assign({},prev,x,chosen));
    }});return Array.from(map.values());};
  r.facts=mergeRecords(n.facts,o.facts);r.interpretations=mergeRecords(n.interpretations,o.interpretations);
  r.migration=Object.assign({},o.migration||{},n.migration||{});r.v=2;
  return r;
}
async function memPush(){
  if(memKV!==true||!online) return;
  try{const j=await memApi({op:'put',mem:Object.assign({},mem,{chars:null})});memSyncAt=Date.now();memErr=false;}
  catch(e){memErr=true;}
  paintMemoStatus();
}
function adoptMemChars(){ /* v54: コーチ同期は R2 のみ */ }
async function memSyncInit(){
  if(!online){memKV=false;paintMemoStatus();return;}
  try{
    const j=await memApi({op:'get'});
    if(!j.kv){memKV=false;paintMemoStatus();return;}
    memKV=true;
    const srv=j.mem?memNorm(j.mem):null;
    if(srv){
      const merged=memMerge(mem,srv);
      mem=merged;S('mem',mem);adoptMemChars();
      if(JSON.stringify(merged)!==JSON.stringify(srv)) await memPush(); else memSyncAt=Date.now();
    } else await memPush();
  }catch(e){memKV=false;memErr=true;}
  paintMemoStatus();
  if(activeAppTab==='log') renderRecMore();
}
async function memBoot(){
  try{await memSyncInit();}catch(e){}
  arcBoot().catch(()=>{});   // v24: R2 への保管と復元（待たない）
  const beforeFacts=JSON.stringify(mem.facts); syncAppFacts();
  if(beforeFacts!==JSON.stringify(mem.facts))memChanged();
  if(typeof coachSync==='function')await coachSync();
  if(needsOnboard()&&!ob&&!obSkip) startOnboarding();   // v18: 初めての人は記録係の聞き取りから
  if(activeAppTab==='log') renderRecMore();
  try{await maybeGrow();}catch(e){}   // v19: 週に1回、記録からコーチが育つ
}

/* ---- v24: 記録（事実）を Cloudflare R2 に保管（ARCHIVE が無ければ端末内だけで動く） ---- */
let arcR2=null, arcLastAt=0, arcDays=0, arcErr=false, arcHash=L('archiveHash',{}), arcTimers={}, arcQ=Promise.resolve(), arcBooted=false;
async function arcApi(body){
  const r=await fetch(API('/api/archive'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({pass:appPass},body))});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||('HTTP '+r.status));
  return j;
}
function archivePayload(d){   // v28: 事実だけ（解釈は送らない）
  syncAppFacts();
  const fsum=focusSummary(d);
  const p={date:d,facts:mem.facts.filter(f=>f.date===d),record:recs[d]||null,focusMinutes:focusMinOf(d),
    focus:fsum.tasks.length?{minutes:fsum.minutes,tasks:fsum.tasks.map(x=>({title:x.title,minutes:x.minutes,running:!!x.running})),lines:focusLines(d)}:null,
    imports:(imports[d]||[]).map(x=>({id:x.id,t:x.t,source:x.source||'ai_paste',text:String(x.text||'')})),
    chats:(chats[d]||[]).filter(m=>m&&m.text).map(m=>{const o={role:m.role,text:String(m.text)};if(m.t)o.t=m.t;if(m.coach)o.coach=m.coach;return o;})};
  if(mem.facts.some(f=>f.sourceRef==='fS.'+d&&f.status==='active'&&f.source==='user_corrected')) p.focusFixed=true;   // 本人がタイマーの分を直した
  const oa=L('obAnswers',null); if(oa&&oa.date===d) p.onboarding=oa;
  if(d===today()) p.factsUndated=mem.facts.filter(f=>!f.date);
  return p;
}
const arcHasData=p=>!!(p.record||p.chats.length||p.focusMinutes||p.facts.length||p.onboarding||p.focus||(p.imports&&p.imports.length));
function archiveDay(d,force){   // 1日分を送る（中身が変わった時だけ）。順番に1件ずつ
  const run=async()=>{
    if(!online||arcR2===false) return false;
    const p=archivePayload(d); if(!arcHasData(p)) return false;
    const h=stableHash(JSON.stringify(p));
    if(!force&&arcHash[d]===h) return false;
    try{
      const j=await arcApi(Object.assign({op:'put_day'},p));
      if(j.r2===false){arcR2=false;paintArc();return false;}
      arcR2=true;arcErr=false;arcHash[d]=h;S('archiveHash',arcHash);
      const t=Date.parse(j.savedAt)||Date.now(); if(t>arcLastAt) arcLastAt=t;
      if(j.changed) arcStatusSoon();
    }catch(e){arcErr=true;}
    paintArc(); return true;
  };
  return arcQ=arcQ.then(run,run);
}
let arcStT=null;
function arcStatusSoon(){clearTimeout(arcStT);arcStT=setTimeout(async()=>{try{const s=await arcApi({op:'status'});if(s.r2){arcDays=+s.days||0;const t=Date.parse(s.lastSavedAt||'')||0;if(t>arcLastAt)arcLastAt=t;}}catch(e){}paintArc();},800);}
function archiveSoon(d,ms){if(!online||arcR2===false)return;clearTimeout(arcTimers[d]);arcTimers[d]=setTimeout(()=>{delete arcTimers[d];d==='*'?archiveRecent(14,false):archiveDay(d);},ms==null?3000:ms);}
async function archiveRecent(n,force){let sent=0;for(let i=0;i<n;i++){if(await archiveDay(dayStr(i),force))sent++;}return sent;}
function arcRestoreDay(d,o){   // クラウドの1日分を、端末に無いものだけ足す（上書きしない）
  const f=o&&o.facts;let got=false;   // v28: 解釈（interp/）は読み込まない
  if(f){
    if(!recs[d]&&f.record&&typeof f.record==='object'){recs[d]=f.record;got=true;}
    if(!(chats[d]||[]).length&&Array.isArray(f.chats)&&f.chats.length){chats[d]=f.chats.map(m=>{const x={role:m.role==='me'?'me':'ai',text:String(m.text||'')};if(m.t)x.t=m.t;if(m.coach)x.coach=m.coach;return x;});got=true;}
    if(!(imports[d]||[]).length&&Array.isArray(f.imports)&&f.imports.length){imports[d]=f.imports.filter(x=>x&&x.text).map(x=>({id:String(x.id||'imp_'+stableHash(x.text)),t:+x.t||0,source:String(x.source||'ai_paste'),text:String(x.text)}));got=true;}   // v35
    // v35：集中は タスクと集中セッション（/api/data）から戻すので、focusMinutes から旧タイマーは作らない
    const ids=new Set(mem.facts.map(x=>x.id));(f.facts||[]).forEach(x=>{if(x&&x.id&&!ids.has(x.id)){mem.facts.push(x);ids.add(x.id);}});
  }
  return got;
}
async function arcRestore(){
  const j=await arcApi({op:'list',prefix:'facts/'});
  if(j.r2===false) return 0;
  const lim=dayStr(60),dates=(j.keys||[]).map(k=>String(k).slice(6,16)).filter(d=>/^\d{4}-\d\d-\d\d$/.test(d)&&d>=lim&&d<=today());
  const miss=dates.filter(d=>!recs[d]&&!(chats[d]||[]).length&&!(imports[d]||[]).length).sort().reverse();
  let n=0;
  for(const d of miss){try{const o=await arcApi({op:'get_day',date:d});if(arcRestoreDay(d,o)){n++;arcHash[d]=stableHash(JSON.stringify(archivePayload(d)));}}catch(e){}}
  if(n){S('recs',recs);S('chats',chats);S('imports',imports);S('archiveHash',arcHash);mem.updatedAt=Date.now();S('mem',mem);memPush();
    if(activeAppTab==='log')renderRecorder();
    toast('クラウドから'+n+'日分の記録を復元しました');}
  return n;
}
async function arcBoot(){
  if(arcBooted) return; arcBooted=true;
  if(!online){arcR2=false;paintArc();return;}
  try{
    const s=await arcApi({op:'status'});
    if(!s.r2){arcR2=false;paintArc();return;}
    arcR2=true;arcDays=+s.days||0;arcLastAt=s.lastSavedAt?Date.parse(s.lastSavedAt)||0:0;paintArc();
    try{await arcRestore();}catch(e){}
    await archiveRecent(14,false);
  }catch(e){arcErr=true;if(arcR2===null)arcR2=false;}
  paintArc();
}
function arcStatusText(){
  if(!online) return '記録の保管：この端末のみ（オフライン）';
  if(arcR2===null) return '記録の保管：確認中…';
  if(arcR2===false) return '記録の保管：この端末のみ（R2未設定）';
  const t=arcLastAt?new Date(arcLastAt):null;
  return '記録の保管：Cloudflare R2（'+(t?'最終保管 '+p2(t.getHours())+':'+p2(t.getMinutes())+'・':'')+arcDays+'日分）'+(arcErr?' ※保管できなかった分はあとで再送します':'');
}
function paintArc(){
  if(typeof dyOnArc==='function') dyOnArc();
  document.querySelectorAll('[data-ast]').forEach(e=>{e.textContent=arcStatusText();e.classList.toggle('on',arcR2===true);});
  document.querySelectorAll('[data-arcbtns]').forEach(e=>e.classList.toggle('hide',arcR2!==true));
}
async function archiveNow(btn){
  if(!online||arcR2!==true) return;
  if(btn){btn.disabled=true;btn.textContent='保管中…';}
  await archiveRecent(14,true);
  if(btn){btn.disabled=false;btn.textContent='いますぐ保管';}
  toast(arcErr?'保管できない日がありました。あとで再送します':'直近14日分を保管しました');
}
let arcMdUrl=null;
async function openMdSheet(){
  const month=today().slice(0,7),name='aicoach-'+month+'.md';
  $('sheetBody').innerHTML='<div class="lb">今月の記録（Markdown）</div><div class="mu" style="font-size:12px">'+esc(month)+' の記録を読み込んでいます…</div>';
  $('sheet').classList.remove('hide');
  try{await archiveDay(today());}catch(e){}
  let text='';
  try{const j=await arcApi({op:'md',month});text=String(j.text||'');}catch(e){text='';}
  if($('sheet').classList.contains('hide')) return;
  if(!text){$('sheetBody').innerHTML='<div class="lb">今月の記録（Markdown）</div><div class="mu">読み込めませんでした。通信できる場所で、もう一度開いてください。</div><button id="mdClose" class="arc-close">閉じる</button>';$('mdClose').onclick=closeSheet;return;}
  if(arcMdUrl) URL.revokeObjectURL(arcMdUrl);
  arcMdUrl=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));
  $('sheetBody').innerHTML='<div class="lb">今月の記録（Markdown）</div>'+
    '<div class="mu" style="font-size:12px">事実（記録・タスクと集中・会話の原文・メモ・訂正の履歴）だけです。Cloudflare R2 の export/'+esc(month)+'.md と同じ内容です。</div>'+
    '<pre class="arc-md" id="mdText">'+esc(text)+'</pre>'+
    '<div class="arc-act"><button id="mdCopy">コピー</button><a id="mdDl" class="arc-dl" href="'+arcMdUrl+'" download="'+name+'">ダウンロード</a></div>'+
    '<button id="mdClose" class="arc-close">閉じる</button>';
  $('mdCopy').onclick=async()=>{let ok=false;try{await navigator.clipboard.writeText(text);ok=true;}catch(e){}
    if(!ok){try{const r=document.createRange();r.selectNodeContents($('mdText'));const s=getSelection();s.removeAllRanges();s.addRange(r);ok=document.execCommand('copy');}catch(e){}}
    toast(ok?'コピーしました':'コピーできませんでした。長押しで選んでください');};
  $('mdClose').onclick=closeSheet;
}

