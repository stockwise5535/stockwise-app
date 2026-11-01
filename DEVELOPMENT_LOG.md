# Stockwise / NexOps 開発記録

## 2026-11-01 — Buffer 読み取り接続と CRM / Growth KPI 連携調査

対象チェックアウト: `stockwise5535/stockwise-app`、調査時 HEAD: `69e54742ecca5f3401338a762707a30ab3fe0fa3`。
既存の開発記録・NEXT_TASK はこのチェックアウト内に存在しなかったため新規作成。別リポジトリや外部の開発記録は調査・更新していない。

### 接続確認結果

公開済み Buffer 専用環境で、認証なし HTTPS GET はプロキシ CONNECT 200、TLS 検証成功、Buffer HTTP 401 / UNAUTHENTICATED。以前のネットワーク制限による CONNECT 403 は解消済み。
その後、登録済み `BUFFER_API_KEY` による GraphQL query のみで組織・チャンネルを確認した。認証情報は記録しない。

| 対象 | 確認した名前 | 結果 |
| --- | --- | --- |
| 組織 | My Organization | 読み取り成功 |
| LinkedIn | NexOps（nexops2026） | 読み取り成功、isDisconnected=false |
| Threads | nexops2026 | 読み取り成功、isDisconnected=false |
| X | NEXOPS2026 | 読み取り成功、isDisconnected=false（API service は twitter） |

これは Buffer が返す接続状態であり、投稿実行や各SNSへの直接接続の検証ではない。

### 既存コードで利用できるもの

| 根拠 | 利用できる機能 | 限界 |
| --- | --- | --- |
| `package.json`, `api/*.js` | React / Vite とサーバー側 API ハンドラーの構成。標準 fetch による外部 HTTP 通信の例あり | Buffer クライアント・読み取りエンドポイントなし。Vite 単体では Vercel の API ハンドラーは動かない |
| `src/App.jsx` の EarlyAccessModal、`api/save-early-access.js` | 会社名・連絡先・メール・課題・source を含む申請受付 | CRM 一覧・流入経路別集計ではない。既存 API は DB 書き込み用なので今回実行しない |
| `src/App.jsx` の MetricCard / MiniMetric / Panel | KPI 表示の UI 部品候補 | 現在の指標は在庫用途。Growth のデータ取得・定義・画面はない |
| `src/AuthContext.jsx`, `src/supabase.js` | 既存アプリの Supabase 認証 | Buffer 専用環境には接続しない。将来の連携 API には利用者認可・組織スコープの検証が別途必要 |
| `SUPABASE_SQL.sql` | profiles / skus / subscriptions の定義 | SNS 指標・CRM・キャンペーン対応表なし。early_access_requests の定義もこの SQL にはない。稼働 DB の状態は未確認 |

Buffer SDK、SNS 指標取得、CRM/Growth 画面、定期収集、テストスクリプトはこのチェックアウトには見当たらない。`buffer` という既存コード内の変数は CSV 読み込みのバイト列であり、Buffer サービスとの連携ではない。

### Buffer 読み取り API の調査結果

`https://api.buffer.com/` の認証付き GraphQL introspection（query のみ）で以下を確認。

- `account.organizations` と `channels(input: { organizationId })`: 接続済み組織・チャンネルを列挙できる。上記接続確認で実行済み。
- `posts(input: PostsInput!, first, after)`: 組織単位の投稿取得とカーソルページング。`edges` / `pageInfo` を返す。
- `Post`: `channelId`, `channelService`, `status`, `dueAt`, `sentAt`, `metrics`, `metricsUpdatedAt` が存在する。本文など不要な項目を取得しない設計が可能。
- `aggregatedPostMetrics(input: AggregatedPostMetricsInput!)`: organizationId、startDateTime、endDateTime が必須。channelIds と tags による絞り込みが可能。metrics と metricsUpdatedAt を返す。
- 集計クエリのスキーマ説明では postCount / reactions / comments が基本。追加指標は選択した全チャンネルの共通対応項目に制限され、LinkedIn 単独なら impressions / reach / engagementRate 等が候補。SNS 別に取得して扱う必要がある。

