# CRYPTO SIGNAL ARCHIVE

価格（ローソク足）と、その時点のイベントを縦線で重ねて見るページ。売買botのリポジトリとは**完全に別物**として作っています。

## 構成
| ファイル | 役割 |
|---|---|
| `public/index.html` | 画面（LUXE）。`/api/*` を呼ぶだけ |
| `public/events_manual.json` | 手動で登録するイベント（今はFOMC 2回分） |
| `worker.js` | `/api/candles`（Pacifica）と `/api/events`（FRED＋手動）を返す |
| `wrangler.jsonc` | Cloudflare Workersの設定 |
| `tools/apply_update.py` | 更新zipを展開して反映する（zip自動展開の本体） |
| `tools/check_site.py` | 公開中のAPIが正しい形で返るかを確認する |
| `.github/workflows/apply_update.yml` | zipをpushすると自動で展開・反映 |
| `.github/workflows/deploy.yml` | 反映後にCloudflareへ自動公開 |
| `.github/workflows/check.yml` | 公開URLの動作確認（手動実行） |

## 公開手順
1. 新しいGitHubリポジトリを作り、この中身をそのままpush（botのリポジトリには入れない）
2. FRED APIキーを無料で取得: https://fred.stlouisfed.org/docs/api/api_key.html
3. ターミナルで:
   ```
   npx wrangler deploy
   npx wrangler secret put FRED_API_KEY
   ```
   （キーはコードやリポジトリに書かず、必ずこのシークレットで渡す）
4. 手元で試すなら `npx wrangler dev`

## zipで更新する（自動展開）
- リポジトリの直下か `updates/` に `*.zip` をアップロードすると、Actionsが中身を展開して反映し、zipは消します。
- zipがフォルダ1つにまとまっていても（`Crypto_Schedule-main/...` など）、その1段は自動で外します。
- 守るもの: `.env` と `.dev.vars` は上書きしません。`../` など外へ書き出す名前、1ファイル20MB超は拒否します。
- `.github/workflows/` の変更だけは、GitHubの制限で自動反映できません。ログに警告が出るので、そのファイルだけ手で上げてください。
- 手で動かすときは Actions → 「Apply update zip」→ Run workflow。

## 自動公開（任意）
- GitHubのSecretsに `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を入れると、`main` へのpushと、zip反映の完了後に、自動で公開されます。未設定なら何もしません（手元の `npx wrangler deploy` でも公開できます）。
- `FRED_API_KEY` はCloudflare側のシークレット（`npx wrangler secret put FRED_API_KEY`）に入れます。GitHubには入れません。

## 動作確認
公開後、Actions → 「Check live site」→ 公開URLを入れて実行すると、全時間軸の価格とイベントが返るかを確認できます。Pacificaの仕様変更などで壊れたときの早期発見に使えます。

## 仕様メモ
- 足: 1分・5分・15分・1時間・4時間・日足はPacificaの足をそのまま使用。週足・月足は日足から集計（UTC基準、週は月曜始まり）。
- 銘柄: BTC / ETH / SOL / SUI / BNB（`worker.js` の `SYMS` と `public/index.html` の `A` を揃えて変更）。
- マクロ: FREDのrelease_datesから、過去60日〜先90日分のCPI・雇用統計・PCE・PPI・GDP・小売売上高・新築住宅販売・ADP（月次は水曜のみ）を自動取得。米東部時間→UTCは夏時間込みで変換。
- FOMCは `events_manual.json` に手動登録。**公式の日程と照合してから使うこと。**
- 市場・銘柄ニュースの層は準備中（`events_manual.json` に `l: "market"` / `"asset"` で追加すれば表示される）。
- キャッシュ: 価格は足ごとに30秒〜10分、イベントは30分。
- Pacificaの応答形式は、botのWorkerと同じ前提で書いています。初回デプロイ後に `/api/candles?sym=BTC&tf=1h` を直接開いて確認してください。

## 動作確認の状況
モックの応答でWorkerとページの動作（足の集計、夏時間の変換、エラー表示、HTMLの無害化）と、zip展開の安全装置（フォルダ1段外し、秘密の保護、パス脱出の拒否、ワークフローの除外）を確認済み。GitHub ActionsとCloudflareへの実際のデプロイは未実行です。実際のPacifica・FREDへの接続は、この環境から通信できないため未確認です。
