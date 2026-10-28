/* AIコーチ v55 — コーチタブ（v55：全コーチの3Dの棚）（＋Claude / ChatGPT に渡す）：選ぶ・おすすめ・コーチビルド・記録から育つ・起動（app-v30/ が元。build_v30.py で1ファイル版・bundle を作る） */
/* ---- v11: コーチ選択（名著3Dカルーセル） ---- */
let labIdx=null,labMob=null,labKeyBound=false;
function labCurrentBooks(){return [activeChar().base];}
function labDims(){
  const mob=window.innerWidth<640;
  return mob?{w:148,h:216,H:102,R:-120,mob}:{w:204,h:304,H:258,R:-180,mob};
}
function labPose(off,drag){
  const g=labDims();let x=0,z=0,r=0,s=1,o=1,zi=1;
  if(off===0){z=32;s=1.11;zi=10;}
  else if(off===1){x=g.H;z=-84;r=-46;s=.86;o=.62;zi=5;}
  else if(off===-1){x=-g.H;z=-84;r=46;s=.86;o=.62;zi=5;}
  else{z=g.R;r=180;s=.72;o=.26;zi=2;}
  const so=(drag||0)*.38;
  return {t:'translate(-50%,-50%) translate3d('+(x+so)+'px,0,'+z+'px) rotateY('+(r+so*.08)+'deg) scale('+s+')',o,zi};
}
function labOff(i){const n=COACH_ORDER.length;const k=(i-labIdx+n)%n;return k>2?k-n:k;}
function labBookHTML(id,i){
  const b=COACH_BOOKS[id],g=labDims(),d=b.d,c=b.color,cur=labCurrentBooks().includes(id);
  const f='translate(-50%,-50%) ';
  return '<div class="lb3-item" data-i="'+i+'">'+
    '<div class="lb3-glow" style="background:radial-gradient(60% 60% at 50% 50%,'+c+'22 0%,transparent 70%)"></div>'+
    '<div class="lb3-book" style="width:'+g.w+'px;height:'+g.h+'px">'+
      '<div class="book-face lb3-front" style="width:'+g.w+'px;height:'+g.h+'px;transform:'+f+'translateZ('+d/2+'px)" data-face>'+
        '<img src="'+b.img+'" alt="'+esc(b.title)+'の表紙" draggable="false">'+
        (cur?'<span class="lb3-cur lb3-cur-abs">いまのベース</span>':'')+
        '<div class="lb3-shine" style="animation:shineMove 5.2s ease-in-out infinite;animation-delay:'+(i*.35)+'s"></div>'+
        '<div class="lb3-edge"></div><div class="lb3-btm" style="background:linear-gradient(90deg,transparent,'+c+',transparent)"></div>'+
      '</div>'+
      '<div class="book-face lb3-back" style="width:'+g.w+'px;height:'+g.h+'px;transform:'+f+'rotateY(180deg) translateZ('+d/2+'px)"><div class="lb3-ov" style="opacity:.6;background:radial-gradient(80% 60% at 50% 20%,'+c+'12,transparent 60%)"></div><i></i><b></b></div>'+
      '<div class="book-face lb3-fore" style="width:'+d+'px;height:'+g.h+'px;transform:'+f+'rotateY(90deg) translateZ('+g.w/2+'px)"><div class="pages-texture"></div><div style="position:absolute;left:0;top:0;bottom:0;width:2px;background:'+c+';opacity:.35;z-index:2"></div></div>'+
      '<div class="book-face lb3-spine" style="width:'+d+'px;height:'+g.h+'px;transform:'+f+'rotateY(-90deg) translateZ('+g.w/2+'px);border-left:1px solid '+c+'22"><div class="lb3-ov" style="opacity:.8;background:linear-gradient(180deg,'+c+'18 0%,transparent 42%)"></div><span class="mono">'+esc(b.coach)+' — '+b.en+'</span></div>'+
      '<div class="book-face lb3-topface" style="width:'+g.w+'px;height:'+d+'px;transform:'+f+'rotateX(90deg) translateZ('+g.h/2+'px);background:#ebe4c8"><div class="pages-texture-dark" style="opacity:.6"></div></div>'+
      '<div class="book-face lb3-botface" style="width:'+g.w+'px;height:'+d+'px;transform:'+f+'rotateX(-90deg) translateZ('+g.h/2+'px);background:#ddd6b4"><div class="pages-texture-dark" style="opacity:.7"></div><div class="lb3-ov" style="background:rgba(0,0,0,.2)"></div></div>'+
    '</div>'+
    '<div class="lb3-tap"><i></i><span class="mono">TAP TO DETAIL</span><i></i></div>'+
  '</div>';
}
function labLayout(drag){
  const wrap=$('labWrap');if(!wrap)return;
  wrap.querySelectorAll('.lb3-item').forEach(el=>{
    const i=+el.dataset.i,off=labOff(i),p=labPose(off,drag),act=off===0;
    el.style.transform=p.t;el.style.opacity=p.o;el.style.zIndex=p.zi;
    el.classList.toggle('active',act);
    const sh=el.querySelector('.lb3-shine');
    if(sh){sh.style.opacity=act?.9:.4;sh.style.animationDuration=act?'2.8s':'5.2s';}
    const fr=el.querySelector('.lb3-front'),c=COACH_BOOKS[COACH_ORDER[i]].color;
    if(fr)fr.style.boxShadow=act?'0 0 0 1px '+c+'55,0 18px 44px rgba(0,0,0,.6),0 0 36px '+c+'33,inset 0 0 0 1px rgba(255,255,255,.06)':'0 0 0 1px '+c+'22,0 10px 28px rgba(0,0,0,.5)';
  });
}
function labDots(){
  const box=$('labDots');if(!box)return;
  box.innerHTML=COACH_ORDER.map((id,i)=>{const b=COACH_BOOKS[id],on=i===labIdx;
    return '<button data-dot="'+i+'" class="'+(on?'on':'')+'" aria-label="'+esc(b.coach)+'を選ぶ"'+(on?' aria-current="true"':'')+'><span style="background:'+(on?b.color:'transparent')+';border-color:'+(on?b.color:'#1a3650')+';box-shadow:'+(on?'0 0 12px '+b.color+'88':'none')+'"></span></button>';}).join('');
  box.querySelectorAll('[data-dot]').forEach(el=>el.onclick=()=>{
    const i=+el.dataset.dot;
    if(i===labIdx){toast(COACH_BOOKS[COACH_ORDER[i]].coach+'は選択中。詳細は下にあります');labScrollDetail();}
    else labGo(i);
  });
}
function labDetail(){
  const box=$('labDetail');if(!box)return;
  const id=COACH_ORDER[labIdx],b=COACH_BOOKS[id],c=b.color,cur=labCurrentBooks().includes(id);
  const tt=$('labTitle');if(tt){const w=tt.parentElement;if(w)w.style.setProperty('--tc',c);tt.innerHTML='<div class="lb3-ttl-en mono">'+esc(b.en)+(cur?'<b>いまのベース</b>':'')+'</div><div class="lb3-ttl-name">'+esc(b.coach)+'</div><div class="lb3-ttl-cr">'+esc(b.credit)+'</div>';}
  box.innerHTML=
    '<div class="lb3-dh"><h2>'+esc(b.coach)+'</h2><span class="lb3-chip'+(cur?' cur':'')+'"><i style="background:'+c+';box-shadow:0 0 8px '+c+'"></i><span>'+(cur?'いまのコーチのベース':'ベース候補')+'</span><em class="mono">/ '+b.en+'</em></span></div>'+
    '<p class="lb3-tagline">'+esc(b.tagline)+'</p><p class="lb3-credit">'+esc(b.credit)+'</p>'+
    '<div class="lb3-card">'+
      '<div class="lb3-head"><div class="lb3-thumb"><img src="'+b.img+'" alt="'+esc(b.title)+'の表紙"><div class="bb" style="background:'+c+'"></div></div>'+
        '<div class="lb3-hmeta"><div class="lb3-ed"><i></i><span class="mono">SELECTED EDITION</span></div><div class="lb3-full">'+esc(b.name)+'</div>'+
        '<div class="lb3-tags"><span>COACH '+String(labIdx+1).padStart(2,'0')+' / '+String(COACH_ORDER.length).padStart(2,'0')+'</span><span>考え方 '+COACH_MODULES[id].on.length+'つ</span><span style="'+(cur?'color:var(--cyan);border-color:rgba(235,198,126,.4)':'')+'">'+(cur?'いまのコーチのベース':'ベース候補')+'</span></div></div></div>'+
      '<div class="lb3-sec"><div class="lb3-k mono"><i></i>著者と背景</div><p>'+esc(b.author)+'</p></div>'+
      '<div class="lb3-sec alt"><div class="lb3-k mono"><i style="background:'+c+'"></i>一言でいうと</div><p class="big">'+esc(b.about)+'</p></div>'+
      '<div class="lb3-sec"><div class="lb3-k mono"><i style="background:rgba(255,255,255,.5)"></i>コーチが使う考え方</div><ul class="lb3-ul">'+COACH_MODULES[id].concepts.filter(k=>COACH_MODULES[id].on.includes(k.k)).map((k,i)=>'<li><b class="mono">0'+(i+1)+'</b><span><strong>'+esc(k.name)+'</strong><br><span style="color:var(--mu);font-size:12.5px">'+esc(k.note)+'</span></span></li>').join('')+'</ul></div>'+
      '<div class="lb3-sec"><div class="lb3-k mono"><i class="pulse"></i>今日の一手</div><div class="lb3-act"><b>↗</b><p>'+esc(COACH_MODULES[id].action)+'</p></div></div>'+
      '<div class="lb3-foot"><button class="lb3-go" id="labStart"><span>このベースで作る</span><b>→</b></button>'+
        '<p class="lb3-note">※ 本の購入ではなく、名著の考え方をもとにした、あなた専用のコーチを作る機能です。作ったコーチは、名前・性格・考え方を「育てる」で変えられます。</p></div>'+
    '</div>';
  $('labStart').onclick=()=>labStartCoach(id);
}
function labScrollDetail(){const d=$('labDetail');if(d&&d.scrollIntoView)d.scrollIntoView({behavior:'smooth',block:'start'});}
function labGo(i){
  const n=COACH_ORDER.length;labIdx=((i%n)+n)%n;
  labLayout(0);labDots();labDetail();
  if($('achName'))updateActiveCoachHero();
}
function labStartCoach(id){createChar(id);}   // v18: ベースを選ぶ＝新しいキャラクターを作る
/* ---- v12: 時間帯スロット ---- */
function writeSlots(slots){S('labSchedule',{slots});S('labTodayOverride',{enabled:false,slots:null});updateCoachContext();}
function setSlotBook(k,id){const slots=readSlots();slots[k].books=[id];slots[k].teachings=[id+':0',id+':1',id+':2'];writeSlots(slots);}

