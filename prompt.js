/* AIコーチ v30 — コーチの部品・キャラクター（設計図）・プロンプト（app-v30/ が元。build_v30.py で1ファイル版・bundle を作る） */
/* 起動時のキャラクター移行（migrateChars）で使うので、ここに置く（v29で coach.js から移動） */
function slotBase(){return {morning:{label:'朝',hint:'宣言する時間',start:5,end:11},daytime:{label:'日中',hint:'実行する時間',start:11,end:18},night:{label:'夜',hint:'記録する時間',start:18,end:5}};}
function readSlots(){
  const saved=L('labSchedule',null),base=slotBase(),fb={morning:['lancer'],daytime:['war'],night:['failure','analects']},slots={};
  Object.keys(base).forEach(k=>{const prev=(saved&&saved.slots&&saved.slots[k])||{};slots[k]=Object.assign({},base[k],{books:fb[k].slice()},prev);});
  return slots;
}
function manMod(id){   // v17 マニュアル設定の読み出し（移行にだけ使う）
  const d=defMod(id),o=coachManual.books[id]||{},r={};
  Object.keys(d).forEach(k=>{const v=o[k];r[k]=(v===undefined||v===null||(Array.isArray(d[k])&&!Array.isArray(v)))?d[k]:clone(v);});
  return r;
}
/* ---- 名著コーチの部品（おすすめ設定）----
   おまかせモードの中身であり、マニュアルモードの初期値。
   concepts は本に実際に出てくる考え方だけを載せる（作り話の引用はしない）。 */
