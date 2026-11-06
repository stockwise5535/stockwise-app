# 本番SNSスキーマの追加計画（未適用）

対象コード: `codex/integrate-social-autopilot-main` / `b6915d7`。
対象サイトは利用者確認済みの `stockwise-app-1qz9`。利用者は最新依頼で本番適用・main反映・デプロイと検証成功後の有効化を承認済み。ただし接続権限/認証情報が不足し、未実行。

## 最新状況（2026-11-02）

- 利用者提供の3 CSVを照合済み。関数3件・RLS4件のハッシュは既存開発定義に一致し、基盤権限10行も整合。基盤定義の追加監査は不要。
- 利用者の本番読み取り結果から確定した3 UUIDを本番SQLに設定済み。メール確認、Growth管理者、組織owner/admin、workspace所属を満たすとの報告。
- 静的検証成功。実行SQLの変更は3 UUIDのリテラルだけ。新規8テーブル/8関数、既定OFF、cronなし、既存基盤変更なしを維持。新規SQLテスト7件再実行成功（破棄可能DB/合成データのみ）。
- **追加スキーマSQLの判定はGO。本番稼働は接続準備不足で停止。** 本番適用時の事前チェックは引き続き有効で、監査後の変更・対象所属欠落・既存SNSオブジェクト等があれば停止する。
- 現クラウドで準備済みはBUFFER_API_KEYのみ。Vercel/Supabase管理接続、AIキー、固定ID、通知先、cron認証情報がない。Vercel本番側の環境変数登録状況を確認できたものではない。
- ネットワークはBuffer APIと既定パッケージ取得先のみ許可。Vercel/Supabase/OpenAI/通知ホストへの通信準備が必要。
- main反映、push、本番DB適用、デプロイ、cron登録、有効化、実Buffer書き込みは未実行。次回投稿日時は未設定。

以下の「現時点NO-GO」等の記録は、UUID/追加CSV確定前の監査経緯。最新判定は上記を参照。

## 監査結果の判断

利用者提供の監査集計は PASS 18、MISSING 24、MISSING_OR_REVIEW 21。
追加の `stockwise_supabase_review_rows.csv` は7行。CSVは監査データとしてのみ扱った。

| 対象 | 確認できたこと | 判断と最小差分 |
| --- | --- | --- |
| `nexops_growth_admins` | RLS有効、anonアクセス不可、authenticated SELECT/書き込み不可、service_role SELECT/INSERT/UPDATE可、RLSポリシー0件 | 直接非公開は適切。SECURITY DEFINERの管理者RPC経由なので、SELECT grantや自己行SELECTポリシー追加は不要。既存設定を維持する |
| 残る基盤4テーブル | 各1ポリシー、最小参照定義とは不一致 | 開発版の組織・workspaceメンバー限定SELECTと整合する可能性はあるが、CSVには式・ハッシュ・対象ロール・コマンドがなく確定不可 |
| `nexops_is_growth_admin()` | boolean、SECURITY DEFINER、空search_path、authenticated実行可、anon不可、本文が最小参照と不一致 | 改行・末尾セミコロン差でも不一致になる。開発版と最小版の両本文ハッシュを照合する。CSVだけで安全と断定しない |
| SNS8テーブル・8関数 | 全て未作成との監査結果 | 新規作成だけを行う。基盤・既存データ・関数・RLS・ACLの修正は含めない |

**現時点の判定: 本番適用はNO-GO。** ローカル追加SQLは検証済みだが、既存RLS/関数の実定義、実効TRUNCATE/列権限、対象管理者・組織・workspaceが未確定。
既存基盤に脆弱性があると断定したものではない。未知の定義を自動修復せず、事前チェックで停止する。
他の既存SECURITY DEFINER RPC、Authトリガー、管理者運用全体をこの7行CSVから完全監査することもできない。

## SQLと既存提案との差分

実行候補は `SOCIAL_AUTOPILOT_PRODUCTION.sql`。旧 `SOCIAL_AUTOPILOT.sql` は参照用として維持する。
新案は同じ8テーブル・8関数のインターフェースと制約を使い、以下だけを追加・絞り込みした。

- 全体を単一トランザクション化し、ロック/処理タイムアウトと同時適用防止ロックを設定。
- 既存管理者・組織・workspaceのUUID入力を必須とする。既定NULLなので未記入では停止。ユーザーや所属を作成しない。
- 基盤RLS・実効権限・既知のポリシー/認可関数のハッシュを検査。基盤のテーブル所有者/BYPASSRLSをクライアントが継承している場合、匿名SELECT、書き込み・TRUNCATE・TRIGGER・REFERENCES・列書き込み権限、未知の定義では停止。
- 権限チェックは保守的。行変更がRLSで拒否される場合でも、余分な既存書き込みgrantがあれば停止し、別途レビューする。勝手にREVOKEしない。
- Growth管理者テーブルの直接SELECTなし/ポリシーなしを許容。最小版の自己SELECT方式も許容。
- 最小基盤と開発版の既知SELECTポリシーを許容し、開発版で使う `nexops_org_member` / `nexops_workspace_role` も存在する場合は本体・属性・権限を検査。
- SNSオブジェクトが一部でも存在すれば停止。`IF NOT EXISTS`、`CREATE OR REPLACE`、基盤ALTER、データ更新、cron登録を使用しない。
- service_roleはSELECTに加え、アダプターが直接使うruns/posts UPDATE、snapshots INSERT/UPDATE、alerts INSERTだけを付与。状態変更RPC6個はservice_role限定。ブラウザーは組織管理者限定のSELECTと管理用RPC2個のみ。
- 監査identity sequenceのブラウザー/worker権限を明示的に除去。監査INSERTはSECURITY DEFINER経由。
- 日次tick・runの組織/日付一意制約、投稿の組織/日付/SNS主キーと組織/SNS/内容hash一意制約を維持。結果不明は保留し、再送しない。
- `enabled DEFAULT false`。設定行は作成せず、設定なしもOFF。アプリ側の公開ゲートは変更しない。
- 新規オブジェクトだけにインストール識別コメントを付け、空インストールの撤去時に照合。

