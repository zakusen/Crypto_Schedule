/* AIコーチ v64 — 学びノート（v66.1：AIの下書きはふわ（Muse）に頼む。アプリの中のAIは使わない）（ログタブ：「日付ログ／学びノート」）
   ・日付ログの1日から「✦ このログから学びを整理」。AIが関連知識を調べ、「下書き（未確認）」を作る。元の記録（台帳・日記）は変えない
   ・下書きは日付ログと学びノートに「未確認」として出る。本人が「確認して保存」を押すと確定。「既存ノートに追記」もできる
   ・ノートの中で「自分の記録」と「AIの補足」と「参照元」を分けて見せる。「チートシートの材料に」で振り返りノートの素材に入る
   ・保存は改訂ごと（同じ改訂の再送は二重にならない）。端末に先に残し、R2 へ送る（Worker v64）。直すと前の内容は履歴に残る */
(function(){
  'use strict';
  let notes=L('knowledgeNotes',[]); if(!Array.isArray(notes)) notes=[];
  let q='', starOnly=false, syncMsg='', syncBusy=false, draft=null, busy=false, lastSync=0, selId='', srcOpen=false;
  const save=()=>S('knowledgeNotes',notes);
  const uid=p=>p+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  const rev=()=>{ try{ if(crypto.randomUUID) return crypto.randomUUID(); }catch(e){} return uid('r'); };
  const md=d=>{ const x=new Date(d+'T00:00'); return (x.getMonth()+1)+'/'+x.getDate(); };
  const now=()=>new Date().toISOString();
  const originOf=n=>n.origin||(n.researched?'web':'self');
  const daysOf=n=>(n.sourceDates&&n.sourceDates.length?n.sourceDates:[n.date]);
  const visible=()=>notes.filter(n=>n.state!=='merged');
  const isDraft=n=>n.state==='draft';
  const supLabel=o=>o==='self'?'自分の補足':o==='fuwa'?'ふわの補足':'AIの補足';
  const IC={   // 小さな線の印（SVG）
    me:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z"/><path d="M9 11l2 2 4-4"/></svg>',
    ai:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z"/><path d="M12 7l1.4 3.2L17 11.5l-3.6 1.3L12 16l-1.4-3.2L7 11.5l3.6-1.3z"/></svg>',
    warn:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
    src:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h4"/></svg>',
    ex:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>',
    log:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    note:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l5 5-10 10H5v-5z"/><path d="M13 6l5 5"/></svg>'};
  async function api(body){
    const r=await fetch(API('/api/knowledge'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({pass:appPass},body))});
    const j=await r.json().catch(()=>({}));
    if(r.status===404) throw new Error('Worker を v64 に更新すると使えます');
    if(!r.ok||j.error) throw new Error(j.error||('HTTP '+r.status));
    return j;
  }

  /* ---- 同期（端末が先。R2 が正本の写し） ---- */
  async function sync(){
    if(syncBusy||!online||!appPass) return; syncBusy=true;
    try{
      for(const n of notes.filter(x=>x.pending)){
        const j=await api({op:'save',note:n});
        const i=notes.findIndex(x=>x.id===n.id&&x.rev===n.rev); if(i>=0&&j.note) notes[i]=Object.assign({},j.note,{pending:false});
      }
      const j=await api({op:'list'});
      (j.notes||[]).forEach(s=>{ const i=notes.findIndex(x=>x.id===s.id);
        if(i<0) notes.push(Object.assign({},s,{pending:false}));
        else if(!notes[i].pending&&String(s.updatedAt)>String(notes[i].updatedAt||'')) notes[i]=Object.assign({},s,{pending:false}); });
      save(); syncMsg=''; lastSync=Date.now();
    }catch(e){ syncMsg='端末にだけ残っています（'+e.message+'）'; }
    syncBusy=false; refresh();
  }
  const isOpen=()=>typeof activeAppTab!=='undefined'&&activeAppTab==='log'&&rvMode==='notes';
  const inDiary=()=>typeof activeAppTab!=='undefined'&&activeAppTab==='log'&&rvMode==='diary'&&$('dyPage');
  function refresh(){ if(isOpen()) render(); else if(inDiary()) paintDayCard(); }
  function putLocal(n){ const i=notes.findIndex(x=>x.id===n.id); if(i>=0) notes[i]=n; else notes.unshift(n); save(); sync(); }
  function revise(n,changes,keepHistory){
    const prev=n, n2=Object.assign({},n,changes,{rev:rev(),pending:true,updatedAt:now()});
    if(keepHistory) n2.history=(prev.history||[]).concat([{at:prev.updatedAt||'',rev:prev.rev||'',title:prev.title,supplement:prev.supplement,example:prev.example,caution:prev.caution}]).slice(-30);
    putLocal(n2); return n2;
  }

  /* ---- 1日の記録から「根拠の文」を作る（元の記録は読むだけ） ---- */
  async function evidenceOf(d){
    const out=[];
    try{ const c=await lgLoadDay(d); const data=c&&c.data;
      ((data&&data.activities)||[]).filter(a=>a.status==='active').forEach(a=>out.push('［'+(a.kind||'記録')+'］'+(a.did||'')+(a.note?'\n'+a.note:'')));
      const st=data&&data.study;
      if(st&&st.mistakes&&st.mistakes.length) out.push('［演習の間違い］\n'+st.mistakes.slice(0,10).map(m=>'・'+(m.topic?m.topic+'：':'')+(m.question||'')+'（選んだ '+(m.selected||'－')+'／正解 '+(m.expected||'－')+'）').join('\n'));
    }catch(e){}
    const r=(typeof recs!=='undefined'&&recs[d])||null;
    if(r&&(r.action||r.note)) out.push('［日の記録］'+(r.action||'')+(r.note?'\nひとこと：'+r.note:''));
    return out.join('\n\n').slice(0,18000);
  }
  const mine=n=>n.question||cut(String(n.evidence||'').replace(/［[^］]*］/g,'').trim(),90)||'（記録なし）';
  const logLabel=n=>{ const f=String(n.evidence||'').match(/［[^］]*］([^\n]*)/); return f?cut(f[1],24):''; };

  /* ---- 学びノートの画面：左に一覧、右（スマホは下）に詳しく ---- */
  function ensureShell(){
    const rv=document.querySelector('#vLog .rv'); if(!rv) return false;
    const tabs=rv.querySelector('.record-tabs');
    if(tabs&&!$('rvTabKn')){ const b=document.createElement('button'); b.id='rvTabKn'; b.setAttribute('role','tab'); b.setAttribute('aria-selected','false');
      b.innerHTML='<span class="tab-icon">✦</span><span class="tab-copy"><b>学びノート</b><small>分かったことを残す</small></span>'; b.onclick=()=>setRvMode('notes',false); tabs.appendChild(b); }
    const dy=$('rvTabDy'); if(dy&&!dy.dataset.v64){ dy.dataset.v64='1'; const t=dy.querySelector('.tab-copy b'); if(t) t.textContent='日付ログ'; }
    const ti=$('rvTabIn'); if(ti&&!ti.dataset.v64){ ti.dataset.v64='1'; const t=ti.querySelector('.tab-copy b'); if(t) t.textContent='取り込み'; }
    if(!$('knWork')){ const s=document.createElement('section'); s.id='knWork'; s.className='kn'; const dw=$('dyWork'); if(dw&&dw.nextSibling) rv.insertBefore(s,dw.nextSibling); else rv.appendChild(s); }
    return true;
  }
  function cardHTML(n){
    const o=originOf(n), dr=isDraft(n);
    return '<button class="kn-card'+(n.id===selId?' sel':'')+(dr?' draft':'')+'" data-kn="'+esc(n.id)+'" aria-pressed="'+(n.id===selId)+'"><span class="kn-ci">'+IC.note+'</span>'+
      '<span class="kn-cb"><span class="kn-ct"><b>'+esc(n.title||'（無題）')+'</b>'+(n.starred?'<i class="kn-star on" aria-label="お気に入り">★</i>':'')+'</span>'+
      '<span class="kn-cm">'+(dr?'<span class="kn-b draft">下書き・確認待ち</span>':'<span class="kn-b o-'+o+'">'+(o==='self'?'自分で書いた':o==='fuwa'?'ふわ補足・確認済み':'AI補足・確認済み')+'</span>')+(n.cheat?'<span class="kn-b cheat">チートシート</span>':'')+(n.pending?'<span class="kn-b pend">未同期</span>':'')+
      '<span class="kn-from mono">元のログ：'+esc(daysOf(n).map(md).join('・'))+'</span></span></span><i class="kn-chev" aria-hidden="true">›</i></button>';
  }
  function detailHTML(n){
    if(!n) return '<div class="kn-none">ノートを選ぶと、ここに「自分の記録・AIの補足・参照元」が並びます。</div>';
    const o=originOf(n), dr=isDraft(n);
    const row=(ic,k,v,cls)=>'<div class="kn-row'+(cls?' r-'+cls:'')+'"><span class="kn-ri">'+ic+'</span><span class="kn-rk">'+k+'</span><div class="kn-rv">'+v+'</div></div>';
    let h='<div class="kn-dhd"><h3>'+esc(n.title)+'</h3>'+(dr?'<span class="kn-b draft">下書き・確認待ち</span>':'<span class="kn-b ok">確認済み</span>')+'<button class="kn-icon" id="knStarT" aria-label="'+(n.starred?'お気に入りを外す':'お気に入り')+'">'+(n.starred?'★':'☆')+'</button></div>';
    h+=row(IC.me,'自分の記録',esc(mine(n))+(n.evidence?'<details class="kn-ev"><summary>元の記録の全文</summary><pre>'+esc(n.evidence)+'</pre></details>':''),'me');
    h+=row(IC.ai,supLabel(o),'<div class="kn-tx">'+esc(n.supplement)+'</div>',o==='self'?'self':'ai');
    if(n.example) h+=row(IC.ex,'例','<pre class="kn-code">'+esc(n.example)+'</pre>');
    if(n.caution) h+=row(IC.warn,'注意点','<div class="kn-tx">'+esc(n.caution)+'</div>');
    if((n.sources&&n.sources.length)||n.searchEntry) h+=row(IC.src,'参照元','<button class="kn-srcbtn" id="knSrcT" aria-expanded="'+srcOpen+'">調査した資料をここで確認 ›</button>'+(srcOpen?sourcesHTML(n):''));
    else if(o!=='self') h+=row(IC.src,'参照元','<span class="mu">Web検索なし（一般知識による補足）</span>');
    h+=row(IC.log,'元のログ',daysOf(n).map(d=>'<button class="kn-day" data-knday="'+esc(d)+'">'+esc(md(d))+(logLabel(n)?' '+esc(logLabel(n)):'')+' ›</button>').join(' '));
    if(n.history&&n.history.length) h+='<details class="kn-hist"><summary>前の内容 '+n.history.length+'件</summary>'+n.history.slice().reverse().map(x=>'<div class="kn-h"><span class="mono">'+esc(String(x.at||'').slice(0,16).replace('T',' '))+'</span><b>'+esc(x.title)+'</b><div class="kn-tx">'+esc(cut(x.supplement,240))+'</div></div>').join('')+'</details>';
    h+='<div class="kn-dbtns"><button class="kn-line" id="knEdit">修正</button>'+(dr?'<button class="kn-primary kn-save" id="knOk">確認して保存</button>':'')+
      '<button class="kn-ai kn-cheat'+(n.cheat?' on':'')+'" id="knCheat" aria-pressed="'+!!n.cheat+'">'+(n.cheat?'✓ チートシートの材料':'チートシートの材料に')+'</button></div>'+
      (dr?'<button class="kn-link" id="knMerge">既存ノートに追記する ›</button>':'');
    return '<article class="kn-detail'+(dr?' draft':'')+'" id="knDetailCard">'+h+'</article>';
  }
  function render(){
    if(!ensureShell()) return; const w=$('knWork');
    const k=q.trim().toLowerCase(), all=visible();
    const list=all.filter(n=>(!starOnly||n.starred)&&(!k||[n.title,n.supplement,n.example,n.caution,n.evidence].join('\n').toLowerCase().includes(k)))
      .sort((a,b)=>(isDraft(b)-isDraft(a))||String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)));
    if(selId&&!all.some(n=>n.id===selId)) selId='';
    const pc=matchMedia('(min-width:900px)').matches; if(!selId&&pc&&list.length) selId=list[0].id;
    const sel=all.find(n=>n.id===selId);
    w.innerHTML='<div class="kn-layout"><div class="kn-left">'+
      '<div class="kn-head"><h2>日付を越えて、<br>学びがつながる</h2><p class="mu">日付ログから作った学びを1枚ずつ。元の記録は変わりません。<span class="mono">（'+all.length+'件）</span></p></div>'+
      '<div class="kn-filter"><input id="knQ" type="search" placeholder="ノートを検索" value="'+esc(q)+'" aria-label="ノートを検索"><button id="knStar" class="kn-line'+(starOnly?' on':'')+'" aria-pressed="'+starOnly+'">★</button></div>'+
      (syncMsg?'<p class="kn-sync warn">'+esc(syncMsg)+'</p>':'')+
      '<div class="kn-list" id="knList">'+(list.length?list.map(cardHTML).join(''):'<p class="kn-empty">'+(all.length?'当てはまるノートがありません。':'まだノートがありません。日付ログの「✦ このログから学びを整理」で作れます。')+'</p>')+'</div>'+
      '<div class="kn-acts"><button class="kn-ai" id="knFromDay">✦ ログから学びを整理</button><button class="kn-line" id="knSelf">＋ 自分で書く</button></div>'+
      '</div><div class="kn-right" id="knDetail">'+detailHTML(sel)+'</div></div>';
    $('knFromDay').onclick=()=>openCreate(typeof dySel!=='undefined'&&dySel?dySel:today());
    $('knSelf').onclick=()=>openEditor({date:today(),sourceDates:[today()],evidence:'',origin:'self'},true);
    let tm=0; $('knQ').oninput=e=>{ q=e.target.value; clearTimeout(tm); tm=setTimeout(()=>{ const p=e.target.selectionStart; render(); const i=$('knQ'); i.focus(); try{i.setSelectionRange(p,p);}catch(_){} },200); };
    $('knStar').onclick=()=>{ starOnly=!starOnly; render(); };
    w.querySelectorAll('[data-kn]').forEach(b=>b.onclick=()=>{ selId=b.dataset.kn; srcOpen=false; render(); if(!matchMedia('(min-width:900px)').matches){ const d=$('knDetailCard'); if(d) d.scrollIntoView({block:'start',behavior:'smooth'}); } });
    if(sel) bindDetail(sel,w);
    if(Date.now()-lastSync>60000) sync();
  }
  function bindDetail(n,root){
    const q2=s=>root.querySelector(s);
    if(q2('#knStarT')) q2('#knStarT').onclick=()=>{ revise(n,{starred:!n.starred}); refresh(); };
    if(q2('#knEdit')) q2('#knEdit').onclick=()=>openEditor(n,false);
    if(q2('#knOk')) q2('#knOk').onclick=()=>{ revise(n,{state:'confirmed'}); toast('確認して保存しました'); refresh(); };
    if(q2('#knCheat')) q2('#knCheat').onclick=()=>{ revise(n,{cheat:!n.cheat}); toast(n.cheat?'チートシートの材料から外しました':'チートシートの材料にしました（振り返りノートの書き出しに入ります）'); refresh(); };
    if(q2('#knMerge')) q2('#knMerge').onclick=()=>openMerge(n);
    if(q2('#knSrcT')) q2('#knSrcT').onclick=()=>{ srcOpen=!srcOpen; refresh(); };
    root.querySelectorAll('[data-knday]').forEach(b=>b.onclick=()=>{ closeSheet(); dySel=b.dataset.knday; showView('log'); setRvMode('diary',false); });
  }

  /* ---- 日付ログの中：入口と「学びノートの下書き（未確認）」 ---- */
  function paintDayCard(){
    const pg=$('dyPage'); if(!pg) return; const d=pg.dataset.day||dySel||today();
    let b=$('knDayBtn');
    if(!b){ b=document.createElement('button'); b.id='knDayBtn'; b.className='kn-dayentry'; b.innerHTML='<span class="kn-spark" aria-hidden="true">✦</span><b>このログから学びを整理</b><small>その日の記録からノートを作る</small><i aria-hidden="true">›</i>';
      const rp=$('rpEntry'); if(rp&&rp.parentNode) rp.parentNode.insertBefore(b,rp.nextSibling); else pg.prepend(b); }
    b.onclick=()=>openCreate(d);
    const drafts=visible().filter(n=>isDraft(n)&&daysOf(n).includes(d));
    let c=$('knDayDrafts');
    if(!drafts.length){ if(c) c.remove(); return; }
    if(!c){ c=document.createElement('section'); c.id='knDayDrafts'; c.className='kn-dcard'; b.parentNode.insertBefore(c,b.nextSibling); }
    c.innerHTML='<div class="kn-dch"><h4>学びノートの下書き</h4><span class="kn-b draft">未確認</span></div>'+drafts.map(n=>
      '<div class="kn-dd"><button class="kn-dt2" data-knopen="'+esc(n.id)+'"><b>'+esc(n.title)+'</b><span class="kn-l1"><i>自分の記録</i>'+esc(cut(mine(n),60))+'</span><span class="kn-l1 ai"><i>'+supLabel(originOf(n))+'</i>'+esc(cut(n.supplement,70))+'</span><em aria-hidden="true">›</em></button>'+
      '<div class="kn-dbtns"><button class="kn-primary kn-save" data-knok="'+esc(n.id)+'">確認して保存</button><button class="kn-line" data-knmg="'+esc(n.id)+'">既存ノートに追記</button></div></div>').join('');
    c.querySelectorAll('[data-knopen]').forEach(x=>x.onclick=()=>{ selId=x.dataset.knopen; srcOpen=false; setRvMode('notes',false); });
    c.querySelectorAll('[data-knok]').forEach(x=>x.onclick=()=>{ const n=notes.find(y=>y.id===x.dataset.knok); if(n){ revise(n,{state:'confirmed'}); toast('確認して保存しました'); paintDayCard(); } });
    c.querySelectorAll('[data-knmg]').forEach(x=>x.onclick=()=>{ const n=notes.find(y=>y.id===x.dataset.knmg); if(n) openMerge(n); });
  }

  /* ---- シート：作る（根拠 → AIの下書き or 自分で） ---- */
  async function openCreate(d){
    sheet('<div class="lb">このログから学びを整理（'+esc(md(d))+'）</div><p class="mu kn-p">記録を読み込んでいます…</p>');
    const ev=await evidenceOf(d);
    sheet('<div class="lb">このログから学びを整理</div>'+
      '<label class="kn-l">日付 <input type="date" id="knD" value="'+esc(d)+'" max="'+today()+'"></label>'+
      '<label class="kn-l">根拠（その日の記録。元の記録は変わりません）<textarea id="knEv" rows="7">'+esc(ev)+'</textarea></label>'+
      (ev?'':'<p class="mu kn-p">この日の記録が見つかりませんでした。分からなかったことを下に書けば、それを元に書けます。</p>')+
      '<label class="kn-l">分からなかったこと・調べたいこと（任意）<input id="knQs" maxlength="500" placeholder="例：傾きと相関係数の違いがあいまい"></label>'+
      '<p class="mu kn-p">根拠と「分からなかったこと」を材料に、自分でノートを書きます。AIに調べさせたい時は、この画面の内容をふわ（チャット）に渡してください。</p>'+
      '<div class="kn-sb"><button class="kn-ai" id="knMine">自分で書く</button></div><div id="knMsg" class="kn-msg" role="status"></div>'+
      '<button class="dy-close" id="knX">閉じる</button>');
    $('knD').onchange=async()=>{ const v=$('knD').value; if(!/^\d{4}-\d\d-\d\d$/.test(v)) return; $('knEv').value='読み込んでいます…'; $('knEv').value=await evidenceOf(v); };
    $('knX').onclick=closeSheet;
    $('knMine').onclick=()=>openEditor({date:$('knD').value||d,sourceDates:[$('knD').value||d],evidence:$('knEv').value,question:$('knQs').value,origin:'self'},true);
  }
  /* ---- シート：修正・自分で書く（新しい改訂として保存） ---- */
  function openEditor(n,isNew){
    draft=Object.assign({},n);
    const o=originOf(draft);
    sheet('<div class="lb">'+(isNew?'ノートを書く':'ノートを修正')+'</div>'+
      (o!=='self'?'<p class="kn-warn">'+supLabel(o)+'です。'+(o==='web'?'参照元を開いて確かめ、':'')+'違うところは直してください。</p>':'')+
      (draft.evidence?'<details class="kn-ev"><summary>根拠（元の記録）</summary><pre>'+esc(draft.evidence)+'</pre></details>':'')+
      '<label class="kn-l">テーマ<input id="knT" maxlength="160" value="'+esc(draft.title||'')+'"></label>'+
      '<label class="kn-l">'+supLabel(o)+'<textarea id="knS" rows="7">'+esc(draft.supplement||'')+'</textarea></label>'+
      '<label class="kn-l">例（式・コード）<textarea id="knE" rows="3" class="mono">'+esc(draft.example||'')+'</textarea></label>'+
      '<label class="kn-l">注意点<textarea id="knC" rows="3">'+esc(draft.caution||'')+'</textarea></label>'+
      '<div class="kn-sb"><button class="kn-primary kn-save" id="knSave">確認して保存</button><button class="kn-line" id="knCancel">やめる</button></div><div id="knMsg" class="kn-msg" role="status"></div>');
    $('knCancel').onclick=()=>{ draft=null; closeSheet(); };
    $('knSave').onclick=()=>{
      const t=$('knT').value.trim(), s=$('knS').value.trim(); if(!t||!s){ $('knMsg').textContent='テーマと補足を書いてください'; return; }
      const fields={title:t,supplement:s,example:$('knE').value,caution:$('knC').value,origin:o,state:'confirmed'};
      if(isNew){ const ts=now(); const n2=Object.assign({},draft,fields,{id:uid('kn'),rev:rev(),pending:true,createdAt:ts,updatedAt:ts,history:[]}); putLocal(n2); selId=n2.id; }
      else { revise(notes.find(x=>x.id===draft.id)||draft,fields,true); selId=draft.id; }
      draft=null; closeSheet(); toast('ノートを保存しました'); if(isOpen()) render(); else setRvMode('notes',false);
    };
  }
  /* ---- シート：既存ノートに追記（下書きは「追記済み」にして一覧から外す。消さない） ---- */
  function openMerge(dr){
    const targets=visible().filter(n=>!isDraft(n)&&n.id!==dr.id);
    sheet('<div class="lb">既存ノートに追記</div><p class="mu kn-p">「'+esc(dr.title)+'」の補足を、選んだノートの後ろに足します。前の内容は履歴に残ります。</p>'+
      (targets.length?'<div class="kn-mlist">'+targets.slice(0,40).map(n=>'<button class="kn-mi" data-kmt="'+esc(n.id)+'"><b>'+esc(n.title)+'</b><span class="mono">'+esc(daysOf(n).map(md).join('・'))+'</span></button>').join('')+'</div>':'<p class="kn-empty">追記できる確認済みのノートがありません。先に「確認して保存」してください。</p>')+
      '<button class="dy-close" id="knX">閉じる</button>');
    $('knX').onclick=closeSheet;
    $('sheetBody').querySelectorAll('[data-kmt]').forEach(b=>b.onclick=()=>{
      const t=notes.find(x=>x.id===b.dataset.kmt); if(!t) return;
      const head='\n\n— 追記（'+md(daysOf(dr)[0])+'・'+dr.title+'）—\n';
      const urls=new Set((t.sources||[]).map(s=>s.url));
      revise(t,{supplement:String(t.supplement||'')+head+dr.supplement,example:[t.example,dr.example].filter(Boolean).join('\n\n'),caution:[t.caution,dr.caution].filter(Boolean).join('\n'),
        evidence:[t.evidence,dr.evidence].filter(Boolean).join('\n\n'),sources:(t.sources||[]).concat((dr.sources||[]).filter(s=>!urls.has(s.url))),sourceDates:[...new Set(daysOf(t).concat(daysOf(dr)))]},true);
      revise(dr,{state:'merged',mergedInto:t.id});
      selId=t.id; closeSheet(); toast('「'+t.title+'」に追記しました'); refresh();
    });
  }
  function sourcesHTML(n){
    let h='';
    if(n.sources&&n.sources.length) h+='<ol class="kn-src">'+n.sources.map(s=>'<li><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title||s.url)+'</a></li>').join('')+'</ol>';
    if(n.searchEntry) h+='<iframe class="kn-sep" title="Google 検索の候補" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" srcdoc="'+esc(n.searchEntry)+'"></iframe>';   // Google の検索候補（決まりで表示する）。スクリプトは動かさない
    return h;
  }
  function sheet(h){ $('sheetBody').innerHTML='<div class="dy-sh kn-sh">'+h+'</div>'; $('sheet').classList.remove('hide'); }

  /* ---- ログタブへのつなぎ込み ---- */
  const _set=setRvMode;
  setRvMode=function(m,save){
    if(m==='notes'){ rvMode='notes'; if(typeof rpOpen!=='undefined') rpOpen=false; rvApply(); render(); window.scrollTo(0,0); return; }
    if(m==='diary'&&typeof rpOpen!=='undefined') rpOpen=false;   // 「日付ログ」を押したら、振り返りノートを閉じて日記へ
    return _set(m,save);
  };
  const _apply=rvApply;
  rvApply=function(){
    _apply(); ensureShell();
    const v=$('vLog'),on=rvMode==='notes'; if(!v) return;
    v.classList.toggle('notes-mode',on);
    if(on){ ['rvTabIn','rvTabDy'].forEach(id=>{const b=$(id);if(b){b.classList.remove('active');b.setAttribute('aria-selected','false');}}); }
    const k=$('rvTabKn'); if(k){ k.classList.toggle('active',on); k.setAttribute('aria-selected',String(on)); }
  };
  const _rr=renderRecorder;
  renderRecorder=function(){ _rr(); if(typeof activeAppTab!=='undefined'&&activeAppTab==='log'&&rvMode==='notes') render(); };
  if(typeof obAfterRender==='function'){ const _after=obAfterRender; obAfterRender=function(){ _after(); paintDayCard(); }; }
  /* ログを開いた時は「日付ログ」から（取り込みは日付ログの「この日の記録を取り込む」や設定から） */
  rvDefaultMode=function(){ return 'diary'; };
  window.Knowledge64={setMode:m=>{ if(typeof activeAppTab!=='undefined'&&activeAppTab!=='log') showView('log'); setRvMode(m==='notes'?'notes':m==='day'?'diary':m,false); }, sync, openCreate, notes:()=>visible().slice(),
    cheatNotes:(from,to)=>visible().filter(n=>n.cheat&&!isDraft(n)&&daysOf(n).some(d=>d>=from&&d<=to)).sort((a,b)=>String(a.date).localeCompare(String(b.date))) };
  (function boot(){ const g=$('gate'); if(appPass&&online&&(!g||g.classList.contains('hide'))){ sync(); return; } setTimeout(boot,1500); })();
})();