const COACH_MODULES={
  failure:{
    role:'計画と現実のズレを、責めずに事実で直させる参謀。',
    view:'うまくいかない原因を、気合いや能力の不足ではなく「目的があいまい」「見通しが楽観的」「前にうまくいったやり方への固執」「ズレを認めずに続けている」といった構造として読む。',
    concepts:[
      {k:'aim',name:'戦略目的のあいまいさ',note:'何のためにやるのかがぼやけると、現場の判断がぶれる。'},
      {k:'short',name:'短期決戦志向',note:'一気に片づける前提で計画し、長引いた時の手を用意しない。'},
      {k:'air',name:'空気による意思決定',note:'事実よりも、その場の雰囲気や願望で決めてしまう。'},
      {k:'learn',name:'学習の軽視',note:'失敗の原因を検証せず、同じパターンを繰り返す。'},
      {k:'unlearn',name:'過去の成功への過剰適応',note:'前にうまくいったやり方に縛られ、状況の変化に合わせられない。'},
      {k:'renew',name:'自己革新',note:'自分のやり方そのものを見直し、作り替えていく力。'}
    ],
    on:['aim','air','learn','unlearn'],
    questions:[
      '計画した時点で、何を前提にしていましたか？',
      '実際には何が起きましたか？（数字や回数で）',
      '同じようなズレは、前にもありましたか？'
    ],
    action:'前提を1つだけ現実に合わせて直し、明日やる量を「確実にできる大きさ」に決め直させる。',
    avoid:['精神論や「次は頑張ろう」で終わらせる','反省させるだけで、次の一手を決めずに終わる','戦史の話を長々とする'],
    when:'「できなかった」が続く／目標が高すぎる／同じ失敗を繰り返している'
  },
  lancer:{
    role:'手を広げすぎた状態から、勝てる一点に絞らせる戦略コーチ。',
    view:'停滞の原因を、力不足ではなく「戦う場所を広げすぎて、力が分散している」こととして読む。弱者は範囲を狭め、一点に集中すれば勝ち筋がある、という前提で考える。',
    concepts:[
      {k:'law1',name:'第一法則（一騎打ちの法則）',note:'1対1・狭い範囲の戦いでは、力の差は数にそのまま比例する。弱者が差を縮めやすい。'},
      {k:'law2',name:'第二法則（集団戦の法則）',note:'広い範囲の集団戦では、数の差が二乗で効いてくる。強者に有利。'},
      {k:'local',name:'局地戦',note:'戦う範囲を狭く限定する。'},
      {k:'close',name:'接近戦',note:'相手（課題）に近いところで、具体的に戦う。'},
      {k:'focus',name:'一点集中',note:'力を一か所に集める。'},
      {k:'no1',name:'No.1主義',note:'小さくてもいいので、一つの分野で一番を取る。'}
    ],
    on:['local','close','focus','no1'],
    questions:[
      '今、手をつけていることを全部挙げると、いくつありますか？',
      'その中で、今週ひとつだけ勝つならどれですか？',
      'それ以外を、いったん止めるとしたら何が困りますか？'
    ],
    action:'やることを1つに絞らせ、それ以外は「今週はやらない」と決めさせる。絞った1つは、今日5〜15分で着手できる大きさまで小さくする。',
    avoid:['あれもこれもと選択肢を増やす','大きな目標の話に広げる','広い範囲で効率を上げる話（強者の戦い方）を勧める'],
    when:'メニューが多い／手を広げすぎ／何から手をつけるか迷っている'
  },
  war:{
    role:'予定が崩れた時に、目的に立ち返って立て直させる参謀。',
    view:'計画どおりに進まないのを、意志の弱さではなく、どんな計画にも必ず起きる「摩擦」と、先が見えない「霧（不確実性）」の結果として読む。大事なのは計画を守ることではなく、目的を見失わずに手段を組み直すこと。',
    concepts:[
      {k:'purpose',name:'目的と手段',note:'戦争は政治の目的のための手段、という考え方。行動はすべて目的に従属する。'},
      {k:'friction',name:'摩擦',note:'計画の上では簡単なことが、現実では小さな障害の積み重ねで難しくなる。'},
      {k:'fog',name:'霧（不確実性）',note:'判断に必要な情報の多くは不確かで、見えないまま決めなければならない。'},
      {k:'center',name:'重心',note:'全体を支えている要の一点。そこに力を向けると全体が動く。'},
      {k:'concentrate',name:'戦力の集中',note:'決定的な地点に、できるだけ多くの力を集める。'},
      {k:'culminate',name:'攻勢の限界点',note:'勢いには限界があり、それを越えると押し返される。引き際を見極める。'}
    ],
    on:['purpose','friction','fog','center'],
    questions:[
      'そもそも、これは何のためにやっていますか？',
      '予定を崩した「摩擦」は具体的に何でしたか？',
      '目的に一番効く一点（重心）はどこだと思いますか？'
    ],
    action:'崩れた計画を元に戻そうとさせず、目的を一行で確認したうえで、今日の残り時間でできる一手に組み直させる。予備の時間（余白）も一緒に決める。',
    avoid:['計画を守れなかったことを責める','完璧な計画を作り直させる','戦争や軍事の話を例として長く出す'],
    when:'予定が崩れた／時間が取れない／状況が変わって動けなくなった'
  },
  analects:{
    role:'学んだことを日々の行動にし、ふり返りで積み重ねさせる師。',
    view:'伸び悩みを、才能や意志の問題ではなく「学んだことを実際にやっていない」「ふり返っていない」「言うことと行うことがずれている」こととして読む。小さな実践と毎日のふり返りの積み重ねを重んじる。',
    concepts:[
      {k:'practice',name:'学びて時に之を習う',note:'学んだことを、折にふれて実際にやってみる。（学而篇）'},
      {k:'reflect',name:'吾日に三たび吾が身を省みる',note:'一日に何度も自分のふるまいをふり返る。曾子の言葉。（学而篇）'},
      {k:'fix',name:'過ちて改めざる、是を過ちと謂う',note:'間違えたことより、改めないことが本当の過ち。（衛霊公篇）'},
      {k:'think',name:'学びて思わざれば則ち罔し',note:'学ぶだけで考えなければ身につかず、考えるだけで学ばなければ危うい。（為政篇）'},
      {k:'act',name:'言に訥にして行いに敏',note:'口は重く、行動はすばやく。（里仁篇）'},
      {k:'enjoy',name:'之を好む者は之を楽しむ者に如かず',note:'好きな人も、楽しんでいる人にはかなわない。（雍也篇）'}
    ],
    on:['practice','reflect','fix','act'],
    questions:[
      '今日学んだこと（読んだこと）で、実際に試したことはありますか？',
      '今日のふるまいで、改めたいことを一つ挙げるなら？',
      '明日、言葉より先にやることは何ですか？'
    ],
    action:'今日できたことと、改めることを一つずつ言葉にさせ、明日の最初の小さな実践を一つ決めさせる。',
    avoid:['説教や道徳の押しつけ','原文の引用を並べる','大きな人生論に広げる'],
    when:'夜・一日の終わり／学んでも行動につながらない／続かない'
  }
};
/* 話し方の初期値（マニュアルで変更できる） */
const STYLE_DEF={polite:'keigo',strict:3,length:'normal',questions:1};
/* ---- v12: 本ごとの設定（おまかせ＝おすすめ設定／マニュアル＝上書き） ---- */
const BOOK_IDS=['failure','lancer','war','analects'];
const clone=o=>JSON.parse(JSON.stringify(o));
let coachMode=L('coachMode','auto'); if(coachMode!=='manual') coachMode='auto';
let coachManual=L('coachManual',null);
if(!coachManual||typeof coachManual!=='object') coachManual={};
if(!coachManual.books||typeof coachManual.books!=='object') coachManual.books={};
if(!coachManual.style||typeof coachManual.style!=='object') coachManual.style={};
function defMod(id){const m=COACH_MODULES[id];return {role:m.role,view:m.view,on:m.on.slice(),questions:m.questions.slice(),action:m.action,avoid:m.avoid.slice()};}
const STRICT_SHORT={1:'とてもやさしい',2:'やさしい',3:'ふつう',4:'やや辛口',5:'辛口'};
const STRICT_TXT={1:'まず受け止め、否定や指摘はほとんどしない',2:'気持ちを受け止めてから、そっと一手を促す',3:'受け止めたうえで、はっきり一手を決めさせる',4:'言い訳や甘い見通しには、事実を確かめて指摘する',5:'遠慮なく核心を突き、先延ばしを許さない。ただし人格は否定しない'};
const LEN_TXT={short:'短め（120字前後）',normal:'ふつう（250字前後）',long:'詳しめ（450字前後）'};
const bookT=id=>COACH_BOOKS[id].coach;
/* ===== v19: キャラクター（育てたコーチ）＝ベースのコーチの上に重ねる「設計図」 =====
   ac_chars = {active, list:[{v:19,id,name,base,createdAt,lastUsed,xp,level,chatDays,lastGrow,growTry,growNote,spec,locks,prefs,log}]}
   spec = {role,view,on,questions,action,avoid,tone:{polite,style,callName},axes:{strict,warmth,ask,length,logic,humor},catchphrases,rules}
   log  = [{t,src:'compare'|'talk'|'record'|'manual'|'create'|'level',summary,before:{spec,prefs}|null,after:[変更]}]
   安全のための決まり（buildPrompt の最後）は、設計図ではどうやっても変えられない。 */