/* ---- v12: おすすめ（ルール／AI） ---- */
let recAI=L('recAI',null),recBusy=false;
function todayChatText(){return (imports[today()]||[]).map(x=>String(x.text||'')).join('\n').slice(-4000);}   // v35：取り込んだ会話の原文
function ruleRecommend(){
  const d=today(),days=Object.keys(recs).filter(k=>k<=d).sort().slice(-3);
  const nNot=days.filter(k=>recs[k]&&recs[k].result==='not').length+days.filter(k=>recs[k]&&recs[k].result==='partial').length*0.5;
  const t=todayChatText(),h=new Date().getHours();
  let m;
  if(nNot>=2) return {book:'failure',reason:'直近3日で「できなかった」「少しできた」が続いています。'};
  if(recs[d]&&recs[d].result==='not') return {book:'failure',reason:'今日の記録が「できなかった」になっています。'};
  const nAct=tasks.filter(x=>x.status==='active').length;
  if(nAct>=6) return {book:'lancer',reason:'いまのタスクが'+nAct+'個あります。一つに絞りどきです。'};
  if((m=t.match(/多すぎ|迷|手を広げ|どれから/))) return {book:'lancer',reason:'今日取り込んだ会話に「'+m[0]+'」という言葉があります。'};
  if((m=t.match(/崩れ|予定|時間がない|忙し|変わった|トラブル/))) return {book:'war',reason:'今日取り込んだ会話に「'+m[0]+'」という言葉があります。'};
  if(h>=18||h<5) return {book:'analects',reason:'夜は一日をふり返る時間です。'};
  const cur=(labCurrentBooks().find(b=>COACH_MODULES[b]))||'lancer';
  return {book:cur,reason:'いまのコーチと同じベースです。記録と会話に、切り替えるほどの変化は見つかりませんでした。',keep:true};
}
function currentRec(){
  if(recAI&&recAI.date===today()&&COACH_MODULES[recAI.book]) return {book:recAI.book,reason:recAI.reason||'',ai:true};
  return ruleRecommend();
}
function renderRecBox(){
  const box=$('recBox');if(!box)return;
  const r=currentRec(),b=COACH_BOOKS[r.book],M=COACH_MODULES[r.book];

  box.className='rc'+(recBusy?' busy':'');
  box.innerHTML=
    '<button class="rimg" id="recImg" aria-label="'+esc(b.coach)+'を表示"><img src="'+b.img+'" alt=""></button>'+
    '<div class="rbody"><div class="rk mono"><i></i>'+(recBusy?'<span><span class="spin"></span>AIが考えています…</span>':(r.ai?'おまかせ · AIが判定':'おまかせ · 記録と会話から判定'))+'</div>'+
    '<h3>'+(r.ai?'AIのおすすめ':'今日のおすすめ')+'：'+esc(b.coach)+'</h3><p class="rcr">'+esc(b.credit)+'</p>'+
    '<p>'+esc(r.reason)+'</p>'+
    '<div class="rw" style="margin-top:4px">向いている場面：'+esc(M.when)+'</div>'+
    '<div class="ra"><button class="rgo" id="recGo"'+(recBusy?' disabled':'')+'>'+'このベースで作る'+'</button>'+
    '<button class="rai" id="recAsk"'+(recBusy?' disabled':'')+'>'+(r.ai?'もう一度AIに聞く':'AIに選んでもらう')+'</button></div></div>';
  $('recGo').onclick=()=>labStartCoach(r.book);
  $('recAsk').onclick=askAIRecommend;
  $('recImg').onclick=()=>{const i=COACH_ORDER.indexOf(r.book);if(i>=0)labGo(i);};
}
async function askAIRecommend(){
  if(recBusy)return;
  if(!online){recAI=null;S('recAI',null);renderRecBox();toast('オフラインのためルールで選びました');return;}
  recBusy=true;renderRecBox();
  try{
    const records=[];for(let i=6;i>=0;i--){const d=dayStr(i),r=recs[d];if(r)records.push({date:d,result:r.result,action:r.action,sat:r.sat||0});}
    const res=await fetch(API('/api/recommend'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      pass:appPass,records,menu:tasks.filter(x=>x.status==='active').slice(0,10).map(x=>x.title),chat:[],
      recentSummaries:recentSums(5),hour:new Date().getHours(),current:labCurrentBooks(),
      books:BOOK_IDS.map(id=>({id,name:COACH_BOOKS[id].title,when:COACH_MODULES[id].when}))})});
    const j=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.error||('HTTP '+res.status));
    if(!COACH_MODULES[j.book]) throw new Error('本の指定が不正です');
    recAI={date:today(),book:j.book,reason:String(j.reason||'').slice(0,240)};S('recAI',recAI);
    toast('AIが'+bookT(j.book)+'を選びました');
  }catch(e){recAI=null;S('recAI',null);toast('AIに聞けず、ルールで選びました');}
  recBusy=false;renderRecBox();
}

