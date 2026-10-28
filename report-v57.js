/* AIコーチ v57 — 振り返りノート（観測報告書）（v61 で v60 に戻した）
   ・日記から開く。期間の台帳（活動のメモ全文・質問・統計アプリの間違い・分野別）を、アプリが並べるだけ（AIは使わない・新しい数字は作らない）
   ・Markdown でコピー／保存。Claude・ChatGPT に「チートシートにして」と頼む文をコピーできる
   ・報告書そのものは保存しない（元の記録が正本。毎回その場で作る） */
let rpOpen=false, rpData=null, rpBusy=false, rpErr='';
const RP_RANGES=[['7','7日'],['30','30日'],['week','今週'],['month','今月'],['custom','指定']];
const RP_TYPES=[['cheat','チートシート'],['qa','一問一答'],['unit','単元まとめ']];
let rpCfg=Object.assign({range:'7',from:'',to:'',kind:'',unit:'',q:'',type:'cheat'},L('rpCfg',{}));
const rpSave=()=>S('rpCfg',rpCfg);

function rpRange(){
  const td=today();let from=addDays(td,-6),to=td;
  if(rpCfg.range==='30') from=addDays(td,-29);
  else if(rpCfg.range==='week'){const w=(new Date(td+'T00:00').getDay()+6)%7;from=addDays(td,-w);}
  else if(rpCfg.range==='month') from=td.slice(0,8)+'01';
  else if(rpCfg.range==='custom'){
    const ok=s=>/^\d{4}-\d\d-\d\d$/.test(s||'');
    to=ok(rpCfg.to)&&rpCfg.to<=td?rpCfg.to:td; from=ok(rpCfg.from)?rpCfg.from:addDays(to,-6);
    if(from>to) from=to; if(addDays(from,92)<=to) from=addDays(to,-92);
  }
  return {from,to};
}
const rpDays=(a,b)=>Math.round((new Date(b+'T00:00')-new Date(a+'T00:00'))/864e5)+1;
const rpMD=d=>(typeof dyMD==='function'?dyMD(d):d.slice(5).replace('-','/'));
const rpShort=d=>(+d.slice(5,7))+'/'+(+d.slice(8,10));
const rpHM=t=>{const x=new Date(t);return t&&!isNaN(x)?p2(x.getHours())+':'+p2(x.getMinutes()):'';};
const rpSrc=s=>(typeof LG_SRC_JP!=='undefined'&&LG_SRC_JP[s])||s||'';
const rpRes=r=>({done:'できた',partial:'少しできた',not:'できなかった',pending:'未定'}[r]||r||'');
const rpIsQ=a=>/質問/.test(a.kind||'');

async function rpLoad(force){
  const {from,to}=rpRange(),key=from+'|'+to;
  if(!force&&rpData&&rpData.key===key&&Date.now()-rpData.at<60000) return;
  if(rpBusy) return; rpBusy=true; rpErr=''; rpRender();
  try{const j=await lgApi({op:'report',from,to});
    if(!Array.isArray(j.days)) throw new Error('old');
    rpData={key,at:Date.now(),from:j.from,to:j.to,days:j.days};}
  catch(e){const m=String(e&&e.message||e);rpErr=(m==='old'||/op は/.test(m))?'Worker が古い版です。worker.js を v61 に更新してください（振り返りノートの読み出しは v57 以降の Worker が必要です）':m;rpData=null;}
  rpBusy=false; if(rpOpen) rpRender();
}