const clamp5=(v,d)=>{const n=Math.round(+v);return n>=1&&n<=5?n:d;};
const uid=()=>'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const AXES=[['strict','厳しさ','やさしい','辛口'],['warmth','あたたかさ','淡々','あたたかい'],['ask','問いと指示','指示','問い'],['length','返事の長さ','短い','詳しい'],['logic','感情と論理','感情','論理'],['humor','ユーモア','まじめ','ユーモア']];
const AXIS_SHORT={strict:'厳しさ',warmth:'あたたかさ',ask:'問い',length:'詳しさ',logic:'論理',humor:'ユーモア'};
const BASE_AXES={lancer:{strict:4,warmth:2,ask:2,length:2,logic:4,humor:2},failure:{strict:4,warmth:2,ask:3,length:3,logic:5,humor:1},war:{strict:3,warmth:3,ask:3,length:3,logic:4,humor:2},analects:{strict:2,warmth:4,ask:4,length:3,logic:3,humor:2}};
const AXIS_TXT={
  strict:STRICT_TXT,
  warmth:{1:'感情表現は控えめにし、淡々と事実を扱う',2:'落ち着いたトーンで、共感は短く添える',3:'受け止めの一言を添えてから本題に入る',4:'気持ちをしっかり受け止め、あたたかい言葉をかける',5:'まず気持ちに寄り添い、安心できる言葉をはっきり伝える'},
  ask:{1:'問いはほとんど使わず、やることを具体的に指示する',2:'基本は指示。確認の問いを時々はさむ',3:'指示と問いを半々で使う',4:'答えを言う前に、問いで本人に考えさせる',5:'答えは与えず、短い問いで本人に気づかせる'},
  length:{1:'1〜2文で言い切る。余計な言葉を足さない',2:'短く要点だけ。前置きはしない',3:'要点を中心に、必要な説明だけする',4:'説明はやや多めでよい',5:'背景や理由まで丁寧に説明する'},
  logic:{1:'気持ちや感覚の言葉を中心に話す',2:'気持ちを優先しつつ、事実も少し添える',3:'事実と気持ちの両方に触れる',4:'事実・数字・理由を軸に話す',5:'数字と因果で詰め、あいまいな言い方を避ける'},
  humor:{1:'冗談は言わない',2:'まじめに話す。冗談はほぼ言わない',3:'ときどき肩の力が抜ける一言を入れてよい',4:'軽いユーモアで場をほぐす',5:'ユーモアを多めに使う。ただし本人の努力や悩みは茶化さない'}
};
const AXIS_WORD={strict:STRICT_SHORT,warmth:{1:'淡々',2:'落ち着き',3:'ふつう',4:'あたたかい',5:'とてもあたたかい'},ask:{1:'指示中心',2:'指示多め',3:'半々',4:'問い多め',5:'問い中心'},
  length:{1:'一言',2:'短め',3:'ふつう',4:'やや詳しめ',5:'詳しめ'},logic:{1:'気持ち中心',2:'気持ち寄り',3:'半々',4:'論理寄り',5:'数字と因果'},humor:{1:'まじめ',2:'ほぼまじめ',3:'ときどき',4:'軽め',5:'多め'}};
const LEN_WORD={1:'1〜2文（60字以内）',2:'短め（120字前後）',3:'ふつう（250字前後）',4:'やや詳しめ（350字前後）',5:'詳しめ（450字前後）'};
const LEVEL_XP=40, LEVEL_MAX=20, LOG_MAX=50, SNAP_MAX=15;
const LOG_SRC={compare:'聞き比べから',talk:'話して作るから',record:'記録から',manual:'手で調整',create:'作成',level:'レベルアップ'};
/* 変えてよい項目（AIの変更案もこの中だけ） */
const FIELD_DEF={role:{t:'str',max:200,lb:'役割'},view:{t:'str',max:400,lb:'見立て'},action:{t:'str',max:300,lb:'一手の出し方'},
  on:{t:'arr',n:6,max:40,lb:'使う考え方'},questions:{t:'arr',n:5,max:120,lb:'問いの型'},avoid:{t:'arr',n:8,max:80,lb:'やらないこと'},
  'tone.polite':{t:'polite',lb:'言葉づかい'},'tone.style':{t:'str',max:60,lb:'口調'},'tone.callName':{t:'str',max:20,lb:'呼び方'},
  catchphrases:{t:'arr',n:5,max:30,lb:'口ぐせ'},rules:{t:'arr',n:8,max:60,lb:'ルール'},prefs:{t:'arr',n:10,max:80,lb:'学んだ好み'}};
AXES.forEach(([k,lb])=>FIELD_DEF['axes.'+k]={t:'axis',lb});
const FIELD_ALIAS={tone:'tone.style',style:'tone.style',polite:'tone.polite',callName:'tone.callName',callname:'tone.callName',concepts:'on',catchphrase:'catchphrases',rule:'rules',pref:'prefs',brevity:'axes.length'};
AXES.forEach(([k])=>FIELD_ALIAS[k]='axes.'+k);
const LOCK_KEYS=['role','view','action','on','questions','avoid','tone','callName','catchphrases','rules','prefs','axes'];
const lockKeyOf=f=>f.indexOf('axes.')===0?'axes':f==='tone.callName'?'callName':f.indexOf('tone.')===0?'tone':f;