/* ===== v19: コーチタブ（キャラクター選択／ベースを選ぶ／コーチビルド） ===== */
let labScreen='base', buildChar=null, buildTab='cmp';
function renderLab(){
  if(labScreen==='base'){paintBodyMode();return renderBasePicker();}
  if(labScreen==='build'&&charById(buildChar)) return renderBuild();
  labScreen='chars';paintBodyMode();
  renderChars();
}
function paintBodyMode(){document.body.classList.toggle('cb-talk',activeAppTab==='settings'&&labScreen==='build'&&buildTab==='talk');}
function renderActiveCoachHeroHTML(){
  const act=activeChar(),base=act.base,b=COACH_BOOKS[base],idx=Math.max(0,COACH_ORDER.indexOf(base));
  labIdx=idx;
  return '<section class="ach" style="--tc:'+b.color+'"><div class="ach-top"><div><span class="mono">YOUR COACH / ACTIVE EDITION</span><h2 id="achName">'+esc(act.name)+'</h2><p id="achSub">'+esc(b.coach)+'をベースに成長中 · Lv.'+lvOf(act)+'</p></div><span class="ach-status" id="achStatus"><i></i>使用中</span></div>'+
    '<div class="lb3-win ach-win"><div class="lb3-wrap ach-wrap" id="labWrap" aria-label="現在使用中のコーチ"><div class="lb3-vig"></div><div class="ach-beam"></div><div class="lb3-floor"></div><div class="lb3-floorglow"></div><div class="lb3-scene">'+labBookHTML(base,idx)+'</div><div class="ach-light-label mono">ACTIVE COACH</div></div></div>'+
    '<div class="ach-bottom"><div><div class="ach-label mono" id="achLabel">CURRENT COACH</div><div class="ach-book" id="achBook">'+esc(b.title)+'</div><div class="ach-xp"><span>Lv.'+lvOf(act)+'</span><div><i style="width:'+Math.max(4,lvPct(act))+'%"></i></div><span>'+xpToNext(act)+' XP TO NEXT</span></div></div><div class="ach-current-mark"><i>✓</i> 現在のコーチ</div></div></section>';
}
function updateActiveCoachHero(){
  const act=activeChar(),id=COACH_ORDER[labIdx],b=COACH_BOOKS[id];
  const existing=chars.list.find(c=>c.base===id),same=act.base===id;
  const name=$('achName'),sub=$('achSub'),status=$('achStatus'),label=$('achLabel'),book=$('achBook'),action=$('achAction');
  const top=$('vLab').querySelector('.ach');if(top)top.style.setProperty('--tc',b.color);
  if(name)name.textContent=same?act.name:b.coach;
  if(sub)sub.textContent=same?'あなた専用のコーチ · Lv.'+lvOf(act):'この名著をベースにしたコーチ';
  if(status){status.innerHTML='<i></i>'+(same?'現在使用中':existing?'切り替え候補':'新規作成候補');status.classList.toggle('candidate',!same);}
  if(label)label.textContent=same?'CURRENT COACH':'PREVIEW / BASE';
  if(book)book.textContent=b.title;
  if(action){action.innerHTML=(same?'現在使用中':existing?'このコーチに切り替える':'このベースで新規作成')+' <span>'+(same?'✓':'→')+'</span>';action.disabled=same;action.classList.toggle('is-current',same);}
}
function bindActiveCoachHero(){
  // 現在のコーチを展示するだけの領域。選択・切り替え操作は行わない。
  labLayout(0);
  const wrap=$('labWrap');
  if(wrap){
    const item=wrap.querySelector('.lb3-item');
    if(item){item.style.cursor='default';item.style.pointerEvents='none';}
  }
}
function useActiveCoachBase(){
  const id=COACH_ORDER[labIdx],act=activeChar();
  if(act.base===id)return;
  const existing=chars.list.find(c=>c.base===id);
  if(existing){activateChar(existing.id);labScreen='chars';renderLab();window.scrollTo(0,0);}
  else {labScreen='base';renderLab();window.scrollTo(0,0);}
}
/* ===== v55: コーチの棚（全コーチを3Dの本で並べる。中央＝選択中、右端＝白紙の本＝新しいコーチ） ===== */
const SHELF_NEW='__new';
let shelfSel=null,shelfKeyBound=false,shelfFlash=null;
const shelfPC=()=>!!(window.matchMedia&&matchMedia('(min-width:1000px) and (hover:hover) and (pointer:fine)').matches);
function shelfItems(){return chars.list.map(c=>c.id).concat([SHELF_NEW]);}
function shelfIdx(){const it=shelfItems();let i=it.indexOf(shelfSel);if(i<0){i=Math.max(0,it.indexOf(chars.active));shelfSel=it[i];}return i;}
function shelfPose(off,drag){   // 直線の棚：右端（白紙）より右には何も無い。離れた本ほど奥へ・小さく・薄く
  const g=Object.assign({},labDims()),a=Math.abs(off),sg=Math.sign(off);let x=0,z=0,r=0,s=1,o=1;
  if(shelfPC())g.H=200;   // PCは右に説明が重なるので、隣の本が見えるよう間隔を詰める
  if(a===0){z=32;s=1.11;}
  else if(a===1){x=sg*g.H;z=-84;r=-46*sg;s=.86;o=.72;}
  else{x=sg*(g.H+(a-1)*g.H*.5);z=-84-(a-1)*96;r=-60*sg;s=Math.max(.5,.86-.1*(a-1));o=a>3?0:Math.max(0,.46-.13*(a-2));}
  const so=(drag||0)*.38;
  return {t:'translate(-50%,-50%) translate3d('+(x+so)+'px,0,'+z+'px) rotateY('+(r+so*.08)+'deg) scale('+s+')',o,zi:20-a,hide:a>3};
}
function shelfBookHTML(id,i){
  const g=labDims(),f='translate(-50%,-50%) ';
  if(id===SHELF_NEW){   // 白紙の本
    const c='#8ee7f2',d=14;
    return '<div class="lb3-item shelf-item shelf-blank" data-si="'+i+'" data-id="'+SHELF_NEW+'" role="button" tabindex="-1" aria-label="新しいコーチを作る（ベースを選ぶ）">'+
      '<div class="lb3-glow" style="background:radial-gradient(60% 60% at 50% 50%,'+c+'22 0%,transparent 70%)"></div>'+
      '<div class="lb3-book" style="width:'+g.w+'px;height:'+g.h+'px">'+
        '<div class="book-face lb3-front shelf-blank-front" style="width:'+g.w+'px;height:'+g.h+'px;transform:'+f+'translateZ('+d/2+'px)"><b>＋</b><span>新しいコーチ</span><em class="mono">BLANK EDITION</em></div>'+
        '<div class="book-face lb3-back shelf-blank-back" style="width:'+g.w+'px;height:'+g.h+'px;transform:'+f+'rotateY(180deg) translateZ('+d/2+'px)"></div>'+
        '<div class="book-face lb3-fore" style="width:'+d+'px;height:'+g.h+'px;transform:'+f+'rotateY(90deg) translateZ('+g.w/2+'px)"><div class="pages-texture"></div></div>'+
        '<div class="book-face lb3-spine shelf-blank-spine" style="width:'+d+'px;height:'+g.h+'px;transform:'+f+'rotateY(-90deg) translateZ('+g.w/2+'px)"><span class="mono">NEW COACH</span></div>'+
        '<div class="book-face lb3-topface" style="width:'+g.w+'px;height:'+d+'px;transform:'+f+'rotateX(90deg) translateZ('+g.h/2+'px);background:#ebe4c8"></div>'+
        '<div class="book-face lb3-botface" style="width:'+g.w+'px;height:'+d+'px;transform:'+f+'rotateX(-90deg) translateZ('+g.h/2+'px);background:#ddd6b4"></div>'+
      '</div><div class="lb3-tap"><i></i><span class="mono">TAP TO CREATE</span><i></i></div></div>';
  }
  const ch=charById(id),b=COACH_BOOKS[ch.base],d=b.d,c=b.color,on=ch.id===chars.active;
  return '<div class="lb3-item shelf-item'+(on?' in-use':'')+'" data-si="'+i+'" data-id="'+esc(id)+'" role="button" tabindex="-1" aria-label="'+esc(ch.name)+(on?'（使用中）':'')+'" style="--bc:'+c+'">'+
    '<div class="lb3-glow" style="background:radial-gradient(60% 60% at 50% 50%,'+c+'22 0%,transparent 70%)"></div>'+
    '<div class="lb3-book" style="width:'+g.w+'px;height:'+g.h+'px">'+
      '<div class="book-face lb3-front" style="width:'+g.w+'px;height:'+g.h+'px;transform:'+f+'translateZ('+d/2+'px)">'+
        '<img src="'+b.img+'" alt="" draggable="false">'+
        '<span class="shelf-name">'+esc(ch.name)+'<small class="mono">Lv.'+lvOf(ch)+'</small></span>'+
        (on?'<span class="lb3-cur lb3-cur-abs">使用中</span>':'')+
        '<div class="lb3-shine" style="animation:shineMove 5.2s ease-in-out infinite;animation-delay:'+(i*.35)+'s"></div>'+
        '<div class="lb3-edge"></div><div class="lb3-btm" style="background:linear-gradient(90deg,transparent,'+c+',transparent)"></div>'+
      '</div>'+
      '<div class="book-face lb3-back" style="width:'+g.w+'px;height:'+g.h+'px;transform:'+f+'rotateY(180deg) translateZ('+d/2+'px)"><div class="lb3-ov" style="opacity:.6;background:radial-gradient(80% 60% at 50% 20%,'+c+'12,transparent 60%)"></div><i></i><b></b></div>'+
      '<div class="book-face lb3-fore" style="width:'+d+'px;height:'+g.h+'px;transform:'+f+'rotateY(90deg) translateZ('+g.w/2+'px)"><div class="pages-texture"></div><div style="position:absolute;left:0;top:0;bottom:0;width:2px;background:'+c+';opacity:.35;z-index:2"></div></div>'+
      '<div class="book-face lb3-spine" style="width:'+d+'px;height:'+g.h+'px;transform:'+f+'rotateY(-90deg) translateZ('+g.w/2+'px);border-left:1px solid '+c+'22"><div class="lb3-ov" style="opacity:.8;background:linear-gradient(180deg,'+c+'18 0%,transparent 42%)"></div><span class="mono">'+esc(ch.name)+' — '+b.en+'</span></div>'+
      '<div class="book-face lb3-topface" style="width:'+g.w+'px;height:'+d+'px;transform:'+f+'rotateX(90deg) translateZ('+g.h/2+'px);background:#ebe4c8"><div class="pages-texture-dark" style="opacity:.6"></div></div>'+
      '<div class="book-face lb3-botface" style="width:'+g.w+'px;height:'+d+'px;transform:'+f+'rotateX(-90deg) translateZ('+g.h/2+'px);background:#ddd6b4"><div class="pages-texture-dark" style="opacity:.7"></div><div class="lb3-ov" style="background:rgba(0,0,0,.2)"></div></div>'+
    '</div><div class="lb3-tap"><i></i><span class="mono">'+(on?'IN USE':'TAP TO SELECT')+'</span><i></i></div></div>';
}
function shelfLayout(drag){
  const wrap=$('shelfWrap');if(!wrap)return;
  const k=shelfIdx();
  wrap.querySelectorAll('.shelf-item').forEach(el=>{
    const i=+el.dataset.si,off=i-k,p=shelfPose(off,drag),act=off===0;
    el.style.transform=p.t;el.style.opacity=p.o;el.style.zIndex=p.zi;el.style.pointerEvents=p.hide?'none':'';
    el.classList.toggle('active',act);el.setAttribute('aria-current',act?'true':'false');
    const sh=el.querySelector('.lb3-shine');if(sh){sh.style.opacity=act?.9:.4;sh.style.animationDuration=act?'2.8s':'5.2s';}
    const fr=el.querySelector('.lb3-front');
    if(fr&&!el.classList.contains('shelf-blank')){const c=el.style.getPropertyValue('--bc')||'#EBC67E';fr.style.boxShadow=act?'0 0 0 1px '+c+'55,0 18px 44px rgba(0,0,0,.6),0 0 36px '+c+'33,inset 0 0 0 1px rgba(255,255,255,.06)':'0 0 0 1px '+c+'22,0 10px 28px rgba(0,0,0,.5)';}
  });
  const sel=shelfSel===SHELF_NEW?null:charById(shelfSel),win=$('shelfWin');
  if(win)win.style.setProperty('--tc',sel?COACH_BOOKS[sel.base].color:'#8ee7f2');
  const dots=$('shelfDots');if(dots)dots.querySelectorAll('[data-sd]').forEach(x=>x.classList.toggle('on',+x.dataset.sd===k));
  const pv=$('shelfPrev'),nx=$('shelfNext');if(pv)pv.disabled=k<=0;if(nx)nx.disabled=k>=shelfItems().length-1;
}
function shelfAxesHTML(c){
  return '<div class="shelf-axes">'+AXES.map(([k,lb])=>{const v=clamp5(c.spec.axes[k],3);return '<div class="shelf-ax"><span>'+esc(lb)+'</span><i aria-hidden="true">'+[1,2,3,4,5].map(n=>'<b class="'+(n<=v?'on':'')+'"></b>').join('')+'</i><em>'+esc(AXIS_WORD[k][v]||'')+'</em></div>';}).join('')+'</div>';
}
function shelfPanelHTML(){
  if(shelfSel===SHELF_NEW) return '<div class="shelf-pk mono">NEW COACH / BLANK EDITION</div><h2>新しいコーチを作る</h2>'+
    '<p class="shelf-lead">名著の考え方をもとにした4冊から、新しいコーチの土台（ベース）を選びます。名前や話し方は、あとで「鍛える」で育てられます。</p>'+
    '<div class="shelf-acts"><button class="p" id="shelfCreate">ベースを選ぶ <b>→</b></button></div>'+
    '<p class="shelf-note mu">いまのコーチはそのまま残ります。</p>';
  const c=charById(shelfSel),b=COACH_BOOKS[c.base],on=c.id===chars.active,tr=traitTags(c),cp=(c.spec.catchphrases||[]),pf=(c.prefs||[]),lg=(c.log||[]).slice(-2).reverse();
  return '<div class="shelf-pk mono">'+(on?'IN USE / ACTIVE COACH':'COACH '+String(shelfIdx()+1).padStart(2,'0')+' / '+String(chars.list.length).padStart(2,'0'))+'</div>'+
    '<div class="shelf-ph"><h2>'+esc(c.name)+'</h2><span class="shelf-st'+(on?' on':'')+'">'+(on?'使用中':esc(relDay(c.lastUsed)))+'</span></div>'+
    '<p class="shelf-base">ベース：'+esc(b.coach)+' <span>'+esc(b.credit)+'</span></p>'+
    '<div class="shelf-xp"><span class="mono">Lv.'+lvOf(c)+'</span><i><b style="width:'+Math.max(4,lvPct(c))+'%"></b></i><span class="mono">'+xpToNext(c)+' XP TO NEXT</span></div>'+
    (b.kw&&b.kw.length?'<div class="shelf-kw" aria-label="このコーチのキーワード">'+b.kw.slice(0,5).map(k=>'<span>'+esc(k)+'</span>').join('')+'</div>':'')+
    (tr.length?'<div class="shelf-tags">'+tr.map(t=>'<span>'+esc(t)+'</span>').join('')+'</div>':'')+
    '<div class="shelf-sec"><div class="shelf-k mono">話し方</div>'+shelfAxesHTML(c)+'</div>'+
    (cp.length||pf.length?'<div class="shelf-sec"><div class="shelf-k mono">口ぐせ・好み</div><p class="shelf-li">'+cp.concat(pf).slice(0,6).map(x=>'「'+esc(cut(x,40))+'」').join(' ')+'</p></div>':'')+
    '<div class="shelf-acts">'+(on?'<button class="shelf-using" disabled>✓ 使用中</button>':'<button class="p" id="shelfUse">このコーチを使う</button>')+
      '<button id="shelfGrow">鍛える</button><button id="shelfMore" aria-label="'+esc(c.name)+'のメニュー">⋯</button></div>';
}
/* v58：くわしい説明（3Dの棚の下）。文言はベースごとの固定の説明、数字はアプリが数えた事実 */
function shelfDetailHTML(){
  if(shelfSel===SHELF_NEW)return '';
  const c=charById(shelfSel);if(!c)return '';
  const b=COACH_BOOKS[c.base];if(!b)return '';
  const li=a=>'<ul>'+a.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
  const base=BASE_AXES[c.base]||{},ch=AXES.map(([k,lb])=>{const v=clamp5(c.spec.axes[k],3),o=base[k];return o==null||v===o?'':lb+(v>o?'↑':'↓');}).filter(Boolean);
  const lg=(c.log||[]).slice(-3).reverse(),days=(c.chatDays||[]).length;
  return '<h3 class="shelf-dh">'+esc(c.name)+' <small class="mono">DETAIL</small></h3><div class="shelf-dg">'+
    (b.tagline?'<section class="shelf-ds wide"><h4>ひとこと</h4><p class="shelf-lead">'+esc(b.tagline)+'</p></section>':'')+
    (b.when?'<section class="shelf-ds"><h4>こんな時に</h4>'+li(b.when)+'</section>':'')+
    (b.teachings?'<section class="shelf-ds"><h4>考え方の柱</h4>'+li(b.teachings)+'</section>':'')+
    (b.sample?'<section class="shelf-ds wide"><h4>話し方の例</h4><p class="shelf-sc">場面：「'+esc(b.sample.scene)+'」</p><blockquote>'+esc(b.sample.reply)+'</blockquote><p class="shelf-note mu">※例です。実際の返答は、会話の内容で変わります。'+(ch.length?'このコーチは、ベースから少し調整されています。':'')+'</p></section>':'')+
    (b.caution?'<section class="shelf-ds"><h4>向かない場面</h4>'+li(b.caution)+'</section>':'')+
    (b.action?'<section class="shelf-ds"><h4>今日の一手の例</h4><p>'+esc(b.action)+'</p></section>':'')+
    '<section class="shelf-ds wide"><h4>使ってきた記録 <small class="mu">アプリが数えた事実</small></h4><p class="shelf-li">'+
      '最後に使った日：'+esc(relDay(c.lastUsed))+'　／　会話した日数：'+days+'日　／　Lv.'+lvOf(c)+'</p>'+
      (ch.length?'<p class="shelf-li">ベースからの変更：'+ch.map(esc).join('　')+'</p>':'')+
      (lg.length?lg.map(x=>'<p class="shelf-li"><span class="mono">'+esc(relDay(x.t))+'</span> '+esc(x.summary)+'</p>').join(''):'')+'</section>'+
  '</div>'+(b.credit?'<p class="shelf-note mu">'+esc(b.credit)+'。'+esc(COACH_DISCLAIMER)+'</p>':'');
}
function shelfPaintPanel(){
  const p=$('shelfPanel');if(!p)return;
  const dt=$('shelfDetail');if(dt){const h=shelfDetailHTML();dt.innerHTML=h;dt.hidden=!h;}
  p.innerHTML=shelfPanelHTML();
  p.style.animation='none';void p.offsetHeight;p.style.animation='';   // 選び直すたびに、ふわっと出し直す
  p.classList.toggle('is-new',shelfSel===SHELF_NEW);
  const go=$('shelfCreate');if(go)go.onclick=shelfCreate;
  const use=$('shelfUse');if(use)use.onclick=()=>shelfActivate(shelfSel);
  const gr=$('shelfGrow');if(gr)gr.onclick=()=>openCoachBuild(shelfSel);
  const mo=$('shelfMore');if(mo)mo.onclick=()=>openCharMenu(shelfSel);
}
function shelfCreate(){shelfSel=null;labIdx=null;labScreen='base';renderLab();window.scrollTo(0,0);}
function shelfGo(i){
  const it=shelfItems();i=Math.max(0,Math.min(it.length-1,i));
  if(it[i]===shelfSel){shelfLayout(0);return;}
  shelfSel=it[i];shelfLayout(0);shelfPaintPanel();
}
function shelfActivate(id){
  if(!charById(id)||id===chars.active)return;
  activateChar(id);shelfSel=id;shelfFlash=id;
  renderChars();toast(charById(id).name+'に切り替えました');
}
function shelfStageHTML(){
  const it=shelfItems(),k=shelfIdx();
  const chevL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  const chevR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  return '<section class="shelf" id="shelfWin"><div class="shelf-stage">'+
    '<div class="lb3-wrap shelf-wrap" id="shelfWrap" tabindex="0" role="region" aria-roledescription="carousel" aria-label="コーチの棚。左右にスワイプ、または矢印キーで選ぶ">'+
      '<div class="lb3-vig"></div><div class="shelf-beam"></div><div class="lb3-floor"></div><div class="lb3-floorglow"></div>'+
      '<div class="lb3-scene shelf-scene">'+it.map((id,i)=>shelfBookHTML(id,i)).join('')+'</div>'+
      '<button class="lb3-arrow lb3-l" id="shelfPrev" aria-label="前のコーチ">'+chevL+'</button><button class="lb3-arrow lb3-r" id="shelfNext" aria-label="次のコーチ">'+chevR+'</button>'+
      '<div class="shelf-dots" id="shelfDots">'+it.map((id,i)=>'<button data-sd="'+i+'" class="'+(i===k?'on':'')+(id===SHELF_NEW?' new':id===chars.active?' use':'')+'" aria-label="'+(id===SHELF_NEW?'新しいコーチ':esc(charById(id).name))+'"></button>').join('')+'</div>'+
    '</div>'+
    '<aside class="shelf-panel" id="shelfPanel" aria-live="polite"></aside>'+
  '</div><section class="shelf-detail" id="shelfDetail" aria-label="コーチのくわしい説明" aria-live="polite" hidden></section></section>';
}
function shelfBind(){
  const wrap=$('shelfWrap');if(!wrap)return;
  shelfLayout(0);shelfPaintPanel();
  if(shelfFlash){const el=wrap.querySelector('.shelf-item[data-id="'+shelfFlash+'"]');if(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),900);}shelfFlash=null;}
  $('shelfPrev').onclick=()=>shelfGo(shelfIdx()-1);
  $('shelfNext').onclick=()=>shelfGo(shelfIdx()+1);
  wrap.querySelectorAll('[data-sd]').forEach(b=>b.onclick=()=>shelfGo(+b.dataset.sd));
  let down=false,sx=0,dx=0,hit=null;
  wrap.onpointerdown=e=>{if(e.target.closest('button'))return;down=true;sx=e.clientX;dx=0;hit=e.target.closest('.shelf-item');try{wrap.setPointerCapture(e.pointerId);}catch(err){}};
  wrap.onpointermove=e=>{if(!down)return;dx=e.clientX-sx;if(Math.abs(dx)>3){wrap.classList.add('dragging');shelfLayout(dx*.6);}};
  const end=e=>{
    if(!down)return;down=false;wrap.classList.remove('dragging');
    try{wrap.releasePointerCapture(e.pointerId);}catch(err){}
    if(Math.abs(dx)>56)shelfGo(shelfIdx()+(dx>0?-1:1));
    else{shelfLayout(0);
      if(Math.abs(dx)<10&&hit){const i=+hit.dataset.si;
        if(i!==shelfIdx())shelfGo(i);
        else if(hit.dataset.id===SHELF_NEW)shelfCreate();
        else{const p=$('shelfPanel');if(p&&window.innerWidth<1000&&p.scrollIntoView)p.scrollIntoView({behavior:'smooth',block:'start'});}}}
    dx=0;hit=null;
  };
  wrap.onpointerup=end;wrap.onpointercancel=end;
  wrap.onkeydown=e=>{
    if(e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();shelfGo(shelfIdx()-1);}
    if(e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();shelfGo(shelfIdx()+1);}
    if(e.key==='Enter'){e.preventDefault();if(shelfSel===SHELF_NEW)shelfCreate();else if(shelfSel!==chars.active)shelfActivate(shelfSel);}
  };
  if(!shelfKeyBound){
    shelfKeyBound=true;
    document.addEventListener('keydown',e=>{
      if(activeAppTab!=='settings'||labScreen!=='chars'||!$('shelfWrap'))return;
      const t=e.target&&e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT'||!$('sheet').classList.contains('hide'))return;
      if(e.target===$('shelfWrap'))return;
      if(e.key==='ArrowLeft')shelfGo(shelfIdx()-1);else if(e.key==='ArrowRight')shelfGo(shelfIdx()+1);
    });
    let mob=window.innerWidth<640;
    window.addEventListener('resize',()=>{const m=window.innerWidth<640;if(m!==mob){mob=m;if(activeAppTab==='settings'&&labScreen==='chars')renderChars();}});
  }
}
function renderChars(){
  if(!charById(shelfSel)&&shelfSel!==SHELF_NEW)shelfSel=chars.active;
  labIdx=Math.max(0,COACH_ORDER.indexOf(activeChar().base));
  $('vLab').innerHTML='<div class="chx"><div class="chx-hd"><div class="chx-k mono">MY COACHES</div><h1>誰に見てもらう？</h1><p>あなたのコーチを棚に並べています。左右に送って選び、右端の白紙の本から新しいコーチを作れます。</p></div>'+
    shelfStageHTML()+
    coachControlsHTML()+'<div id="growBanSel">'+growBannerHTML()+'</div>'+handoffSectionHTML()+'</div>'+coachDiscHTML();
  coachBindControls();
  bindGrowBanner($('growBanSel'));
  shelfBind();
  bindHandoff();
}
function openCharMenu(id){
  const c=charById(id);if(!c)return;
  const last=chars.list.length<=1;
  $('sheetBody').innerHTML='<div class="chx-sh"><div class="lb">'+esc(c.name)+'（ベース：'+esc(COACH_BOOKS[c.base].coach)+'）</div>'+
    '<button class="wide p" id="chBuild">鍛える（コーチビルド）</button>'+
    '<div class="lb">名前を変える</div><div class="row"><input id="chName" value="'+esc(c.name)+'" maxlength="24" aria-label="新しい名前"><button class="p" id="chRen" style="flex:0 0 76px;height:42px">変更</button></div>'+
    '<button class="wide" id="chDup">複製する</button><button class="wide" id="chHist">履歴（前の設定に戻す）</button>'+ 
    (last?'<div class="mu" style="margin-top:10px;font-size:11.5px">最後の1人は削除できません。</div>':'<button class="wide danger" id="chDel">削除する</button>')+
    '<button class="wide" id="chClose">閉じる</button></div>';
  $('sheet').classList.remove('hide');
  const ren=()=>{if(renameChar(id,$('chName').value.trim()))toast('名前を変えました');closeSheet();renderLab();};
  $('chHist').onclick=()=>coachHistory(id);
  $('chBuild').onclick=()=>{closeSheet();openCoachBuild(id);};
  $('chRen').onclick=ren;$('chName').onkeydown=e=>{if(e.key==='Enter')ren();};
  $('chDup').onclick=()=>{dupChar(id);closeSheet();renderLab();};
  $('chClose').onclick=closeSheet;
  if($('chDel')) $('chDel').onclick=()=>{
    const b=$('chDel');
    if(!b.dataset.sure){b.dataset.sure='1';b.textContent='本当に「'+c.name+'」を削除する';return;}
    deleteChar(id);closeSheet();if(buildChar===id)labScreen='chars';renderLab();
  };
}
function openCoachBuild(charId,tab){
  if(!charById(charId)) return;
  if(buildChar!==charId){cmp=null;}
  buildChar=charId;labScreen='build';if(tab)buildTab=tab;
  if(activeAppTab!=='settings') showView('settings'); else renderLab();
  window.scrollTo(0,0);
}

