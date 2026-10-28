/* AIコーチ v53 — Claude / ChatGPT との受け渡し（v53：AIの記録は中央台帳 /api/ledger へ活動ごとに追記）（ログの入力は JSONファイル／貼り付け の2つ）、AIの記録の取り込み、ダッシュボード（仮）
   ・アプリ → AI：設定文（いまのコーチ＋記録ブロックの決まり）を1回、毎日は「今日の状況」をコピーして渡す
   ・AI → アプリ：会話の終わりにAIが書く ```aicoach ブロックを「ログ」に貼り付けて、本人が確かめてから記録する
   ・ログイン情報・APIキー・Cookie は扱わない。保存するのはチャットのURL（任意）だけ */

/* ---- コピー（clipboard が使えない時は全選択した欄を出す） ---- */
async function copyText(t){
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(t);return true;}}catch(e){}
  try{const ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok;}catch(e){return false;}
}
function aiLinksHTML(){
  const c=dataSettings.claudeUrl||'https://claude.ai/new',g=dataSettings.chatgptUrl||'https://chatgpt.com/';
  return '<div class="ho-links"><a class="ho-open" href="'+esc(c)+'" target="_blank" rel="noopener noreferrer">Claudeを開く ↗</a><a class="ho-open" href="'+esc(g)+'" target="_blank" rel="noopener noreferrer">ChatGPTを開く ↗</a></div>'+
    '<div class="mu" style="font-size:11px;margin-top:6px">'+(dataSettings.claudeUrl||dataSettings.chatgptUrl?'保存したチャットのURLを開きます。':'チャットのURLは「コーチ」タブで保存できます（任意）。')+'ログインはいつものブラウザ・アプリで。アプリはログイン情報を扱いません。</div>';
}
async function copyOut(text,title,note,links){
  const ok=await copyText(text);
  $('sheetBody').innerHTML='<div class="dy-sh ho-sh"><div class="lb">'+esc(title)+'</div>'+
    '<div class="ho-ok'+(ok?'':' ng')+'">'+(ok?'✓ コピーしました':'自動でコピーできませんでした。下の欄を長押しして「すべて選択」→「コピー」してください')+'</div>'+
    (note?'<div class="mu" style="font-size:12px;margin:8px 0">'+note+'</div>':'')+(links?aiLinksHTML():'')+
    '<textarea id="hoText" class="ho-ta" readonly aria-label="コピーする文章">'+esc(text)+'</textarea>'+
    '<div class="row" style="margin-top:8px"><button id="hoSel">すべて選択</button><button id="hoAgain">もう一度コピー</button></div>'+
    '<button class="dy-close" id="hoX">閉じる</button></div>';
  $('sheet').classList.remove('hide');
  const ta=$('hoText');if(!ok){ta.focus();ta.select();}
  $('hoSel').onclick=()=>{ta.focus();ta.select();try{ta.setSelectionRange(0,ta.value.length);}catch(e){}};
  $('hoAgain').onclick=async()=>{toast((await copyText(text))?'コピーしました':'コピーできませんでした。長押しで選んでください');};
  $('hoX').onclick=closeSheet;
  return ok;
}

/* ---- 設定文（1回だけ貼る） ---- */
const AI_BLOCK_TEMPLATE=['```aicoach','date: YYYY-MM-DD','did: やったこと（本人の言葉で）','minutes: 数字（分。分からなければ空）','result: できた / 少しできた / できなかった / 未定','feel: 1-5（任意）','note: ひとこと（任意）','next: 次にやること（任意。複数なら「; 」区切り）','```'];
const AI_JSON_TEMPLATE=['```json','{"aicoach":1,"source":"claude または chatgpt","records":[{"id":"YYYYMMDD-短い名前","date":"YYYY-MM-DD","kind":"授業／演習／復習／質問","did":"やったこと","minutes":30,"result":"できた","feel":4,"note":"授業の内容・質問したこと・分かったこと（長くてよい）","next":["次にやること"]}]}','```',
  '（1つの活動を records の1件にする。同じ日に授業と復習をしたら2件。minutes・feel・note・next は分からなければ省く。result は「できた／少しできた／できなかった／未定」のどれか）',
  '（id はこの会話の中で同じ活動に同じものを付ける。前に出した記録を直す時は、同じ id で "rev":2 のように版を上げる。id が分からなければ省いてよい）'];
function aiSetupText(kind){
  const ch=activeChar(),goal=(selfCur('goal')||{}).value||mem.memo.goal||cfg.goal||'';
  const where=kind==='claude'?'この文章は Claude のプロジェクトの「指示（カスタム指示）」に貼り付けて使います。':'この文章は ChatGPT の「カスタム指示」（入りきらない時は GPT の「指示」）に貼り付けて使います。';
  return ['（'+where+'作成：AIコーチ '+APP_VERSION+'）','',...coachCoreLines()].join('\n');
}
function coachCoreLines(){   // v39：設定文と「今日のプロンプト」で共通のコーチ部分
  const ch=activeChar(),goal=(selfCur('goal')||{}).value||mem.memo.goal||cfg.goal||'';
  return [
   'あなたは私専用のAIコーチです。','',
   charBlock(ch),'',
   coachModuleBlock(ch),
   persBlock(ch),
   '## 8. 守ること',
   '本の考え方を参考にしつつ、今日の一手を具体的かつ小さく提案してください。',
   'これは名著の考え方をもとに独自に設計したコーチ設定であり、著者・出版社の公認や公式な代弁ではありません。本文を引用せず、自分の言葉で伝えてください。心理検査・診断ではなく、効果や成果を保証しません。',
   '目標・状況：'+(goal||'（会話の中で聞いてください）'),
   '私が「AIコーチ（アプリ）からの今日の状況」を貼ったら、その数字（集中の分・記録の日数など）はアプリが計算した事実です。数え直したり、推測で書き換えたりしないでください。',
   '「本人の事実」にない人物像を決めつけないでください。','',
   SAFETY_RULES,'',
   '## 10. 会話の終わりの記録ブロック（必ず守る）',
   '相談の区切りや、私が「終わり」「記録して」と言った時は、返事の最後に次の形の記録ブロックを1つだけ書いてください。私はこれをコピーして記録アプリに貼ります。',
   ...AI_BLOCK_TEMPLATE,
   '書き方の決まり：',
   '- 私が言った事実だけを書く。言っていないことは書かずに空にする。',
   '- 数字（分・手ごたえ）は推測しない。私が言った数字か、私が貼った「今日の状況」の数字だけ。分からなければ空にする。',
   '- date は今日の日付（貼った「今日の状況」に日付があればそれ）。',
   '- 日本語で、短く。1項目1行。',
   '- ブロックの中に、あなたの解釈・評価・分析は書かない。','',
   '## 11. JSONで出す時',
   '私が「JSONで」「ファイルで」と言ったら、同じ内容を次の形のJSONで出してください（ファイルを作れる時は aicoach-YYYY-MM-DD.json というファイルに）。複数の日があれば records に並べます。決まりは上と同じです。',
   ...AI_JSON_TEMPLATE
  ];
}
function copyAiSetup(kind){
  const note=kind==='claude'?'Claude：プロジェクトを開き、「指示（カスタム指示）」に貼り付けて保存します。以後そのプロジェクトで話します。'
    :'ChatGPT：設定の「カスタム指示」に貼り付けます。文字数の上限で入りきらない時は、GPTを作って「指示」に貼り付けます。';
  copyOut(aiSetupText(kind),(kind==='claude'?'Claude':'ChatGPT')+'用の設定文',esc(note)+'<br>コーチを切り替えた・鍛えた時は、もう一度コピーして貼り直してください。',false);
}

