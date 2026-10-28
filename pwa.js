/* AIコーチ v30 — PWA（インストール案内・Service Worker 登録）（app-v30/ が元。build_v30.py で1ファイル版・bundle を作る） */
(function(){
 var ok=/^https?:$/.test(location.protocol)&&!/claude\.ai|claudeusercontent/.test(location.hostname);
 if(ok&&'serviceWorker' in navigator){try{navigator.serviceWorker.register('/sw.js').catch(function(){});}catch(e){}}
 var dp=null,standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone;
 var ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
 function dismissed(){try{return +localStorage.getItem('ac_installDismiss')>Date.now()}catch(e){return false}}
 function bar(){
  if(standalone||!ok||dismissed()||document.getElementById('pwaBar'))return;
  if(!dp&&!ios)return;
  var d=document.createElement('div');d.id='pwaBar';
  d.style.cssText='position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:180;display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;border:1px solid #2a5a6a;border-radius:16px;background:rgba(8,18,32,.97);box-shadow:0 12px 30px rgba(0,0,0,.5);color:#eaffff;font-size:13px';
  d.innerHTML='<img src="/icon-192.png" width="36" height="36" style="border-radius:9px"><div style="flex:1;line-height:1.5"><b>アプリとしてインストール</b><div style="font-size:11px;color:#8199b0">'+(dp?'ホーム画面から全画面で開けます':'共有ボタン →「ホーム画面に追加」')+'</div></div>'+(dp?'<button id="pwaGo" style="height:38px;padding:0 14px;border:0;border-radius:11px;background:linear-gradient(100deg,#EBC67E,#D9A85B);color:#291D09;font-weight:800">インストール</button>':'')+'<button id="pwaX" aria-label="閉じる" style="width:32px;height:32px;border:1px solid #18354a;border-radius:10px;background:none;color:#8199b0">×</button>';
  document.body.appendChild(d);
  var g=document.getElementById('pwaGo');if(g)g.onclick=function(){dp.prompt();dp.userChoice.finally(function(){dp=null;d.remove();});};
  document.getElementById('pwaX').onclick=function(){try{localStorage.setItem('ac_installDismiss',String(Date.now()+14*864e5))}catch(e){}d.remove();};
 }
 window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();dp=e;setTimeout(bar,1500);});
 window.addEventListener('appinstalled',function(){var d=document.getElementById('pwaBar');if(d)d.remove();});
 if(ios)setTimeout(bar,3000);
})();

/* 新しい版がR2に上がっていたら、自動で読み込み直す（同じ版なら何もしない） */
(function(){
 if(!/^https?:$/.test(location.protocol)||/claude\.ai|claudeusercontent/.test(location.hostname))return;
 function check(){
  fetch('/app/manifest.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(m){
   if(!m||!m.version||typeof APP_VERSION==='undefined'||m.version===APP_VERSION)return;
   var k='ac_autoReload_'+m.version;
   try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1');}catch(e){}
   location.reload();
  }).catch(function(){});
 }
 check();
 document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')check();});
})();

/* v46：PC（幅1000px以上・マウス操作）だけ、キー 1〜5 で下のタブ（左サイドバー）を切り替える（v63：予定タブで5つ） */
(function(){
 var mq=window.matchMedia&&window.matchMedia('(min-width:1000px) and (hover:hover) and (pointer:fine)');
 var ids=['tToday','tPlan','tLog','tDash','tSettings'];
 document.addEventListener('keydown',function(e){
  if(!mq||!mq.matches||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
  var i=ids.indexOf(['1','2','3','4','5'].indexOf(e.key)>=0?ids[Number(e.key)-1]:'');
  if(i<0)return;
  var t=e.target,tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable))return;
  var g=document.getElementById('gate');if(g&&!g.classList.contains('hide'))return;
  var b=document.getElementById(ids[i]);if(b){e.preventDefault();b.click();}
 });
})();

/* v47：PCの「今日のプロンプト」中身表示（モーダル）を、背景クリックと Esc で閉じる */
(function(){
 var mq=window.matchMedia&&window.matchMedia('(min-width:1000px) and (hover:hover) and (pointer:fine)');
 function d(){return document.getElementById('fzAiV');}
 document.addEventListener('click',function(e){var x=d();if(x&&x.open&&e.target===x&&mq&&mq.matches)x.open=false;});
 document.addEventListener('keydown',function(e){var x=d();if(e.key==='Escape'&&x&&x.open&&mq&&mq.matches)x.open=false;});
})();

/* v49：右上の「プロトタイプ vNN」は APP_VERSION に自動で合わせる（index.html の直し忘れ防止） */
(function(){const f=()=>{try{const e=document.querySelector('.hd-set span');if(e&&typeof APP_VERSION!=='undefined')e.textContent='プロトタイプ '+APP_VERSION;}catch(_){}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',f);else f();})();