/* ---- ベースを選ぶ（3Dの本のカルーセル） ---- */
function renderBasePicker(){
  const g=labDims();labMob=g.mob;
  if(labIdx===null){const i=COACH_ORDER.indexOf(labCurrentBooks()[0]);labIdx=i<0?0:i;}
  const chevL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  const chevR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  $('vLab').innerHTML='<button class="chx-back" id="labBack">← コーチの棚へ</button><div class="lb3">'+
    '<div class="lb3-hd cm-hd" style="padding-top:14px"><div class="lb3-kick mono">NEW COACH / BASE SELECT</div><h1>ベースを選ぶ</h1><p>名著の考え方をもとにした4人から、新しいコーチの土台を選びます。名前や性格はあとで育てられます。</p><div class="lb3-rule"></div></div>'+
    '<div id="recBox" class="rc" aria-live="polite"></div>'+
    '<section><div class="lb3-win"><div class="lb3-ttl" id="labTitle" aria-live="polite"></div><div class="lb3-wrap" id="labWrap" tabindex="0" role="region" aria-roledescription="carousel" aria-label="ベースを選ぶ。左右にスワイプ、または矢印キーで切り替え">'+
      '<div class="lb3-vig"></div><div class="lb3-floor"></div><div class="lb3-floorglow"></div>'+
      '<div class="lb3-scene">'+COACH_ORDER.map((id,i)=>labBookHTML(id,i)).join('')+'</div>'+
      '<button class="lb3-arrow lb3-l" id="labPrev" aria-label="前へ">'+chevL+'</button><button class="lb3-arrow lb3-r" id="labNext" aria-label="次へ">'+chevR+'</button>'+
      '<div class="lb3-hint"><i></i><span class="mono">DRAG / SWIPE</span><i></i></div>'+
    '</div>'+
    '</div><div class="lb3-dots-wrap"><div class="lb3-dots" id="labDots"></div></div></section>'+
    '<section class="lb3-detail" id="labDetail"></section>'+
    coachDiscHTML()+
    '<div class="lb3-end"><span class="mono">© MEICHO COACH — BASE SELECT</span><span class="mono">PERSPECTIVE 1200</span></div>'+
  '</div>';
  $('labBack').onclick=()=>{labScreen='chars';renderLab();};
  labLayout(0);labDots();labDetail();renderRecBox();
  $('labPrev').onclick=()=>labGo(labIdx-1);
  $('labNext').onclick=()=>labGo(labIdx+1);
  const wrap=$('labWrap');
  let down=false,sx=0,dx=0,hit=null;
  wrap.onpointerdown=e=>{
    if(e.target.closest('button'))return;
    down=true;sx=e.clientX;dx=0;hit=e.target.closest('.lb3-item');
    try{wrap.setPointerCapture(e.pointerId);}catch(err){}
  };
  wrap.onpointermove=e=>{
    if(!down)return;dx=e.clientX-sx;
    if(Math.abs(dx)>3){wrap.classList.add('dragging');labLayout(dx*.6);}
  };
  const end=e=>{
    if(!down)return;down=false;
    wrap.classList.remove('dragging');
    try{wrap.releasePointerCapture(e.pointerId);}catch(err){}
    if(Math.abs(dx)>56){labGo(labIdx+(dx>0?-1:1));}
    else{
      labLayout(0);
      if(Math.abs(dx)<10&&hit){const i=+hit.dataset.i;if(i===labIdx)labScrollDetail();else labGo(i);}
    }
    dx=0;hit=null;
  };
  wrap.onpointerup=end;wrap.onpointercancel=end;
  wrap.onkeydown=e=>{if(e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();labGo(labIdx-1);}if(e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();labGo(labIdx+1);}};
  if(!labKeyBound){
    labKeyBound=true;
    document.addEventListener('keydown',e=>{
      if(activeAppTab!=='settings'||labScreen!=='base'||!$('vLab')||$('vLab').classList.contains('hide'))return;
      const t=e.target&&e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT')return;
      if(e.key==='ArrowLeft')labGo(labIdx-1);else if(e.key==='ArrowRight')labGo(labIdx+1);
    });
    window.addEventListener('resize',()=>{if(activeAppTab==='settings'&&labScreen==='base'&&labMob!==(window.innerWidth<640))renderLab();});
  }
}

/* ===== v19: コーチビルド（聞き比べ／話して作る／設計図）＋ 記録から育つ ===== */
async function buildApi(body){
  const r=await fetch(API('/api/build'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({pass:appPass},body))});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.error) throw new Error(j.error||('HTTP '+r.status));
  return j;
}
function specForApi(c){
  return {name:c.name,base:c.base,baseName:COACH_BOOKS[c.base].coach,spec:c.spec,prefs:c.prefs,
    locks:LOCK_KEYS.filter(k=>c.locks[k]),concepts:COACH_MODULES[c.base].concepts.map(k=>({k:k.k,name:k.name}))};
}
function memoForRecorder(){   // v28: 目標・期限・本人の発言だけ
  const g=selfCur('goal'),dl=selfCur('deadline');
  return {goal:g?g.value:mem.memo.goal,deadline:dl?dl.value:mem.memo.deadline,prefs:[],patterns:[],notes:selfStatements().slice(-6).map(f=>f.value)};
}
function memoExcerpt(){   // v28: 本人の事実だけ（解釈は渡さない）
  const o=[],g=selfCur('goal'),dl=selfCur('deadline');
  if(g)o.push('目標：'+g.value);
  if(dl)o.push('期限：'+dl.value);
  selfStatements().slice(-4).forEach(f=>o.push('本人の発言：'+f.value));
  return o.join('\n').slice(0,500);
}