/* ---- v39：今日のプロンプト（コーチ設定＋今日のタスクと状況。新しいチャットに貼るだけで始められる） ---- */
function todayPromptText(){
  const ch=activeChar();
  return ['【AIコーチ（アプリ）からの今日のプロンプト】作成：AIコーチ '+APP_VERSION,
    'この会話では、下の「コーチ設定」のコーチとして話してください。後半の「今日の状況」はアプリが記録した事実です。','',
    '==================== コーチ設定（'+ch.name+'） ====================',
    ...coachCoreLines(),'',
    '==================== 今日の状況 ====================',
    dailyContextText()].join('\n');
}
function copyTodayPrompt(){
  copyOut(todayPromptText(),'今日のプロンプト（'+activeChar().name+'）','新しいチャットに貼り付けて、最後の「今日の相談：」の後に話したいことを書いてください。終わりにAIが出す記録（JSONか ```aicoach）は「ログ」で取り込みます。',true);
}
function copyTodayStatus(){
  copyOut(dailyContextText(),'今日の状況だけ','すでにコーチとして話している会話の続きに貼ります。コーチ設定は入っていません。',true);
}

/* ---- 毎日：今日の状況 ---- */
function dailyContextText(){
  const t=nowMs(),d=jstDay(t),f=focusSummary(d,t),fts=todayTasks();
  const w='日月火水木金土'[new Date(t+JST_OFF).getUTCDay()];
  const out=['【AIコーチ（アプリ）からの今日の状況】'+d+'（'+w+'）','※アプリが記録した事実だけです。数字はアプリの計算値なので、数え直さないでください。','','## 今日のタスク（本人が FOCUS 枠で選んだもの・最大3つ）と集中（ここまで）'];
  const mins=x=>{const o=f.tasks.find(y=>y.title===x.title);return o||{minutes:0,running:false};};
  fts.forEach(x=>{const o=mins(x);out.push('- '+x.title+'：'+o.minutes+'分'+(o.running?'（計測中）':''));});
  const extra=f.tasks.filter(y=>!fts.some(x=>x.title===y.title));   // 枠から外したが、今日は集中した分（事実）
  if(extra.length)out.push('- 枠の外で集中した分：'+extra.map(x=>x.title+' '+x.minutes+'分').join(' / '));
  if(!fts.length&&!extra.length)out.push('- （FOCUS 枠がまだ選ばれていません。今日やることは、相談の中で一緒に決めます）');
  out.push('- 今日の集中 合計：'+focusMinOf(d)+'分');
  let w7=0;for(let i=0;i<7;i++)w7+=dayMins(dayStr(i));
  out.push('','## 直近7日の記録（アプリが事実から作成）');
  for(let i=6;i>=1;i--){const dd=dayStr(i),l=dayLine(dd);if(l)out.push('- '+mdw(dd)+' '+cut(l,140));}
  out.push('- 直近7日の集中 合計：'+w7+'分');
  const g=selfCur('goal'),dl=selfCur('deadline');
  if(g||dl){out.push('','## 本人の事実');if(g)out.push('- 目標：'+cut(g.value,80));if(dl)out.push('- 期限：'+cut(dl.value,60));}
  try{const st=dashState;if(st&&st.ledger&&(st.ledger.recent||[]).length){const at=new Date(st.builtAt);
    out.push('','## 最近の学習（台帳・'+(at.getMonth()+1)+'/'+at.getDate()+' '+p2(at.getHours())+':'+p2(at.getMinutes())+' の集計）');
    st.ledger.recent.slice(0,5).forEach(a=>out.push('- '+a.date+'【'+(LG_SRC_JP[a.source]||a.source)+(a.kind?'・'+a.kind:'')+'】'+cut(a.did||'',60)+(a.minutes!=null?'（'+a.minutes+'分）':'')));
    if(st.study&&st.study.lowFields30&&st.study.lowFields30.length)out.push('- 正答率の低い分野（統計アプリ・30日）：'+st.study.lowFields30.slice(0,3).map(f=>f.name+' '+f.rate+'%').join('、'));}}catch(e){}
  out.push('','今日の相談：');
  return out.join('\n');
}
function openHandoffDaily(){
  copyOut(dailyContextText(),'今日の状況をAIに渡す','Claude / ChatGPT の会話に貼り付けて、「今日の相談：」の後に話したいことを書いてください。終わりにAIが書く記録ブロックは「ログ」に貼り付けます。',true);
}

/* ---- コーチタブの「Claude / ChatGPT に渡す」 ---- */
function handoffSectionHTML(){
  const ch=activeChar();
  return '<section class="ho" id="hoSec"><div class="ho-k mono">HANDOFF · CLAUDE / CHATGPT</div><h2>Claude / ChatGPT に渡す</h2>'+
   '<p>会話はいつもの Claude / ChatGPT で。このアプリは記録・タスク・コーチの調整を受け持ちます。</p>'+
   '<div class="ho-step"><b>1</b><div><h3>最初に1回：設定文をコピー</h3><p>いまのコーチ「'+esc(ch.name)+'」の設定と、会話の終わりに記録ブロックを書く決まりが入っています。</p>'+
     '<div class="ho-btns"><button class="p" id="hoClaude">Claude用の設定文をコピー</button><button id="hoGpt">ChatGPT用の設定文をコピー</button></div>'+
     '<small>Claude → プロジェクトの「指示（カスタム指示）」に貼る ／ ChatGPT → 「カスタム指示」かGPTの「指示」に貼る</small></div></div>'+
   '<div class="ho-step"><b>2</b><div><h3>毎日：今日の状況を渡す</h3><p>今日のタスクと集中の分、直近7日の記録（アプリが計算した事実）をコピーします。</p><div class="ho-btns"><button id="hoDaily">今日の状況をAIに渡す</button></div></div></div>'+
   '<div class="ho-step"><b>3</b><div><h3>終わりに：AIの記録を貼り付ける</h3><p>AIが書いた記録（```aicoach ブロック、またはJSONファイル）を「ログ」で取り込むと、確かめてから記録できます。</p><div class="ho-btns"><button id="hoToLog">ログで取り込む →</button></div></div></div>'+
   '<details class="ho-url"><summary>チャットのURL（任意）</summary><div class="in"><div class="mu" style="font-size:11.5px">いつも使う会話・プロジェクトのURLを入れると、「開く」でそこへ行けます。端末間で同期します。パスワードやログイン情報は入れないでください（保存しません）。</div>'+
     '<label class="ho-lb">Claude<input id="hoUrlC" inputmode="url" placeholder="https://claude.ai/project/…" value="'+esc(dataSettings.claudeUrl||'')+'"></label>'+
     '<label class="ho-lb">ChatGPT<input id="hoUrlG" inputmode="url" placeholder="https://chatgpt.com/g/…" value="'+esc(dataSettings.chatgptUrl||'')+'"></label>'+
     '<button class="p" id="hoUrlSave">保存</button></div></details></section>';
}
function bindHandoff(){
  if(!$('hoSec'))return;
  $('hoClaude').onclick=()=>copyAiSetup('claude');
  $('hoGpt').onclick=()=>copyAiSetup('chatgpt');
  $('hoDaily').onclick=openHandoffDaily;
  $('hoToLog').onclick=()=>{window.aiOrigin={kind:'coach'};recBackTo=null;recDay=null;rvMode='input';showView('log');setTimeout(()=>{const t=$('aiImp');if(t)t.scrollIntoView({block:'start'});},50);};
  $('hoUrlSave').onclick=()=>{if(setChatUrls($('hoUrlC').value,$('hoUrlG').value))toast('保存しました');else toast('https:// で始まるURLを入れてください');};
}

/* ===== AI → アプリ：記録ブロックの読み取り ===== */
const AI_KEYS={at:'at',time:'time','時刻':'time',date:'date','日付':'date','日にち':'date',did:'did','やったこと':'did','内容':'did',minutes:'minutes',minute:'minutes','min':'minutes','分':'minutes','時間':'minutes','集中':'minutes',
  result:'result','結果':'result',feel:'feel','手ごたえ':'feel','手応え':'feel','満足度':'feel',note:'note','ひとこと':'note','一言':'note','メモ':'note',next:'next',tasks:'next',task:'next','タスク':'next','次':'next','次にやること':'next','次の一手':'next',
  id:'id',activity_id:'id',rev:'rev',revision:'rev',kind:'kind',type:'kind','種類':'kind',source:'source','出どころ':'source',updatedat:'updatedAt',updated_at:'updatedAt'};
