# CRYPTO SIGNAL ARCHIVE

価格（ローソク足）と、その時点のイベントを縦線で重ねて見るページ。売買botのリポジトリとは**完全に別物**として作っています。

## 構成
| ファイル | 役割 |
|---|---|
| `public/index.html` | 画面（LUXE）。`/api/*` を呼ぶだけ |
| `public/events_manual.json` | 任意の追加イベント用（今は空。マクロは全て自動取得） |
| `worker.js` | `/api/candles`（Pacifica）、`/api/events`（日米欧のマクロ指標・チェーン直読みの予定など）、`/api/ethqueue`（ETH出口待ち）を返す。30分ごとの定時実行でマクロ指標をKVに保存する |
| `wrangler.jsonc` | Cloudflare Workersの設定（Worker名、KV `cal` の接続、30分ごとの定時実行） |
| `tools/apply_update.py` | 更新zipを展開して反映する（zip自動展開の本体） |
| `tools/check_site.py` | 公開中のAPIが正しい形で返るかを確認する |
| `.github/workflows/apply_update.yml` | zipをpushすると自動で展開・反映 |
| `.github/workflows/deploy.yml` | 反映後にCloudflareへ自動公開 |
| `.github/workflows/check.yml` | 公開URLの動作確認（手動実行） |

## 公開手順
1. 新しいGitHubリポジトリを作り、この中身をそのままpush（botのリポジトリには入れない）
2. ターミナルで `npx wrangler deploy`（**APIキーは不要**）
3. 手元で試すなら `npx wrangler dev`

## zipで更新する（自動展開）
- リポジトリの直下か `updates/` に `*.zip` をアップロードすると、Actionsが中身を展開して反映し、zipは消します。
- zipがフォルダ1つにまとまっていても（`Crypto_Schedule-main/...` など）、その1段は自動で外します。
- 守るもの: `.env` と `.dev.vars` は上書きしません。`../` など外へ書き出す名前、1ファイル20MB超は拒否します。
- `.github/workflows/` の変更だけは、GitHubの制限で自動反映できません。ログに警告が出るので、そのファイルだけ手で上げてください。
- 手で動かすときは Actions → 「Apply update zip」→ Run workflow。