/* ---- 場面（聞き比べのお題）とオフライン用の例文 ---- */
const SCENES=[
 {id:'nomot',t:'今日は全然やる気が出ない',re:/続かな|やる気|気分|だる/,
  a:{text:'やる気は後から来ます。まず問題集を開くだけ。タイマー5分、今押してください。',diff:'指示先行・短め',axes:{ask:1,length:2,warmth:2}},
  b:{text:'やる気が出ない日は誰にでもあります。何がいちばん重く感じていますか？そこから一緒にほどきましょう。',diff:'受け止め先行・問い',axes:{ask:4,length:3,warmth:4}}},
 {id:'broken',t:'予定が崩れて1問もできなかった',re:/崩れ|予定|計画/,
  a:{text:'崩れた原因を一つだけ特定しましょう。今日の残り時間で1問だけ解けますか。できるなら今から10分です。',diff:'事実確認・辛口',axes:{strict:4,logic:4,warmth:2}},
  b:{text:'予定が崩れる日もあります。責める必要はありません。明日の最初の5分だけ、いま決めておきましょう。',diff:'やさしく切り替え',axes:{strict:2,logic:2,warmth:4}}},
 {id:'streak',t:'3日連続でできた',re:/続|習慣/,
  a:{text:'3日連続、良い流れです。今日も同じ大きさで続けてください。',diff:'淡々・短く',axes:{length:1,warmth:2,humor:1,ask:2}},
  b:{text:'3日連続、すごいです！流れができてきましたね。何が効いていると思いますか？',diff:'ほめる・問い',axes:{length:3,warmth:5,humor:3,ask:4}}},
 {id:'which',t:'何から手をつけるか迷う',re:/迷|多すぎ|抱え/,
  a:{text:'迷ったら、締切が一番近いものから。今日はそれだけ。他は明日以降に回しましょう。',diff:'即決・指示',axes:{ask:1,length:2}},
  b:{text:'候補を全部挙げると、いくつありますか？その中で、今週ひとつだけ勝つならどれでしょう。',diff:'問いで絞る',axes:{ask:5,length:3}}},
 {id:'panic',t:'試験まで1か月で焦っている',re:/試験|焦|期限|合格|か月/,
  a:{text:'残り30日です。1日あたりの量に割ると現実的な範囲が見えます。まず過去問を1回分解いて、弱い分野を数字で出しましょう。',diff:'数字で計画',axes:{logic:5,length:4,warmth:2}},
  b:{text:'焦るのは本気の証拠です。今日は1つだけ、確実にできることをやりましょう。',diff:'気持ちを落ち着ける',axes:{logic:2,length:2,warmth:4}}},
 {id:'short',t:'今日は30分しか取れない',re:/時間がな|忙し|仕事/,
  a:{text:'30分で十分です。1単元だけ、今から始めてください。',diff:'一言で指示',axes:{length:1,ask:1}},
  b:{text:'30分なら、最初の5分で前回の復習、20分で新しい1単元、最後の5分で次にやることのメモ。この配分がおすすめです。',diff:'段取りを説明',axes:{length:4,ask:2,logic:4}}},
 {id:'skip',t:'3日サボってしまった',re:/続かな|サボ|さぼ/,
  a:{text:'3日空きました。事実として受け止めて、今日は必ず10分やりましょう。言い訳より行動です。',diff:'厳しめ・事実',axes:{strict:5,warmth:2,ask:1}},
  b:{text:'戻ってきてくれただけで十分です。何があって離れていましたか？再開は小さくで大丈夫です。',diff:'やさしく・問い',axes:{strict:2,warmth:4,ask:4}}},
 {id:'phone',t:'スマホを見てしまって進まない',re:/スマホ|集中|動画/,
  a:{text:'スマホを別の部屋に置いてください。それからタイマー15分。話はそのあとです。',diff:'指示・辛口',axes:{ask:1,strict:4,humor:1}},
  b:{text:'スマホ、強敵ですよね。どんな時に手が伸びやすいですか？そこに一つ仕掛けを作りましょう。',diff:'問い・ユーモア',axes:{ask:4,strict:2,humor:4}}},
 {id:'tired',t:'仕事で疲れて頭が回らない',re:/疲|仕事|しんど/,
  a:{text:'今日は休むのも作戦です。5分だけ教材を眺めたら、それで合格にしましょう。',diff:'休ませる',axes:{warmth:5,strict:1}},
  b:{text:'疲れていても、5分の復習ならできます。頭を使わない暗記から始めてください。',diff:'最低限は求める',axes:{warmth:2,strict:4}}},
 {id:'toomany',t:'やることが多すぎて手が止まっている',re:/多すぎ|抱え|広げ/,
  a:{text:'今週やらないものを2つ決めましょう。残った1つだけに今日の時間を全部使います。',diff:'絞らせる・指示',axes:{ask:1,strict:4,length:2}},
  b:{text:'全部大事に見えますよね。もし今週ひとつしかできないとしたら、どれを選びますか？',diff:'問いで気づかせる',axes:{ask:4,strict:2,length:2}}},
 {id:'wrong',t:'模試の点数が思ったより低かった',re:/点|模試|試験/,
  a:{text:'点数より中身です。間違えた問題を分野別に数えると、次にやることがはっきりします。まず数えてみましょう。',diff:'分析・論理',axes:{logic:5,warmth:2,ask:2}},
  b:{text:'悔しいですね。でも本番前に分かったのは良いことです。いま一番気になっているのはどこですか？',diff:'受け止め・問い',axes:{logic:2,warmth:4,ask:4}}},
 {id:'morning',t:'朝、今日の一手を決めたい',re:/朝/,
  a:{text:'今日の一手：問題集を2ページ。以上です。',diff:'一言',axes:{length:1,ask:1,warmth:1}},
  b:{text:'おはようございます。今日いちばん大事なことは何でしょう。それを5分でできる大きさにしてから始めましょう。',diff:'ていねい・問い',axes:{length:3,ask:4,warmth:3}}}
];
function pickScenes(n){
  const lines=[];for(let i=1;i<=7;i++){const l=dayLine(dayStr(i));if(l)lines.push(l);}
  const hay=selfFacts().map(f=>f.value).concat(lines).join(' ');
  let nots=0,dones=0;for(let i=1;i<=7;i++){const r=recs[dayStr(i)];if(r&&r.result==='not')nots++;if(r&&r.result==='done')dones++;}
  const seen=L('cmpSeen',[]);
  const sc=SCENES.map(s=>({s,v:(s.re.test(hay)?2:0)+(nots>=2&&/broken|skip/.test(s.id)?1.5:0)+(dones>=3&&s.id==='streak'?1.5:0)-(seen.includes(s.id)?1.5:0)+Math.random()*1.2}));
  const out=sc.sort((a,b)=>b.v-a.v).slice(0,n).map(x=>x.s);
  S('cmpSeen',out.map(s=>s.id));
  return out;
}
const AX_KEYS=AXES.map(a=>a[0]);
function cleanAx(o){const r={};if(o&&typeof o==='object')AX_KEYS.forEach(k=>{const n=Math.round(+o[k]);if(n>=1&&n<=5)r[k]=n;});return r;}
function normPair(j){
  const side=x=>x&&typeof x==='object'&&typeof x.text==='string'&&x.text.trim()?{text:cut(x.text,400),diff:cut(x.diff||'',20),axes:cleanAx(x.axes)}:null;
  const a=side(j&&j.a),b=side(j&&j.b);
  if(!a||!b||unsafeText(a.text)||unsafeText(b.text)) return null;
  return {a,b,axis:AX_KEYS.includes(j.axis)?j.axis:'',note:cut(j.note||'',80)};
}
const tplPair=sc=>({a:clone(sc.a),b:clone(sc.b),axis:'',offline:true});

/* ---- 傾向（オフラインの学習にも、学習中の表示にも使う） ---- */
const TEND_TXT={strict:['やわらかく言ってほしい','遠慮なく言ってほしい'],warmth:['気持ちより用件を先に言ってほしい','指示より先に、一度受け止めてほしい'],
  ask:['やることをはっきり指示してほしい','答えより問いで考えさせてほしい'],length:['短く言い切ってほしい','理由まで説明してほしい'],
  logic:['気持ちに寄り添ってほしい','数字と理由で話してほしい'],humor:['まじめに話してほしい','少し笑える一言がほしい']};
const NONE_REASONS=[['長すぎる','length',-1],['短すぎる','length',1],['きつすぎる','strict',-1],['やさしすぎる','strict',1],['質問はいらない','ask',-1],['もっと具体的に','ask',-1],['もっと寄り添って','warmth',1],['まじめすぎる','humor',1]];
function tendScores(picks){
  const s={};AX_KEYS.forEach(k=>s[k]=0);
  picks.forEach(p=>{
    if(p.choice==='a'||p.choice==='b'){
      const ch=p[p.choice].axes||{},ot=p[p.choice==='a'?'b':'a'].axes||{};
      AX_KEYS.forEach(k=>{if(ch[k]==null&&ot[k]==null)return;const d=(ch[k]||3)-(ot[k]||3);if(d)s[k]+=Math.sign(d);});
    } else {
      NONE_REASONS.forEach(([w,k,d])=>{if((p.reason||'').indexOf(w)>=0)s[k]+=d;});
      kwAxes(p.reason||'').forEach(([k,d])=>s[k]+=d);
    }
  });
  return s;
}
function topTend(picks){
  const s=tendScores(picks);let best=null;
  AX_KEYS.forEach(k=>{if(s[k]&&(!best||Math.abs(s[k])>Math.abs(s[best])))best=k;});
  return best?{k:best,d:Math.sign(s[best]),n:Math.abs(s[best])}:null;
}
function ruleLearn(picks,c){
  const s=tendScores(picks),changes=[],prefs=[];
  AX_KEYS.filter(k=>Math.abs(s[k])>=2).sort((a,b)=>Math.abs(s[b])-Math.abs(s[a])).slice(0,3).forEach(k=>{
    const d=Math.sign(s[k]);changes.push({field:'axes.'+k,to:c.spec.axes[k]+d,why:'5問中、'+(d>0?AXES.find(a=>a[0]===k)[3]:AXES.find(a=>a[0]===k)[2])+'寄りの返事を選んだ'});
    if(prefs.length<2) prefs.push(TEND_TXT[k][d>0?1:0]);
  });
  prefs.forEach(p=>changes.push({field:'prefs',op:'add',to:p,why:'聞き比べの選び方から'}));
  return {changes,summary:prefs.length?prefs.join('・'):''};
}

/* ---- オフラインの「話して作る」：言葉からルールで変更案を作る ---- */
function kwAxes(t){
  const o=[],R=(re,k,d)=>{if(re.test(t))o.push([k,d]);};
  R(/厳しく|きびしく|辛口|スパルタ|甘やかさ|ビシッ|容赦なく/,'strict',1);R(/やさしく|優しく|甘め|ゆるく|厳しすぎ|きつい|きつすぎ|怖い/,'strict',-1);
  R(/短く|簡潔|手短|長い|長すぎ|一言で|ひとことで|端的/,'length',-1);R(/詳しく|くわしく|丁寧に説明|理由も|じっくり/,'length',1);
  R(/問い|質問を?多|考えさせ/,'ask',1);R(/指示|はっきり言|答えを(言|教)|質問は?いらな|質問(しないで|はなし)/,'ask',-1);
  R(/あたたか|温か|寄り添|共感|受け止め/,'warmth',1);R(/淡々|ドライ|クール/,'warmth',-1);
  R(/論理|数字|データ|根拠/,'logic',1);R(/気持ちを|感情を|気持ち重視/,'logic',-1);
  R(/ユーモア|面白|冗談|笑わせ/,'humor',1);R(/まじめに|真面目に|ふざけない/,'humor',-1);
  return o;
}
function ruleTalk(text,c){
  let t=String(text||'');const ch=[],a=c.spec.axes;
  const add=(field,to,why)=>ch.push({field,op:'add',to,why});
  let m;
  if((m=t.match(/(朝|夜|昼|日中)は?(一言|ひとこと|1文|一文|短く)/))){add('rules',m[1]+'は1文まで','「'+m[0]+'」');t=t.replace(m[0],'');}
  else if((m=t.match(/(朝|夜|昼|日中)は([^。、,.！!]{2,16})/))){add('rules',m[0],'言われたとおり');t=t.replace(m[0],'');}
  if((m=t.match(/ルール[:：]\s*([^。\n]{2,40})/))){add('rules',m[1].trim(),'言われたとおり');t=t.replace(m[0],'');}
  if((m=t.match(/人格(を|の)?否定(は|を)?(なし|しない|しないで|NG|禁止|やめて)/))){add('avoid','人格を否定しない','言われたとおり');t=t.replace(m[0],'');}
  if((m=t.match(/「([^」]{1,20})」(って|と|が)?(口ぐせ|口癖|言って)/))){add('catchphrases',m[1],'言われたとおり');t=t.replace(m[0],'');}
  if((m=t.match(/([^\s、。「」]{1,12}?)(って|と)呼んで/))){ch.push({field:'tone.callName',to:m[1],why:'言われたとおり'});t=t.replace(m[0],'');}
  const ROLES=[[/参謀/,'参謀風（〜すべきです）',1],[/軍師/,'軍師風（静かに一手先を読む）',0],[/師匠|師範|先生/,'師範風（落ち着いて諭す）',0],[/相棒|友達|友だち/,'相棒風（気さくに）',0],[/執事/,'執事風（丁寧に仕える）',0],[/鬼軍曹|軍曹/,'鬼軍曹風（短く命令口調）',1]];
  ROLES.forEach(([re,v,st])=>{if(re.test(t)&&!ch.some(x=>x.field==='tone.style')){ch.push({field:'tone.style',to:v,why:'「'+t.match(re)[0]+'」っぽく'});if(st)ch.push({field:'axes.strict',to:Math.min(5,a.strict+1),why:'参謀らしく言い切る'});}});
  if(/関西弁|大阪弁/.test(t))ch.push({field:'tone.style',to:'関西弁',why:'言われたとおり'});
  else if(/博多弁/.test(t))ch.push({field:'tone.style',to:'博多弁',why:'言われたとおり'});
  if(/タメ口|ため口|常体|フランクに|敬語(は)?(なし|やめ|いらない)/.test(t))ch.push({field:'tone.polite',to:'plain',why:'言われたとおり'});
  else if(/敬語|丁寧語|です・?ます/.test(t))ch.push({field:'tone.polite',to:'keigo',why:'言われたとおり'});
  kwAxes(t).forEach(([k,d])=>{if(!ch.some(x=>x.field==='axes.'+k))ch.push({field:'axes.'+k,to:(/一言|ひとこと/.test(t)&&k==='length'&&d<0)?1:a[k]+d,why:'言われたとおり'});});
  return {reply:ch.length?'こう変えます。よければ［反映］を。':'うまく読み取れませんでした（オフラインでは分かる言葉が限られています）。「厳しく」「短く」「問い多め」「関西弁で」「参謀っぽく」「朝は一言でいい」のように伝えてください。',changes:ch};
}