投稿一覧・集計の実データクエリは今回未実行。利用プラン・権限・各SNSの対応指標・値・鮮度・レート制限は未検証。スキーマに項目があることだけで、3チャンネルの全指標が取得可能とは判断しない。

### 不足している実装と設計上の確認事項

- サーバー側の Buffer 読み取りアダプター。キーをブラウザーへ渡さず、固定した GraphQL query のみを許可し、任意クエリや mutation の中継を禁止する。
- 組織・3チャンネルの識別と認可、X と API の twitter の表記対応、投稿ページング、期間・タイムゾーンの明示。
- 投稿状態と SNS 別指標を正規化するデータ契約。取得日時・指標更新日時・欠損/非対応/権限不足/ゼロを区別し、異なるSNSの率を単純合算しない。
- 401/403、429、GraphQL 部分エラー、通信失敗の区別、再試行・キャッシュ方針と機密情報を出さないログ。
- CRM / Growth 側の参照先がこのチェックアウトでは未実装。SNS の反応数から商談・売上への因果や流入元は確定できない。申請の source だけでは投稿・キャンペーン別の対応付けが不足する。
- 将来の表示・集計を検証する読み取り専用テスト。DB 保存・定期ジョブ・デプロイは今回の対象外。

### 今回の変更・実行範囲

開発記録と NEXT_TASK の文書のみ追加。既存コード、設定、依存関係、ロックファイル、DB は変更していない。Supabase / Gmail 接続、投稿・予約・下書き変更、デプロイ、commit / push は行っていない。アプリ起動・ビルド・テストは今回の調査対象外で未実行。

次に実装する作業は `NEXT_TASK.md` の1件のみ。


## 2026-11-01 — Buffer 実データ読み取り実装

既存アダプターは調査記録だけで未実装だったため、今回新規実装した。
`server/buffer-growth.js` にサーバー専用 `readBufferGrowth`、`scripts/buffer-growth-read.mjs` にCLIを追加。
CRM/Growthから利用できる内部関数であり、公開HTTPルート・CRM画面・DB保存・定期実行は未追加。
固定GraphQL query、組織スコープ、3サービス、ページング、タイムアウト、リダイレクト拒否、エラー秘匿化を実装。
共通JSONは取得日時・集計期間・投稿状態・投稿別指標・SNS別集計・欠損・部分失敗を保持する。
詳細な利用契約は `server/BUFFER_GROWTH.md`。

### 実データ確認

My Organizationの3チャンネルとも成功、isDisconnected=false。
集計要求期間: UTC 2026-10-02 00:00〜2026-11-02 00:00。終了日は確認時点より後を含む。
投稿一覧は全日時・全状態でページング完了。本文は未取得。下書きは状態の読み取りのみ。

| SNS | 全日時の投稿数 / 状態 | 投稿別指標（返却された項目の集合） | 期間集計の返却値 |
| --- | --- | --- | --- |
| LinkedIn / NexOps | 83 / sent | comments, engagementRate, impressions, reach, reactions, shares | postCount=12, comments=1, engagementRate=0.85%, impressions=352, reach=258, reactions=1, shares=0, totalTimeWatched=0, viewers=0, views=0 |
| Threads / nexops2026 | 136 / sent, draft | comments, engagementRate, quotes, reactions, reposts, views | postCount=2, comments=0, engagementRate=0.21%, quotes=0, reactions=0, reposts=1, views=466 |
| X / NEXOPS2026 | 172 / sent, draft | clicks, comments, engagementRate, impressions, reactions, reposts | postCount=22, clicks=0, comments=0, engagementRate=1.43%, impressions=70, reactions=0, reposts=0 |

投稿別項目は全投稿に値があるという意味ではない。集計値はAPIの返却値であり、SNSでの独立検証はしていない。
未取得の集計指標（未返却をゼロに置き換えない）:

