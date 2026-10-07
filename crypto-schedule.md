# CRYPTO SIGNAL ARCHIVE 運用まとめ(2026-10-07 更新)

公開URL: https://crypto-schedule.signalarchive.workers.dev/ (旧: crypto-schedule.zakusenwig.workers.dev)
リポジトリ: Crypto_Schedule(非公開)。
現在の版: `2026-10-07-v73`(crypto-schedule-v73.zip。v69〜v72 の変更を含む。公開待ち)
X: @csa_archive(日英)。運用仕様書 crypto_signal_archive_x_spec.md(4シリーズ・予想しない/解釈しない/記録する)

## 10/7 当チャット v70〜v73
- v70: 指標を選ぶと「指標の概要(無料)」と「過去の発表日時・結果(有料🔒)」を表示(PC・スマホ両方)。説明は `public/ind.json`(44指標)。
- v71: スマホ版の「従来のスマホ画面」リンクを削除。
- v72: X投稿のお知らせ(ntfy)。→ v73 で置き換え。
- **v73: X投稿の下書き置き場 `/posts.html`**(ユーザー決定: 英日は別投稿/数値は無料で載せてよい/管理キーで保護/画像の手間を最小に)
  - `tools/x_notify.mjs`(RX runner の最後に毎時)が4シリーズの下書きを作り KV `posts:v1` に貯める。API `/api/admin/posts`(管理キー必須)。
    - DAILY TIMELINE・ON THIS DATE: 毎日 UTC 0時台。WEEK IN CRYPTO: 月曜 UTC 0時台。ARCHIVED: 発表65分後以降。
  - 数値の決まり: Binance 現物、UTC。前 = 発表時刻の5分足始値、後 = 1時間後に閉じる5分足終値。週 = 月曜0時〜次の月曜0時 UTC。変化率は小数2桁。
  - 英語の時刻はUTC、日本語は日本時間(週次・ON THIS DATE は UTC 基準)。
  - 画像はページ上で自動生成(1200×675、仕様書の配色)。スマホは共有メニュー → X で画像+本文。PC は画像コピー → 投稿画面で貼り付け。投稿すると「投稿済み」。
  - X API は使わない(有料)。UI自動操作・フォローBotはしない。
- 公開後の作業: zip を上げる → /posts.html で管理キーを1回入れる。NTFY_TOPIC(任意)があれば新着通知。

## 10/6〜10/7 の追加(別チャット v28〜v68 + v69)
- PC版はモックアップのデザイン(v26〜)。言語は EN/JP(v27)。スマホ版 `classic.html` は新デザイン(v36〜)。
- 支払い: ウォレット接続 → 1 USDC 等で365日アクセス。`/api/auth/*`・`/api/pay/*`。
- **EVENT IMPACT(過去の反応)= 有料機能**。2017年からの重要度「高」の発表について、Binance 5分足で各時間後の変化と最大上下を計算。
  - 計算係は GitHub Actions の `tools/rx_runner.mjs`(`.github/workflows/rx_runner.yml`、毎時23分)。
  - 保存: KV `rx:s:00〜63`・`rx:idx`・`rx:run`。Secrets: GitHub `RX_ADMIN_KEY`。
- 「1つも計算されていない」の正体: 計算は正常。ブラウザが支払い済みと判定されず全部🔒だった。
- v69: 発表20回未満の指標は出さない、同時刻の重複統合、名前修正、最大上下を全時間で(記録の長さ18)。

## 仕組み
- Cloudflare Worker(無料プラン)。画面は保存済みデータを読むだけ。取得は定時実行のみ。
  - 5分ごと: 価格(Pacifica → Hyperliquid → dYdX)。30分ごと: マクロ指標・チェーン → イベント完成品、ETH出口/入口待ち、ステーク量。
- KV: `px:v2`・`macro:v1`・`events:v1`・`ethq:v1`・`stake:v1`・`rx:*`・`posts:v1`
- 更新: zip をリポジトリに上げる → Actions が展開 → Deploy。`.github/workflows/` だけ手で上げる。

## 教訓
- Cloudflare の外向きIPは共用。Pacifica・publicnode・Binance は断ってくる → 予備の取得元、重い取得は GitHub Actions へ。
- 定時実行の重い処理は `await`(`waitUntil` は約30秒で切れる)。
- API名に events / track / analytics / collect を使わない(広告ブロッカー)。
- 画面向けAPIは保存済みを返すだけ(計算時間10ms)。
- Python で JS を書き換える時は raw 文字列を使う。

## 方針・制約
- 収益化前の出費はしない。無料プラン上限: 1日10万アクセス/計算10ms/外部問い合わせ50回/KV書き込み1日1000回。
- 統計は過去の観測値であり売買推奨ではない。「勝率」は使わない。
- 訓練中の収益化(有料アクセス)はハローワークに要確認(未解決)。

## 残っている課題
- ETH ステーク量(beaconcha.in 429)。SOL 総供給比。価格は実質 Hyperliquid。
- X仕様のうち ETF・トークンアンロック・プロトコルアップグレードはデータ源が未整備。
