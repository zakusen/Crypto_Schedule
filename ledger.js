/* AIコーチ v53 — 学習台帳の閲覧（日記の1日ページに「学習台帳」を出す）。正本は Cloudflare R2（/api/ledger）。ここは見るだけ＋本人の操作（取り消し・訂正の判断） */
const LG_SRC_LB={chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini',ai:'AI',manual:'自分',aicoach:'アプリ',other:'その他'};
let lgCache={}, lgBusy={};
function lgInvalidate(dates){if(!dates){lgCache={};return;}[].concat(dates).forEach(d=>{delete lgCache[d];});}
async function lgApi(body){
  const r=await fetch(API('/api/ledger'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({pass:appPass},body))});
  const j=await r.json().catch(()=>({}));
  if(r.status===404)throw new Error('台帳を使うには Worker を v53 に更新してください');
  if(!r.ok||j.error)throw new Error(j.error||('HTTP '+r.status));
  return j;
}
async function lgLoadDay(d,force){
  if(!force&&lgCache[d]&&Date.now()-lgCache[d].at<60000)return lgCache[d];
  if(lgBusy[d])return lgBusy[d];
  lgBusy[d]=(async()=>{try{const j=await lgApi({op:'day',date:d});lgCache[d]={at:Date.now(),data:j};}catch(e){lgCache[d]={at:Date.now(),error:e.message};}finally{delete lgBusy[d];}return lgCache[d];})();
  return lgBusy[d];
}
const lgAt=t=>{const x=new Date(t);return isNaN(x)?'':(x.getMonth()+1)+'/'+x.getDate()+' '+p2(x.getHours())+':'+p2(x.getMinutes());};
const lgRes=r=>({done:'できた',partial:'少しできた',not:'できなかった',pending:'未定'}[r]||r||'');
function lgActRow(a,maybe){
  const off=a.status!=='active';
  return '<button class="lg-act'+(off?' off':'')+(maybe?' maybe':'')+'" data-lgact="'+esc(a.id)+'"><span class="lg-src s-'+esc(a.source)+'">'+esc(LG_SRC_LB[a.source]||a.source)+'</span>'+
    '<span class="lg-tx"><b>'+(a.kind?'<em>'+esc(a.kind)+'</em>':'')+esc(a.did||'（やったこと未記入）')+'</b>'+
    '<small>'+[a.minutes!=null?a.minutes+'分（自己申告）':'',lgRes(a.result)||a.resultRaw,a.feel?'手ごたえ'+a.feel:'',a.noteLength?'メモ '+a.noteLength.toLocaleString()+'字':'',a.revisions>1?'改訂 '+a.revisions:'',off?(a.status==='retracted'?'取り消し済み':'置き換え済み'):''].filter(Boolean).map(esc).join(' · ')+'</small></span><i>›</i></button>';
}
function lgStudyHTML(s){
  if(!s)return '';
  const rate=s.answered?Math.round(s.correct/s.answered*1000)/10:null;
  const fs=Object.entries(s.fields||{}).sort((a,b)=>b[1].answered-a[1].answered);
  return '<div class="lg-study"><div class="lg-sh"><span class="lg-src s-study">統計アプリ</span><b>解答 '+s.answered+'問・正解 '+s.correct+'問'+(rate!=null?'（'+rate+'%）':'')+'</b></div>'+
    '<small class="mu">取り込み '+s.batches+'回分を解答ごとに合わせています（詳細履歴 '+s.eventCount+'件）'+(s.conflicts?'・同じ解答で中身が違うもの '+s.conflicts+'件':'')+'</small>'+
    (s.fieldsStatus==='uncertain'?'<div class="lg-warn">'+esc((s.notes||[]).join(' ')||'分野別の数ははっきり分けられないため、大きい方の値です')+'</div>':'')+
    (fs.length?'<details class="lg-fd"><summary>分野別（'+fs.length+'分野）</summary>'+fs.map(([n,v])=>'<div class="lg-fr"><span>'+esc(n)+'</span><em class="mono">'+v.correct+'/'+v.answered+'</em></div>').join('')+'</details>':'')+
    ((s.mistakes||[]).length?'<details class="lg-fd"><summary>間違えた問題（'+s.mistakes.length+'）</summary>'+s.mistakes.map(m=>'<div class="lg-mk"><b>'+esc(m.topic||m.mode)+'</b><span>'+esc(m.question)+'</span>'+(m.selected||m.expected?'<small>回答：'+esc(m.selected||'—')+' ／ 正答：'+esc(m.expected||'—')+'</small>':'')+'</div>').join('')+'</details>':'')+'</div>';
}
function lgDayHTML(d,c){
  if(!c)return '<div class="mu lg-wait">台帳を読み込んでいます…</div>';
  if(c.error)return '<div class="mu lg-wait">台帳を読めませんでした：'+esc(c.error)+' <button class="dp-link" data-lgre>もう一度</button></div>';
  const x=c.data,acts=x.activities||[],mb=new Set((x.maybeCorrections||[]).flat());
  if(!acts.length&&!x.study)return '<div class="mu lg-wait">この日の台帳はまだありません。</div>';
  let h='';
  if(acts.length)h+=acts.filter(a=>a.status==='active').map(a=>lgActRow(a,mb.has(a.id))).join('')+
    (acts.some(a=>a.status!=='active')?'<details class="lg-fd"><summary>取り消し・置き換え済み（'+acts.filter(a=>a.status!=='active').length+'）</summary>'+acts.filter(a=>a.status!=='active').map(a=>lgActRow(a,false)).join('')+'</details>':'');
  (x.maybeCorrections||[]).forEach(([p,q])=>{const A=acts.find(a=>a.id===p),B=acts.find(a=>a.id===q);if(!A||!B)return;const [o,n]=String(A.importedAt)<=String(B.importedAt)?[A,B]:[B,A];
    h+='<div class="lg-maybe"><b>訂正かもしれない記録があります</b><span>「'+esc(cut(n.did,30))+'」が2つあり、中身が違います（'+(o.minutes!=null?o.minutes+'分':'—')+' と '+(n.minutes!=null?n.minutes+'分':'—')+'）。確かめるまでは、時間は大きい方だけ数えます。</span>'+
      '<div class="row"><button class="p" data-lgsup="'+esc(o.id)+'" data-lgby="'+esc(n.id)+'">新しい方に置き換える</button><button data-lgkeep="'+esc(o.id)+'" data-lgwith="'+esc(n.id)+'">別の活動として両方残す</button></div></div>';});
  if(acts.length)h+='<div class="lg-sum mu">記録に書いた分の合計：'+x.selfReportMinutes+'分（タイマーの分とは別に数えています）</div>';
  h+=lgStudyHTML(x.study);
  return h;
}
function lgFillDiary(d){
  const box=$('dyLedger');if(!box||box.dataset.d!==d)return;
  const c=lgCache[d];
  box.querySelector('.lg-body').innerHTML=lgDayHTML(d,c&&Date.now()-c.at<60000?c:c&&c.data?c:null);
  const pg=$('dyPage');if(pg&&c&&c.data&&((c.data.activities||[]).length||c.data.study)){const e=pg.querySelector('.dp-empty');if(e)e.classList.add('hide');}
  box.querySelectorAll('[data-lgact]').forEach(b=>b.onclick=()=>lgOpenAct(b.dataset.lgact,d));
  box.querySelectorAll('[data-lgre]').forEach(b=>b.onclick=()=>{lgInvalidate(d);lgDiary(d);});
  box.querySelectorAll('[data-lgsup]').forEach(b=>b.onclick=()=>lgAction({action:'supersede',id:b.dataset.lgsup,by:b.dataset.lgby},d,'置き換えました（元の記録も残っています）'));
  box.querySelectorAll('[data-lgkeep]').forEach(b=>b.onclick=()=>lgAction({action:'keep_both',id:b.dataset.lgkeep,with:b.dataset.lgwith},d,'両方を別の活動として残しました'));
}
async function lgDiary(d){
  if(typeof online!=='undefined'&&!online){const box=$('dyLedger');if(box)box.querySelector('.lg-body').innerHTML='<div class="mu lg-wait">オフラインのため台帳を読めません</div>';return;}
  lgFillDiary(d);await lgLoadDay(d);lgFillDiary(d);
}
function lgSectionHTML(d){return '<section class="dp-sec dp-ledger" id="dyLedger" data-d="'+esc(d)+'"><h3>その日の出来事 <small class="mu">学習台帳・集中・メモ</small></h3><div class="lg-body"></div>'+
  '<button class="dp-link" data-recfix>この日の記録を取り込む ›</button></section>';}