/* ---- 安全チェック：罵倒・人格否定・危険な勧め・決まりの上書きは設計図に入れない ---- */
const BAD_RE=/罵倒|罵[るりっれ]|ののし|人格(を|の)?否定|人格攻撃|侮辱|見下|バカ|馬鹿|アホ|クズ|ゴミ|無能|役立たず|死ね|殺|自傷|自殺|リスカ|リストカット|脅[しす]|脅迫|恫喝|怒鳴|暴言|差別|価値がない|消えろ|追い詰め|寝るな|寝ずに|睡眠を削|食事を抜|徹夜を(勧|強|させ)/g;
const NEG_RE=/^(は|を|も|、|\s)*(絶対に|決して|一切|けっして)?(しな|せず|さな|さず|禁止|NG|ＮＧ|なし|無し|ません|厳禁|避け|やめ|ダメ|だめ|はしな)/;
const OVERRIDE_RE=/(安全|決まり|ルール|制限|指示|設定|守ること)[^。]{0,6}(無視|破|解除|外し|外す|守らな|従わな|撤廃)|システムプロンプト|\[\[|\]\]/;
function unsafeText(s,field){
  s=String(s||'');
  if(OVERRIDE_RE.test(s)) return true;
  if(field==='avoid') return false;   // 「やらないこと」には悪い言葉が入っていてよい（してはいけないことの一覧なので）
  BAD_RE.lastIndex=0;let m;
  while((m=BAD_RE.exec(s))){ if(!NEG_RE.test(s.slice(m.index+m[0].length))) {BAD_RE.lastIndex=0;return true;} }
  return false;
}
const safeList=(a,f)=>a.map(s=>String(s).trim()).filter(s=>s&&!unsafeText(s,f));
const safeStr=(s,f)=>{s=String(s||'').trim();return unsafeText(s,f)?'':s;};

/* ---- 正規化（v18 のデータもここで v19 に移す） ---- */
function specDefault(base){const m=defMod(base);return {role:m.role,view:m.view,on:m.on.slice(),questions:m.questions.slice(),action:m.action,avoid:m.avoid.slice(),
  tone:{polite:'keigo',style:'',callName:''},axes:Object.assign({},BASE_AXES[base]||BASE_AXES.lancer),catchphrases:[],rules:[]};}