/* ---- 画面の外枠 ---- */
const BT=[['cmp','聞き比べ','どっちが刺さる？'],['talk','話して作る','話して作る'],['plan','設計図','設計図']];
function renderBuild(){
  const c=charById(buildChar),B=COACH_BOOKS[c.base],on=c.id===chars.active;
  paintBodyMode();
  $('vLab').innerHTML='<div class="cb" style="--c:'+B.color+'">'+
    '<div class="cb-top"><button class="chx-back" id="labBack">← コーチ一覧</button>'+(on?'<span class="cb-act">使用中</span>':'<button class="cb-use" id="cbUse">このコーチを使う</button>')+'</div>'+
    '<div class="cb-hd"><div class="cb-k mono">COACH BUILD · '+esc(c.name)+' <b>Lv.'+lvOf(c)+'</b></div><h1 id="cbH1">'+BT.find(x=>x[0]===buildTab)[2]+'</h1>'+
      '<div class="cb-xp"><i style="width:'+Math.max(3,lvPct(c))+'%"></i></div><div class="cb-xpt">'+(lvOf(c)>=LEVEL_MAX?'最大レベル':'次のLvまで '+xpToNext(c)+'XP')+'</div></div>'+
    '<div class="cb-tabs" role="tablist">'+BT.map(([k,lb])=>'<button role="tab" data-bt="'+k+'" class="'+(k===buildTab?'on':'')+'" aria-selected="'+(k===buildTab)+'">'+lb+'</button>').join('')+'</div>'+
    '<div id="cbBody"></div></div>';
  $('labBack').onclick=()=>{labScreen='chars';renderLab();window.scrollTo(0,0);};
  if($('cbUse')) $('cbUse').onclick=()=>{activateChar(c.id);renderBuild();};
  $('vLab').querySelectorAll('[data-bt]').forEach(b=>b.onclick=()=>{buildTab=b.dataset.bt;renderBuild();window.scrollTo(0,0);});
  paintBuildBody();
}
function paintBuildHead(){   // XP・レベルだけ更新（入力中の欄を壊さない）
  const c=charById(buildChar);if(!c||!$('cbH1'))return;
  const k=document.querySelector('.cb-k');if(k)k.innerHTML='COACH BUILD · '+esc(c.name)+' <b>Lv.'+lvOf(c)+'</b>';
  const i=document.querySelector('.cb-xp i');if(i)i.style.width=Math.max(3,lvPct(c))+'%';
  const t=document.querySelector('.cb-xpt');if(t)t.textContent=lvOf(c)>=LEVEL_MAX?'最大レベル':'次のLvまで '+xpToNext(c)+'XP';
}
function paintBuildBody(){
  if(!$('cbBody'))return;
  if(buildTab==='cmp') paintCmp(); else if(buildTab==='talk') paintTalk(); else paintPlan();
}
const buildVisible=t=>activeAppTab==='settings'&&labScreen==='build'&&buildTab===t&&!!$('cbBody');

/* ---- 変更案カード（聞き比べ・話して作るで共通） ---- */
function diffRows(c,p){
  const row=ch=>{
    const lb=FIELD_DEF[ch.field].lb;let v;
    if(ch.op==='add') v='<b>＋ '+esc(ch.field==='on'?conceptName(ch.to,c.base):ch.to)+'</b>';
    else if(ch.op==='remove') v='<s>− '+esc(ch.field==='on'?conceptName(ch.to,c.base):ch.to)+'</s>';
    else v='<i>'+esc(cut(valTxt(ch.field,ch.from,c),26))+'</i> → <b>'+esc(cut(valTxt(ch.field,ch.to,c),40))+'</b>';
    return '<div class="kv"><span>'+lb+'</span><em>'+v+(ch.why?'<small>'+esc(ch.why)+'</small>':'')+'</em></div>';
  };
  return p.ok.map(row).join('')+
    p.locked.map(x=>'<div class="kv lk"><span>🔒 '+FIELD_DEF[x.field].lb+'</span><em>ロック中なので変えません</em></div>').join('')+
    p.rejected.map(x=>'<div class="kv ng"><span>⚠ '+FIELD_DEF[x.field].lb+'</span><em>「'+esc(cut(x.text,30))+'」は安全のため入れません</em></div>').join('');
}
function diffCardHTML(c,p,id,who){
  if(p.state==='applied') return '<div class="cb-card cb-done">✓ 反映しました'+(p.xp?'（+'+p.xp+'XP）':'')+'　<button class="lnk" data-dundo="'+id+'">取り消す</button></div>';
  if(p.state==='undone') return '<div class="cb-card cb-done mu">取り消しました</div>';
  if(p.state==='cancel') return '<div class="cb-card cb-done mu">やめました</div>';
  const pv=p.preview;
  return '<div class="cb-card cb-diff" data-dc="'+id+'"><div class="t"><span>変更案</span><span class="who">'+esc(who||'ビルダーAI')+'</span></div>'+
    (p.ok.length?diffRows(c,p):diffRows(c,p)+'<div class="mu" style="font-size:12px;padding:4px 0">変える所はありません。</div>')+
    (pv?'<div class="cb-pv">'+(pv.loading?'<span class="rx-typing"><i></i><i></i><i></i></span> 試しに話しています…':'<b>試しに：「'+esc(pv.scene)+'」と言われたら</b>'+esc(pv.text))+'</div>':'')+
    (p.ok.length?'<div class="btns"><button data-dno="'+id+'">やめる</button><button class="p" data-dyes="'+id+'">反映</button></div>'+
      (pv&&!pv.loading?'':'<button class="cb-try" data-dtry="'+id+'">▷ 反映する前に、試しに話してみる</button>'):
      '<div class="btns"><button data-dno="'+id+'">閉じる</button></div>')+
  '</div>';
}
function tempChar(c,list){const t=clone(c);list.forEach(ch=>applyOne(t,ch));t.spec=specNorm(t.spec,t.base);return t;}
async function previewProp(c,p,repaint){
  const t=tempChar(c,p.ok),sc=SCENES[Math.floor(Math.random()*SCENES.length)];
  p.preview={loading:true,scene:sc.t};repaint();
  let text='';
  if(online){try{const j=await buildApi(Object.assign({op:'preview',scene:sc.t,persona:buildPrompt(t,{preview:true})},specForApi(t)));text=cut(j.text||'',400);}catch(e){text='';}}
  if(!text){   // オフライン：例文のうち、新しい性格に近い方
    const dist=x=>AX_KEYS.reduce((s,k)=>s+(x.axes[k]==null?0:Math.abs(x.axes[k]-t.spec.axes[k])),0);
    text=(dist(sc.a)<=dist(sc.b)?sc.a:sc.b).text;
  }
  p.preview={scene:sc.t,text};repaint();
}

/* ---- ② 聞き比べ ---- */
let cmp=null;   // {cid,scenes,i,pairs,picks,sel,none,reason,phase:'pick'|'learning'|'diff',prop}
const ROUND=5;
function cmpStart(c){
  cmp={cid:c.id,scenes:pickScenes(ROUND),i:0,pairs:[],picks:[],sel:null,none:false,reason:'',phase:'pick',prop:null};
  cmpLoad(0);cmpLoad(1);
}
async function cmpLoad(i){
  const my=cmp;if(!my||i>=ROUND||my.pairs[i])return;
  const c=charById(my.cid),sc=my.scenes[i];
  my.pairs[i]={loading:true};
  let p=null;
  if(online){try{p=normPair(await buildApi(Object.assign({op:'compare',scene:sc.t,memo:memoExcerpt(),persona:buildPrompt(c,{preview:true})},specForApi(c))));}catch(e){p=null;}}
  if(!p) p=tplPair(sc);
  if(cmp!==my) return;
  my.pairs[i]=p;
  if(i===my.i&&buildVisible('cmp')) paintCmp();
}
function learnHint(){
  const n=cmp.picks.length,rest=ROUND-n,t=topTend(cmp.picks);
  if(!t||t.n<1) return '🧠 ビルダーが学習中：<br>選ぶたびに、あなたに刺さる話し方を探します。'+ROUND+'問で設計図に反映します。';
  return '🧠 ビルダーが学習中：<br>「'+TEND_TXT[t.k][t.d>0?1:0]+'」傾向。'+(rest>0?'あと'+rest+'問で反映します。':'');
}
function paintCmp(){
  const c=charById(buildChar),box=$('cbBody');if(!c||!box)return;
  if(!cmp||cmp.cid!==c.id) cmpStart(c);
  const R=cmp,n=R.picks.length;
  const prog='<div class="cb-prog">'+Array.from({length:ROUND},(_,i)=>'<i class="'+(i<n?'d':i===n&&R.phase==='pick'?'n':'')+'"></i>').join('')+'<span>'+Math.min(n+(R.phase==='pick'?1:0),ROUND)+'/'+ROUND+'</span></div>';
  if(R.phase==='learning'){
    box.innerHTML=prog+'<div class="cb-card cb-wait"><span class="rx-typing"><i></i><i></i><i></i></span> 5つの選び方から、設計図の変更案を作っています…</div>';return;
  }
  if(R.phase==='diff'){
    const p=R.prop,who=p.offline?'ルールで学習（オフライン）':'ビルダーAI';
    box.innerHTML=prog+
      '<div class="learn">🧠 学習結果：'+esc(p.summary||'はっきりした傾向はまだ出ていません')+'</div>'+
      (p.ok.length||p.locked.length||p.rejected.length||p.state?diffCardHTML(c,p,'cmp',who):'<div class="cb-card"><div class="mu" style="font-size:12.5px;line-height:1.7">今回は、設計図を変えるほどの傾向は出ませんでした。もう1ラウンドやると、はっきりしてきます。</div><div class="btns" style="margin-top:10px"><button class="p" data-cmpok>OK（+10XP）</button></div></div>')+
      '<div class="btns" style="margin-top:12px"><button data-again>もう1ラウンド</button><button data-toplan>設計図を見る</button></div>';
    bindDiff(box,c,{cmp:R.prop},()=>paintCmp(),{src:'compare',xp:10});
    if(box.querySelector('[data-cmpok]')) box.querySelector('[data-cmpok]').onclick=()=>{R.prop.state='applied';R.prop.xp=10;pushLog(c,{src:'compare',summary:'聞き比べ：傾向を確認（変更なし）'});addXp(c,10,'聞き比べ');paintBuildHead();paintCmp();};
    box.querySelector('[data-again]').onclick=()=>{cmpStart(c);paintCmp();};
    box.querySelector('[data-toplan]').onclick=()=>{buildTab='plan';renderBuild();window.scrollTo(0,0);};
    return;
  }
  const sc=R.scenes[R.i],pr=R.pairs[R.i];
  const opt=(k,o)=>'<button class="opt'+(R.sel===k?' pick':'')+'" data-opt="'+k+'" aria-pressed="'+(R.sel===k)+'"><span class="l">'+k.toUpperCase()+(R.sel===k?' ✓':'')+'</span>'+esc(o.text)+(o.diff?'<small>'+esc(o.diff)+'</small>':'')+'</button>';
  let mid;
  if(!pr||pr.loading) mid='<div class="opt sk"><span class="l">A</span><span class="rx-typing"><i></i><i></i><i></i></span> 2通りの返事を書いています…</div><div class="opt sk"><span class="l">B</span>&nbsp;</div>';
  else mid=opt('a',pr.a)+opt('b',pr.b);
  const none=R.none?'<div class="cb-card cb-none"><div class="t"><span>どこが違う？（任意・ひとことでOK）</span></div><div class="rx-chips">'+
      NONE_REASONS.map(x=>x[0]).map(w=>'<button data-nr="'+esc(w)+'" class="'+(R.reason.indexOf(w)>=0?'sel':'')+'">'+esc(w)+'</button>').join('')+'</div>'+
      '<input id="cmpWhy" placeholder="例：もっと具体的な数字がほしい" value="'+esc(R.reason)+'" autocomplete="off" aria-label="どっちも違う理由">'+
      '<div class="btns" style="margin-top:10px"><button data-nback>戻る</button><button class="p" data-ngo>次へ →</button></div></div>':'';
  box.innerHTML=prog+
    '<div class="scene">場面：<b>「'+esc(sc.t)+'」</b>と言われたら'+(pr&&pr.offline?'<em>例文</em>':'')+'</div>'+
    '<div class="cb-opts">'+mid+'</div>'+
    (R.none?none:'<div class="btns"><button data-none'+(pr&&!pr.loading?'':' disabled')+'>どっちも違う</button><button class="p" data-go'+(R.sel?'':' disabled')+'>'+(R.sel?R.sel.toUpperCase()+' にする →':'A か B をタップ')+'</button></div>')+
    '<div class="learn">'+learnHint()+'</div>';
  box.querySelectorAll('[data-opt]').forEach(b=>b.onclick=()=>{R.sel=b.dataset.opt;R.none=false;paintCmp();});
  const go=box.querySelector('[data-go]');if(go) go.onclick=()=>cmpCommit(R.sel);
  const nb=box.querySelector('[data-none]');if(nb) nb.onclick=()=>{R.none=true;R.sel=null;paintCmp();};
  if(R.none){
    box.querySelectorAll('[data-nr]').forEach(b=>b.onclick=()=>{const w=b.dataset.nr;R.reason=R.reason.indexOf(w)>=0?R.reason.replace(w,'').replace(/^[、\s]+|[、\s]+$/g,'').replace(/、{2,}/g,'、'):(R.reason?R.reason+'、':'')+w;paintCmp();});
    $('cmpWhy').oninput=e=>{R.reason=e.target.value;};
    $('cmpWhy').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)cmpCommit('none');};
    box.querySelector('[data-nback]').onclick=()=>{R.none=false;paintCmp();};
    box.querySelector('[data-ngo]').onclick=()=>cmpCommit('none');
  }
}
function cmpCommit(choice){
  const R=cmp,pr=R.pairs[R.i];if(!pr||pr.loading||!choice)return;
  R.picks.push({scene:R.scenes[R.i].t,a:pr.a,b:pr.b,choice,reason:choice==='none'?cut(R.reason,60):''});
  R.i++;R.sel=null;R.none=false;R.reason='';
  if(R.i<ROUND){cmpLoad(R.i);cmpLoad(R.i+1);paintCmp();window.scrollTo(0,0);return;}
  cmpFinish();
}
async function cmpFinish(){
  const R=cmp,c=charById(R.cid);R.phase='learning';paintCmp();
  let res=null,offline=false;
  if(online){try{const j=await buildApi(Object.assign({op:'learn',picks:R.picks,memo:memoExcerpt()},specForApi(c)));
    res={changes:(Array.isArray(j.changes)?j.changes:[]).concat((Array.isArray(j.prefs)?j.prefs:[]).map(p=>({field:'prefs',op:'add',to:p,why:'聞き比べの選び方から'}))),summary:cut(j.summary||'',60),rejected:j.rejected};}catch(e){res=null;}}
  if(!res){res=ruleLearn(R.picks,c);offline=true;}
  const p=prepChanges(res.changes,c,res.rejected);
  p.summary=res.summary||(p.ok.length?p.ok.map(chgShort).join('、'):'');p.offline=offline;
  if(cmp!==R) return;
  R.prop=p;R.phase='diff';
  if(buildVisible('cmp')) paintCmp();
}
/* 反映／やめる／取り消す／試しに話す */
function bindDiff(box,c,props,repaint,o){
  box.querySelectorAll('[data-dyes]').forEach(b=>b.onclick=()=>{
    const p=props[b.dataset.dyes];if(!p||!p.ok.length)return;
    const e=applyChanges(c,p.ok,{src:o.src,summary:p.summary||p.ok.map(chgShort).join('、'),xp:o.xp,why:LOG_SRC[o.src]});
    p.state='applied';p.xp=o.xp;p.logT=e.t;toast('反映しました（+'+o.xp+'XP）');paintBuildHead();repaint();
  });
  box.querySelectorAll('[data-dno]').forEach(b=>b.onclick=()=>{const p=props[b.dataset.dno];if(p){p.state='cancel';repaint();}});
  box.querySelectorAll('[data-dundo]').forEach(b=>b.onclick=()=>{const p=props[b.dataset.dundo];if(p&&p.logT&&restoreLog(c,p.logT)){p.state='undone';toast('元に戻しました');repaint();}});
  box.querySelectorAll('[data-dtry]').forEach(b=>b.onclick=()=>{const p=props[b.dataset.dtry];if(p)previewProp(c,p,repaint);});
}

