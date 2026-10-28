/* AIコーチ v48 — Amazon Cognito ログイン（認可コード＋PKCE）。core.js の次に読み込む。
   ・Worker の GET /api/config で方式（pass / cognito / both）を知る。pass なら何もしない（v47と同じ）
   ・ログイン＝Cognito の Hosted UI へ移動 → 戻ってきたら code をトークンに換える（クライアントシークレットは使わない）
   ・送るのは ID トークン。API の "pass" の欄に入れる（Worker が署名・iss・aud・exp・token_use を確認する）
   ・トークンは約1時間で切れるので、リフレッシュトークンで自動更新する（端末の localStorage に保存）
   ・ログアウトは Cognito 側のセッションも閉じる（閉じないと次回パスワードなしで入れてしまう） */
(function(){
 'use strict';
 var CFG=null, tok=null, pending=null, busy=false, timer=null;
 var RU=location.origin+'/';
 var enc=encodeURIComponent;
 try{tok=L('cog',null);}catch(e){tok=null}
 if(!tok||typeof tok!=='object'||!tok.id)tok=null;

 function b64u(buf){var s='',a=new Uint8Array(buf);for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
 function rnd(n){var a=new Uint8Array(n);crypto.getRandomValues(a);return b64u(a);}
 function sha256(s){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)).then(b64u);}
 function expOf(jwt){try{var p=String(jwt).split('.')[1].replace(/-/g,'+').replace(/_/g,'/');while(p.length%4)p+='=';return JSON.parse(atob(p)).exp*1000;}catch(e){return 0}}
 function active(){return !!(CFG&&CFG.cognito&&tok);}
 function msg(t){var e=$('pwMsg');if(e)e.textContent=t||'';}
 function show(id,on){var e=$(id);if(e)e.classList[on?'remove':'add']('hide');}
 function save(){try{if(tok)S('cog',tok);else localStorage.removeItem('ac_cog');}catch(e){}}
 function clearTok(){tok=null;save();if(timer)clearTimeout(timer);}
 function tokenUrl(){return 'https://'+CFG.cognito.domain+'/oauth2/token';}
 function form(o){return Object.keys(o).map(function(k){return enc(k)+'='+enc(o[k]);}).join('&');}

 /* ---- ログイン開始：Hosted UI へ ---- */
 async function login(){
  if(!CFG||!CFG.cognito)return;
  if(!(window.crypto&&crypto.subtle)){msg('この環境ではログインできません（https で開いてください）');return;}
  var v=rnd(48), st=rnd(16);
  S('cogpkce',{v:v,s:st,t:Date.now()});
  var ch=await sha256(v);
  location.href='https://'+CFG.cognito.domain+'/oauth2/authorize?response_type=code&client_id='+enc(CFG.cognito.clientId)+
   '&redirect_uri='+enc(RU)+'&scope='+enc('openid email')+'&state='+st+'&code_challenge_method=S256&code_challenge='+ch;
 }

 /* ---- 戻ってきた時：code → トークン ---- */
 async function handleCallback(){
  var q=new URLSearchParams(location.search);
  if(!q.has('code')&&!q.has('error'))return null;
  var code=q.get('code'), st=q.get('state'), err=q.get('error'), desc=q.get('error_description');
  ['code','state','error','error_description'].forEach(function(k){q.delete(k);});
  try{history.replaceState(null,'',location.pathname+(q.toString()?'?'+q.toString():'')+location.hash);}catch(e){}
  var p=L('cogpkce',null); try{localStorage.removeItem('ac_cogpkce');}catch(e){}
  if(err){msg('ログインできませんでした（'+(desc||err)+'）');return false;}
  if(!p||!p.v||p.s!==st||Date.now()-p.t>15*60*1000){msg('ログインの途中で状態が合わなくなりました。もう一度ログインしてください');return false;}
  try{
   var r=await fetch(tokenUrl(),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:form({grant_type:'authorization_code',client_id:CFG.cognito.clientId,code:code,redirect_uri:RU,code_verifier:p.v})});
   var j=await r.json().catch(function(){return {}});
   if(!r.ok||!j.id_token){msg('ログインできませんでした（'+(j.error_description||j.error||('HTTP '+r.status))+'）');return false;}
   tok={id:j.id_token,refresh:j.refresh_token||'',exp:expOf(j.id_token)};
   save();return true;
  }catch(e){msg('Cognito に接続できませんでした');return false;}
 }

 /* ---- 自動更新 ---- */
 var refreshing=null;
 function refresh(){
  if(refreshing)return refreshing;
  refreshing=(async function(){
   var t=tok; if(!t||!t.refresh||!CFG||!CFG.cognito)return false;
   try{
    var r=await fetch(tokenUrl(),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
     body:form({grant_type:'refresh_token',client_id:CFG.cognito.clientId,refresh_token:t.refresh})});
    if(r.status===400||r.status===401){clearTok();return false;}   // リフレッシュトークンが失効
    var j=await r.json().catch(function(){return {}});
    if(!r.ok||!j.id_token)return false;
    tok={id:j.id_token,refresh:j.refresh_token||t.refresh,exp:expOf(j.id_token)};
    save();apply();return true;
   }catch(e){return false;}   // 通信できないだけなら、トークンは残す
   finally{refreshing=null;}
  })();
  return refreshing;
 }
 function apply(){
  if(!tok)return;
  appPass=tok.id;
  if(timer)clearTimeout(timer);
  timer=setTimeout(refresh,Math.max(15000,tok.exp-Date.now()-120000));
 }
 function fresh(){return tok&&tok.exp-Date.now()<90000?refresh():Promise.resolve(true);}

 /* ---- fetch の包み：このアプリのWorkerへの /api/ 呼び出しだけ、最新のトークンに差し替え、401なら1回更新して再送 ---- */
 var rawFetch=window.fetch.bind(window);
 function own(url){var b=apiBase();return b?url.indexOf(b+'/api/')===0:(url.charAt(0)==='/'||url.indexOf(location.origin+'/')===0)&&url.indexOf('/api/')>=0;}
 var PASS_HEAD=/^\{"pass":"(?:[^"\\]|\\.)*"/;
 function withTok(init){
  if(!tok||!init||typeof init.body!=='string'||!PASS_HEAD.test(init.body))return init;
  return Object.assign({},init,{body:init.body.replace(PASS_HEAD,'{"pass":"'+tok.id+'"')});
 }
 window.fetch=function(input,init){
  var url=typeof input==='string'?input:(input&&input.url)||'';
  if(!active()||!own(url)||url.indexOf('/api/config')>=0)return rawFetch(input,init);
  return fresh().then(function(){return rawFetch(input,withTok(init));}).then(function(res){
   if(res.status!==401)return res;
   return refresh().then(function(ok){
    if(!ok)return res;
    return rawFetch(input,withTok(init)).then(function(r2){if(r2.status===401)expired();return r2;});
   });
  });
 };
 function expired(){
  clearTok();
  var g=$('gate');if(g)g.classList.remove('hide');
  showBoxes();msg('ログインが切れました。もう一度ログインしてください');
 }
 document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&active())fresh();});

 /* ---- 入り口の画面 ---- */
 function showBoxes(){
  var m=CFG&&CFG.mode||'pass';
  show('pwBox',m!=='cognito');                                  // パスワード欄：pass / both の時だけ
  show('cogBox',m!=='pass'&&!!(CFG&&CFG.cognito));              // Cognito ボタン：cognito / both で、設定がそろっている時だけ
 }
 async function enter(){
  if(busy)return; busy=true;
  try{
   if(tok&&tok.exp-Date.now()<90000)await refresh();
   if(!tok){msg('ログインが切れました。もう一度ログインしてください');return;}
   if(tok.exp<Date.now()){msg('サーバーに接続できません。つながると自動で入ります');return;}   // 通信できないだけ。トークンは残す
   apply();
   msg('ログインを確認しています…');
   var r=await unlock(tok.id);
   if(r==='denied')clearTok();   // サーバーが受け付けなかった（許可されていないアカウントなど）
  }finally{busy=false;}
 }
 function logoutHosted(){   // Cognito 側のセッションも閉じる（閉じないと、次のログインでパスワードなしに同じ人で入ってしまう）
  location.href='https://'+CFG.cognito.domain+'/logout?client_id='+enc(CFG.cognito.clientId)+'&logout_uri='+enc(RU);
 }
 function logout(){
  var had=!!tok;
  clearTok();
  try{localStorage.removeItem('ac_cogpkce');}catch(e){}
  if(had&&CFG&&CFG.cognito)logoutHosted();else location.reload();
 }

 async function start(){
  window.__acAuth=1;
  var cb=$('cogBtn'); if(cb)cb.onclick=login;
  var co=$('cogOut'); if(co)co.onclick=function(){CFG&&CFG.cognito?logoutHosted():location.reload();};
  try{
   var r=await rawFetch(API('/api/config'),{cache:'no-store'});
   CFG=r.ok?await r.json():null;
  }catch(e){CFG=null;}
  if(!CFG||(CFG.mode||'pass')==='pass'){CFG=CFG||{mode:'pass'};clearTok();show('pwBox',true);show('cogBox',false);msg('');return;}   // v47と同じ：パスワード
  showBoxes();msg('');
  if(CFG.error&&!CFG.cognito){msg('サーバーの設定が足りません：'+CFG.error);return;}
  var cbk=await handleCallback();
  if(cbk===false)return;
  window.addEventListener('online',function(){var g=$('gate');if(tok&&g&&!g.classList.contains('hide'))enter();});
  if(tok)await enter();
 }
 window.acAuth={active:active,logout:logout,login:login,mode:function(){return CFG&&CFG.mode||'pass'}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