const AI_KV=/^\s*(?:[-*・]\s*)?\**\s*([A-Za-z]+|[ぁ-んァ-ヶ一-龠々ー]+)\s*\**\s*[:：]\s*(.*?)\s*$/;
const AI_PLACEHOLDER=/本人の言葉で|分からなければ空|^数字|^YYYY|1-5（任意）|（任意）$|できた\s*\/\s*少しできた/;
function aiKV(line){const m=String(line).match(AI_KV);if(!m)return null;const k=AI_KEYS[m[1].toLowerCase()]||AI_KEYS[m[1]];return k?{k,v:m[2].replace(/^["「]|["」]$/g,'').trim()}:null;}
function aiDate(v,base){
  v=z2h(v).trim();let m;const y0=+(base||today()).slice(0,4);
  if((m=v.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/)))return m[1]+'-'+p2(+m[2])+'-'+p2(+m[3]);
  if((m=v.match(/^(\d{1,2})[/月](\d{1,2})/)))return y0+'-'+p2(+m[1])+'-'+p2(+m[2]);
  if(/今日|本日/.test(v))return today();
  return '';
}
function aiResult(v){v=String(v||'').trim();if(!v)return '';
  if(/少し|partial|半分|一部/i.test(v))return 'partial';
  if(/できなかった|出来なかった|not|×/i.test(v))return 'not';
  if(/できた|出来た|done|完了|✓/i.test(v))return 'done';
  if(/未定|まだ|pending|？|\?/i.test(v))return 'pending';
  return '';}