/* ---- ③ 話して作る ---- */
const talks={};   // charId → {hist:[{role:'me'|'ai',text,prop}],busy}
const TALK_CHIPS=['もっと短く','厳しめに','やさしく','問いを多めに','参謀っぽく','関西弁で','朝は一言でいい','人格否定はなし'];
function talkOf(c){return talks[c.id]||(talks[c.id]={hist:[],busy:false});}
function paintTalk(){
  const c=charById(buildChar),box=$('cbBody');if(!c||!box)return;
  const T=talkOf(c);
  const props={};
  const thread=T.hist.map((m,i)=>{
    if(m.role==='me') return '<div class="cb-me">'+esc(m.text)+'</div>';
    let h='<div class="cb-ai">'+esc(m.text)+'</div>';
    if(m.prop){props['t'+i]=m.prop;h+=diffCardHTML(c,m.prop,'t'+i,m.prop.offline?'ルール（オフライン）':'ビルダーAI');}
    return h;
  }).join('');
  box.innerHTML='<div class="cb-thread" id="cbThread">'+
    '<div class="cb-ai">どんなコーチにしたいですか？ひとことで大丈夫です。設計図への変更案にして見せます。<br><span class="mu">例：「もっと参謀っぽく。でも人格否定はなし。朝は一言でいい」</span></div>'+
    thread+(T.busy?'<div class="rx-typing"><i></i><i></i><i></i></div>':'')+'</div>'+
    renderTalkLog(c)+
    '<div class="cb-inp"><div><div class="cb-chips">'+TALK_CHIPS.map(w=>'<button data-tc="'+esc(w)+'">'+esc(w)+'</button>').join('')+'</div>'+
      '<div class="cb-row"><input id="cbIn" placeholder="どんなコーチにしたい？" autocomplete="off" aria-label="どんなコーチにしたいか"><button class="p" id="cbSend" aria-label="送る">↑</button></div></div></div>';
  bindDiff(box,c,props,()=>paintTalk(),{src:'talk',xp:5});
  box.querySelectorAll('[data-tc]').forEach(b=>b.onclick=()=>{const i=$('cbIn');i.value=i.value?i.value.replace(/[。\s]*$/,'')+'。'+b.dataset.tc:b.dataset.tc;i.focus();});
  $('cbSend').onclick=()=>talkSend();
  $('cbIn').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)talkSend();};
  box.querySelectorAll('[data-lgr]').forEach(b=>b.onclick=()=>logRestore(c,+b.dataset.lgr,()=>paintTalk()));
}
function renderTalkLog(c){
  const L5=c.log.slice().reverse().filter(x=>x.src!=='level').slice(0,3);
  return '<div class="cb-card cb-log"><div class="t"><span>育成ログ</span><button class="lnk" data-golog>すべて見る</button></div>'+
    (L5.length?L5.map(logLineHTML).join(''):'<div class="mu">まだありません</div>')+'</div>';
}
async function talkSend(){
  const c=charById(buildChar),inp=$('cbIn'),text=(inp&&inp.value||'').trim();if(!c||!text)return;
  const T=talkOf(c);if(T.busy)return;
  const hist=T.hist.slice(-6).map(m=>({role:m.role,text:m.text}));
  T.hist.push({role:'me',text});T.busy=true;inp.value='';paintTalk();scrollTalk();
  let res=null,offline=false;
  if(online){try{const j=await buildApi(Object.assign({op:'talk',message:text,history:hist},specForApi(c)));
    res={reply:cut(j.reply||'',240)||'こう変えます。',changes:(Array.isArray(j.changes)?j.changes:[]).concat((Array.isArray(j.prefs)?j.prefs:[]).map(p=>({field:'prefs',op:'add',to:p}))),rejected:j.rejected};}catch(e){res=null;}}
  if(!res){res=ruleTalk(text,c);offline=true;}
  const p=prepChanges(res.changes,c,res.rejected);p.offline=offline;p.summary=p.ok.map(chgShort).join('、');
  T.busy=false;
  T.hist.push({role:'ai',text:res.reply,prop:(p.ok.length||p.locked.length||p.rejected.length)?p:null});
  if(buildVisible('talk')){paintTalk();scrollTalk();}
}
function scrollTalk(){const t=$('cbThread');if(t&&t.lastElementChild&&t.lastElementChild.scrollIntoView)t.lastElementChild.scrollIntoView({block:'center'});}