const strArr=(v,dv,n,len)=>Array.isArray(v)?v.map(x=>cut(x==null?'':x,len)).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).slice(0,n):dv;
function specNorm(s,base){
  const d=specDefault(base);s=(s&&typeof s==='object')?s:{};
  const old=s.tone==null||typeof s.tone==='string';   // v18：tone は文字列、style.polite、callName、traits
  const t=old?{polite:s.style&&s.style.polite,style:s.tone||'',callName:s.callName||''}:s.tone;
  let ax=s.axes;
  if(!ax&&s.traits&&typeof s.traits==='object'){ax=Object.assign({},s.traits);ax.length=s.traits.brevity?6-clamp5(s.traits.brevity,3):3;}
  const axes={};AXES.forEach(([k])=>axes[k]=clamp5(ax&&ax[k],d.axes[k]));
  const keys=COACH_MODULES[base].concepts.map(k=>k.k);
  return {role:typeof s.role==='string'?cut(s.role,200):d.role,view:typeof s.view==='string'?cut(s.view,400):d.view,
    on:strArr(s.on,d.on,6,40).filter(k=>keys.includes(k)),questions:strArr(s.questions,d.questions,5,120),
    action:typeof s.action==='string'?cut(s.action,300):d.action,avoid:strArr(s.avoid,d.avoid,8,80),
    tone:{polite:t&&t.polite==='plain'?'plain':'keigo',style:cut(t&&t.style||'',60),callName:cut(t&&t.callName||'',20)},
    axes,catchphrases:strArr(s.catchphrases,[],5,30),rules:strArr(s.rules,[],8,60)};
}
const lvFromXp=xp=>Math.min(LEVEL_MAX,1+Math.floor(xp/LEVEL_XP));
function charNorm(c){
  if(!c||typeof c!=='object') return null;
  const base=COACH_MODULES[c.base]?c.base:'lancer',v19=c.v===19;
  let xp=Math.max(0,Math.floor(+c.xp||0)); if(!v19) xp*=8;   // v18 は 5XP で1レベル → v19 は 40XP で1レベル（レベルは保つ）
  const log=(Array.isArray(c.log)?c.log:[]).filter(x=>x&&(x.summary||x.text)).map(x=>({t:+x.t||+x.at||Date.now(),
    src:LOG_SRC[x.src]?x.src:(x.src==='edit'?'manual':'manual'),summary:cut(x.summary||x.text,140),
    before:x.before&&typeof x.before==='object'&&x.before.spec?x.before:null,after:Array.isArray(x.after)?x.after.slice(0,12):[]})).slice(-LOG_MAX);
  log.forEach((x,i)=>{if(i<log.length-SNAP_MAX)x.before=null;});
  const locks={};if(c.locks&&typeof c.locks==='object')LOCK_KEYS.forEach(k=>{if(c.locks[k])locks[k]=true;});
  const gn=c.growNote&&typeof c.growNote==='object'&&c.growNote.summary?{t:+c.growNote.t||0,summary:cut(c.growNote.summary,140),seen:!!c.growNote.seen}:null;
  const normalized={v:19,id:String(c.id||uid()),name:cut(c.name||COACH_BOOKS[base].coach,24)||COACH_BOOKS[base].coach,base,
    createdAt:+c.createdAt||Date.now(),lastUsed:+c.lastUsed||0,xp,level:lvFromXp(xp),
    chatDays:strArr(c.chatDays,[],60,10).filter(d=>/^\d{4}-\d\d-\d\d$/.test(d)),lastGrow:+c.lastGrow||0,growTry:+c.growTry||0,growNote:gn,
    spec:specNorm(c.spec,base),locks,prefs:strArr(c.prefs,[],10,80),log};
  normalized._raw=c._raw||JSON.parse(JSON.stringify(c));
  normalized._view=c._view||JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(normalized).filter(([k])=>k!=='_raw'))));
  return normalized;
}
function validChars(x){return !!(x&&typeof x==='object'&&Array.isArray(x.list)&&x.list.length);}
function charsNorm(x){
  const list=x.list.map(charNorm).filter(Boolean);
  if(!list.length) return null;
  return {active:list.some(c=>c.id===x.active)?x.active:list[0].id,list};
}
function newChar(base,name,spec){
  const t=Date.now();
  return charNorm({v:19,id:uid(),name,base,createdAt:t,lastUsed:t,xp:0,spec:spec||specDefault(base),log:[{t,src:'create',summary:'作成：'+COACH_BOOKS[base].coach+'をベースに'}]});
}
function migrateChars(){   // v17 の状態（日中のコーチ＋マニュアルの上書き）から1人目を作る
  const slots=readSlots();
  const base=((slots.daytime&&slots.daytime.books)||[]).find(b=>COACH_MODULES[b])||'war';
  const manual=coachMode==='manual';
  const sp=specDefault(base);
  if(manual){Object.assign(sp,manMod(base));const st=coachManual.style||{};
    if(st.strict) sp.axes.strict=clamp5(st.strict,sp.axes.strict);
    if(st.length==='short') sp.axes.length=2; else if(st.length==='long') sp.axes.length=4;}
  sp.tone.polite=cfg.polite==='plain'?'plain':'keigo';
  const c=newChar(base,COACH_BOOKS[base].coach,sp);
  c.log[0].summary='作成：これまでの設定（'+COACH_BOOKS[base].coach+(manual?'・マニュアル設定':'')+'）から';
  return {active:c.id,list:[c]};
}
const coachHadLocal=validChars(L('chars',null))||validChars(mem.chars);
let chars=(()=>{
  const loc=L('chars',null);
  if(validChars(loc)){const n=charsNorm(loc);if(n)return n;}
  if(validChars(mem.chars)){const n=charsNorm(mem.chars);if(n)return n;}
  return migrateChars();
})();
S('chars',chars);
function saveChars(sync){
  S('chars',chars);
  if(typeof coachCapture==='function')coachCapture();
}
const charById=id=>chars.list.find(c=>c.id===id);
const activeChar=()=>charById(chars.active)||chars.list[0];
const lvOf=c=>lvFromXp(c.xp);
const lvPct=c=>lvOf(c)>=LEVEL_MAX?100:Math.round((c.xp%LEVEL_XP)/LEVEL_XP*100);
const xpToNext=c=>lvOf(c)>=LEVEL_MAX?0:LEVEL_XP-(c.xp%LEVEL_XP);
const snapOf=c=>clone({spec:c.spec,prefs:c.prefs});
function pushLog(c,e){
  const x={t:Date.now(),src:e.src,summary:cut(e.summary,140),before:e.before||null,after:e.after||[]};
  c.log.push(x);
  if(c.log.length>LOG_MAX) c.log=c.log.slice(-LOG_MAX);
  c.log.forEach((y,i)=>{if(i<c.log.length-SNAP_MAX)y.before=null;});
  return x;
}
function charLog(c,src,text){return pushLog(c,{src:src==='edit'?'manual':src,summary:text});}
function addXp(c,n,why){
  if(typeof c==='number'){why=n;n=c;c=activeChar();}
  const lv=lvOf(c);
  c.xp+=n; c.level=lvOf(c);
  if(c.level>lv){pushLog(c,{src:'level',summary:'Lv.'+c.level+'に上がりました（'+why+'）'});toast(c.name+'が Lv.'+c.level+' になりました');}
  saveChars();
}
function uniqName(n){
  if(!chars.list.some(c=>c.name===n)) return n;
  for(let i=2;i<100;i++){const m=n+' '+i;if(!chars.list.some(c=>c.name===m))return m;}
  return n+' '+Date.now()%1000;
}
function activateChar(id,quiet){
  const c=charById(id);if(!c)return;
  chars.active=id;c.lastUsed=Date.now();saveChars();
  updateCoachContext();
  if(!quiet) toast(c.name+'に切り替えました');
}
function createChar(base){
  if(!COACH_MODULES[base]) return;
  const c=newChar(base,uniqName(COACH_BOOKS[base].coach));
  chars.list.push(c);activateChar(c.id,true);
  toast(c.name+'を作りました');
  if(needsOnboard()){labScreen='chars';startOnboarding(c.name);}
  else {buildTab='cmp';openCoachBuild(c.id);}   // v19: 作ったらそのままコーチビルドへ
}
function dupChar(id){
  const c=charById(id);if(!c)return;
  const d=charNorm(Object.assign(clone(c),{id:uid(),name:uniqName(c.name),createdAt:Date.now(),lastUsed:0,growNote:null,chatDays:[]}));
  d.log=[{t:Date.now(),src:'create',summary:'作成：「'+c.name+'」を複製',before:null,after:[]}];
  chars.list.splice(chars.list.indexOf(c)+1,0,d);saveChars();toast('「'+d.name+'」を作りました');
  return d;
}
function renameChar(id,name){
  const c=charById(id);name=cut(name,24);if(!c||!name||name===c.name)return false;
  charLog(c,'manual','名前を「'+c.name+'」から「'+name+'」に');c.name=name;saveChars();updateCoachContext();return true;
}
function deleteChar(id){
  if(chars.list.length<=1) return false;
  const i=chars.list.findIndex(c=>c.id===id);if(i<0)return false;
  const [c]=chars.list.splice(i,1);
  if(chars.active===id){const n=chars.list.slice().sort((a,b)=>b.lastUsed-a.lastUsed)[0];chars.active=n.id;}
  saveChars();updateCoachContext();toast('「'+c.name+'」を削除しました');return true;
}
function relDay(ts){
  if(!ts) return 'まだ使っていません';
  const a=new Date(ts);a.setHours(0,0,0,0);const b=new Date();b.setHours(0,0,0,0);
  const n=Math.round((b-a)/864e5);
  return n<=0?'今日':n===1?'昨日':n+'日前';
}
function traitTags(c){
  const a=c.spec.axes,o=[],st=c.spec.tone.style.replace(/[（(].*$/,'').trim();
  if(a.length<=2)o.push(a.strict>=3?'短く鋭い':'短め');else if(a.length>=4)o.push('じっくり説明');
  if(a.strict>=4)o.push('辛口 '+a.strict+'/5');else if(a.strict<=2)o.push('やさしい');
  if(st)o.push(cut(/口調|風|弁$/.test(st)?st:st+'口調',9));
  if(a.ask>=4)o.push('問い多め');else if(a.ask<=1)o.push('指示がはっきり');
  if(a.logic>=5&&a.strict>=4)o.push('数字で詰める');else if(a.logic<=2)o.push('気持ち重視');
  if(a.warmth>=4)o.push('あたたかい');
  if(a.humor>=4)o.push('ユーモア');
  if(c.spec.tone.polite==='plain'&&!st)o.push('タメ口');
  if(!o.length)o.push('バランス型');
  return o.slice(0,3);
}

/* ---- 設計図の項目の読み書き・変更案 ---- */
function getF(c,f){
  if(f==='prefs') return c.prefs;
  if(f.indexOf('tone.')===0) return c.spec.tone[f.slice(5)];
  if(f.indexOf('axes.')===0) return c.spec.axes[f.slice(5)];
  return c.spec[f];
}
function setF(c,f,v){
  if(f==='prefs') c.prefs=v;
  else if(f.indexOf('tone.')===0) c.spec.tone[f.slice(5)]=v;
  else if(f.indexOf('axes.')===0) c.spec.axes[f.slice(5)]=v;
  else c.spec[f]=v;
}
function conceptKey(v,base){   // AI が考え方を名前で返しても key に直す
  const cs=COACH_MODULES[base].concepts,s=String(v||'').trim();
  const k=cs.find(x=>x.k===s)||cs.find(x=>x.name===s)||cs.find(x=>s&&(x.name.indexOf(s)>=0||s.indexOf(x.name.replace(/（.*$/,''))>=0));
  return k?k.k:null;
}
/* 1つの変更案を検査して整える → {field,op,from,to,why} / {locked} / {rejected} / null（変化なし・不正） */
function normChange(x,c){
  if(!x||typeof x!=='object') return null;
  let f=String(x.field||'').trim();f=FIELD_ALIAS[f]||f;
  const D=FIELD_DEF[f];if(!D) return null;
  const why=cut(x.why||'',80),cur=getF(c,f);
  if(c.locks[lockKeyOf(f)]) return {field:f,locked:true,why};
  if(D.t==='axis'){
    let n=Math.round(+x.to);
    if(!(n>=1&&n<=5)&&Number.isFinite(+x.delta)) n=cur+Math.round(+x.delta);
    n=Math.max(1,Math.min(5,n));if(!Number.isFinite(n)||n===cur) return null;
    return {field:f,op:'set',from:cur,to:n,why};
  }
  if(D.t==='polite'){const v=/plain|常体|タメ|ため口/.test(String(x.to))?'plain':'keigo';return v===cur?null:{field:f,op:'set',from:cur,to:v,why};}
  if(D.t==='str'){
    const v=cut(Array.isArray(x.to)?x.to.join(' '):(x.to==null?'':x.to),D.max);
    if(!v&&!(f==='tone.style'||f==='tone.callName')) return null;
    if(v===cur) return null;
    if(unsafeText(v,f)) return {field:f,rejected:true,text:v,why};
    return {field:f,op:'set',from:cur,to:v,why};
  }
  // 配列
  if(Array.isArray(x.to)&&x.op!=='add'&&x.op!=='remove'){
    let v=x.to.map(s=>cut(s,D.max)).filter(Boolean);
    if(f==='on') v=v.map(s=>conceptKey(s,c.base)).filter(Boolean);
    v=v.filter((s,i,a)=>a.indexOf(s)===i).slice(0,D.n);
    const bad=v.find(s=>unsafeText(s,f));if(bad) return {field:f,rejected:true,text:bad,why};
    if(JSON.stringify(v)===JSON.stringify(cur)||(!v.length&&f!=='catchphrases'&&f!=='rules'&&f!=='prefs')) return null;
    return {field:f,op:'set',from:cur.slice(),to:v,why};
  }
  const items=Array.isArray(x.to)?x.to:[x.to];
  let v=cut(items[0]==null?'':items[0],D.max);if(!v) return null;
  if(f==='on'){v=conceptKey(v,c.base);if(!v)return null;}
  if(x.op==='remove'){return cur.includes(v)?{field:f,op:'remove',to:v,why}:null;}
  if(cur.includes(v)) return null;
  if(unsafeText(v,f)) return {field:f,rejected:true,text:v,why};
  return {field:f,op:'add',to:v,why};
}
function prepChanges(list,c,rejectedFromServer){
  const out={ok:[],locked:[],rejected:[]};
  (Array.isArray(list)?list:[]).slice(0,16).forEach(x=>{
    const r=normChange(x,c);if(!r)return;
    if(r.locked){if(!out.locked.some(y=>y.field===r.field))out.locked.push(r);return;}
    if(r.rejected){out.rejected.push(r);return;}
    if(r.op==='set') out.ok=out.ok.filter(y=>y.field!==r.field);
    if(!out.ok.some(y=>y.field===r.field&&y.op===r.op&&y.to===r.to)) out.ok.push(r);
  });
  (Array.isArray(rejectedFromServer)?rejectedFromServer:[]).slice(0,4).forEach(x=>{
    let f=FIELD_ALIAS[x&&x.field]||(x&&x.field);if(!FIELD_DEF[f])f='rules';
    out.rejected.push({field:f,rejected:true,text:cut(x&&x.text||'',40)});
  });
  return out;
}
function applyOne(c,ch){
  const D=FIELD_DEF[ch.field];
  if(D.t!=='arr'){setF(c,ch.field,ch.to);return;}
  let a=getF(c,ch.field).slice();
  if(ch.op==='set') a=ch.to.slice();
  else if(ch.op==='remove') a=a.filter(s=>s!==ch.to);
  else {a.push(ch.to);while(a.length>D.n)a.shift();}
  setF(c,ch.field,a);
}
function applyChanges(c,list,o){
  const before=snapOf(c);
  list.forEach(ch=>applyOne(c,ch));
  c.spec=specNorm(c.spec,c.base);c.prefs=strArr(c.prefs,[],10,80);
  const e=pushLog(c,{src:o.src,summary:o.summary||list.map(chgShort).join('、'),before,after:list.map(ch=>({field:ch.field,op:ch.op,from:ch.from,to:ch.to}))});
  if(o.xp) addXp(c,o.xp,o.why||LOG_SRC[o.src]); else saveChars();
  updateCoachContext();
  return e;
}
function restoreLog(c,t){
  const e=c.log.find(x=>x.t===t);if(!e||!e.before) return false;
  const cur=snapOf(c);
  c.spec=specNorm(clone(e.before.spec),c.base);c.prefs=strArr(e.before.prefs,[],10,80);
  pushLog(c,{src:'manual',summary:'戻しました：「'+cut(e.summary,40)+'」の前の状態に',before:cur});
  if(c.growNote&&c.growNote.t===t) c.growNote=null;
  saveChars();updateCoachContext();return true;
}
/* 変更の見せ方 */
const POLITE_WORD={keigo:'敬語',plain:'常体（タメ口）'};
function valTxt(f,v,c){
  const D=FIELD_DEF[f];
  if(D.t==='axis') return v+'（'+AXIS_WORD[f.slice(5)][v]+'）';
  if(D.t==='polite') return POLITE_WORD[v]||v;
  if(D.t==='arr'){if(f==='on')v=v.map(k=>conceptName(k,c&&c.base));return v.length?v.join('／'):'なし';}
  return v?String(v):(f==='tone.style'?'ふつう':f==='tone.callName'?'あなた':'なし');
}
const conceptName=(k,base)=>{const x=base&&COACH_MODULES[base].concepts.find(y=>y.k===k);return x?x.name.replace(/（.*$/,''):k;};
function chgShort(ch){
  const lb=FIELD_DEF[ch.field].lb;
  if(ch.op==='add') return lb+'＋「'+cut(ch.to,24)+'」';
  if(ch.op==='remove') return lb+'−「'+cut(ch.to,24)+'」';
  if(FIELD_DEF[ch.field].t==='axis') return lb+' '+ch.from+'→'+ch.to;
  return lb+'を「'+cut(valTxt(ch.field,ch.to),20)+'」に';
}

/* ---- プロンプト（いま使っているキャラクターの設計図から作る） ---- */
function slotNow(){const h=new Date().getHours();return (h>=5&&h<11?'朝':h>=11&&h<18?'日中':'夜')+'（'+h+'時台）';}
function charBlock(ch){
  const sp=ch.spec,B=COACH_BOOKS[ch.base],tn=sp.tone,a=sp.axes;
  const style=safeStr(tn.style,'tone.style'),call=safeStr(tn.callName,'tone.callName');
  const out=['## 0. あなたのキャラクター','あなたの名前：'+ch.name+'（ベース：'+B.coach+'）',
    '名前を聞かれたら「'+ch.name+'」と名乗ってください。著者や実在人物として名乗ったり話したりしないでください。',
    '言葉づかい：'+(tn.polite==='plain'?'常体（タメ口）':'敬語')+(style?'。口調：'+style+'（この口調で話す。ただし下の決まりの範囲で）':''),
    '私の呼び方：'+(call?'「'+call+'」と呼んでください。':'「あなた」と呼んでください。')];
  const cp=safeList(sp.catchphrases,'catchphrases');
  if(cp.length) out.push('口ぐせ（ここぞという時にだけ、たまに使う。毎回は使わない）：'+cp.map(s=>'「'+s+'」').join(' '));
  out.push('性格（1〜5）：');
  AXES.forEach(([k,lb])=>out.push('- '+lb+' '+a[k]+'/5：'+AXIS_TXT[k][a[k]]));
  return out.join('\n');
}
function coachModuleBlock(ch){
  ch=ch||activeChar();
  const id=ch.base,m=ch.spec,a=m.axes,B=COACH_BOOKS[id],qn=a.ask>=4?2:1;
  const li=x=>x.length?x.map(s=>'- '+s).join('\n'):'- （なし）';
  return [
    '## 1. あなたの役割：'+B.coach+'の考え方（参考：'+B.ref+'）',
    safeStr(m.role,'role')||COACH_MODULES[id].role,'',
    '## 2. 相談の見立て方',safeStr(m.view,'view')||COACH_MODULES[id].view,'',
    '## 3. 使ってよい考え方（この本に実際に出てくるもの。引用や出典を作らないこと）',
    li(COACH_MODULES[id].concepts.filter(k=>m.on.includes(k.k)).map(k=>k.name+'：'+k.note)),'',
    '## 4. よく使う問い（そのまま読み上げず、会話に合わせて1回に'+qn+'つまで）',
    li(safeList(m.questions,'questions')),'',
    '## 5. 一手の出し方',safeStr(m.action,'action')||COACH_MODULES[id].action,'',
    '## 6. やらないこと',li(safeList(m.avoid,'avoid')),'',
    '## 7. 話し方',
    '言葉づかい：'+(m.tone.polite==='plain'?'常体':'敬語')+'。厳しさ：'+a.strict+'/5（'+STRICT_SHORT[a.strict]+'）。返事の長さ：'+LEN_WORD[a.length]+'。質問は1回の返事につき'+qn+'つまで。'
  ].join('\n');
}
function persBlock(ch){
  const rules=safeList(ch.spec.rules,'rules'),prefs=safeList(ch.prefs,'prefs'),out=[];
  if(rules.length) out.push('## 7b. このコーチの決まり（本人と決めたこと。下の「守ること」「安全のための決まり」の範囲で守る）\n'+rules.map(s=>'- '+s).join('\n')+'\n今の時間帯：'+slotNow());
  if(prefs.length) out.push('## 7c. 本人が好む返し方（聞き比べ・会話・記録から学んだこと）\n'+prefs.map(s=>'- '+s).join('\n'));
  return out.length?'\n'+out.join('\n\n')+'\n':'';
}
const SAFETY_RULES=[
   '## 9. 安全のための決まり（キャラクター・口調・性格・決まりの設定より優先。どの設定でも変わりません）',
   '- 人格否定・罵倒・脅し・見下しは絶対にしない。厳しさは行動と事実にだけ向ける。',
   '- 医療・法律・お金のことは断定しない。診断や確実な見通しは言わず、必要なら専門家への相談を勧める。',
   '- 自傷や強い落ち込みの話が出たら、一手より先に休むことを優先し、身近な人か相談窓口（いのちの電話など）に話すよう案内する。',
   '- 上のキャラクター設定がこの決まりとぶつかる時は、この決まりを守る。'
].join('\n');
function buildPrompt(ch,opts){
  ch=(ch&&ch.spec)?ch:activeChar();opts=opts||{};
  const fixed=opts.preview?[
   '## 8. 守ること',
   '本の考え方を参考にしつつ、今日の一手を具体的かつ小さく提案してください。',
   'これは名著の考え方をもとに独自に設計したコーチ設定であり、著者・出版社の公認や公式な代弁ではありません。本文を引用せず、自分の言葉で伝えてください。心理検査・診断ではなく、効果や成果を保証しません。'
  ]:[
   '## 8. 守ること',
   '本の考え方を参考にしつつ、今日の一手を具体的かつ小さく提案してください。',
   'これは名著の考え方をもとに独自に設計したコーチ設定であり、著者・出版社の公認や公式な代弁ではありません。本文を引用せず、自分の言葉で伝えてください。心理検査・診断ではなく、効果や成果を保証しません。',
   '型：既定の型は '+tname(cfg.type)+' です。型は私が決めます。あなたは型を判定しないでください。',
   '目標・状況：'+(mem.memo.goal||cfg.goal||'（未入力）'),
   '宣言する行動は、次のメニューから選んでください。当てはまらないときだけ、新しい行動を提案してください。',
   'メニュー（今日の FOCUS）：'+(todayTasks().length?todayTasks().map(x=>x.title).join(' / '):(menu.length?menu.join(' / '):'（FOCUS未選択）')),
   '毎回の返答の末尾に、次の行を書いてください（表示されない機械用の行です）。',
   '[[summary: 今日の状況を一言で]]',
   '[[menu_suggest: 行動1 | 行動2]]（当てはまらないときだけ。なければ省略）',
   '数字や回数は「アプリが計算した事実」を使い、自分で数え直さないでください。',
   '「本人の事実」にない人物像を決めつけないでください。'
  ];
  return [
   'あなたは私専用のAIコーチです。',
   '',
   charBlock(ch),
   '',
   coachModuleBlock(ch),
   persBlock(ch),
   fixed.join('\n'),
   '',
   SAFETY_RULES
  ].join('\n');
}