/* 素材を集める（絞り込みはここだけ。数は元の記録から数えるだけ） */
function rpCollect(){
  const out={acts:[],qs:[],miss:[],fields:{},topics:{},uncertain:false,capped:false,units:new Set(),kinds:new Set(),days:0};
  if(!rpData) return out;
  const q=String(rpCfg.q||'').trim().toLowerCase(),unit=rpCfg.unit||'';
  const hit=(...xs)=>{const t=xs.join('\n').toLowerCase();return (!q||t.includes(q))&&(!unit||t.includes(unit.toLowerCase()));};
  for(const day of rpData.days){
    let used=false;
    for(const a of day.activities||[]){
      if(a.status!=='active') continue;
      const k=a.kind||'その他'; out.kinds.add(k);
      if(rpCfg.kind&&k!==rpCfg.kind) continue;
      if(!hit(a.did||'',a.note||'',(a.next||[]).join(' '),k)) continue;
      const x=Object.assign({},a,{date:day.date,kind:k}); (rpIsQ(a)?out.qs:out.acts).push(x); used=true;
    }
    const st=day.study; if(!st){ if(used) out.days++; continue; }
    Object.keys(st.fields||{}).forEach(f=>out.units.add(f)); (st.topics||[]).forEach(t=>t.topic&&out.units.add(t.topic));
    if(rpCfg.kind&&rpCfg.kind!=='演習ログ') { if(used) out.days++; continue; }
    if(st.fieldsStatus==='uncertain') out.uncertain=true;
    if((st.mistakes||[]).length>=20) out.capped=true;
    for(const [f,v] of Object.entries(st.fields||{})){
      if((q||unit)&&!hit(f)) continue;
      const c=out.fields[f]||(out.fields[f]={answered:0,correct:0,days:0}); c.answered+=+v.answered||0; c.correct+=+v.correct||0; c.days++; used=true;
    }
    for(const m of st.mistakes||[]){
      if(!hit(m.topic,m.question,m.mode,m.selected,m.expected)) continue;
      out.miss.push(Object.assign({date:day.date},m)); used=true;
    }
    for(const t of st.topics||[]){
      if((q||unit)&&!hit(t.topic)) continue;
      const c=out.topics[t.topic]||(out.topics[t.topic]={answered:0,incorrect:0}); c.answered+=+t.answered||0; c.incorrect+=+t.incorrect||0;
    }
    if(used) out.days++;
  }
  out.kinds.add('演習ログ');
  return out;
}
function rpMissGroups(c){
  const g={};c.miss.forEach(m=>{const k=m.topic||'（単元なし）';(g[k]||(g[k]=[])).push(m);});
  return Object.entries(g).sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));
}
const rpPct=(c,a)=>a?Math.round(c/a*100):0;