/* ---- 設計図 ---- */
function radarSVG(c){
  const a=c.spec.axes,col=COACH_BOOKS[c.base].color,cx=160,cy=128,R=88;
  const pt=(i,v)=>{const ang=(-90+60*i)*Math.PI/180;return [cx+Math.cos(ang)*R*v/5,cy+Math.sin(ang)*R*v/5];};
  const poly=v=>AX_KEYS.map((k,i)=>pt(i,typeof v==='number'?v:v[k]).map(n=>n.toFixed(1)).join(',')).join(' ');
  let g='';for(let l=1;l<=5;l++)g+='<polygon points="'+poly(l)+'" fill="none" stroke="#1d3a52" stroke-width="'+(l===5?1.2:.7)+'"/>';
  AX_KEYS.forEach((k,i)=>{const [x,y]=pt(i,5);g+='<line x1="'+cx+'" y1="'+cy+'" x2="'+x.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="#1d3a52" stroke-width=".7"/>';});
  const lab=AX_KEYS.map((k,i)=>{const [x,y]=pt(i,6.35);const anc=Math.abs(x-cx)<4?'middle':x>cx?'start':'end';
    return '<g class="rd-l" data-rax="'+k+'" role="button" tabindex="0" aria-label="'+AXIS_SHORT[k]+'を調整"><rect x="'+(x-(anc==='end'?62:anc==='middle'?31:0)).toFixed(1)+'" y="'+(y-14).toFixed(1)+'" width="62" height="26" fill="transparent"/>'+
      '<text x="'+x.toFixed(1)+'" y="'+(y+4).toFixed(1)+'" text-anchor="'+anc+'">'+AXIS_SHORT[k]+' <tspan>'+a[k]+'</tspan></text></g>';}).join('');
  const dots=AX_KEYS.map((k,i)=>{const [x,y]=pt(i,a[k]);return '<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="3.2" fill="'+col+'"/>';}).join('');
  return '<svg class="cb-radar" viewBox="-28 0 376 256" role="img" aria-label="性格の6軸レーダー">'+g+
    '<polygon points="'+poly(a)+'" fill="'+col+'" fill-opacity=".22" stroke="'+col+'" stroke-width="2" stroke-linejoin="round"/>'+dots+lab+'</svg>';
}
let planEdit=null, planAx=null, nameSug=null;
const SPEC_ROWS=[['role','役割','role'],['view','見立て','view'],['tone','口調','tone'],['callName','呼び方','tone.callName'],['catchphrases','口ぐせ','catchphrases'],['rules','ルール','rules'],
  ['avoid','やらないこと','avoid'],['questions','問いの型','questions'],['action','一手の出し方','action'],['on','使う考え方','on'],['prefs','学んだ好み','prefs']];
function lockBtn(c,k){const on=!!c.locks[k];return '<button class="lk'+(on?' on':'')+'" data-lock="'+k+'" aria-pressed="'+on+'" title="ロックするとAIはこの項目を変えません">'+(on?'🔒 ロック中':'🔓')+'</button>';}
function specValHTML(c,key,f){
  const sp=c.spec;
  if(key==='tone') return '<span class="pill">'+POLITE_WORD[sp.tone.polite]+'</span>'+(sp.tone.style?esc(sp.tone.style):'<span class="mu">ふつう</span>');
  if(key==='on') return '<div class="sp-chips">'+COACH_MODULES[c.base].concepts.map(k=>'<button data-con="'+k.k+'" class="'+(sp.on.includes(k.k)?'on':'')+'" aria-pressed="'+sp.on.includes(k.k)+'">'+esc(k.name.replace(/（.*$/,''))+'</button>').join('')+'</div>';
  const v=getF(c,f);
  if(Array.isArray(v)) return v.length?'<ul>'+v.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>':'<span class="mu">'+(key==='prefs'?'聞き比べや記録から自動で増えます':key==='rules'?'例：朝は1文まで':'なし')+'</span>';
  return v?esc(v):'<span class="mu">'+(key==='callName'?'あなた':'なし')+'</span>';
}
function paintPlan(){
  const c=charById(buildChar),box=$('cbBody');if(!c||!box)return;
  const a=c.spec.axes,last=chars.list.length<=1;
  const axRows=AXES.map(([k,lb,lo,hi])=>'<div class="ax-row'+(planAx===k?' hl':'')+'" id="axr_'+k+'"><span class="ax-l">'+lb+'</span>'+
    '<button data-axm="'+k+'" aria-label="'+lb+'を下げる"'+(a[k]<=1||c.locks.axes?' disabled':'')+'>−</button>'+
    '<span class="ax-d" aria-label="'+a[k]+' / 5">'+[1,2,3,4,5].map(n=>'<i class="'+(n<=a[k]?'on':'')+'"></i>').join('')+'</span>'+
    '<button data-axp="'+k+'" aria-label="'+lb+'を上げる"'+(a[k]>=5||c.locks.axes?' disabled':'')+'>＋</button><span class="ax-w">'+esc(AXIS_WORD[k][a[k]])+'</span></div>').join('');
  const rows=SPEC_ROWS.map(([key,lb,f])=>{
    const ed=planEdit===key;
    let val;
    if(ed){
      if(key==='tone') val='<div class="seg" style="margin-bottom:8px"><button data-pol="keigo" class="'+(c.spec.tone.polite==='keigo'?'on':'')+'">敬語</button><button data-pol="plain" class="'+(c.spec.tone.polite==='plain'?'on':'')+'">常体（タメ口）</button></div><input id="spIn" maxlength="60" value="'+esc(c.spec.tone.style)+'" placeholder="例：参謀風（〜すべきです）／関西弁">';
      else if(FIELD_DEF[f].t==='arr') val='<textarea id="spIn" rows="4" placeholder="1行に1つ">'+esc(getF(c,f).join('\n'))+'</textarea><div class="mu" style="font-size:11px;margin-top:4px">1行に1つ。最大'+FIELD_DEF[f].n+'つ。</div>';
      else if(key==='callName') val='<input id="spIn" maxlength="20" value="'+esc(c.spec.tone.callName)+'" placeholder="例：〇〇さん（空なら「あなた」）">';
      else val='<textarea id="spIn" rows="3">'+esc(getF(c,f))+'</textarea>';
      val+='<div class="btns" style="margin-top:8px"><button data-spx>やめる</button><button class="p" data-spok="'+key+'">保存</button></div>';
    } else val='<div class="sp-v'+(key==='on'?' nochg':'')+'" '+(key==='on'?'':'data-sped="'+key+'" role="button" tabindex="0" aria-label="'+lb+'を編集"')+'>'+specValHTML(c,key,f)+'</div>';
    return '<div class="sp-row'+(c.locks[key]?' locked':'')+'"><div class="sp-h"><span>'+lb+'</span>'+lockBtn(c,key)+'</div>'+val+'</div>';
  }).join('');
  const logs=c.log.slice().reverse();
  box.innerHTML=
    '<div class="cb-card"><div class="t"><span>性格（6軸）</span>'+lockBtn(c,'axes')+'</div>'+radarSVG(c)+
      '<div class="ax-rows">'+axRows+'</div><div class="mu" style="font-size:11px;margin-top:6px">ラベルか −／＋ をタップで手直しできます。</div></div>'+
    '<div class="cb-card cb-spec"><div class="t"><span>設計図</span><span class="mu" style="letter-spacing:0">タップで直す・🔓でロック</span></div>'+rows+'</div>'+
    '<div class="cb-card cb-log" id="cbLogAll"><div class="t"><span>育成ログ</span><span class="mu" style="letter-spacing:0">'+logs.length+'件</span></div>'+
      (logs.length?logs.map(logLineHTML).join(''):'<div class="mu">まだありません</div>')+'</div>'+
    '<div class="cb-card cb-acts"><div class="t"><span>このコーチ</span></div>'+
      '<div class="cb-row"><input id="cbName" maxlength="24" value="'+esc(c.name)+'" aria-label="名前"><button class="p" id="cbRen">名前を変える</button></div>'+
      '<button class="lnk" id="cbNameAI" style="margin-top:8px">✨ 名前の候補を3つ出してもらう</button>'+
      (nameSug&&nameSug.cid===c.id?'<div class="rx-chips" style="margin-top:8px">'+(nameSug.loading?'<span class="mu">考えています…</span>':nameSug.list.map(n=>'<button data-nm="'+esc(n)+'">'+esc(n)+'</button>').join(''))+'</div>':'')+
      '<div class="btns" style="margin-top:12px"><button id="cbDup">複製する</button>'+(last?'<button disabled title="最後の1人は削除できません">削除（最後の1人）</button>':'<button class="danger" id="cbDel">削除する</button>')+'</div>'+
      '<details class="cb-pr"><summary>このコーチのプロンプトを見る</summary><pre id="cmPre"></pre><button class="cm-copy" id="cmCopy">コピー</button></details></div>'+
    coachDiscHTML();
  $('cmPre').textContent=buildPrompt(c);$('cmCopy').onclick=copyPrompt;
  const rp=()=>paintPlan();
  const nudge=(k,d)=>{if(c.locks.axes){toast('性格はロック中です');return;}const n=Math.max(1,Math.min(5,c.spec.axes[k]+d));if(n===c.spec.axes[k])return;manualChange(c,{field:'axes.'+k,op:'set',from:c.spec.axes[k],to:n});planAx=k;rp();};
  box.querySelectorAll('[data-axm]').forEach(b=>b.onclick=()=>nudge(b.dataset.axm,-1));
  box.querySelectorAll('[data-axp]').forEach(b=>b.onclick=()=>nudge(b.dataset.axp,1));
  box.querySelectorAll('[data-rax]').forEach(g=>{const f=()=>{planAx=g.dataset.rax;rp();const r=$('axr_'+planAx);if(r&&r.scrollIntoView)r.scrollIntoView({block:'center',behavior:'smooth'});};g.onclick=f;g.onkeydown=e=>{if(e.key==='Enter')f();};});
  box.querySelectorAll('[data-lock]').forEach(b=>b.onclick=()=>{const k=b.dataset.lock;if(c.locks[k])delete c.locks[k];else c.locks[k]=true;saveChars();toast(c.locks[k]?'ロックしました（AIはここを変えません）':'ロックを外しました');rp();});
  box.querySelectorAll('[data-sped]').forEach(el=>{const f=()=>{planEdit=el.dataset.sped;rp();const i=$('spIn');if(i)i.focus();};el.onclick=f;el.onkeydown=e=>{if(e.key==='Enter')f();};});
  box.querySelectorAll('[data-pol]').forEach(b=>b.onclick=()=>{if(c.spec.tone.polite!==b.dataset.pol){manualChange(c,{field:'tone.polite',op:'set',from:c.spec.tone.polite,to:b.dataset.pol});}rp();});
  box.querySelectorAll('[data-con]').forEach(b=>b.onclick=()=>{const k=b.dataset.con,on=c.spec.on.includes(k);
    if(on&&c.spec.on.length<=1){toast('1つは残してください');return;}
    manualChange(c,{field:'on',op:on?'remove':'add',to:k});rp();});
  const sx=box.querySelector('[data-spx]');if(sx) sx.onclick=()=>{planEdit=null;rp();};
  const so=box.querySelector('[data-spok]');if(so) so.onclick=()=>{
    const key=so.dataset.spok,f=SPEC_ROWS.find(r=>r[0]===key)[2],fld=key==='tone'?'tone.style':f,D=FIELD_DEF[fld],raw=$('spIn').value;
    const x=D.t==='arr'?{field:fld,to:raw.split('\n').map(s=>s.trim()).filter(Boolean)}:{field:fld,to:raw.trim()};
    const was=c.locks[lockKeyOf(fld)];if(was)delete c.locks[lockKeyOf(fld)];   // 自分で直す時はロック中でも直せる
    const r=normChange(x,c);if(was)c.locks[lockKeyOf(fld)]=true;
    if(r&&r.rejected){toast('安全のため、その内容は入れられません');return;}
    if(r&&!r.locked) manualChange(c,r);
    planEdit=null;rp();};
  box.querySelectorAll('[data-lgr]').forEach(b=>b.onclick=()=>logRestore(c,+b.dataset.lgr,rp));
  $('cbRen').onclick=()=>{if(renameChar(c.id,$('cbName').value.trim())){toast('名前を変えました');renderBuild();}};
  $('cbName').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)$('cbRen').click();};
  $('cbNameAI').onclick=()=>suggestNames(c);
  box.querySelectorAll('[data-nm]').forEach(b=>b.onclick=()=>{$('cbName').value=b.dataset.nm;$('cbRen').click();});
  $('cbDup').onclick=()=>{const d=dupChar(c.id);if(d)openCoachBuild(d.id,'plan');};
  if($('cbDel')) $('cbDel').onclick=()=>{
    const b=$('cbDel');
    if(!b.dataset.sure){b.dataset.sure='1';b.textContent='本当に削除する';return;}
    if(deleteChar(c.id)){labScreen='chars';renderLab();}
  };
}
let manualLast=null;   // 続けて手で直した時は、ログを1件にまとめる
function manualChange(c,ch){
  const now=Date.now(),e=c.log[c.log.length-1];
  if(manualLast&&manualLast.cid===c.id&&e&&e.t===manualLast.t&&e.src==='manual'&&now-manualLast.at<120000&&e.before){
    applyOne(c,ch);c.spec=specNorm(c.spec,c.base);c.prefs=strArr(c.prefs,[],10,80);
    e.after.push({field:ch.field,op:ch.op,from:ch.from,to:ch.to});e.summary=cut(e.after.map(chgShort).join('、'),140);
    manualLast.at=now;saveChars();updateCoachContext();return;
  }
  const x=applyChanges(c,[ch],{src:'manual',summary:chgShort(ch)});
  manualLast={cid:c.id,t:x.t,at:now};
}
function logLineHTML(x){
  const d=new Date(x.t);
  return '<div class="lg"><div><i>'+(d.getMonth()+1)+'/'+d.getDate()+'</i><em class="s-'+x.src+'">'+LOG_SRC[x.src]+'</em><span>'+esc(x.summary)+'</span></div>'+
    (x.before?'<button class="lnk" data-lgr="'+x.t+'">↺ この時点に戻す</button>':'')+'</div>';
}
function logRestore(c,t,repaint){
  const e=c.log.find(x=>x.t===t);if(!e)return;
  if(!confirm('「'+cut(e.summary,40)+'」の前の状態に戻しますか？\n（戻したこともログに残り、あとでやり直せます）'))return;
  if(restoreLog(c,t)){toast('戻しました');repaint();}
}
async function suggestNames(c){
  nameSug={cid:c.id,loading:true,list:[]};paintPlan();
  let list=[];
  if(online){try{const j=await buildApi(Object.assign({op:'name'},specForApi(c)));list=(Array.isArray(j.names)?j.names:[]).map(s=>cut(s,16)).filter(s=>s&&!unsafeText(s)).slice(0,3);}catch(e){}}
  if(!list.length){const a=c.spec.axes,t=new Date().getHours()<11?'朝の':'夜の';
    list=[(a.strict>=4?'辛口の':'やさしい')+(a.logic>=4?'参謀':'師範'),t+(a.ask>=4?'問いかけ役':'指揮官'),(a.length<=2?'一言':'じっくり')+(a.warmth>=4?'伴走者':'軍師')];}
  nameSug={cid:c.id,list};if(buildVisible('plan'))paintPlan();
}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-golog]');if(b){buildTab='plan';renderBuild();setTimeout(()=>{const l=$('cbLogAll');if(l&&l.scrollIntoView)l.scrollIntoView({block:'start'});},30);}});

/* ---- ④ 記録から育つ（週に1回・自動で反映・いつでも戻せる） ---- */
function growStats(){
  const rows=[];
  for(let i=1;i<=28;i++){const d=dayStr(i),r=recs[d];if(!r||r.result==='pending')continue;
    const ai=(chats[d]||[]).filter(m=>m.role==='ai').map(m=>m.text.length);
    rows.push({done:r.result==='done',len:ai.length?ai.reduce((x,y)=>x+y,0)/ai.length:null});}
  const rate=a=>a.length?Math.round(a.filter(x=>x.done).length/a.length*100):null;
  const wl=rows.filter(r=>r.len!=null),longs=wl.filter(r=>r.len>=200),shorts=wl.filter(r=>r.len<200);
  return {days:rows.length,doneRate:rate(rows),longReplyDays:longs.length,longDoneRate:rate(longs),shortReplyDays:shorts.length,shortDoneRate:rate(shorts)};
}
async function maybeGrow(){   // v28: 材料はアプリが事実から作った1行と週の集計。反映は自動、通知は出さない（育成ログから戻せる）
  if(!online) return;
  const c=activeChar(),now=Date.now(),since=c.lastGrow||c.createdAt;
  if(now-since<7*864e5) return;
  if(c.growTry&&now-c.growTry<864e5) return;
  const sinceD=ymd(new Date(since)),days=[];
  for(let i=28;i>=1;i--){const d=dayStr(i);if(d>=sinceD&&dyRecOf(d))days.push(d);}
  if(days.length<3) return;
  c.growTry=now;saveChars(false);
  const lines=days.slice(-14).map(d=>mdw(d)+' '+dayLine(d));
  const cur=mondayOf(today()),weeks=[];
  for(let k=4;k>=1;k--){const ws=addDays(cur,-7*k),l=weekLine(ws);if(l)weeks.push(ws.slice(5).replace('-','/')+'週：'+l);}
  let j;
  try{j=await buildApi(Object.assign({op:'grow',memo:memoExcerpt(),days:lines,weeks,stats:growStats()},specForApi(c)));}catch(e){return;}
  const p=prepChanges((Array.isArray(j.changes)?j.changes:[]).concat((Array.isArray(j.prefs)?j.prefs:[]).map(x=>({field:'prefs',op:'add',to:x}))),c,j.rejected);
  c.lastGrow=now;
  if(!p.ok.length){saveChars();return;}
  const why=cut(j.why||'',60),sum=cut(j.summary||p.ok.map(chgShort).join('、'),40)+(why?'（'+why+'）':'');
  applyChanges(c,p.ok,{src:'record',summary:sum,xp:10,why:'記録から育った'});
  c.growNote=null;saveChars();
}
function growBannerHTML(){return '';}   // v28: 「記録から育つ」のバナー・通知は出さない
function bindGrowBanner(){}
function paintGrowBanners(){const c=$('growBanChat');if(c)c.remove();}

function copyPrompt(){
  const t=buildPrompt(labScreen==='build'&&charById(buildChar)||activeChar());
  const fb=()=>{const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
    let ok=false;try{ok=document.execCommand('copy');}catch(e){}ta.remove();toast(ok?'プロンプトをコピーしました':'コピーできませんでした');};
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(()=>toast('プロンプトをコピーしました'),fb);
  else fb();
}
function init(){setupTabs();renderRecCard();showView('today');memBoot();dataBoot();}

