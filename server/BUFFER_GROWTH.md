# Buffer → CRM / Growth 読み取りインターフェース

`readBufferGrowth({ organizationId, start, end, maxPages })` を信頼されたサーバー側から import する。
`start` / `end` はタイムゾーン付き ISO 日時、start < end が必須。`maxPages` は各チャンネルの投稿取得上限（既定10、1〜100）。
Node.js 24 の環境で検証済み。プロキシ環境では `node --use-env-proxy` を使用する。

CLI: `npm run buffer:read -- ORGANIZATION_ID 2026-10-02T00:00:00Z 2026-11-02T00:00:00Z`
キーはサーバー環境の `BUFFER_API_KEY` のみから取得し、引数・VITE_変数・ソース・ログに書かない。CLI は投稿本文を取得しないが、JSON に投稿IDや指標を含むため出力先のアクセスを管理する。

出力は schemaVersion / source / organization / fetchedAt / period / missingServices / channels / status。
channels は接続状態、投稿状態一覧、投稿別 metrics、SNS別期間集計 metrics、metricsUpdatedAt、errors を持つ。
`status=complete` は要求した取得処理が完了した意味で、全指標対応・リアルタイム更新・接続正常を保証しない。
接続状態は `disconnected` を確認する。

投稿一覧は全日時・全状態（postsScope=all_statuses_all_dates）。period は集計だけに適用する。
投稿一覧の件数と期間集計の postCount は別の値。postsComplete=false の場合、投稿状態の総数として利用しない。
指標は API 返却値・単位を保持し、未返却は status=not_fetched / value=null。未対応か権限不足かデータ未生成かを推測しない。
API が返すゼロは保持する。異なるSNSの engagementRate や reach を単純合算しない。
顧客・売上・コンバージョンへの紐付けはこのデータだけでは成立しない。

GraphQL は固定 query のみ。mutation、任意URL、任意クエリ、DB書き込み、バックグラウンドジョブは実装しない。
HTTP 403 は ACCESS_DENIED、接続失敗は NETWORK_ERROR とし、403だけではプロキシ制限かBuffer権限か断定しない。
429 は RATE_LIMITED。自動再試行はせず、呼び出し側で実行頻度・バックオフを管理する。
GraphQL 部分エラーは当該クエリの結果を採用せずエラーとして示す。投稿と集計は独立して取得する。

この関数は内部APIであり、公開HTTPルートは追加していない。CRM サーバーへの組み込み時には、呼び出し元の認証と組織への認可が必要。
APIキーが組織を参照できることと、CRM利用者がその組織を参照してよいことは別。
起動時の secret / api.buffer.com 許可 / CA trust / proxy は運用環境で構成する。Supabase や Gmail の資格情報は不要。

本番で未整備: CRMの呼び出し箇所と認可、実行頻度・キャッシュ・429バックオフ、監視と失敗通知、キー更新、データ保持方針、キャンペーン/CRMの対応付け。


## Dashboard integration update

`GET /api/growth/social-metrics` now wraps this internal reader with Supabase Auth,
Growth administrator and organization/workspace authorization. It pins channel IDs
and supplies stricter caps and a shared request deadline. See
[docs/SOCIAL_METRICS.md](../docs/SOCIAL_METRICS.md) for current behavior and setup.
The earlier statement that no HTTP route exists describes the previous checkpoint.