- 共通: averageTimeWatched, follows, freeSubscriptions, likes, paidSubscriptions, saves。
- LinkedIn: 共通に加え clicks, quotes, reposts。
- Threads: 共通に加え clicks, impressions, reach, shares, totalTimeWatched, viewers。
- X: 共通に加え quotes, reach, shares, totalTimeWatched, viewers, views。

未対応・権限不足・データ未生成の理由は断定しない。フォロワー総数・CRM流入/商談/売上/コンバージョンは取得していない。

### 検証

既存Unit/Securityスクリプト・テストは存在しなかったため追加。Unit 5件、Security 5件が成功。既存Buildも成功。
欠損とゼロ、ページング、部分失敗、入力検証、組織スコープ、401/403/429/通信エラー、固定query/宛先、クライアント境界を検証。
初回テストのISO日時の期待値不一致は正規化後の期待値に修正して再実行済み。
APIキーはサーバー環境のみから取得し、VITE_変数・コード・ログへ公開しない。ビルド出力のキー混入も確認する。
依存関係は既存ロックファイルでnpm ci。ロックファイル未変更。

本番運用にはCRM呼び出し箇所と利用者/組織認可、実行頻度・キャッシュ・429バックオフ、監視通知、キー更新、保持方針、キャンペーン対応付けが不足。
本番DB書き込み・投稿・予約・下書き変更・デプロイ・push・環境設定変更は行っていない。


## 2026-11-01 — Authenticated Buffer metrics in Internal Growth Dashboard

User-authorized implementation/local validation only; no hosted DB change, push,
deployment, publication or scheduler activation. Working branch:
`codex/managed-service-mvp`, integration baseline `5ea4dec`.

Preserved previous main-based uncommitted files in a recoverable archive outside
the checkout, then switched to the existing development history. Integrated the
fixed-query server reader, its CLI and tests. `bbf5f77` remains unlocated (earlier
GitHub patch lookup 404); used inspected source and added regression/security
checks instead. Existing services/buffer-adapter.js has publication methods and
is not imported by the new read-only route.

Added GET /api/growth/social-metrics: Supabase getUser + nexops_is_growth_admin,
RLS-backed organization owner/admin and workspace membership checks; fixed
server organization/channel mapping; strict period/query validation; capped
pagination and whole-request deadline; bounded process-local quota, single-flight
and organization/period cache; fresh authorization on all cache hits; no-store
responses and sanitized failures. No service-role credential is required.

Internal Growth Dashboard now has a manual SNS read panel for LinkedIn/Threads/X.
Available values (including real zero), missing metrics, loading, fetch failure,
partial inventories and metrics freshness are distinct. Changes of scope/period
clear data and obsolete responses cannot repopulate the old view. Extra available
provider metrics are shown; posts are not modified.

Validation: 171 Unit/Security cases passed; 23 disposable local SQL tests passed;
existing acquisition/growth/attribution/legal/operations browser suites passed,
plus the dedicated SNS browser suite. Existing production Build and secret scan
passed. Final verification after the last UI/error-state edits is recorded below.
All Browser Auth/provider responses are synthetic/local; no hosted Auth/RLS or
end-to-end production verification is claimed.

Live configuration inspection found only BUFFER_API_KEY present. Buffer fixed IDs,
NEXOPS_SOCIAL_ORGANIZATION_ID and Supabase public Auth settings are absent.
No values were requested in chat, recorded or written to environment settings.
The endpoint fails closed pending configuration. Cache/rate limits are per-process;
distributed enforcement and authorized-user hosted validation remain release work.
See docs/SOCIAL_METRICS.md for exact contracts, caps, settings and limitations.


Final post-edit verification (2026-11-01): all 171 Unit/Security tests passed;
new SNS browser suite passed after adding independent post/metric failure checks;
Growth browser verified administrator-only panel mounting. Existing five browser
suites and 23 local SQL tests passed. Production Build passed; final source/dist
security scan passed with 173 inspected files and no findings. git diff --check
passed. No live authenticated endpoint test was possible without the missing
server mapping/Auth configuration. No production changes or remote publication.


