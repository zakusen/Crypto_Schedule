/* AIコーチ v30 — アプリの更新（app-v30/ が元。build_v30.py で1ファイル版・bundle を作る）
   ・アプリのファイル（.bundle.json＝一式／record.js などの一部／covers/*.webp／昔の1ファイル版 .html）をR2に入れる
   ・worker.js を選ぶと、Worker も Cloudflare API で差し替える（CF_API_TOKEN / CF_ACCOUNT_ID が設定されている時だけ）
   ・前の版に戻す：アプリはスナップショットごと、Worker は保管した版ごと
   ・v30：aicoach-vXX.zip を1つ選ぶだけでよい（中のアプリのファイル → R2、worker.js → Worker の更新）。ZIP はブラウザだけで開く */
const UP_WORKER_MARK=/^﻿?\/\/ AIコーチ Cloudflare Worker/;   // worker.js の1行目
const UP_APP_EXT=/\.(html|css|js|json|webp|png|svg)$/i;
const UP_IMG_EXT=/\.(webp|png|svg)$/i;
const UP_ZIP_MAX=20*1024*1024, UP_FILE_MAX=5*1024*1024, UP_TOTAL_MAX=15*1024*1024, UP_WORKER_MAX=3*1024*1024;
let upSel=null, upInfo=null;
const upVerOf=html=>{const m=String(html||'').match(/<title>\s*AIコーチ\s+(v[0-9A-Za-z._-]+)\s*<\/title>/i);return m?m[1]:'';};
const upWhen=s=>{const d=new Date(s);return isNaN(d)?'':(d.getMonth()+1)+'/'+d.getDate()+' '+p2(d.getHours())+':'+p2(d.getMinutes());};
const upVerName=v=>v==='none'?'最初の状態（埋め込み版）':(v||'不明な版');
const upKB=n=>n>=1024*1024?(n/1024/1024).toFixed(1)+'MB':Math.max(1,Math.round(n/1024))+'KB';
const upSplitMode=()=>!!document.querySelector('script[src^="/app/"]');   // R2の分割ファイルから動いているか
function upCheck(html,size){
  if(size>UP_FILE_MAX) return 'ファイルが大きすぎます（5MBまで）';
  if(!/^\s*<!doctype html/i.test(String(html).replace(/^﻿/,''))) return 'HTMLファイルではないようです';
  if(!String(html).includes('AIコーチ')) return 'AIコーチのアプリのファイルではないようです';
  return '';
}
async function appApi(body){
  let r;
  try{ r=await fetch(API('/api/app'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({pass:appPass},body))}); }
  catch(e){ return {error:'通信できませんでした。電波のある場所でもう一度どうぞ'}; }
  let j={}; try{ j=await r.json(); }catch(e){}
  if(!r.ok&&!j.error) j.error='うまくいきませんでした（'+r.status+'）';
  return j;
}
const upB64=buf=>{const u=new Uint8Array(buf);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
const upCleanName=n=>String(n||'').replace(/\s*\(\d+\)(?=\.[^.]+$)/,'').replace(/\s*-\s*コピー(?=\.[^.]+$)/,'').trim();   // 「record (1).js」→「record.js」
const upType=p=>({html:'text/html',css:'text/css',js:'text/javascript',json:'application/json',webp:'image/webp',png:'image/png',svg:'image/svg+xml'})[String(p).split('.').pop().toLowerCase()]||'';


/* ---- ZIP（外部ライブラリなし）：中央ディレクトリを読む。無圧縮(0)と deflate(8) ---- */
async function upUnzip(buf){
  const u=new Uint8Array(buf), dv=new DataView(u.buffer,u.byteOffset,u.byteLength), td=new TextDecoder();
  let e=-1;
  for(let i=u.length-22;i>=Math.max(0,u.length-22-65535);i--) if(dv.getUint32(i,true)===0x06054b50){e=i;break;}
  if(e<0) throw new Error('ZIPファイルとして読めませんでした');
  const n=dv.getUint16(e+10,true), ents=[]; let off=dv.getUint32(e+16,true);
  for(let k=0;k<n;k++){
    if(off+46>u.length||dv.getUint32(off,true)!==0x02014b50) throw new Error('ZIPファイルが壊れているようです');
    const flags=dv.getUint16(off+8,true), method=dv.getUint16(off+10,true), csize=dv.getUint32(off+20,true), usize=dv.getUint32(off+24,true);
    const nl=dv.getUint16(off+28,true), xl=dv.getUint16(off+30,true), cl=dv.getUint16(off+32,true), lho=dv.getUint32(off+42,true);
    const name=td.decode(u.subarray(off+46,off+46+nl)).replace(/\\/g,'/');
    off+=46+nl+xl+cl;
    if(/\/$/.test(name)||/(^|\/)__MACOSX\//.test(name)||/(^|\/)\.DS_Store$/.test(name)) continue;
    if(/^\/|^[A-Za-z]:/.test(name)||name.split('/').some(s=>s==='..')) throw new Error('安全でないファイル名が入っています（'+name+'）');
    if(flags&1) throw new Error('パスワード付きのZIPは開けません');
    if(method!==0&&method!==8) throw new Error(name+'：この圧縮形式は読めません');
    ents.push({name,method,csize,usize,lho});
  }
  if(ents.some(x=>x.method===8)&&typeof DecompressionStream==='undefined') throw new Error('このブラウザではZIPを開けません。aicoach-vXX.bundle.json を選んでください');
  const out=[];
  for(const x of ents){
    if(x.usize>UP_FILE_MAX) throw new Error(x.name+'：ファイルが大きすぎます（5MBまで）');
    if(dv.getUint32(x.lho,true)!==0x04034b50) throw new Error('ZIPファイルが壊れているようです');
    const ds=x.lho+30+dv.getUint16(x.lho+26,true)+dv.getUint16(x.lho+28,true), raw=u.subarray(ds,ds+x.csize);
    const data=x.method===0?raw:new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    out.push({path:x.name,data});
  }
  // 全部が同じ1つのフォルダに入っていたら外す（aicoach-v30/index.html → index.html）。app/ も外す
  const tops=new Set(out.map(x=>x.path.includes('/')?x.path.split('/')[0]:''));
  if(tops.size===1&&!tops.has('')) out.forEach(x=>x.path=x.path.slice(x.path.indexOf('/')+1));
  out.forEach(x=>{ if(x.path.startsWith('app/')) x.path=x.path.slice(4); });
  return out;
}
function upAddBundle(sel,name,b){
  if(!b||b.format!=='aicoach-bundle'||!b.files||typeof b.files!=='object'){sel.errors.push(name+'：AIコーチの更新ファイル（bundle）ではないようです');return;}
  sel.bundle={name,version:String(b.version||''),count:Object.keys(b.files).length};
  Object.keys(b.files).forEach(p=>{if(!(p in sel.app))sel.app[p]=b.files[p];});   // 個別に選んだファイルの方を優先
  if(b.version) sel.version=String(b.version);
}
function upAddWorker(sel,name,t,size){
  if(size>UP_WORKER_MAX){sel.errors.push(name+'：Workerのファイルが大きすぎます（3MBまで）');return;}
  if(!/export\s+default/.test(t)){sel.errors.push(name+'：Workerのファイルではないようです（export default がありません）');return;}
  const m=t.match(/const\s+WORKER_VERSION\s*=\s*["'](v[0-9A-Za-z._-]+)["']/);
  sel.worker={name,script:t,version:m?m[1]:'',lite:/worker-lite/.test(name.toLowerCase())};
}
async function upAddZip(sel,f){
  if(f.size>UP_ZIP_MAX){sel.errors.push(f.name+'：ZIPが大きすぎます（20MBまで）');return;}
  let ents; try{ ents=await upUnzip(await f.arrayBuffer()); }catch(e){ sel.errors.push(f.name+'：'+e.message); return; }
  const td=new TextDecoder(), z={name:f.name,paths:[],skipped:[]};
  for(const x of ents){
    const p=x.path, low=p.toLowerCase();
    if(/^worker(-lite)?\.m?js$/.test(low)){ const t=td.decode(x.data); if(UP_WORKER_MARK.test(t)) upAddWorker(sel,p,t,x.data.byteLength); else sel.errors.push(p+'：AIコーチのWorkerのファイルではないようです'); continue; }
    if(/\.bundle\.json$/.test(low)){ let b=null; try{b=JSON.parse(td.decode(x.data));}catch(e){} upAddBundle(sel,p,b); continue; }
    if(low==='manifest.json'||!UP_APP_EXT.test(low)||!/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?$/.test(p)){ z.skipped.push(p); continue; }
    const type=upType(p);
    sel.app[p]=/^image\/(webp|png)$/.test(type)?{type,base64:upB64(x.data)}:{type,text:td.decode(x.data)};
    z.paths.push(p);
  }
  const core=sel.app['core.js'], idx=sel.app['index.html'];
  const v=(core&&core.text&&(core.text.match(/const APP_VERSION='(v[0-9A-Za-z._-]+)'/)||[])[1])||(idx&&idx.text&&upVerOf(idx.text));
  if(v) sel.version=v;
  if(idx&&idx.text&&!/<script[^>]+src="\/app\/core\.js/.test(idx.text)){   // 1ファイル版の html だけが入っている
    delete sel.app['index.html']; z.paths=z.paths.filter(p=>p!=='index.html'); sel.single={name:'index.html',html:idx.text,version:upVerOf(idx.text)};
  }
  if(!z.paths.length&&!sel.worker&&!sel.bundle&&!sel.single) sel.errors.push(f.name+'：AIコーチのファイルが入っていません');
  sel.zip=z;
}
/* 選んだファイルを仕分ける → {app:{path:{type,text|base64}}, bundle, single, worker, errors[], rows[]} */
async function upClassify(fileList){
  const sel={app:{},bundle:null,single:null,worker:null,errors:[],version:''};
  for(const f of Array.from(fileList||[])){
    const name=upCleanName(f.name), low=name.toLowerCase();
    try{
      if(/\.zip$/.test(low)){ await upAddZip(sel,f); continue; }
      if(/\.bundle\.json$/.test(low)){
        if(f.size>22*1024*1024){sel.errors.push(f.name+'：ファイルが大きすぎます');continue;}
        let b=null; try{b=JSON.parse(await f.text());}catch(e){}
        upAddBundle(sel,f.name,b); continue;
      }
      if(/\.m?js$/.test(low)){
        const t=await f.text();
        if(UP_WORKER_MARK.test(t)){ upAddWorker(sel,f.name,t,f.size); continue; }
        if(/^worker(-lite)?\.m?js$/.test(low)){sel.errors.push(f.name+'：AIコーチのWorkerのファイルではないようです');continue;}
        if(f.size>UP_FILE_MAX){sel.errors.push(f.name+'：ファイルが大きすぎます（5MBまで）');continue;}
        sel.app[low.replace(/\.mjs$/,'.js')]={type:'text/javascript',text:t,picked:true};
        const v=t.match(/const APP_VERSION='(v[0-9A-Za-z._-]+)'/); if(v&&!sel.version) sel.version=v[1];
        continue;
      }
      if(/\.html?$/.test(low)){
        const t=await f.text(), bad=upCheck(t,f.size);
        if(bad){sel.errors.push(f.name+'：'+bad);continue;}
        if(/<script[^>]+src="\/app\/core\.js/.test(t)){ sel.app['index.html']={type:'text/html',text:t,picked:true}; const v=upVerOf(t); if(v&&!sel.version) sel.version=v; }
        else sel.single={name:f.name,html:t,version:upVerOf(t)};   // 昔の1ファイル版
        continue;
      }
      if(/\.css$/.test(low)){
        if(f.size>UP_FILE_MAX){sel.errors.push(f.name+'：ファイルが大きすぎます（5MBまで）');continue;}
        sel.app[low]={type:'text/css',text:await f.text(),picked:true}; continue;
      }
      if(UP_IMG_EXT.test(low)){
        if(f.size>UP_FILE_MAX){sel.errors.push(f.name+'：ファイルが大きすぎます（5MBまで）');continue;}
        const p='covers/'+low; sel.app[p]=/\.svg$/.test(low)?{type:'image/svg+xml',text:await f.text(),picked:true}:{type:upType(p),base64:upB64(await f.arrayBuffer()),picked:true};
        continue;
      }
      sel.errors.push(f.name+'：このファイルは使えません（.zip・.bundle.json・.js・.css・.html・画像・worker.js）');
    }catch(e){ sel.errors.push(f.name+'：読み込めませんでした'); }
  }
  if(sel.single&&(Object.keys(sel.app).length)){sel.errors.push('1ファイル版（'+sel.single.name+'）と分割ファイルは一緒に選べません。どちらかにしてください');sel.single=null;}
  return sel;
}
function upRows(sel){
  const rows=[], picked=Object.keys(sel.app).filter(p=>sel.app[p].picked);
  if(sel.zip&&sel.zip.paths.length){ const n=sel.zip.paths.length; rows.push('アプリ：'+n+'ファイル'+(sel.version?'（'+sel.version+'）':'')+(n<=4?' … '+sel.zip.paths.join('、'):'')); }
  if(sel.bundle) rows.push('アプリ一式：'+(sel.bundle.version||'版不明')+'（'+sel.bundle.count+'ファイル）');
  picked.forEach(p=>rows.push('アプリ：'+p));
  if(sel.single) rows.push('アプリ（1ファイル版）：'+sel.single.name+(sel.single.version?'（'+sel.single.version+'）':''));
  if(sel.worker) rows.push('Worker：'+sel.worker.name+(sel.worker.version?'（'+sel.worker.version+'）':''));
  return rows;
}
function upShell(inner){
  $('sheetBody').innerHTML='<div class="lb">アプリの更新</div>'+inner+'<button id="upClose" class="arc-close">閉じる</button>';
  $('sheet').classList.remove('hide'); $('upClose').onclick=closeSheet;
}
function upMsg(t,bad){const i=$('upInfo');if(!i)return;i.classList.toggle('err',!!bad);i.innerHTML=t;}
async function openUpdateSheet(){
  upSel=null; upInfo=null;
  const curTxt='<div class="up-cur">アプリ <b>'+esc(APP_VERSION)+'</b>（'+(upSplitMode()?'R2から配信':'1ファイル版')+'）</div>';
  upShell(curTxt+'<div class="mu up-note">確認しています…</div>');
  if(!online){ upShell(curTxt+'<div class="mu up-note">更新は、通信できる状態（パスワードをサーバーで確認できた時）だけ使えます。</div>'); return; }
  const info=await appApi({op:'info'});
  if($('sheet').classList.contains('hide')) return;
  if(info.r2===false){ upShell(curTxt+'<div class="mu up-note">アプリの更新には Cloudflare R2（バインディング名 ARCHIVE）が必要です。</div>'); return; }
  if(info.error){ upShell(curTxt+'<div class="up-file err">'+esc(info.error)+'</div>'); return; }
  upInfo=info;
  const app=info.app||{}, w=info.worker||{}, bks=info.backups||[], wbks=(w.backups||[]);
  const r2Ver=app.version||(info.current&&info.current.version)||'';
  upShell(
    '<div class="up-cur">アプリ <b>'+esc(APP_VERSION)+'</b>（'+(upSplitMode()?'R2から配信':app.source==='r2'?'R2・1ファイル版':'埋め込み版')+'）'+
      (r2Ver&&r2Ver!==APP_VERSION?'<div class="mu" style="font-size:11.5px">R2には '+esc(r2Ver)+' が入っています。再読み込みで切り替わります。</div>':'')+
      '<div class="up-w">'+(w.selfUpdate?'Worker <b>'+esc(w.version||'?')+'</b>（アプリから更新できます）':'<span class="mu">Workerもアプリから更新するには、APIトークンの設定が必要です（手順書7）</span>')+'</div></div>'+
    '<div class="mu up-note">受け取った <b>aicoach-vXX.zip</b> を選んで「更新する」を押すだけです（中のアプリとworker.jsをまとめて入れます）。いまの版は自動で残します。</div>'+
    '<label class="up-pick"><input type="file" id="upIn" multiple accept=".zip,application/zip,.json,.js,.mjs,.css,.html,.webp,.png,.svg,application/json,text/javascript,text/css,text/html,image/*">更新ファイルを選ぶ</label>'+
    '<div id="upList" class="up-list"></div>'+
    '<div id="upInfo" class="up-file mu"></div>'+
    '<button class="p up-go" id="upGo" disabled>更新する</button>'+
    '<div class="lb" style="margin-top:22px">前の版に戻す</div>'+
    '<div class="mu" style="font-size:11.5px;margin-bottom:4px">アプリ</div>'+
    (bks.length?'<div>'+bks.map((b,i)=>'<div class="up-bk"><span><em>'+esc(upVerName(b.version))+'</em><span class="mu">'+esc(upWhen(b.backedUpAt||b.uploadedAt))+' まで使用'+(b.files&&b.files.length?'・'+esc(b.files.length>3?b.files.slice(0,3).join(', ')+' ほか'+(b.files.length-3):b.files.join(', ')):'')+'</span></span><button data-rb="'+i+'">戻す</button></div>').join('')+'</div>'
      :'<div class="mu" style="font-size:12px">まだありません。更新すると、それまでの版がここに残ります。</div>')+
    (w.selfUpdate?'<div class="mu" style="font-size:11.5px;margin:12px 0 4px">Worker</div>'+
      (wbks.length?'<div>'+wbks.map((b,i)=>'<div class="up-bk"><span><em>'+esc(b.version||'不明な版')+'</em><span class="mu">'+esc(upWhen(b.at))+' に保管・'+esc(upKB(b.size||0))+'</span></span><button data-wrb="'+i+'">戻す</button></div>').join('')+'</div>'
        :'<div class="mu" style="font-size:12px">まだありません。アプリからWorkerを更新すると、それまでの版がここに残ります。</div>'):''));
  $('upIn').onchange=async e=>{
    upSel=null; $('upGo').disabled=true; $('upList').innerHTML=''; upMsg('');
    const fl=e.target.files; if(!fl||!fl.length) return;
    upMsg('読み込んでいます…');
    const sel=await upClassify(fl);
    const errs=sel.errors.slice();
    const notes=[];
    if(sel.worker&&!w.selfUpdate){
      if(sel.zip&&Object.keys(sel.app).length){ notes.push('worker.js は飛ばします（Workerもアプリから更新するには、APIトークンの設定が必要です。手順書7）'); sel.workerSkipped=true; }
      else errs.push('Workerの更新には、APIトークンの設定が必要です（手順書7）。worker.js はCloudflareの画面に貼り付けてください');
      sel.worker=null;
    }
    const appPaths=Object.keys(sel.app);
    let total=0; appPaths.forEach(p=>{const x=sel.app[p];total+=x.text!=null?new Blob([x.text]).size:Math.floor(String(x.base64||'').length*3/4);});
    if(total>UP_TOTAL_MAX){ errs.push('アプリのファイルが合計で大きすぎます（15MBまで）'); appPaths.forEach(p=>delete sel.app[p]); sel.bundle=null; }
    const rows=upRows(sel);
    $('upList').innerHTML=rows.map(r=>'<div class="up-row">'+esc(r)+'</div>').join('');
    upMsg(errs.concat(notes).map(esc).join('<br>'),errs.length>0);
    if(errs.length&&sel.zip) rows.length=0;   // ZIP に問題があれば、一部だけ入れることはしない
    if(rows.length){ upSel=sel; $('upGo').disabled=false; }
  };
  $('upGo').onclick=async()=>{
    const sel=upSel; if(!sel) return;
    const btn=$('upGo'); btn.disabled=true; btn.textContent='更新しています…'; upMsg('');
    const done=[];
    if(sel.worker){
      btn.textContent='Workerを更新しています…';
      const j=await appApi({op:'worker_update',script:sel.worker.script});
      if(!j.ok){ btn.disabled=false; btn.textContent='更新する'; upMsg((done.length?esc(done.join('・'))+' は更新しました。<br>':'')+'Worker：'+esc(j.error||'更新できませんでした'),1); if(done.length){upSel=Object.assign({},sel,{app:{},single:null,bundle:null});} return; }
      done.push('Worker '+(j.version||''));
      upSel=Object.assign({},sel,{worker:null});
    }
    const appPaths=Object.keys(sel.app);
    if(appPaths.length){
      const files={}; appPaths.forEach(p=>{const x=sel.app[p];files[p]=x.text!=null?{type:x.type||upType(p),text:x.text}:{type:x.type||upType(p),base64:x.base64};});
      const j=await appApi({op:'upload_files',files,version:sel.version||undefined});
      if(!j.ok){ btn.disabled=false; btn.textContent='更新する'; upMsg('アプリ：'+esc(j.error||'更新できませんでした'),1); return; }
      done.push('アプリ '+(j.version||''));
    }else if(sel.single){
      const j=await appApi({op:'upload',html:sel.single.html,version:sel.single.version||undefined});
      if(!j.ok){ btn.disabled=false; btn.textContent='更新する'; upMsg('アプリ：'+esc(j.error||'更新できませんでした'),1); return; }
      done.push('アプリ '+(j.version||''));
    }
    btn.textContent='更新しました';
    toast(done.join('・')+' に更新しました'+(sel.workerSkipped?'（worker.js は飛ばしました）':'')+'。再読み込みします');
    if(sel.workerSkipped) upMsg('worker.js は飛ばしました（手順書7のAPIトークンを設定すると、次からWorkerも一緒に更新できます）');
    setTimeout(()=>location.reload(),sel.worker||sel.workerSkipped?3000:1300);
  };
  $('sheetBody').querySelectorAll('[data-rb]').forEach(b=>b.onclick=async()=>{
    const bk=bks[+b.dataset.rb]; if(!bk) return;
    if(!confirm('アプリを '+upVerName(bk.version)+'（'+upWhen(bk.backedUpAt||bk.uploadedAt)+' まで使用）に戻しますか？\nいまの版も「前の版」に残ります。')) return;
    b.disabled=true; b.textContent='…';
    const j=await appApi({op:'rollback',key:bk.key});
    if(!j.ok){ b.disabled=false; b.textContent='戻す'; toast(j.error||'戻せませんでした'); return; }
    toast('アプリを '+(j.version||bk.version||'前の版')+' に戻しました。再読み込みします');
    setTimeout(()=>location.reload(),1300);
  });
  $('sheetBody').querySelectorAll('[data-wrb]').forEach(b=>b.onclick=async()=>{
    const bk=wbks[+b.dataset.wrb]; if(!bk) return;
    if(!confirm('Workerを '+(bk.version||'この版')+'（'+upWhen(bk.at)+' に保管）に戻しますか？')) return;
    b.disabled=true; b.textContent='…';
    const j=await appApi({op:'worker_rollback',key:bk.key});
    if(!j.ok){ b.disabled=false; b.textContent='戻す'; toast(j.error||'戻せませんでした'); return; }
    toast('Workerを '+(j.version||bk.version||'前の版')+' に戻しました。再読み込みします');
    setTimeout(()=>location.reload(),3000);
  });
}
