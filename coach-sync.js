/* v54 R2 コーチ同期。送信列・基準ハッシュ・生データを端末に保持する。 */
const coachCopy=x=>JSON.parse(JSON.stringify(x));
const coachStable=x=>JSON.stringify(x===null||typeof x!=='object'?x:Array.isArray(x)?x.map(v=>JSON.parse(coachStable(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(coachStable(x[k]))])));
function coachRaw(c){
  const view=Object.fromEntries(Object.entries(c).filter(([k])=>!['_raw','_view'].includes(k)));
  if(!c._raw)return coachCopy(view);
  const patch=(raw,old,now)=>{
    if(coachStable(old)===coachStable(now))return coachCopy(raw===undefined?now:raw);
    if(now&&old&&typeof now==='object'&&!Array.isArray(now)&&!Array.isArray(old)){
      const out=raw&&typeof raw==='object'&&!Array.isArray(raw)?coachCopy(raw):{};
      Object.keys(now).forEach(k=>{out[k]=patch(out[k],old[k],now[k]);});return out;
    }
    return now===undefined?null:coachCopy(now);
  };
  const raw=patch(c._raw,c._view||{},view);raw.id=c.id;return raw;
}
let coachState=Object.assign({hashes:{},localHashes:{},savedActive:null,migrated:{},queue:[],lastAt:0,conflicts:[],deleted:[],activeEvent:null},L('coachSync',{}));
const coachFingerprint=async c=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(coachStable(coachRaw(c)))))).map(x=>x.toString(16).padStart(2,'0')).join('');
let coachSeen=new Map(chars.list.map(c=>[c.id,coachStable(coachRaw(c))])),coachSeenActive=chars.active;
let coachBusy=false,coachTimer=null,coachStatus='接続を確認しています',coachBooted=false;
const coachPersist=()=>S('coachSync',coachState);
function coachEnqueue(item){
  item.token=Date.now().toString(36)+Math.random().toString(36).slice(2);
  coachState.queue.push(item);coachPersist();
}
function coachCapture(){
  for(const c of chars.list){const raw=coachRaw(c),text=coachStable(raw);
    if(coachSeen.get(c.id)!==text){coachEnqueue({op:'put',coach:raw,reason:c.log&&c.log.at(-1)&&c.log.at(-1).summary||'設定の変更',baseHash:coachState.hashes[c.id]||null});coachSeen.set(c.id,text);}
  }
  for(const id of coachSeen.keys())if(!charById(id)){coachEnqueue({op:'action',action:'delete',id});coachSeen.delete(id);}
  if(coachSeenActive!==chars.active){coachEnqueue({op:'action',action:'activate',id:chars.active});coachSeenActive=chars.active;}
  clearTimeout(coachTimer);coachTimer=setTimeout(coachSync,400);coachPaint();
}
async function coachApiClient(body){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
  try{
    const r=await fetch(API('/api/coach'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:appPass,device:devId,...body}),signal:ctl.signal});
    if(r.status===404){const e=new Error('Worker を v54 に更新すると、コーチがクラウドに保存されます');e.oldWorker=true;throw e;}
    const j=await r.json();if(!r.ok||j.error)throw new Error(j.error||'HTTP '+r.status);return j;
  }finally{clearTimeout(timer);}
}
async function coachAdopt(j){
  const pending=new Set(coachState.queue.map(x=>x.coach&&x.coach.id||x.id));
  coachState.deleted=j.coaches.filter(x=>x.deleted);
  coachState.conflicts=j.coaches.filter(x=>x.conflicts.length);
  j.coaches.forEach(x=>{
    if(pending.has(x.id))return;
    coachState.hashes[x.id]=x.hash;coachState.migrated[x.id]=true;
    const i=chars.list.findIndex(c=>c.id===x.id);
    if(x.deleted){if(i>=0&&chars.list.length>1)chars.list.splice(i,1);return;}
    const c=charNorm(x.coach);
    if(i>=0){
      // ビルド画面の操作が参照しているオブジェクトを切り離さない。
      if(coachStable(coachRaw(chars.list[i]))!==coachStable(x.coach)){const existing=chars.list[i];Object.keys(existing).forEach(k=>delete existing[k]);Object.assign(existing,c);}
    }else chars.list.push(c);
  });
  if(!coachState.queue.some(x=>x.action==='activate')&&j.active&&charById(j.active)&&!coachState.deleted.some(x=>x.id===j.active))chars.active=j.active;
  if(!charById(chars.active)||coachState.deleted.some(x=>x.id===chars.active))chars.active=(chars.list.find(c=>!coachState.deleted.some(x=>x.id===c.id))||chars.list[0]).id;
  for(const c of chars.list)if(!pending.has(c.id))coachState.localHashes[c.id]=await coachFingerprint(c);
  coachState.savedActive=chars.active;
  coachState.activeEvent=j.activeEvent;coachSeen=new Map(chars.list.map(c=>[c.id,coachStable(coachRaw(c))]));coachSeenActive=chars.active;
  S('chars',chars);coachPersist();updateCoachContext();
}
async function coachSync(){
  if(coachBusy||!appPass)return;
  if(!navigator.onLine){coachStatus='端末に保存・接続後に送信';coachPaint();return;}
  coachBusy=true;
  try{
    const configResponse=await fetch(API('/api/config'),{cache:'no-store'});
    if(configResponse.ok){const config=await configResponse.json();const v=/^v(\d+)/.exec(config.version||'');if(v&&+v[1]<54){const e=new Error('Worker を v54 に更新すると、コーチがクラウドに保存されます');e.oldWorker=true;throw e;}}
    let j=await coachApiClient({op:'list'});
    if(!coachBooted){
      // 移行は生の設定を一度だけ送る。既存IDとの違いは競合候補として保全する。
      for(const c of chars.list){
        const remote=j.coaches.find(x=>x.id===c.id);
        if(coachState.migrated[c.id]&&coachState.localHashes[c.id]&&coachState.localHashes[c.id]!==await coachFingerprint(c)&&!coachState.queue.some(x=>x.coach&&x.coach.id===c.id))coachEnqueue({op:'put',coach:coachRaw(c),reason:'端末に残る変更（旧版からの再更新など）',baseHash:coachState.hashes[c.id]||null});
        if(!coachState.migrated[c.id]&&(coachHadLocal||!j.coaches.some(x=>!x.deleted))&&!coachState.queue.some(x=>x.coach&&x.coach.id===c.id))coachEnqueue({op:'put',coach:coachRaw(c),reason:'v53からの移行',baseHash:remote?null:coachState.hashes[c.id]||null});
      }
      if(!coachHadLocal&&j.coaches.some(x=>!x.deleted)&&!coachState.queue.length)chars.list=[];
      if(!j.active&&(coachHadLocal||!j.coaches.length)&&!coachState.queue.some(x=>x.action==='activate'))coachEnqueue({op:'action',action:'activate',id:chars.active});
      if(coachState.savedActive&&coachState.savedActive!==chars.active&&!coachState.queue.some(x=>x.action==='activate'))coachEnqueue({op:'action',action:'activate',id:chars.active});
      coachBooted=true;
    }
    let conflict=false;
    while(coachState.queue.length){
      const item=coachState.queue[0],id=item.coach&&item.coach.id||item.id;
      const r=await coachApiClient(item);
      if(item.op==='put'){
        coachState.migrated[id]=true;
        if(r.result==='conflict'){conflict=true;toast('別の端末で変更がありました。両方の設定を履歴に保存しました');}
        else {
          coachState.hashes[id]=r.hash;
          // 自分の連続編集だけを次の基準へつなぐ。競合後は自動で上書きしない。
          coachState.queue.slice(1).filter(x=>x.coach&&x.coach.id===id&&x.baseHash===item.baseHash).forEach(x=>x.baseHash=r.hash);
        }
      }
      coachState.queue.shift();coachState.lastAt=Date.now();coachPersist();
    }
    j=await coachApiClient({op:'list'});const oldView=JSON.stringify(chars);await coachAdopt(j);
    coachState.lastAt=Math.max(coachState.lastAt,...j.coaches.map(x=>x.at));coachPersist();
    if(oldView!==JSON.stringify(chars)&&activeAppTab==='settings'&&labScreen==='chars')renderChars();
    coachStatus=conflict||coachState.conflicts.length?'別の端末で変更がありました。履歴で設定を選べます':'Cloudflare';
  }catch(e){coachStatus=e.oldWorker?e.message:'端末に保存・クラウド未保存：'+(e.message||'接続できません');}
  finally{coachBusy=false;coachPaint();}
}
function coachControlsHTML(){return '<section class="coach-cloud"><div id="coachCloudStatus" role="status"></div><div class="row"><button id="coachSyncNow">同期する</button><button id="coachHistory">履歴（前の設定に戻す）</button><button id="coachDeleted">削除したコーチ（戻す）</button></div></section>';}
function coachPaint(){
  const e=$('coachCloudStatus');if(e)e.textContent='保存先：'+coachStatus+(coachStatus==='Cloudflare'&&coachState.lastAt?'（最終保存 '+p2(new Date(coachState.lastAt).getHours())+':'+p2(new Date(coachState.lastAt).getMinutes())+'）':'')+(coachState.queue.length?' ／ 未送信 '+coachState.queue.length+'件':'');
}
function coachBindControls(){
  coachPaint();if($('coachSyncNow'))$('coachSyncNow').onclick=async()=>{await coachSync();if(activeAppTab==='settings')renderLab();};
  if($('coachHistory'))$('coachHistory').onclick=()=>coachHistory(chars.active);
  if($('coachDeleted'))$('coachDeleted').onclick=coachDeleted;
}
async function coachHistory(id,offset=0,accum=[]){
  try{
    const j=await coachApiClient({op:'history',id,offset});j.revisions=[...j.revisions,...accum];
    $('sheetBody').innerHTML='<div class="lb">履歴（前の設定に戻す）</div><p class="mu">競合した設定も残っています。内容を確認して選べます。</p>'+j.revisions.slice().reverse().map((r,i)=>'<details class="coach-rev"><summary>'+esc(new Date(r.at).toLocaleString())+' · '+esc(r.coach.name||id)+(r.conflict?' · 別端末の変更':'')+'</summary><p>'+esc(r.reason)+'</p><pre>'+esc(JSON.stringify(r.coach,null,2))+'</pre><button data-coach-revert="'+esc(r.hash)+'">この設定に戻す</button></details>').join('')+'<button id="coachClose">閉じる</button>';
    if(j.nextOffset!=null){const b=document.createElement('button');b.textContent='もっと前の履歴';b.onclick=()=>coachHistory(id,j.nextOffset,j.revisions);$('sheetBody').insertBefore(b,$('coachClose'));}
    $('sheet').classList.remove('hide');$('coachClose').onclick=closeSheet;
    $('sheetBody').querySelectorAll('[data-coach-revert]').forEach(b=>b.onclick=async()=>{if(!confirm('この設定を新しい改訂として復元しますか？ 現在の設定も履歴に残ります。'))return;await coachDoAction({action:'revert',id,to:b.dataset.coachRevert});});
  }catch(e){toast(e.message);}
}
async function coachDeleted(){
  try{
    await coachSync();const list=coachState.deleted;
    $('sheetBody').innerHTML='<div class="lb">削除したコーチ（戻す）</div>'+(list.length?list.map(x=>'<div class="coach-rev">'+esc(x.coach.name)+' <button data-coach-restore="'+esc(x.id)+'">戻す</button></div>').join(''):'<p>削除したコーチはありません。</p>')+'<button id="coachClose">閉じる</button>';
    $('sheet').classList.remove('hide');$('coachClose').onclick=closeSheet;
    $('sheetBody').querySelectorAll('[data-coach-restore]').forEach(b=>b.onclick=()=>coachDoAction({action:'restore',id:b.dataset.coachRestore}));
  }catch(e){toast(e.message);}
}
async function coachDoAction(body){
  try{await coachApiClient({op:'action',...body});await coachSync();closeSheet();if(activeAppTab==='settings')renderLab();toast('設定を復元しました');}catch(e){toast(e.message);}
}
window.addEventListener('online',()=>coachSync());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')coachSync();});
setInterval(()=>{if(document.visibilityState==='visible')coachSync();},30000);