## 2026-11-01 — Administrator-enabled daily SNS autopilot (local only)

Current user policy supersedes older per-post human review for this new path:
after explicit administrator activation, AI + deterministic-rule-approved posts
may publish automatically. Default OFF; no runtime activation performed here.

Implemented fixed three-channel daily cycle, private production-only job route,
Supabase-authenticated organization/admin control API and Dashboard enable/stop
panel. Generation is constrained composition from reviewed public facts and hooks,
followed by separate AI review, fixed source/shape/risk/length checks, normalized
copy dedup and seven-day same-topic cooldown. Source fingerprints are tested;
version or channel changes require administrator reactivation. No unrestricted
AI claims, numeric social proof or private customer data are published.

Added an UNAPPLIED SQL proposal for eight social tables and scoped RPCs: durable
per-UTC-day tick/run and one post/network/day, policy revisions, pre-call AI budget
reservations, dispatch claims, accepted/unknown/published outcomes, common JSON
snapshots, operator alerts and administrator audit. Counters/claims use PostgreSQL
unique keys and policy-row locks, not per-process ledgers. Unknown/sending states
hold future automatic publication; no retry or destructive reset mechanism added.
Safe rejected copy and fixed reasons are retained; raw untrusted model output is not.

AI limits: pinned gpt-4.1-mini, max 8192 input-content bytes / 600 output tokens,
six generation+review calls/day, 20 US cents reserved/call, $1.20/day and $40/month
per organization at reviewed price ceilings. Failures consume reservations. Current
pricing and provider project budget/alerts must be verified before production;
no paid AI request was made. Reservation is not a guarantee against provider
repricing. Actual safe model output/request latency remains a production preflight.

Buffer results are collected daily even when publishing policy is OFF (once the
production job/configuration is approved), persisted as common JSON, and reused
by the authenticated metrics API. Registered accepted IDs are reconciled without
post text, including bounded individual reads when list pagination is incomplete.
Measured prior-topic/channel performance and freshness feed the next day's plan;
missing metrics stay missing. Stop blocks future dispatch gates but cannot retract
in-flight or already Buffer-accepted posts/schedules. Faults send fixed-code HTTPS
webhook alerts and record endpoint-acceptance status; no Gmail/email integration.

Read-only Buffer schema introspection found required createPost assets and
needsApproval fields missing from the old adapter. Added assets:[],
needsApproval:false, saveToDraft:false, aiAssisted:true and verified current
customScheduled/automatic enum and success/error fragment types. No mutation was
sent to Buffer. Production write checks now also guard the reused adapter itself.
Older dry-run tests use static simulated production flags with a hard-coded mocked
transport; real environment credentials/transports are never used in these tests.

Validation: 193 Unit/Security cases passed, 29 disposable local SQL tests passed
(including six new autopilot SQL cases), seven browser suites passed, production
Build passed. Dedicated browser tests cover dual activation consent, ON/stop,
preview denial, unknown delivery, stale policy and fail-closed config/error states.
Existing Auth/provider browser traffic is synthetic; no hosted authorization or
multi-connection load verification is claimed. Final source/dist secret scan follows.

Artifacts and exact setup/release bounds: docs/SOCIAL_AUTOPILOT.md,
docs/proposals/SOCIAL_AUTOPILOT.sql, and INACTIVE
SOCIAL_AUTOPILOT_CRON.json (daily 09:00 UTC). Active vercel.json, registered
migrations, GitHub workflow/scheduler settings and package-lock are unchanged.
Current environment still has only Buffer key; production IDs/Auth/worker/AI/
notification/cron credentials and Vercel controls are unconfigured/unverified.

No GitHub push, production deployment, hosted DB/role change, actual Buffer write,
AI billing, notification delivery, email or scheduler activation was performed.
Only the schema introspection contacted Buffer and it used query operations.
