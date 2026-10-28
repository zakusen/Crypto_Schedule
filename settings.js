/* AIコーチ v45 — 設定（外部サービス連携の入口）。ここには「識別子」だけ保存する。秘密鍵・トークンは入れない（Worker の Secret に置く） */
(function(){
 var SVC=[
  {id:'cf',name:'Cloudflare',ic:'☁',desc:'Worker / R2',f:[]},
  {id:'gc',name:'Google Cloud',ic:'◈',desc:'プロジェクト / API',f:[['project','プロジェクトID','例: my-project-123'],['region','リージョン','例: asia-northeast1'],['sa','サービスアカウント（メール）','例: bot@my-project.iam.gserviceaccount.com']]},
  {id:'ds',name:'Google Data Studio',ic:'▦',desc:'Looker Studio レポート',f:[['report','レポートURL / ID','https://lookerstudio.google.com/…'],['source','データソース名','例: aicoach-daily']]},
  {id:'aws',name:'AWS',ic:'▲',desc:'S3 / Lambda など',f:[['region','リージョン','例: ap-northeast-1'],['bucket','S3バケット名','例: aicoach-backup'],['acct','アカウントID（12桁）','例: 123456789012']]}
 ];
 function get(){var v=L('conn',{});return v&&typeof v==='object'?v:{}}
 function done(id){var c=get()[id];if(!c)return false;return Object.keys(c).some(function(k){return k!=='on'&&String(c[k]||'').trim()})}
 function closeS(){$('sheet').classList.add('hide')}
 function row(attr,ic,name,desc,st,on){return '<button class="cn-row" '+attr+'><span class="cn-ic">'+ic+'</span><span class="cn-tx"><b>'+esc(name)+'</b><small>'+esc(desc)+'</small></span><span class="cn-st'+(on?' on':'')+'">'+st+'</span></button>';}
 function list(){
  var c=get();
  $('sheetBody').innerHTML='<div class="lb">設定</div><div class="lb" style="margin-top:6px">接続</div>'+
   row('data-cf="1"','☁','Cloudflare','Worker / R2','確認中…',false)+
   SVC.filter(function(s){return s.id!=='cf'}).map(function(s){var on=done(s.id)&&(c[s.id]||{}).on!==false;
    return row('data-s="'+s.id+'"',s.ic,s.name,s.desc,on?'設定済み':'未設定',on);}).join('')+
   '<div class="lb" style="margin-top:14px">読み込み</div>'+
   row('data-ai="1"','📄','AIの記録を取り込む','JSONファイル／貼り付け','開く',false)+
   row('data-sl="1"','📒','学習記録を取り込む','統計アプリ：詳細履歴＋21分野集計','開く',false)+
   row('data-ex="1"','⬇','日ごとのCSV','集計をダウンロード','開く',false)+
   row('data-up="1"','⚙','アプリを更新','いま '+APP_VERSION,'開く',false)+
   (window.acAuth&&window.acAuth.active()?row('data-lo="1"','⏻','ログアウト','Amazon Cognito','実行',false):'')+
   '<button id="cnClose" class="arc-close">閉じる</button>';
  $('sheet').classList.remove('hide');
  $('cnClose').onclick=closeS;
  var q=function(s){return $('sheetBody').querySelector(s)};
  Array.prototype.forEach.call($('sheetBody').querySelectorAll('[data-s]'),function(b){b.onclick=function(){edit(b.getAttribute('data-s'))}});
  q('[data-ai]').onclick=function(){window.aiOrigin={kind:'settings'};closeS();if(typeof showView==='function')showView('log');if(typeof setRvMode==='function'){recBackTo=null;recDay=null;setRvMode('input',false);}setTimeout(function(){var t=$('aiImp');if(t)t.scrollIntoView({block:'start'})},60)};
  q('[data-up]').onclick=function(){openUpdateSheet()};
  if(q('[data-lo]'))q('[data-lo]').onclick=function(){if(confirm('ログアウトしますか？'))window.acAuth.logout()};
  q('[data-ex]').onclick=csvPanel;
  q('[data-sl]').onclick=studyPanel;
  q('[data-cf]').onclick=cf;
  cfCheck();
 }
 function cfCheck(){
  var st=function(t,on){var e=$('sheetBody')&&$('sheetBody').querySelector('[data-cf] .cn-st');if(e){e.textContent=t;e.classList.toggle('on',!!on)}};
  if(typeof online==='undefined'||!online){st('未接続',false);return}
  appApi({op:'info'}).then(function(i){st(i&&!i.error&&i.r2!==false?'接続済み':'要確認',i&&!i.error&&i.r2!==false)}).catch(function(){st('要確認',false)});
 }
 function cf(){
  var base=apiBase();
  $('sheetBody').innerHTML='<div class="lb">Cloudflare 接続</div>'+
   '<div class="mu" id="cfInfo" style="margin-bottom:10px">確認しています…</div>'+
   '<div class="mu" style="font-size:12px;margin:10px 0 4px">接続先のWorker URL（空＝このアプリを配信しているWorker）</div>'+
   '<input id="cfUrl" value="'+esc(base)+'" placeholder="https://aicoach.xxx.workers.dev" autocomplete="off" autocapitalize="off" spellcheck="false">'+
   '<div class="mu" id="cfMsg" style="font-size:12px;margin-top:8px"></div>'+
   '<div class="mu" style="font-size:11px;margin-top:8px">※別のWorkerに向けるには、そちらにも今回の worker.js を入れておく必要があります（他のサイトからの通信を許可する設定を追加しました）。保存するとパスワード入力からやり直します。</div>'+
   '<div class="row" style="margin-top:12px"><button id="cnBack">戻る</button><button id="cfTest">接続テスト</button><button class="p" id="cfSave">保存</button></div>'+
   '<button id="cfReset" class="arc-close">標準（このWorker）に戻す</button>';
  $('cnBack').onclick=list;
  var norm=function(){var v=$('cfUrl').value.trim().replace(/\/+$/,'');if(v&&!/^https:\/\/[^\s/]+(\/[^\s]*)?$/i.test(v))return null;return v};
  $('cfTest').onclick=function(){
   var v=norm();if(v===null){$('cfMsg').textContent='https:// から始まるURLを入れてください';return}
   $('cfMsg').textContent='テスト中…';
   fetch(v+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:appPass})}).then(function(r){
    $('cfMsg').textContent=r.ok?'接続できました ✔':r.status===401?'つながりましたが、パスワードが違います（保存後に新しく入力できます）':'つながりましたが応答が正しくありません（'+r.status+'）';
   }).catch(function(){$('cfMsg').textContent='つながりません。URL、または相手のworker.jsの版（v42以降）を確認してください'});
  };
  $('cfSave').onclick=function(){var v=norm();if(v===null){$('cfMsg').textContent='https:// から始まるURLを入れてください';return}if(v===base){toast('変更はありません');return}S('cfbase',v);toast('接続先を保存しました');setTimeout(function(){location.reload()},500)};
  $('cfReset').onclick=function(){if(!base){toast('すでに標準です');return}S('cfbase','');toast('標準に戻しました');setTimeout(function(){location.reload()},500)};
  if(typeof online==='undefined'||!online){$('cfInfo').innerHTML='接続先：<b>'+esc(base||'このWorker（標準）')+'</b><br>まだサーバーに接続できていません。';return}
  appApi({op:'info'}).then(function(i){
   if(!$('cfInfo'))return;
   var w=(i&&i.worker)||{},a=(i&&i.app)||{};
   $('cfInfo').innerHTML='接続先：<b>'+esc(base||'このWorker（標準）')+'</b><br>'+(!i||i.error?esc((i&&i.error)||'確認できませんでした'):'Worker：<b>接続済み</b>'+(w.version?'（'+esc(w.version)+'）':'')+'<br>R2（保存先）：<b>'+(i.r2===false?'未接続':'接続済み')+'</b><br>アプリ配信：'+esc(a.source==='r2'?'R2':'埋め込み版'));
  });
 }
 function edit(id){
  var s=SVC.filter(function(x){return x.id===id})[0],c=get()[id]||{};
  $('sheetBody').innerHTML='<div class="lb">'+esc(s.name)+' 接続</div>'+
   s.f.map(function(f){return '<div class="mu" style="font-size:12px;margin:10px 0 4px">'+esc(f[1])+'</div><input data-k="'+f[0]+'" value="'+esc(c[f[0]]||'')+'" placeholder="'+esc(f[2])+'" autocomplete="off" autocapitalize="off" spellcheck="false">';}).join('')+
   '<label class="cn-sw"><input type="checkbox" id="cnOn"'+(c.on===false?'':' checked')+'> 有効にする</label>'+
   '<div class="mu" style="font-size:11px;margin-top:8px">※ここには識別子だけを保存します（この端末内）。APIキー・トークンは入力せず、Worker の Secret に登録してください。</div>'+
   '<div class="row" style="margin-top:12px"><button id="cnBack">戻る</button><button class="p" id="cnSave">保存</button></div>'+
   '<button id="cnDel" class="arc-close">この接続を削除</button>';
  $('cnBack').onclick=list;
  $('cnSave').onclick=function(){
   var v=get(),o={on:$('cnOn').checked};
   Array.prototype.forEach.call($('sheetBody').querySelectorAll('input[data-k]'),function(i){o[i.getAttribute('data-k')]=i.value.trim()});
   v[id]=o;S('conn',v);toast(s.name+' を保存しました');list();
  };
  $('cnDel').onclick=function(){var v=get();delete v[id];S('conn',v);toast('削除しました');list();};
 }

 /* ---- v44：日ごとの集計をCSVでダウンロード ---- */
 async function exApi(body){
  var r;
  try{r=await fetch(API('/api/export'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({pass:appPass},body))});}
  catch(e){return {error:'通信できませんでした。電波のある場所でもう一度どうぞ'};}
  var j={};try{j=await r.json();}catch(e){}
  if(!r.ok&&!j.error)j.error='うまくいきませんでした（'+r.status+'）';
  return j;
 }
 function csvPanel(){
  $('sheetBody').innerHTML='<div class=\"lb\">日ごとのCSV</div>'+
   '<div class=\"mu\" style=\"font-size:12px;margin:8px 0\">日ごとの集計（集中時間・記録の有無・結果・手ごたえ・完了タスク数など）をCSVで保存します。Looker Studio などには、このファイルをアップロードして使えます。</div>'+
   '<label class=\"cn-sw\"><input type=\"checkbox\" id=\"exTxt\"> 文章（タスク名・やったこと・ひとこと）も含める</label>'+
   '<div class=\"mu\" id=\"exMsg\" style=\"font-size:12px;margin-top:8px\"></div>'+
   '<div class=\"row\" style=\"margin-top:12px\"><button id=\"cnBack\">戻る</button><button id=\"exCopy\">コピー</button><button class=\"p\" id=\"exDl\">ダウンロード</button></div>';
  var msg=function(t){var e=$('exMsg');if(e)e.textContent=t||''};
  $('cnBack').onclick=list;
  var make=function(cb){
   if(typeof online==='undefined'||!online){msg('サーバー（Worker）に接続できていません');return}
   msg('作っています…');
   exApi({op:'csv',includeText:$('exTxt').checked}).then(function(j){
    if(!j||j.error||j.r2===false){msg((j&&j.error)||'R2（保存先）が未接続です');return}
    if(!j.rows){msg('まだ集計できる記録がありません');return}
    cb(j);
   });
  };
  $('exDl').onclick=function(){make(function(j){
   try{
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([j.csv],{type:'text/csv;charset=utf-8'}));a.download=j.name;
    document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000);
    msg(j.rows+'日分を保存しました（'+j.name+'）');
   }catch(e){msg('ダウンロードできませんでした。「コピー」を使ってください')}
  })};
  $('exCopy').onclick=function(){make(function(j){copyText(j.csv).then(function(ok){msg(ok?j.rows+'日分をコピーしました':'コピーできませんでした')})})};
 }

 // v52: 1種類の学習記録JSONを読み込む（v51の旧集計とv420の旧詳細履歴も互換）。
 function normalizeStudyFile(o,name){
   if(o&&['study-log/1','study-log/2'].includes(o.format))return o;
   // 統合前の詳細履歴だけのファイル。分野別の集計は復元できないため空で持ち込む。
   if(o&&o.schema_version==='1.0'&&o.app==='統計集中対策'&&Array.isArray(o.events)&&typeof o.study_date==='string'&&typeof o.exported_at==='string')
     return {format:'study-log/2',date:o.study_date,exportedAt:o.exported_at,fields:{},history:o};
   throw Error(name+'：統計アプリの学習記録JSONではありません。');
 }
 async function importStudyLogFiles(files,msg){
   files=Array.from(files||[]);
   if(!files.length||files.length>100)throw Error('JSONファイルを1〜100個選んでください');
   if(files.some(f=>f.size>2*1024*1024)||files.reduce((n,f)=>n+f.size,0)>7*1024*1024)throw Error('ファイルは1個2MB、合計7MBまでです');
   const logs=[];
   for(const f of files){let o;try{o=JSON.parse((await f.text()).replace(/^\uFEFF/,''));}catch(e){throw Error(f.name+'：JSONを読めませんでした');}
     logs.push(normalizeStudyFile(o,f.name));}
   if(msg)msg.textContent='サーバーに保存しています…';
   const r=await fetch(API('/api/studylog'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:appPass,op:'put',logs,names:files.map(f=>f.name)})});
   if(r.status===404)throw Error('AIコーチのWorkerをv53に更新してください');
   const j=await r.json().catch(()=>({})),lines=[];
   if(j.ledger){   // v53：中央台帳。日付ではなく解答ごとに合わせた結果
     lines.push('新規追加 '+(j.added|0)+'件 ／ 既存記録の更新 '+(j.updated|0)+'件 ／ 重複スキップ '+(j.duplicate|0)+'件 ／ エラー '+(j.errors|0)+'件');
     if(j.events)lines.push('解答：新しく '+(j.events.added|0)+'問を台帳に追加（'+(j.events.duplicate|0)+'問は保存済み）');
     for(const f of j.files||[])lines.push('・'+(f.name||'ファイル'+(f.index+1))+'：'+({added:'新しい日として追加',updated:'その日の記録に追記（新しい解答 '+(f.newEvents|0)+'問）',duplicate:'すべて保存済み（変更なし）',error:f.error}[f.result]||f.result)+(f.date?'（'+f.date+'）':''));
     if(!r.ok||j.error)lines.push(j.error||'取り込めませんでした（'+r.status+'）');
     if(typeof lgInvalidate==='function')lgInvalidate(j.dates);
     if((j.added|0)+(j.updated|0)){dashAt=0;await dashLoad('state');}
     return lines.join('\n');
   }
   if(j.saved&&j.saved.length)lines.push('取り込みました：'+j.saved.join('、'));
   for(const x of j.skipped||[])lines.push(x.date+'：'+({older:'保存済みの記録より古いため変更しませんでした',same:'同じ記録が保存済みです',conflict:'書き出し時刻が同じで内容が異なります。統計アプリから出力し直してください'}[x.reason]||'変更はありません'));
   for(const e of j.rejected||[])lines.push((files[e.index]?files[e.index].name:'ファイル')+'：'+e.error);
   if(!r.ok||j.error||j.r2===false)lines.push(j.error||'取り込めませんでした（'+r.status+'）');
   if(j.saved&&j.saved.length){dashAt=0;await dashLoad('state');}
   return lines.join('\n')||'取り込み結果を確認できませんでした';
 }
 function studyPanel(){
   $('sheetBody').innerHTML='<div class="lb">学習記録を取り込む</div><p class="mu">統計アプリの「学習記録JSON」を選んでください。詳細履歴と21分野集計が1ファイルにまとまっています（複数選択も可）。過去の学習台帳JSON・履歴JSONも読み込めます。データはR2へ保存し、同じ日の更新前データをバックアップします。</p><input id="slFile" type="file" accept=".json,application/json" multiple><div id="slMsg" class="mu" role="status" aria-live="polite" style="white-space:pre-wrap;margin-top:12px"></div><div class="row" style="margin-top:12px"><button id="slBack">戻る</button><button id="slGo" class="p">取り込む</button></div>';
   $('slBack').onclick=list;
   $('slGo').onclick=async function(){
     const msg=$('slMsg'),go=$('slGo'),file=$('slFile'),back=$('slBack');
     go.disabled=file.disabled=back.disabled=true;msg.textContent='読み込んでいます…';
     try{msg.textContent=await importStudyLogFiles(file.files,msg);}
     catch(e){msg.textContent=e.message||'通信できませんでした。再度取り込んでください';}
     finally{go.disabled=file.disabled=back.disabled=false;}
   };
 }
 window.importStudyLogFiles=importStudyLogFiles;
 window.openStudyLogImport=function(){list();studyPanel();};
 window.openSettings=list;
 function init(){var b=$('btnSettings');if(b)b.onclick=list;}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