## 自動公開（任意）
- GitHubのSecretsに `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を入れると、`main` へのpushと、zip反映の完了後に、自動で公開されます。未設定なら何もしません（手元の `npx wrangler deploy` でも公開できます）。

## 動作確認
公開後、Actions → 「Check live site」→ 公開URLを入れて実行すると、全時間軸の価格とイベントが返るかを確認できます。Pacificaの仕様変更などで壊れたときの早期発見に使えます。

## 仕様メモ
- 足: 1分・5分・15分・1時間・4時間・日足はPacificaの足をそのまま使用。週足・月足は日足から集計（UTC基準、週は月曜始まり）。
- 銘柄: BTC / ETH / SOL / SUI / BNB（`worker.js` の `SYMS` と `public/index.html` の `A` を揃えて変更）。
- マクロ（日米欧）: TradingViewの公開カレンダー（`economic-calendar.tradingview.com/events`、鍵なし・**非公式**）から、過去60日〜先90日分を自動取得。米・日・ユーロ圏（US/JP/EU）の重要度「高」「中」のみ。祝日と低重要度は除外。指標名は主要なものを日本語に置き換え（対応表は `worker.js` の `JA`）、それ以外は英語のまま。FOMC・日銀会合・ECB政策金利も同じ取得に含まれるため、手動登録は不要。
- マクロの予備: TradingViewが取得できない時だけ、Forex Factoryの週次JSON（今週・来週分のみ、非公式）に切り替える。切り替わると画面下に警告が出る。
- 非公式な取得元に依存するため、止まる・仕様が変わる可能性がある。`Check live site` で国別の件数（US/JP/EU）を定期的に確認すること。
- 銘柄イベント(チェーン直読み): BTCの半減期(mempool.spaceのブロック高から10分/ブロックで逆算・推定)と、ETHのコンセンサス層 fork_schedule に載った未来のフォークを、毎回公開APIから読む。鍵・申請は不要。出典欄に「チェーン確定」「チェーン由来・推定」と確度を書く。ETHは未来のフォークが載るまで何も出ない。
- ETH出口待ち(時系列の別枠): ビーコンチェーンの公開API(鍵なし)から出口待ちのバリデータ(active_exiting)を30分ごとに読み、件数と待ち日数(最後のexit_epoch−現在のエポック、1エポック=6.4分)をKV(`ethq:v1`)に120日分貯める。画面はETHタブの価格の下に同じ時間軸で表示(`/api/ethqueue`)。履歴を返すAPIは使わないので、記録は導入日から貯まる。
- 銘柄イベント(BNBバーンの目安): 四半期(1・4・7・10月)の15日を「目安」として生成(第36回が2026-07-15、次回は10月中旬見込み。正確な日付は告知まで不明)。
- 銘柄イベント(満期の自動計算): Deribitの公式規則(全て08:00 UTC、月次=月末最終金曜、四半期=3・6・9・12月の最終金曜)から、BTC/ETH/SOLのオプション・先物の満期を先6か月ぶん生成する。取得元は無く、鍵も不要。
- 銘柄ニュース(現在は無効。`worker.js` の `NEWS_ENABLED` を true にすると再開): 暗号資産メディア（Cointelegraph、CoinDesk、Decrypt）のRSSから、見出し・日時・リンクだけを30分ごとに取得し、KVの `news:v1` に積み上げる（90日分）。鍵は不要。銘柄はタイトルの言葉（Bitcoin、Solana、BNB、Suiなど）で判定。一部のメディアが取れなくても、他のメディアの分は出る（取れなかった所は画面に警告）。縦線を選ぶと「記事を開く」のリンクが出る。
- 市場ニュースの層は準備中（`events_manual.json` に `l: "market"` / `"asset"` で追加すれば表示される）。
- マクロ指標の保存: 定時実行（Cron Trigger、30分ごと）が指標を取得し、KV（名前空間 `cal`、バインディング名 `CAL`）に保存する。`/api/events` は保存済みの内容を返すので、見る人が増えても取得元への問い合わせは増えない。
  - 取得範囲（過去60日〜先90日）は取得結果で置き換え、それより古い過去分は1年分まで残す。
  - 取得に失敗した時は上書きしない（0件では保存しない。一部失敗では既存分を残す）。
  - 保存が3時間より古い・無い時だけ、その場で取得する。それも失敗し、古い保存があれば、警告つきでそれを返す。
  - KVが接続されていなくても動く（毎回その場で取得）。定時実行の結果は Cloudflare のログで確認できる。
- キャッシュ: `workers.dev` のURLでは Workers のCache APIは機能しない（独自ドメインのみ）ため、サーバー側のキャッシュには頼っていない。価格は、足ごとに30秒〜10分、ブラウザが同じ内容を使い回す。画面は開いている間、価格を60秒ごと、指標を30分ごとに取り直す。
- Worker名は Cloudflare 上の名前（`crypto-schedule`）と `wrangler.jsonc` の `name` を一致させること。
- Pacificaの応答形式は、botのWorkerと同じ前提で書いています。初回デプロイ後に `/api/candles?sym=BTC&tf=1h` を直接開いて確認してください。

## 動作確認の状況
モックの応答でWorkerとページの動作（足の集計、マクロ指標の取得・日本語化・予備への切替、エラー表示、HTMLの無害化）と、zip展開の安全装置（フォルダ1段外し、秘密の保護、パス脱出の拒否、ワークフローの除外）を確認済み。GitHub ActionsとCloudflareへの実際のデプロイは未実行です。実際のPacifica・TradingView・Forex Factoryへの接続は、この環境から通信できないため未確認です（TradingViewが要求するヘッダーも未確認）。