ハッシュは最小基盤提案と `f797b10` の既存開発マイグレーションからローカルPostgreSQLカタログで抽出した。
書式・PostgreSQLの逆構文生成の差でも停止し得る。停止時は実定義を読み取りレビューし、別のレビュー済みSQLを用意する。ハッシュ条件を削除して続行しない。

## 本番適用前（読み取りだけ）

1. SupabaseのプロジェクトをVercel本番URL/設定と照合する。ローカルVercelリンクは別プロジェクトなので使用しない。
2. `SOCIAL_BASELINE_SECURITY_REVIEW.sql` をSQL Editorで実行。ポリシー式/関数本文そのものやユーザーデータを出力せず、定義ハッシュ・属性・実効権限を確認する。新案の許可リストと照合し、未知のものは停止する。
3. 確認済みの既存管理者user UUID、NexOps organization UUID、workspace UUIDを特定する。メール確認済み、Growth管理者登録、対象組織owner/admin、同じworkspace所属が必要。不足する権限割り当てはこのSQLで補わず、別承認の対象。
4. `SOCIAL_INTEGRATION_READONLY.sql` の先頭3 UUIDを設定し再監査する。新SNSオブジェクトが存在しないこと、対象認可を確認する。
5. Vercelで `NEXOPS_SOCIAL_WRITES_ALLOWED=false`、`NEXOPS_SOCIAL_EMERGENCY_STOP=true`、scheduler未登録を別途読み取り確認。DB監査だけでは外部cron・Vercel環境変数を証明できない。
6. バックアップ/PITRの利用可否を確認し、新SQLの3 UUIDだけを入力した実行版をレビュー。その後で本番SQL適用の明示承認を得る。機密キーをSQLに記入しない。

## 承認後の適用・確認

この作業では本番実行していない。将来の承認後、SQL Editorで追加SQL全体を一度実行する。
エラー時はトランザクションをROLLBACKし、後半だけ再実行しない。既に成功したSQLの再適用も意図的に拒否される。

- 再度 `SOCIAL_BASELINE_SECURITY_REVIEW.sql` とUUID入り `SOCIAL_INTEGRATION_READONLY.sql` を実行し、基盤の事前/事後結果が同一であることを比較。
- SNS8テーブル・8関数・8 SELECTポリシー・一意/チェック制約・worker専用RPC権限を確認。SNS項目はPASS、設定は行なし/OFFであること。基盤の参照定義差によるREVIEWは消す必要がなく、検証した既知定義との照合で判断する。
- DB内のcron未登録を監査し、Vercel/GitHub/外部schedulerも別途OFF確認。
- 後続の承認済み検証環境で、実ユーザーによる管理者取得成功、非管理者/他組織拒否、権限確認失敗時拒否を確認する。本番の認証・認可がローカルDBだけで確認済みとは扱わない。
- デプロイ、cron登録、自動公開ON、Buffer書き込みはそれぞれ今回の範囲外。DB追加の承認から推定しない。

## ロールバック

適用途中で失敗した場合は単一トランザクションのROLLBACKで新規DDLを全て撤回する。
適用成功後はデータ保存を優先し、承認を得てアプリの停止操作/公開ゲートOFFとscheduler停止を行う。今回その操作は実行しない。

`SOCIAL_AUTOPILOT_ROLLBACK_EMPTY.sql` は**8テーブルが全て空の場合だけ**使える別承認用の破壊的SQL。
識別コメント、全8関数、全テーブルの空判定と排他ロックを確認し、明示名で撤去する。CASCADEなしで外部依存があれば全体が失敗/ROLLBACKする。既存基盤、既存管理者関数、Auth、CRM、Stripeには触らない。
設定OFF行1件だけでも存在すれば停止する。投稿・実行・結果不明・予算・重複防止・監査履歴を削除して再送の余地を作らない。データがある場合の物理撤去は別途設計・承認する。

## ローカル検証

PGlite（PostgreSQLエンジン）の破棄可能DBのみを使用。Supabase本番には接続していない。

```sh
NEXOPS_PGLITE_PATH=/path/to/node_modules/@electric-sql/pglite npm run test:db
```

新規テストは `supabase/tests/social-production.test.mjs`。最小基盤と開発版互換基盤への適用/再監査、既存テーブル定義・ACL・ポリシー・関数・データの保持、OFF既定値、未認証/他組織/worker権限、異常時の原子性、上限/重複/結果不明保留、最小worker ACLによる直接書き込み、空撤去/非空・識別違い・外部依存時拒否を検証する。
本番PostgreSQLバージョン・Supabase/PostgREST・実JWT・VercelはこのローカルDB検証の対象外。

実行結果: 新規7件＋既存8件のDBテストが成功。ローカルBuild成功。
秘密情報検査は90ファイルで検出なし。標準コマンドは環境の`spawnSync git`が
EPERMで拒否されたため、シェルで同じGit対象一覧を取得し、/tmpの一時runnerで
既存検査ロジックを実行した。検査スクリプト自体のリポジトリ変更はない。
アプリコード変更がないため、成功済みUnit/Browserは今回再実行していない。