function aiFeel(v){v=z2h(v);let m;if((m=v.match(/([1-5])/)))return +m[1];if((m=v.match(/★+/)))return Math.min(5,m[0].length);return 0;}
function aiMinutes(v){v=z2h(v).trim();if(!v)return null;const n=minutesOf(v);if(n!=null)return n;const m=v.match(/^(\d{1,3})$/);return m&&+m[1]<=600?+m[1]:null;}
function aiBlockFrom(kvs){
  const o={};kvs.forEach(({k,v})=>{if(v&&!AI_PLACEHOLDER.test(v)&&!(k in o))o[k]=v;});
  if(!o.did&&!o.result&&!o.minutes&&!o.next&&!o.note)return null;
  // v53：did・note は切り詰めない（長い授業メモもそのまま台帳へ）
  const b={date:aiDate(o.date||'')||today(),dateRaw:o.date||'',did:String(o.did||'').slice(0,2000),minutes:aiMinutes(o.minutes||''),result:aiResult(o.result),feel:aiFeel(o.feel||''),note:String(o.note||'').slice(0,100000),
    next:String(o.next||'').split(/\s*[;；]\s*|\n/).map(s=>cut(s.replace(/^[-・*]\s*/,''),100)).filter(Boolean).slice(0,8),kind:cut(o.kind||'',30)};
  if(o.id)b.id=cut(o.id,120);if(o.rev!=null&&/^\d+$/.test(String(o.rev)))b.rev=+o.rev;if(o.source)b.source=cut(o.source,30);if(o.updatedAt)b.updatedAt=cut(o.updatedAt,40);
  if(o.at)b.at=String(o.at);if(o.time)b.time=String(o.time);
  return b;
}
/* v38：JSON（ファイルでも貼り付けでも同じ形） */
function aiJsonCandidates(text){
  const out=[],t=String(text||'').trim();
  if(/^[\[{]/.test(t))out.push(t);
  const re=/(?:```|~~~)[ \t]*(?:json|aicoach)[^\n]*\n([\s\S]*?)\n[ \t]*(?:```|~~~)/gi;let m;
  while((m=re.exec(text))){const b=m[1].trim();if(/^[\[{]/.test(b))out.push(b);}
  // 囲みが無い時：最初の { から対応する } まで
  const i=t.search(/[{\[]/);
  if(i>0){let dep=0,q=false,esc2=false;for(let j=i;j<t.length;j++){const c=t[j];
    if(q){if(esc2)esc2=false;else if(c==='\\')esc2=true;else if(c==='"')q=false;continue;}
    if(c==='"')q=true;else if(c==='{'||c==='[')dep++;else if(c==='}'||c===']'){dep--;if(!dep){out.push(t.slice(i,j+1));break;}}}}
  return out;
}
function aiJsonVal(v){if(v==null)return '';if(Array.isArray(v))return v.map(aiJsonVal).filter(Boolean).join('; ');if(typeof v==='object')return '';return String(v).trim();}
function aiBlockFromObj(o){
  if(!o||typeof o!=='object'||Array.isArray(o))return null;
  const kvs=[];
  Object.keys(o).forEach(k0=>{const k=AI_KEYS[String(k0).toLowerCase()]||AI_KEYS[k0];if(!k)return;
    let v=o[k0];if(k==='next'&&Array.isArray(v))v=v.map(x=>typeof x==='object'&&x?aiJsonVal(x.title||x.task||x.name||''):aiJsonVal(x)).filter(Boolean).join('; ');
    kvs.push({k,v:aiJsonVal(v)});});
  if(o.at)kvs.push({k:'at',v:String(o.at)});if(o.time)kvs.push({k:'time',v:String(o.time)});
  return aiBlockFrom(kvs);
}
function parseAiJson(text){
  for(const c of aiJsonCandidates(text)){
    let j;try{j=JSON.parse(c);}catch(e){continue;}
    let list=Array.isArray(j)?j:Array.isArray(j.records)?j.records:Array.isArray(j.logs)?j.logs:Array.isArray(j['記録'])?j['記録']:[j];
    const out=list.map(aiBlockFromObj).filter(Boolean);
    if(!Array.isArray(j)){const at=j.exportedAt||j.exported_at||j.updatedAt;out.forEach(b=>{if(!b.source&&j.source)b.source=cut(j.source,30);if(!b.updatedAt&&at)b.updatedAt=cut(at,40);});}
    // 一番上の tasks / next（記録とは別に「次にやること」だけ来た時）
    const top=Array.isArray(j)?null:(j.tasks||j.next||j['次にやること']);
    if(top&&list[0]!==j){const nx=(Array.isArray(top)?top:[top]).map(x=>typeof x==='object'&&x?aiJsonVal(x.title||x.task||x.name||''):aiJsonVal(x)).filter(Boolean);
      if(nx.length){if(out.length)out[out.length-1].next=out[out.length-1].next.concat(nx).slice(0,8);else{const b=aiBlockFrom([{k:'next',v:nx.join('; ')}]);if(b)out.push(b);}}}
    if(out.length)return out;
  }
  return [];
}
function parseAiBlocks(text){
  text=String(text||'').replace(/\r\n?/g,'\n').replace(/｀｀｀/g,'```');
  const js=parseAiJson(text);if(js.length)return js;
  const out=[],seen=new Set(),push=b=>{if(!b)return;const k=JSON.stringify(b);if(!seen.has(k)){seen.add(k);out.push(b);}};
  const re=/(?:```|~~~)[ \t]*aicoach[^\n]*\n([\s\S]*?)(?:\n[ \t]*(?:```|~~~)|$)/gi;let m;
  while((m=re.exec(text)))push(aiBlockFrom(m[1].split('\n').map(aiKV).filter(Boolean)));
  if(out.length)return out;
  // 囲みが無い時：キー: 値 の行が続くところを1つのブロックとして読む
  let cur=[];const flush=()=>{if(cur.length>=2)push(aiBlockFrom(cur));cur=[];};
  text.split('\n').forEach(line=>{
    if(/^\s*(?:```|~~~)?\s*aicoach\s*$/i.test(line)){flush();return;}
    const kv=aiKV(line);
    if(kv){if(cur.some(x=>x.k===kv.k)&&(kv.k==='date'||kv.k==='did'))flush();cur.push(kv);}
    else if(line.trim()||cur.length)flush();
  });
  flush();
  return out;
}

/* ---- ログ（入力モード）：v38 は「JSONファイル」「貼り付け」の2つだけ → 確かめる → 記録する ---- */
let aiImp=null;   // {text, blocks:[...], none:bool, src:'file'|'paste', name}
let aiMode=L('impMode','paste')==='file'?'file':'paste';
let aiDefDate=null;   // 日記から来た時の日付（読み取った記録に日付が無い時に使う）
let aiStudyResult=null; // 統計JSONの取り込み結果。元のAI記録画面を離れず表示する
let aiStudyPending=false;
let aiSaving=false, aiLedgerRes=null;   // v53：台帳への保存中／保存の結果（件数）
let aiSrc=L('aiSrc','');               // v53：出どころ（JSONに書いてあればそちら）
window.aiOrigin=null;                  // v53：取り込みを始めた画面 {kind:'diary'|'settings'|'coach', date}
const AI_SRC_OPTS=[['','JSONのまま／不明'],['chatgpt','ChatGPT'],['claude','Claude'],['gemini','Gemini'],['ai','その他のAI'],['manual','自分で書いた']];
function aiImportHTML(){
  let h='<section class="ai-imp" id="aiImp"><div class="ai-imp-h"><div><div class="eyebrow">FROM CLAUDE / CHATGPT</div><h2>AIの記録を取り込む</h2>'+
    '<p>AIの会話記録を取り込みます。統計アプリの学習記録JSONも、ここで選べば自動判別します。JSONファイルでも、貼り付けでも同じように読み取ります。'+(aiDefDate?'<br><b style="color:#8ee7f2">'+esc(dyMDs(aiDefDate))+'の記録として取り込みます</b>（日付が書いてあればそちらを使います）':'')+'</p></div></div>';
  if(aiLedgerRes){h+=aiLedgerResHTML();}
  else if(aiStudyResult!==null){
    h+='<div class="aim-study-result" role="status" aria-live="polite"><div class="t">学習記録の取り込み結果</div>'+
      '<div style="font-size:13px;white-space:pre-wrap;line-height:1.75">'+esc(aiStudyResult)+'</div></div>'+
      '<div class="ai-act"><button id="aiStudyBack" class="p"'+(aiStudyPending?' disabled':'')+'>AIの記録の取り込みに戻る</button></div>';
  } else if(!aiImp||(!aiImp.blocks.length&&!aiImp.none)){
    h+='<div class="imp-mode" role="tablist" aria-label="取り込み方">'+
      '<button role="tab" data-imode="file" aria-selected="'+(aiMode==='file')+'" class="'+(aiMode==='file'?'on':'')+'"><b>📄 JSONファイル</b><small>AIが作ったファイルを選ぶ</small></button>'+
      '<button role="tab" data-imode="paste" aria-selected="'+(aiMode==='paste')+'" class="'+(aiMode==='paste'?'on':'')+'"><b>📋 テキスト貼り付け</b><small>AIの返事をそのまま貼る</small></button></div>';
    if(aiMode==='file'){
      h+='<div class="imp-drop" id="aiDrop"><input type="file" id="aiFile" accept=".json,.txt,.md,application/json,text/plain,text/markdown" hidden>'+
        '<button type="button" id="aiPick" class="imp-pick">ファイルを選ぶ</button><span>.json（.txt / .md も可）。PCではここにドラッグしても取り込めます。</span></div>'+
        '<div class="mu" style="font-size:11px;margin-top:8px">AIに「JSONで出して」と頼むと、この形のファイルを作ってくれます（設定文に決まりが入っています）。</div>';
    } else {
      h+='<textarea id="aiPaste" class="ai-ta" placeholder="AIの返事をそのまま貼り付け&#10;&#10;```aicoach&#10;date: 2026-10-20&#10;did: 問題集を2ページ&#10;minutes: 30&#10;result: できた&#10;```&#10;&#10;JSON（{&quot;records&quot;:[…]}）でもOK" aria-label="AIの記録を貼り付ける">'+esc(aiImp?aiImp.text:'')+'</textarea>'+
        '<div class="ai-act"><button class="p" id="aiRead">取り込む</button><button id="aiPasteBtn">クリップボードから貼る</button></div>';
    }
    if(aiDefDate)h+='<div class="ai-act"><button id="aiDefX">今日の記録に戻す</button></div>';
  } else if(aiImp.none){
    h+='<div class="ai-none"><b>記録が見つかりませんでした。</b><span>「date: 」「did: 」の行や、records を持つJSONが無いようです。AIに「記録ブロックを出して」「JSONで出して」と頼んでから、もう一度どうぞ。</span></div>'+
      '<div class="ai-act"><button class="p" id="aiBack">やり直す</button></div>';
  } else {
    h+='<div class="mu" style="font-size:12px;margin:2px 0 8px">'+(aiImp.name?'「'+esc(aiImp.name)+'」から':'')+'読み取った内容です。違うところは直してから「記録する」を押してください。</div>'+aiImp.blocks.map(aiCardHTML).join('')+
      '<label class="aim-src"><span>出どころ</span><select id="aiSrcSel">'+AI_SRC_OPTS.map(([k,l])=>'<option value="'+k+'"'+(aiSrc===k?' selected':'')+'>'+l+'</option>').join('')+'</select></label>'+
      '<div class="ai-act"><button class="p" id="aiSave"'+(aiSaving?' disabled':'')+'>'+(aiSaving?'台帳に保存しています…':'✓ 台帳に記録する')+'</button><button id="aiBack"'+(aiSaving?' disabled':'')+'>やめる</button></div>'+
      '<div class="mu" style="font-size:11px;margin-top:6px">1件ずつ別の活動として台帳（Cloudflare）に追記します。同じ日にほかの記録があっても消えません。同じものをもう一度取り込んでも二重にはなりません。元の文章もそのまま保管します。「次」は今日のタスクに足します（自動では始めません）。</div>';
  }
  return h+'</section>';
}
function aiCardHTML(b,i){
  const opt=(v,list)=>list.map(([k,l])=>'<option value="'+k+'"'+(String(v)===String(k)?' selected':'')+'>'+l+'</option>').join('');
  return '<div class="aim-card" data-ai="'+i+'"><div class="t mono">活動 '+(i+1)+(b.id?' · ID '+esc(cut(b.id,24)):'')+(b.rev!=null?' · 版 '+b.rev:'')+'</div>'+
   '<label><span>日付</span><input type="date" data-f="date" value="'+esc(b.date)+'"></label>'+
   '<label><span>やったこと</span><input data-f="did" maxlength="2000" value="'+esc(b.did)+'"></label>'+
   '<label><span>種類</span><input data-f="kind" maxlength="30" list="aiKinds" value="'+esc(b.kind||'')+'" placeholder="授業・演習・復習・質問など"></label>'+
   '<label><span>分</span><input data-f="minutes" type="number" inputmode="numeric" min="0" max="600" value="'+(b.minutes==null?'':b.minutes)+'" placeholder="空のまま"></label>'+
   '<label><span>結果</span><select data-f="result">'+opt(b.result,[['','—'],['done','できた'],['partial','少しできた'],['not','できなかった'],['pending','未定']])+'</select></label>'+
   '<label><span>手ごたえ</span><select data-f="feel">'+opt(b.feel||'',[['','—'],[1,'★1'],[2,'★2'],[3,'★3'],[4,'★4'],[5,'★5']])+'</select></label>'+
   '<label class="aim-note"><span>メモ</span><textarea data-f="note" rows="'+(b.note.length>200?6:2)+'" placeholder="授業の内容・質問・分かったことなど（長くてもそのまま保存）">'+esc(b.note)+'</textarea>'+(b.note.length>200?'<small class="mu">'+b.note.length.toLocaleString()+'字</small>':'')+'</label>'+
   '<label><span>次</span><input data-f="next" maxlength="300" value="'+esc(b.next.join('; '))+'" placeholder="「; 」で区切る"></label></div>'+
   (i===0?'<datalist id="aiKinds"><option value="授業"><option value="演習"><option value="復習"><option value="質問"><option value="読書"></datalist>':'');
}
function renderAiImport(){
  const box=$('aiImpBox');if(!box)return;
  box.innerHTML=aiImportHTML();
  box.querySelectorAll('[data-imode]').forEach(b=>b.onclick=()=>{aiMode=b.dataset.imode;S('impMode',aiMode);renderAiImport();});
  const rd=$('aiRead');
  if(rd){rd.onclick=()=>aiRead($('aiPaste').value,'paste');
    $('aiPasteBtn').onclick=async()=>{try{const t=await navigator.clipboard.readText();if(t){$('aiPaste').value=t;aiRead(t,'paste');}else toast('クリップボードが空です');}catch(e){toast('読めませんでした。欄を長押しして貼り付けてください');$('aiPaste').focus();}};}
  const fi=$('aiFile');
  if(fi){
    // label の暗黙クリックを使わず、ボタンから一度だけファイル選択を開く。
    const pick=$('aiPick');if(pick)pick.onclick=()=>fi.click();
    fi.onchange=()=>{const f=fi.files&&fi.files[0];fi.value='';if(f&&!aiStudyPending)aiReadFile(f);};
    const dz=$('aiDrop');
    dz.ondragover=e=>{e.preventDefault();dz.classList.add('over');};
    dz.ondragleave=()=>dz.classList.remove('over');
    dz.ondrop=e=>{e.preventDefault();dz.classList.remove('over');const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];if(f)aiReadFile(f);};}
  if($('aiStudyBack'))$('aiStudyBack').onclick=()=>{if(aiStudyPending)return;aiStudyResult=null;renderAiImport();};
  if($('aiDefX'))$('aiDefX').onclick=()=>{aiDefDate=null;renderAiImport();};
  if($('aiBack'))$('aiBack').onclick=()=>{aiImp=aiImp&&aiImp.src==='paste'?{text:aiImp.text,blocks:[],none:false,src:'paste'}:null;renderAiImport();};
  if($('aiSave'))$('aiSave').onclick=aiSaveAll;
  if($('aiSrcSel'))$('aiSrcSel').onchange=()=>{aiSrc=$('aiSrcSel').value;S('aiSrc',aiSrc);};
  if($('aiResBack'))$('aiResBack').onclick=aiGoOrigin;
  if($('aiResDiary'))$('aiResDiary').onclick=()=>{const d=aiLedgerRes.dates&&aiLedgerRes.dates[aiLedgerRes.dates.length-1]||today();aiLedgerRes=null;window.aiOrigin=null;dySel=d;setRvMode('diary',false);};
  if($('aiResMore'))$('aiResMore').onclick=()=>{aiLedgerRes=null;renderAiImport();};
  box.querySelectorAll('.aim-card').forEach(c=>{const b=aiImp.blocks[+c.dataset.ai];c.querySelectorAll('[data-f]').forEach(inp=>inp.oninput=inp.onchange=()=>{
    const f=inp.dataset.f,v=inp.value;
    if(f==='minutes')b.minutes=v===''?null:Math.max(0,Math.min(600,Math.round(+v)||0));
    else if(f==='feel')b.feel=+v||0;
    else if(f==='next')b.next=v.split(/\s*[;；]\s*/).map(s=>cut(s,100)).filter(Boolean).slice(0,8);
    else if(f==='date'){if(/^\d{4}-\d\d-\d\d$/.test(v))b.date=v;}
    else b[f]=v;});});
}
async function aiReadFile(f){
  if(f.size>2*1024*1024){toast('ファイルが大きすぎます（2MBまで）');return;}
  let t='';try{t=await f.text();}catch(e){toast('ファイルを読めませんでした');return;}
  // v52: 統計アプリのJSONを誤って「AIの記録」で選んだ場合も、正しい取り込みへ案内・転送する。
  if(/\.json$/i.test(f.name||'')){
    try{
      const o=JSON.parse(t.replace(/^\uFEFF/,''));
      if(o&&(['study-log/1','study-log/2'].includes(o.format)||(o.app==='統計集中対策'&&Array.isArray(o.events)&&o.study_date))){
        if(typeof window.importStudyLogFiles!=='function'){toast('設定 → 学習記録を取り込む から読み込んでください');return;}
        // 選んだファイルを一度だけ保存。設定シート・2度目のファイル選択は開かない。
        if(aiStudyPending)return;
        aiStudyPending=true;
        aiStudyResult='統計アプリの学習記録として保存しています…';
        renderAiImport();
        try{aiStudyResult=await window.importStudyLogFiles([f]);}
        catch(e){aiStudyResult=e.message||'学習記録を読み込めませんでした';}
        finally{aiStudyPending=false;renderAiImport();}
        return;
      }
    }catch(e){}
  }
  aiRead(t,'file',cut(f.name||'',60));
}
function aiRead(t,src,name){
  t=String(t||'');if(!t.trim()){toast(src==='file'?'ファイルが空です':'貼り付けてから押してください');return;}
  if(t.length>2000000){toast('長すぎます（200万字まで）');return;}
  const blocks=parseAiBlocks(t).map(b=>{if(aiDefDate&&!b.dateRaw)b.date=aiDefDate;if(b.date>today())b.date=today();return b;});
  aiImp={text:t,blocks,none:!blocks.length,src:src||'paste',name:name||''};renderAiImport();
  if(blocks.length)toast(blocks.length+'件の記録を読み取りました');
  const el=$('aiImp');if(el)el.scrollIntoView({block:'start'});
}
function aiKeepRaw(d,text,src){
  text=String(text||'').slice(0,30000);if(!text.trim())return false;
  const id='imp_'+stableHash(text),list=imports[d]||(imports[d]=[]);
  if(list.some(x=>x.id===id))return false;
  list.push({id,t:Date.now(),source:src==='file'?'ai_json_file':'ai_paste',text});S('imports',imports);return true;
}
/* ---- v53：中央台帳へ保存（活動ごとに追記。日付では上書きしない） ---- */
async function aiSaveAll(){
  if(!aiImp||!aiImp.blocks.length||aiSaving)return;
  if(typeof online!=='undefined'&&!online){toast('サーバー（Cloudflare）に接続できていません。電波のある所で「台帳に記録する」を押してください');return;}
  aiSaving=true;renderAiImport();
  const blocks=aiImp.blocks.map(b=>Object.assign({},b,{date:/^\d{4}-\d\d-\d\d$/.test(b.date)&&b.date<=today()?b.date:today()}));
  const records=blocks.map(b=>{const r={date:b.date,did:b.did,minutes:b.minutes,result:b.result,feel:b.feel||null,note:b.note,next:b.next,kind:b.kind||''};
    if(b.id)r.id=b.id;if(b.rev!=null)r.rev=b.rev;if(b.updatedAt)r.updatedAt=b.updatedAt;if(b.at)r.at=b.at;if(b.time)r.time=b.time;if(aiSrc)r.source=aiSrc;else if(b.source)r.source=b.source;return r;});
  let j=null,err='';
  try{
    const r=await fetch(API('/api/ledger'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:appPass,op:'import',records,raw:aiImp.text,source:aiSrc||null,fileName:aiImp.name||null})});
    j=await r.json().catch(()=>({}));
    if(r.status===404)err='台帳に保存するには、Worker を v53 に更新してください（まだ保存していません）';
    else if(j.r2===false)err='R2（ARCHIVE）が未設定のため保存できません';
    else if(!r.ok||j.error)err=j.error||('保存できませんでした（'+r.status+'）');
  }catch(e){err='通信できませんでした。もう一度「台帳に記録する」を押してください（同じものを押し直しても二重にはなりません）';}
  aiSaving=false;
  if(err){toast(err);renderAiImport();return;}
  // 「次」は、新しく入った・新しい版になった活動の分だけ今日のタスクに足す
  let addedTasks=0;
  (j.items||[]).forEach(it=>{if(it.result!=='added'&&it.result!=='updated')return;const b=blocks[it.index];(b&&b.next||[]).forEach(n=>{if(!tasks.some(t=>t.status==='active'&&t.title===n)){if(taskAdd(n,'ai_import',{fromDate:b.date}))addedTasks++;}});});
  aiLedgerRes={added:j.added|0,updated:j.updated|0,duplicate:j.duplicate|0,stale:j.stale|0,errors:j.errors|0,items:j.items||[],dates:j.dates||[],tasks:addedTasks,name:aiImp.name||''};
  aiImp=null;aiDefDate=null;
  if(typeof lgInvalidate==='function')lgInvalidate(aiLedgerRes.dates);
  dashAt=0;
  renderAiImport();
  const el=$('aiImp');if(el)el.scrollIntoView({block:'start'});
}
function aiLedgerResHTML(){
  const r=aiLedgerRes,c=(k,l,n,cls)=>'<div class="lg-cnt'+(cls?' '+cls:'')+'"><b>'+n+'</b><span>'+l+'</span></div>';
  const errs=r.items.filter(x=>x.result==='error');
  const o=window.aiOrigin,back=o&&o.kind==='diary'?esc(dyMDs(o.date))+'の日記に戻る':o&&o.kind==='settings'?'設定に戻る':o&&o.kind==='coach'?'コーチに戻る':'';
  return '<div class="aim-study-result lg-res" role="status" aria-live="polite"><div class="t">台帳への取り込み結果'+(r.name?'（'+esc(r.name)+'）':'')+'</div>'+
    '<div class="lg-cnts">'+c('a','新規追加',r.added,'ok')+c('u','既存記録の更新',r.updated,'up')+c('d','重複スキップ',r.duplicate)+c('e','エラー',r.errors,r.errors?'ng':'')+'</div>'+
    (r.stale?'<div class="mu" style="font-size:12px;margin-top:6px">古い版 '+r.stale+'件：保管しましたが、新しい版のままにしています。</div>':'')+
    (errs.length?'<div class="lg-errs">'+errs.map(x=>'<div>'+(x.index+1)+'件目：'+esc(x.error)+'</div>').join('')+'</div>':'')+
    (r.tasks?'<div class="mu" style="font-size:12px;margin-top:6px">今日のタスクに '+r.tasks+'件足しました。</div>':'')+
    (r.dates.length?'<div class="mu" style="font-size:12px;margin-top:6px">対象の日：'+r.dates.map(d=>esc(dyMDs(d))).join('、')+'</div>':'')+'</div>'+
    '<div class="ai-act">'+(back?'<button class="p" id="aiResBack">'+back+'</button>':'')+'<button'+(back?'':' class="p"')+' id="aiResDiary">日記で見る</button><button id="aiResMore">続けて取り込む</button></div>';
}
function aiGoOrigin(){
  const o=window.aiOrigin;aiLedgerRes=null;window.aiOrigin=null;
  if(o&&o.kind==='diary'){dySel=o.date;setRvMode('diary',false);return;}
  if(o&&o.kind==='settings'){renderAiImport();if(typeof window.openSettings==='function')window.openSettings();return;}
  if(o&&o.kind==='coach'){showView('settings');return;}
  renderAiImport();
}

/* ===== v40：ダッシュボード ＝ いまの状態（Cloudflare R2 のログから Worker が計算した集計。AIは使わない） =====
   ・数字は /api/state（stats/daily/日付.json の積み上げ）。どの端末でも同じ数字になる
   ・アプリは判断（好調・不調など）を書かない。比べるのは計算だけ */
let dashState=L('dashState',null),dashPer=L('dashPer',7)===30?30:7,dashCoach=!!L('dashCoach',false),dashBusy=false,dashErr='',dashAt=0,dashSig='';
async function dashLoad(op){
  if(dashBusy)return;dashBusy=true;dashErr='';dashPaint(true);
  try{
    const r=await fetch(API('/api/state'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:appPass,op:op||'state'})});
    const j=await r.json().catch(()=>({}));
    if(r.status===404)dashErr='サーバー（Worker）が古い版です。アプリの更新で v40 以降を入れてください';
    else if(j.r2===false)dashErr='R2（ARCHIVE）が未設定のため、集計できません';
    else if(!r.ok||j.error)dashErr=j.error||('HTTP '+r.status);
    else{dashState=j;S('dashState',j);if(op==='rebuild')toast('集計を作り直しました');}
  }catch(e){dashErr='オフラインのため、前回の集計を表示しています';}
  dashBusy=false;dashAt=Date.now();dashSig='';dashPaint(true);
}
const DS_RES={done:'できた',partial:'少しできた',not:'できなかった',pending:'未定'};
const dsMin=m=>m>=60?Math.floor(m/60)+'時間'+(m%60?m%60+'分':''):m+'分';
function dsDiff(a,b,n){const w='前の'+(n||'')+(n?'日':'期間');if(!b)return a?w+'は0分':'';const p=Math.round((a-b)/b*100);return w+'より'+(p>0?'+':'')+p+'%（前は'+b+'分）';}
function stateDefs(){return ['- 取り組んだ分：その日の「タイマーで計った分」と「記録に書いた分（自己申告。台帳の活動の合計）」の大きい方。重なっているか分からないので足していません',
  '- 台帳の活動：授業・演習・復習・質問など、AIの記録を1件ずつ別に保存したもの。同じ日の別の活動は別々に数えます','- 取り組んだ日：取り組んだ分がある日か、記録がある日','- 記録した日：その日の記録（やったこと・結果など）がある日','- できた率：記録した日のうち「できた」の割合（「未定」は数えない）','- 記録が無い日は「やらなかった日」とは限りません（記録していないだけのことがあります）'];}

function studyStateLines(st,per){
 const p=st.study&&(per===30?st.study.p30:st.study.p7);if(!p)return [];
 const errors=(st.study.mistakes||[]).filter(e=>e.date>=p.from).slice(0,8);
 const lines=['','## 統計アプリの学習記録（'+per+'日・'+p.days+'日分）',
 '- 解答 '+p.answered+'問・正解 '+p.correct+'問（正答率 '+(p.rate==null?'—':p.rate+'%')+'）・初習 '+p.first+'・反復 '+p.review,
 '- 初習は段階学習、反復はそれ以外の採点対象。時間の記録とは別集計です。未取り込みの日は学習していない日とは限りません。',
 ...p.fields.map(f=>'- '+f.name+'：解答 '+f.answered+'・正解 '+f.correct+'（'+(f.rate==null?'—':f.rate+'%')+'）・初習 '+(f.answered-f.review)+'・反復 '+f.review)];
 if(errors.length){
   lines.push('','### 最近間違えた問題（詳細履歴から最大8件）');
   errors.forEach(e=>lines.push('- '+e.date+' '+e.field+(e.question?'／問題：'+e.question:'')+(e.selected?'／回答：'+e.selected:'')+(e.expected?'／正答：'+e.expected:'')));
 }
 return lines;
}
const LG_SRC_JP={chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini',ai:'AI',manual:'自分',aicoach:'アプリ',other:'その他'};
function ledgerStateLines(st,per){
  const L=st.ledger,S=st.study,o=[];if(!L&&!S)return o;
  const P=per===30?st.p30:st.p7;
  if(P&&P.acts!=null)o.push('','## 学習台帳（直近'+per+'日）','- 活動 '+P.acts+'件（'+P.actDays+'日）・記録に書いた分の合計 '+P.selfMin+'分・タイマー '+P.timer+'分'+(P.maybe?'・「訂正かも」で未確認 '+P.maybe+'組':''));
  if(L&&L.recent&&L.recent.length){o.push('','## 最近学習した内容（台帳・直近14日・新しい順）');
    L.recent.forEach(a=>o.push('- '+a.date+'【'+(LG_SRC_JP[a.source]||a.source)+(a.kind?'・'+a.kind:'')+'】'+cut(a.did||'（やったこと未記入）',80)+(a.minutes!=null?'（'+a.minutes+'分）':'')+(a.result?'・'+(DS_RES[a.result]||a.result):'')+(a.note?'\n  メモ：'+cut(String(a.note).replace(/\s+/g,' '),160):'')));}
  if(L&&L.questions&&L.questions.length){o.push('','## 過去に質問した内容（台帳）');L.questions.forEach(q=>o.push('- '+q.date+' '+cut(q.did,80)+(q.note?'：'+cut(String(q.note).replace(/\s+/g,' '),120):'')));}
  if(S&&S.lowFields30&&S.lowFields30.length){o.push('','## 正答率の低い分野（統計アプリ・30日・3問以上。アプリの計算）');S.lowFields30.forEach(f=>o.push('- '+f.name+'：'+f.correct+'/'+f.answered+'（'+f.rate+'%）'));}
  if(S&&S.missTopics14&&S.missTopics14.length){o.push('','## 間違えた回数が多いトピック（統計アプリ・14日。アプリの計算）');S.missTopics14.forEach(t=>o.push('- '+t.topic+'：間違い '+t.incorrect+'回／解答 '+t.answered+'回'));}
  if(L&&L.months&&L.months.length){o.push('','## 月ごと（台帳と記録から）');L.months.forEach(m=>o.push('- '+m.month+'：取り組んだ日 '+m.activeDays+'日・タイマー '+m.timer+'分・記録に書いた分 '+m.selfMin+'分・活動 '+m.acts+'件'+(m.answered?'・統計アプリ '+m.correct+'/'+m.answered+'問':'')));}
  if(S&&(S.p30&&S.p30.uncertainDays))o.push('- ※統計アプリの分野別の数は、'+S.p30.uncertainDays+'日分が「重なりが分からないため大きい方の値」です');
  return o;
}
function ledgerStateCard(st,per){
  const L=st.ledger,P=per===30?st.p30:st.p7;if(!L||!P||P.acts==null)return '';
  let h='<div class="ds-c"><div class="mono ds-ck">学習台帳（'+per+'日）</div><div class="ds-lgs"><span><b>'+P.acts+'</b>件の活動</span><span>記録に書いた分 <b>'+P.selfMin+'</b>分</span><span>タイマー <b>'+P.timer+'</b>分</span></div>';
  if(P.maybe)h+='<div class="ds-err" style="margin-top:8px">「訂正かも」の記録が '+P.maybe+'組あります。日記で確かめてください。</div>';
  if(L.recent.length)h+='<div class="ds-acts">'+L.recent.slice(0,6).map(a=>'<div class="ds-act"><span class="mono">'+esc(a.date.slice(5).replace('-','/'))+'</span><em class="lg-src s-'+esc(a.source)+'">'+esc(LG_SRC_JP[a.source]||a.source)+'</em><b>'+esc(cut(a.kind?a.kind+'：'+a.did:a.did,40))+'</b><i>'+(a.minutes!=null?a.minutes+'分':'')+'</i></div>').join('')+'</div>';
  if(L.months&&L.months.length)h+='<div class="ds-mo">'+L.months.map(m=>'<div><span>'+(+m.month.slice(5))+'月</span><b>'+m.effective+'</b><small>分・'+m.activeDays+'日'+(m.answered?'・'+m.answered+'問':'')+'</small></div>').join('')+'</div>';
  return h+'</div>';
}
function studyStateCard(st,per){
 const lines=studyStateLines(st,per);if(!lines.length)return '';
 return '<div class="ds-c"><div class="mono ds-ck">'+esc(lines[1].slice(3))+'</div><div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px">'+esc(lines.slice(2).join('\n'))+'</div></div>';
}

function statePromptText(st,per,withCoach){
  const P=per===30?st.p30:st.p7,Q=per===30?st.prev30:st.prev7,o=[];
  if(withCoach){o.push('【AIコーチ（アプリ）からの「いまの状態」】作成：AIコーチ '+APP_VERSION,'この会話では、下の「コーチ設定」のコーチとして話してください。後半の「いまの状態」はアプリが記録から計算した事実です。','','==================== コーチ設定（'+activeChar().name+'） ====================',...coachCoreLines(),'','==================== いまの状態 ====================');}
  o.push('【AIコーチ（アプリ）からの「いまの状態」】'+st.today+' 時点・直近'+per+'日（'+P.from+'〜'+P.to+'）');
  o.push('※ Cloudflare に貯まった記録から、アプリが計算した数字です。数え直したり、推測で補ったりしないでください。アプリは良い・悪いの判断をしていません。','');
  o.push('## 数え方',...stateDefs(),'');
  if(st.profile.goal||st.profile.deadline){o.push('## 目標（本人の言葉）');if(st.profile.goal)o.push('- 目標：'+st.profile.goal);if(st.profile.deadline)o.push('- 期限：'+st.profile.deadline);o.push('');}
  o.push('## 直近'+per+'日の数字');
  o.push('- 取り組んだ分：'+P.effective+'分（'+dsDiff(P.effective,Q.effective,per)+'）');
  o.push('- 取り組んだ日：'+P.activeDays+'/'+per+'日（1日あたり '+P.perActiveDay+'分 ※取り組んだ日だけで平均）');
  o.push('- 記録した日：'+P.recordedDays+'/'+per+'日　結果：できた '+P.results.done+'・少しできた '+P.results.partial+'・できなかった '+P.results.not+'・未定 '+P.results.pending);
  if(P.doneRate!=null)o.push('- できた率：'+P.doneRate+'%（少しできたを含めると '+P.doneOrPartialRate+'%）');
  if(P.satAvg!=null)o.push('- 手ごたえ（1〜5）の平均：'+P.satAvg+'（'+P.satDays+'日分）');
  o.push('- 今日まで続けて取り組んだ日数：'+st.streak+'日');
  o.push('- タスク：いま残っている '+st.tasks.active+'件、完了 '+(per===30?st.tasks.done30:st.tasks.done7)+'件（直近'+per+'日）');
  if(P.tasks.length){o.push('','## タスクごとの取り組んだ分（タイマー）');P.tasks.forEach(t=>o.push('- '+t.title+'：'+t.minutes+'分'));}
  if(st.tasks.activeTitles.length){o.push('','## 残っているタスク');st.tasks.activeTitles.forEach(t=>o.push('- '+t));}
  o.push('','## 週ごとの推移（月曜はじまり・古い順）');
  st.weeks.forEach(w=>o.push('- '+w.from+'〜：'+w.effective+'分・取り組んだ日 '+w.activeDays+'/'+w.days+'・記録 '+w.recordedDays+'日'));
  o.push('','## 直近7日');
  st.last7.forEach(r=>o.push('- '+r.date+'：'+(r.effective?r.effective+'分':'0分')+(r.recorded?'・'+(DS_RES[r.result]||'—')+(r.sat?'・手ごたえ'+r.sat:'')+(r.did?'・'+cut(r.did,40):''):'・記録なし')));
  if(st.words.length){o.push('','## 最近の本人の言葉（ひとこと・メモ）');st.words.forEach(w=>o.push('- '+w.date+'「'+cut(w.text,80)+'」'));}
  o.push(...studyStateLines(st,per));
  o.push(...ledgerStateLines(st,per));
  o.push('','## データの確かさ','- 記録した日 '+P.recordedDays+'/'+per+'日、タイマーで計った日 '+P.timerDays+'日、自己申告の分だけの日 '+P.selfReportedDays+'日'+(st.firstDay?'。記録の始まり：'+st.firstDay:''));
  o.push('','この状態を見て、どう進めるかを一緒に考えてください。私に聞きたいことがあれば先に聞いてください。','','相談したいこと：');
  return o.join('\n');
}
function dashPaint(force){
  const v=$('vDash');if(!v||(activeAppTab!=='dash'&&!force))return;
  if(activeAppTab==='dash'&&!dashBusy&&online&&appPass&&Date.now()-dashAt>60000){dashLoad('state');return;}
  const st=dashState,sig=[dashBusy,dashErr,dashPer,dashCoach,st&&st.builtAt].join('|');
  if(!force&&sig===dashSig)return;dashSig=sig;
  const open=$('dsPv')&&$('dsPv').open;
  let h='<div class="ds"><div class="eyebrow">DASHBOARD · いまの状態</div><h1>ダッシュボード</h1><p class="mu">Cloudflare に貯まった記録から計算した数字です。良い・悪いの判断はしていません。</p>'+
    '<div class="ds-per" role="tablist"><button data-per="7" class="'+(dashPer===7?'on':'')+'">直近7日</button><button data-per="30" class="'+(dashPer===30?'on':'')+'">直近30日</button></div>';
  if(dashErr)h+='<div class="ds-err">'+esc(dashErr)+'</div>';
  if(!st){h+='<div class="ds-next">'+(dashBusy?'集計しています…':'まだ集計がありません。')+'</div></div>';v.innerHTML=h;dsBind();return;}
  const P=dashPer===30?st.p30:st.p7,Q=dashPer===30?st.prev30:st.prev7,n=dashPer;
  const tile=(k,big,u,sub)=>'<div class="ds-t"><span class="mono">'+k+'</span><b>'+big+'<small>'+u+'</small></b><em>'+sub+'</em></div>';
  h+='<div class="ds-g">'+tile('MINUTES',P.effective,'分',esc(dsDiff(P.effective,Q.effective,n)))+tile('ACTIVE',P.activeDays,'/'+n+'日','取り組んだ日（その日の平均 '+P.perActiveDay+'分）')+
    tile('DONE',P.doneRate==null?'—':P.doneRate,P.doneRate==null?'':'%','できた率（記録 '+P.recordedDays+'日）')+tile('STREAK',st.streak,'日','今日まで続けて取り組んだ日')+'</div>';
  const res=P.results,rt=res.done+res.partial+res.not+res.pending;
  h+='<div class="ds-c"><div class="mono ds-ck">記録の結果（'+n+'日）</div>'+(rt?'<div class="ds-stk">'+['done','partial','not','pending'].map(k=>res[k]?'<i class="'+k+'" style="flex:'+res[k]+'" title="'+DS_RES[k]+' '+res[k]+'日"></i>':'').join('')+'</div><div class="ds-lg">'+['done','partial','not','pending'].map(k=>'<span><i class="'+k+'"></i>'+DS_RES[k]+' '+res[k]+'</span>').join('')+'</div>':'<div class="mu" style="font-size:12px">この期間の記録はまだありません</div>')+
    (P.satAvg!=null?'<div class="ds-sat">手ごたえの平均 <b>'+P.satAvg+'</b> / 5（'+P.satDays+'日分）</div>':'')+'</div>';
  const wmax=Math.max(1,...st.weeks.map(w=>w.effective));
  h+='<div class="ds-c"><div class="mono ds-ck">週ごとの取り組んだ分（12週・月曜はじまり）</div><div class="ds-wk">'+st.weeks.map((w,i)=>'<div class="ds-wb'+(i===st.weeks.length-1?' now':'')+'" title="'+w.from+'〜 '+w.effective+'分"><i style="height:'+(w.effective?Math.max(4,Math.round(w.effective/wmax*100)):0)+'%"></i><span>'+(+w.from.slice(5,7))+'/'+(+w.from.slice(8))+'</span></div>').join('')+'</div></div>';
  const lmax=Math.max(1,...st.last7.map(r=>r.effective));
  h+='<div class="ds-c"><div class="mono ds-ck">直近7日</div>'+st.last7.map(r=>'<div class="ds-r"><span>'+esc(mdw(r.date))+'</span><i><b style="width:'+(r.effective?Math.max(3,Math.round(r.effective/lmax*100)):0)+'%"></b></i><em class="mono">'+r.effective+'</em><small>'+(r.recorded?esc(DS_RES[r.result]||'—'):'記録なし')+'</small></div>').join('')+'</div>';
  if(P.tasks.length){const tmax=Math.max(1,...P.tasks.map(t=>t.minutes));
    h+='<div class="ds-c"><div class="mono ds-ck">タスクごとの分（'+n+'日・タイマー）</div>'+P.tasks.map(t=>'<div class="ds-r ds-tr"><span title="'+esc(t.title)+'">'+esc(cut(t.title,14))+'</span><i><b style="width:'+Math.max(3,Math.round(t.minutes/tmax*100))+'%"></b></i><em class="mono">'+t.minutes+'</em></div>').join('')+'</div>';}
  if(st.words.length)h+='<div class="ds-c"><div class="mono ds-ck">最近の本人の言葉</div>'+st.words.map(w=>'<div class="ds-w"><span class="mono">'+esc(w.date.slice(5).replace('-','/'))+'</span>「'+esc(w.text)+'」</div>').join('')+'</div>';
  h+=ledgerStateCard(st,n);
  h+=studyStateCard(st,n);
  h+='<div class="ds-c ds-q"><div class="mono ds-ck">データの確かさ</div>記録した日 '+P.recordedDays+'/'+n+'・タイマーの日 '+P.timerDays+'・自己申告の分だけの日 '+P.selfReportedDays+(st.firstDay?'<br>記録の始まり：'+esc(st.firstDay):'')+'</div>';
  h+='<section class="ds-ai"><div class="mono ds-ck">STATE PROMPT · AIに渡す</div><h2>いまの状態をAIに渡す</h2><p>この画面の数字と数え方を文章にします。週に1回くらい、計画の見直しに。</p>'+
    '<label class="ds-chk"><input type="checkbox" id="dsCoach"'+(dashCoach?' checked':'')+'> コーチ設定（'+esc(activeChar().name)+'）も入れる <small>新しいチャット用</small></label>'+
    '<button class="p ds-copy" id="dsCopy">いまの状態をコピー（直近'+n+'日）</button>'+
    '<details id="dsPv"'+(open?' open':'')+'><summary>中身を見る</summary><pre>'+esc(statePromptText(st,n,dashCoach))+'</pre></details></section>';
  const at=new Date(st.builtAt);
  h+='<div class="ds-ft"><span>集計：'+(at.getMonth()+1)+'/'+at.getDate()+' '+p2(at.getHours())+':'+p2(at.getMinutes())+(dashBusy?'（更新中…）':'')+'</span><button id="dsReload">更新</button><button id="dsRebuild">集計を作り直す</button></div>'+
    '<div class="fz-sync"><span data-dsync class="memo-st"></span></div></div>';
  v.innerHTML=h;dsBind();paintSync();
}
function dsBind(){
  document.querySelectorAll('[data-per]').forEach(b=>b.onclick=()=>{dashPer=+b.dataset.per;S('dashPer',dashPer);dashPaint(true);});
  const c=$('dsCoach');if(c)c.onchange=()=>{dashCoach=c.checked;S('dashCoach',dashCoach);dashPaint(true);};
  const cp=$('dsCopy');if(cp)cp.onclick=()=>copyOut(statePromptText(dashState,dashPer,dashCoach),'いまの状態（直近'+dashPer+'日）',dashCoach?'新しいチャットに貼り付けて、最後の「相談したいこと：」の後に書いてください。':'コーチとして話している会話に貼り付けて、最後の「相談したいこと：」の後に書いてください。',true);
  const rl=$('dsReload');if(rl)rl.onclick=()=>dashLoad('state');
  const rb=$('dsRebuild');if(rb)rb.onclick=()=>{if(confirm('記録から集計を全部作り直します（元の記録は変わりません）。'))dashLoad('rebuild');};
}