/* ---- Markdown（コピー・保存・AIに渡す素材） ---- */
function rpMarkdown(){
  const c=rpCollect(),{from,to}=rpData||rpRange(),o=[];
  const flt=[rpCfg.kind&&'種類：'+rpCfg.kind,rpCfg.unit&&'分野・単元：'+rpCfg.unit,rpCfg.q&&'キーワード：'+rpCfg.q].filter(Boolean).join('／');
  o.push('# 振り返りノート（'+from+' 〜 '+to+'）','');
  o.push('- 期間：'+from+' 〜 '+to+'（'+rpDays(from,to)+'日間・記録のある日 '+c.days+'日）'+(flt?'\n- 絞り込み：'+flt:''));
  o.push('- 作成：AIコーチ '+APP_VERSION+'。アプリの記録をそのまま並べたもの（AIの要約ではありません）。各項目の［日付］は記録の日です。','');
  const fs=Object.entries(c.fields).sort((a,b)=>rpPct(a[1].correct,a[1].answered)-rpPct(b[1].correct,b[1].answered));
  if(fs.length){
    o.push('## 分野別の正答率（統計アプリ）','','| 分野 | 正答 / 解答 | 正答率 | 日数 |','|---|---|---|---|');
    fs.forEach(([f,v])=>o.push('| '+f+' | '+v.correct+' / '+v.answered+' | '+rpPct(v.correct,v.answered)+'% | '+v.days+' |'));
    if(c.uncertain) o.push('','※ 一部の日は取り込みが重なっていて、分野別の数が「大きい方の値」です。');
    o.push('');
  }
  if(c.acts.length){
    o.push('## 授業・復習のノート','');
    c.acts.forEach(a=>{
      const meta=[rpSrc(a.source),a.minutes?a.minutes+'分':'',rpRes(a.result)].filter(Boolean).join('・');
      o.push('### ［'+a.date+(rpHM(a.occurredAt)?' '+rpHM(a.occurredAt):'')+'］'+a.kind+'｜'+(a.did||'（見出しなし）')+(meta?'（'+meta+'）':''));
      if(a.note) o.push('',String(a.note).trim());
      if(a.next&&a.next.length) o.push('','次にやること：'+a.next.join(' ／ '));
      o.push('');
    });
  }
  if(c.qs.length){
    o.push('## 質問と答え','');
    c.qs.forEach(a=>{o.push('**Q. '+(a.did||'（質問の見出しなし）')+'**　［'+a.date+'・'+rpSrc(a.source)+'］','',a.note?'A. '+String(a.note).trim():'A. （答えの記録なし）','');});
  }
  if(c.miss.length){
    o.push('## 間違えた問題（単元ごと）','');
    rpMissGroups(c).forEach(([t,ms])=>{
      const tp=c.topics[t];
      o.push('### '+t+'（'+ms.length+'件'+(tp&&tp.answered?'／この単元 '+tp.answered+'問中 '+tp.incorrect+'問ミス':'')+'）');
      ms.forEach(m=>o.push('- ［'+m.date+'］'+(m.question||'（問題文なし）')+' — 選んだ：'+(m.selected||'－')+'／正解：'+(m.expected||'－')+(m.mode?'（'+m.mode+'）':'')));
      o.push('');
    });
    if(c.capped) o.push('※ 間違いは1日あたり新しい20件までです。','');
  }
  const kn=(window.Knowledge64&&Knowledge64.cheatNotes)?Knowledge64.cheatNotes(from,to):[];   // v64：学びノートで「チートシートの材料に」した分
  if(kn.length){
    o.push('## 学びノート（チートシートの材料）','');
    kn.forEach(n=>{ o.push('### ［'+n.date+'］'+n.title,'');
      if(n.evidence) o.push('自分の記録：'+String(n.evidence).trim().split('\n').slice(0,6).join(' / '),'');
      o.push((n.origin==='self'?'補足（自分）：':'AIの補足（確認済み）：')+String(n.supplement||'').trim(),'');
      if(n.example) o.push('例：','```',String(n.example).trim(),'```','');
      if(n.caution) o.push('注意点：'+String(n.caution).trim(),'');
      if(n.sources&&n.sources.length) o.push('参照元：'+n.sources.map(x=>x.title+' '+x.url).join(' ／ '),''); });
  }
  if(!fs.length&&!c.acts.length&&!c.qs.length&&!c.miss.length&&!kn.length) o.push('（この期間・条件に当てはまる記録はありません）');
  return o.join('\n').replace(/\n{3,}/g,'\n\n').trim()+'\n';
}
function rpGoal(){try{return ((typeof selfCur==='function'&&selfCur('goal'))||{}).value||mem.memo.goal||cfg.goal||'';}catch(e){return '';}}
function rpPromptText(){
  const md=rpMarkdown(),goal=rpGoal(),{from,to}=rpData||rpRange(),type=rpCfg.type;
  const head={
    cheat:'下の「振り返りノート」は、私が '+from+' 〜 '+to+' に勉強した記録です。これを元に、試験の直前に見返すチートシートを作ってください。',
    qa:'下の「振り返りノート」は、私が '+from+' 〜 '+to+' に勉強した記録です。これを元に、一問一答の問題集を作ってください。',
    unit:'下の「振り返りノート」は、私が '+from+' 〜 '+to+' に勉強した記録です。これを元に、単元ごとのまとめノートを作ってください。'}[type]||'';
  const shape={
    cheat:['構成：①公式・定義 ②間違えやすい点（私の間違いから） ③解決した疑問 ④覚え方のコツ','分量：A4で1〜2枚。表や箇条書きで短く','正答率の低い分野・間違いの多い単元を先に置く'],
    qa:['形式：「問い｜答え｜出どころの日付」の表。30問くらい','私が間違えた問題は、形を変えて必ず入れる','答えは1〜2行で。計算は式も書く'],
    unit:['単元ごとに：要点／公式／私の間違い／関連する質問と答え','単元の順番は、教科書の順番に近い並びで','各単元の終わりに「確認の1問」を付ける']}[type]||[];
  return [head,'',
    '## 決まり',
    ...shape.map(x=>'- '+x),
    '- 各項目に、出どころの日付（例：10/21）を付ける',
    '- 記録に無い内容を補うときは、その部分に【補足】と書く（記録の内容と混ぜない）',
    '- 数字（正答率・問題数）は記録のものを使い、作り変えない',
    '- 最後に「記録だけでは分からなかったこと」を短く挙げる',
    goal?'- 私の目標：'+goal:'',
    '',
    '--- ここから振り返りノート ---','',md].filter((x,i,a)=>x!==''||a[i-1]!=='').join('\n');
}
function rpSaveMd(){
  const md=rpMarkdown(),{from,to}=rpData||rpRange();
  try{const u=URL.createObjectURL(new Blob([md],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='振り返りノート_'+from+'_'+to+'.md';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);toast('保存しました');}
  catch(e){copyOut(md,'振り返りノート（Markdown）','保存できなかったので、コピーで渡します。');}
}

/* ---- 画面 ---- */
function rpLink(d){return '<button class="rp-d mono" data-rpday="'+d+'" aria-label="'+esc(rpMD(d))+'の観測シートを開く">'+esc(rpShort(d))+'</button>';}
function rpBodyHTML(){
  if(rpBusy&&!rpData) return '<p class="mu rp-msg">台帳を読んでいます…</p>';
  if(rpErr) return '<p class="rp-msg warn" id="rpErr">台帳を読めませんでした：'+esc(rpErr)+'<br><span class="mu">振り返りノートはオンラインの時だけ作れます。</span></p><button id="rpRetry">もう一度読む</button>';
  if(!rpData) return '';
  const c=rpCollect(),ans=Object.values(c.fields).reduce((n,v)=>n+v.answered,0),cor=Object.values(c.fields).reduce((n,v)=>n+v.correct,0);
  let h='<p class="rp-sum" id="rpSum" role="status">記録のある日 '+c.days+'日 · ノート '+c.acts.length+'件 · 質問 '+c.qs.length+'件 · 間違い '+c.miss.length+'件'+(ans?' · 解答 '+cor+'/'+ans+'問（'+rpPct(cor,ans)+'%）':'')+'</p>';
  const fs=Object.entries(c.fields).sort((a,b)=>rpPct(a[1].correct,a[1].answered)-rpPct(b[1].correct,b[1].answered));
  if(fs.length) h+='<section class="rp-sec" id="rpFields"><h3><span class="mono">01</span> 分野別の正答率 <small>統計アプリ・期間の合計</small></h3>'+
    fs.map(([f,v])=>{const p=rpPct(v.correct,v.answered);return '<div class="rp-f"><span class="n">'+esc(f)+'</span><span class="rp-bar"><i style="width:'+p+'%"></i></span><span class="v mono">'+p+'%</span><span class="c mono">'+v.correct+'/'+v.answered+'</span></div>';}).join('')+
    (c.uncertain?'<p class="rp-note">※ 一部の日は取り込みが重なっていて、分野別の数が「大きい方の値」です。</p>':'')+'</section>';
  if(c.acts.length) h+='<section class="rp-sec" id="rpNotes"><h3><span class="mono">02</span> 授業・復習のノート <small>'+c.acts.length+'件・メモは全文</small></h3>'+
    c.acts.map(a=>'<article class="rp-a"><div class="rp-ah">'+rpLink(a.date)+(rpHM(a.occurredAt)?'<span class="mono mu">'+rpHM(a.occurredAt)+'</span>':'')+'<span class="rp-k">'+esc(a.kind)+'</span><span class="rp-src s-'+esc(a.source||'other')+'">'+esc(rpSrc(a.source))+'</span>'+(a.minutes?'<span class="mu mono">'+a.minutes+'分</span>':'')+'</div>'+
      '<h4>'+esc(a.did||'（見出しなし）')+'</h4>'+(a.note?'<div class="rp-note-t">'+esc(a.note)+'</div>':'<div class="mu rp-empty">（メモなし）</div>')+
      (a.next&&a.next.length?'<div class="rp-next">次：'+esc(a.next.join(' ／ '))+'</div>':'')+'</article>').join('')+'</section>';
  if(c.qs.length) h+='<section class="rp-sec" id="rpQs"><h3><span class="mono">03</span> 質問と答え <small>'+c.qs.length+'件</small></h3>'+
    c.qs.map(a=>'<article class="rp-qa"><div class="rp-ah">'+rpLink(a.date)+'<span class="rp-src s-'+esc(a.source||'other')+'">'+esc(rpSrc(a.source))+'</span></div><p class="q"><b>Q</b>'+esc(a.did||'（見出しなし）')+'</p><div class="a"><b>A</b><div class="rp-note-t">'+(a.note?esc(a.note):'<span class="mu">（答えの記録なし）</span>')+'</div></div></article>').join('')+'</section>';
  if(c.miss.length) h+='<section class="rp-sec" id="rpMiss"><h3><span class="mono">04</span> 間違えた問題 <small>単元ごと・'+c.miss.length+'件</small></h3>'+
    rpMissGroups(c).map(([t,ms])=>{const tp=c.topics[t];return '<div class="rp-mg"><h4>'+esc(t)+' <small class="mu">'+ms.length+'件'+(tp&&tp.answered?'／'+tp.answered+'問中 '+tp.incorrect+'問ミス':'')+'</small></h4>'+
      ms.map(m=>'<div class="rp-m"><div class="rp-ah">'+rpLink(m.date)+(m.mode?'<span class="mu">'+esc(m.mode)+'</span>':'')+'</div><p>'+esc(m.question||'（問題文なし）')+'</p><div class="rp-ans"><span class="sel">選んだ <b>'+esc(m.selected||'－')+'</b></span><span class="exp">正解 <b>'+esc(m.expected||'－')+'</b></span></div></div>').join('')+'</div>';}).join('')+
    (c.capped?'<p class="rp-note">※ 間違いは1日あたり新しい20件までです。</p>':'')+'</section>';
  if(!fs.length&&!c.acts.length&&!c.qs.length&&!c.miss.length) h+='<p class="mu rp-msg" id="rpEmpty">この期間・条件に当てはまる記録はありません。</p>';
  return h;
}
function rpRender(){
  const w=$('dyWork');if(!w)return;
  const {from,to}=rpRange(),c=rpData?rpCollect():{kinds:new Set(),units:new Set()};
  const kinds=[...c.kinds].sort(),units=[...c.units].sort();
  if(rpCfg.kind&&!kinds.includes(rpCfg.kind))kinds.unshift(rpCfg.kind);
  if(rpCfg.unit&&!units.includes(rpCfg.unit))units.unshift(rpCfg.unit);
  w.innerHTML='<div class="rp" id="rpView"><div class="rp-top"><button class="rp-back" id="rpBack">← 観測シートへ</button></div>'+
    '<div class="ob-head rp-head"><div class="ob-kick">観測報告書 ／ OBSERVATION REPORT</div><div class="ob-row"><h2 class="ob-title">振り返りノート</h2><span class="ob-state past">記録から作成</span></div>'+
    '<div class="ob-meta mono"><span>RANGE '+esc(from)+' → '+esc(to)+'</span><span>'+rpDays(from,to)+' 日間</span></div></div>'+
    '<p class="rp-honest">アプリの記録をそのまま並べたものです（AIの要約ではありません）。取り消した記録は入りません。報告書は保存せず、開くたびに記録から作ります。</p>'+
    '<div class="rp-ctl"><div class="rp-chips" role="group" aria-label="期間">'+RP_RANGES.map(([k,l])=>'<button data-rprange="'+k+'" class="'+(rpCfg.range===k?'on':'')+'" aria-pressed="'+(rpCfg.range===k)+'">'+l+'</button>').join('')+'</div>'+
    (rpCfg.range==='custom'?'<div class="rp-cust"><input type="date" id="rpFrom" value="'+esc(from)+'" max="'+today()+'" aria-label="はじめの日"><span>〜</span><input type="date" id="rpTo" value="'+esc(to)+'" max="'+today()+'" aria-label="おわりの日"></div>':'')+
    '<div class="rp-flt"><select id="rpKind" aria-label="種類"><option value="">種類：すべて</option>'+kinds.map(k=>'<option'+(k===rpCfg.kind?' selected':'')+'>'+esc(k)+'</option>').join('')+'</select>'+
    '<select id="rpUnit" aria-label="分野・単元"><option value="">分野・単元：すべて</option>'+units.map(k=>'<option'+(k===rpCfg.unit?' selected':'')+'>'+esc(k)+'</option>').join('')+'</select>'+
    '<input id="rpQ" type="search" placeholder="キーワード" value="'+esc(rpCfg.q)+'" aria-label="キーワード"></div></div>'+
    '<div id="rpBody">'+rpBodyHTML()+'</div>'+
    (rpData?'<div class="rp-out"><div class="lb">書き出す</div><div class="rp-btns"><button id="rpCopy">Markdownをコピー</button><button id="rpDl">Markdownで保存</button></div>'+
      '<div class="rp-ask"><select id="rpType" aria-label="頼む形">'+RP_TYPES.map(([k,l])=>'<option value="'+k+'"'+(rpCfg.type===k?' selected':'')+'>'+l+'</option>').join('')+'</select><button class="p" id="rpPrompt">AIに頼む文をコピー</button></div>'+
      '<p class="mu rp-note">Claude・ChatGPT に貼ると、この記録を元にまとめてくれます。記録に無い内容は【補足】と書くよう頼んでいます。</p></div>':'')+'</div>';
  rpBind();
}
function rpBind(){
  $('rpBack').onclick=rpClose;
  document.querySelectorAll('[data-rprange]').forEach(b=>b.onclick=()=>{rpCfg.range=b.dataset.rprange;if(rpCfg.range==='custom'&&!rpCfg.from){const r=rpRange();rpCfg.from=r.from;rpCfg.to=r.to;}rpSave();rpRender();rpLoad();});
  const cu=()=>{rpCfg.from=$('rpFrom').value;rpCfg.to=$('rpTo').value;rpSave();rpRender();rpLoad();};
  if($('rpFrom')){$('rpFrom').onchange=cu;$('rpTo').onchange=cu;}
  $('rpKind').onchange=e=>{rpCfg.kind=e.target.value;rpSave();rpRender();};
  $('rpUnit').onchange=e=>{rpCfg.unit=e.target.value;rpSave();rpRender();};
  let tm=0;$('rpQ').oninput=e=>{rpCfg.q=e.target.value;rpSave();clearTimeout(tm);tm=setTimeout(()=>{$('rpBody').innerHTML=rpBodyHTML();rpBindBody();},250);};
  if($('rpCopy')){
    $('rpCopy').onclick=()=>copyOut(rpMarkdown(),'振り返りノート（Markdown）','ノートアプリや Obsidian などに貼れます。');
    $('rpDl').onclick=rpSaveMd;
    $('rpType').onchange=e=>{rpCfg.type=e.target.value;rpSave();};
    $('rpPrompt').onclick=()=>copyOut(rpPromptText(),'AIに頼む文（'+(RP_TYPES.find(x=>x[0]===rpCfg.type)||[,''])[1]+'）','Claude か ChatGPT の新しいチャットに貼ってください。',true);
  }
  rpBindBody();
}
function rpBindBody(){
  if($('rpRetry'))$('rpRetry').onclick=()=>rpLoad(true);
  document.querySelectorAll('#rpBody [data-rpday]').forEach(b=>b.onclick=()=>{rpOpen=false;dySel=b.dataset.rpday;dyEdit=null;dyNoteOpen=false;renderDiary();window.scrollTo(0,0);});
}
function rpOpenView(){rpOpen=true;rpRender();window.scrollTo(0,0);rpLoad();}
function rpClose(){rpOpen=false;renderDiary();window.scrollTo(0,0);}

/* 日記に入口を足す（観測シートの台紙の下）。報告書を開いている間は日記の代わりに報告書を描く */
(function(){
  const head=obHeadHTML;
  obHeadHTML=function(d){return head(d)+'<button class="rp-entry" id="rpEntry"><span class="mono">REPORT</span>振り返りノートを作る<small>期間の授業・質問・間違いをまとめる</small><i aria-hidden="true">›</i></button>';};
  const after=obAfterRender;
  obAfterRender=function(){after();const b=$('rpEntry');if(b)b.onclick=rpOpenView;};
  const rd=renderDiary;
  renderDiary=function(){if(rpOpen&&$('dyWork'))return rpRender();return rd();};
  const sm=setRvMode;
  setRvMode=function(m,save){if(m!=='diary')rpOpen=false;return sm(m,save);};
})();