async function lgAction(body,d,msg){
  try{await lgApi(Object.assign({op:'action'},body));toast(msg);lgInvalidate(d);dashAt=0;await lgDiary(d);}
  catch(e){toast(e.message||'できませんでした');}
}
async function lgOpenAct(id,d){
  $('sheetBody').innerHTML='<div class="lb">活動</div><div class="mu">読み込んでいます…</div><button class="dy-close" id="lgX">閉じる</button>';
  $('sheet').classList.remove('hide');$('lgX').onclick=closeSheet;
  let a;try{a=await lgApi({op:'activity',id});}catch(e){$('sheetBody').querySelector('.mu').textContent=e.message;return;}
  const c=a.current,st=a.status;
  $('sheetBody').innerHTML='<div class="lb">'+esc(LG_SRC_LB[c.source]||c.source)+(c.kind?'・'+esc(c.kind):'')+' · '+esc(dyMDs(c.date))+'</div>'+
    '<div class="lg-dt"><h3>'+esc(c.did||'（やったこと未記入）')+'</h3>'+
    '<div class="lg-kv">'+[['時間（自己申告）',c.minutes!=null?c.minutes+'分':'—'],['結果',lgRes(c.result)||c.resultRaw||'—'],['手ごたえ',c.feel||'—'],['次にやること',(c.next||[]).join(' ／ ')||'—'],['状態',st==='active'?'有効':st==='retracted'?'取り消し済み':'置き換え済み'],['取り込み',(c.file?c.file+' · ':'')+lgAt(c.importedAt)]].map(([k,v])=>'<div><span>'+esc(k)+'</span><b>'+esc(String(v))+'</b></div>').join('')+'</div>'+
    (c.note?'<div class="lg-note">'+esc(c.note)+'</div>':'')+
    (a.revisions.length>1?'<details class="lg-fd"><summary>改訂の履歴（'+a.revisions.length+'）</summary>'+a.revisions.slice().reverse().map(r=>'<div class="lg-rv"><b>'+(r.rev!=null?'版 '+r.rev+' · ':'')+esc(lgAt(r.importedAt))+'</b><span>'+esc(cut(r.did,60))+(r.minutes!=null?'（'+r.minutes+'分）':'')+'</span>'+(r.note?'<small>'+esc(cut(r.note,120))+'</small>':'')+'</div>').join('')+'</details>':'')+
    '</div><div class="row" style="margin-top:12px">'+(st==='active'?'<button id="lgRt">この活動を取り消す</button>':'<button class="p" id="lgRs">元に戻す</button>')+'</div>'+
    '<div class="mu" style="font-size:11px;margin-top:6px">取り消しても台帳からは消えません（あとで戻せます）。</div><button class="dy-close" id="lgX">閉じる</button>';
  $('lgX').onclick=closeSheet;
  if($('lgRt'))$('lgRt').onclick=async()=>{if(!confirm('この活動を取り消しますか？（あとで戻せます）'))return;closeSheet();await lgAction({action:'retract',id},d,'取り消しました');};
  if($('lgRs'))$('lgRs').onclick=async()=>{closeSheet();await lgAction({action:'restore',id},d,'元に戻しました');};
}
