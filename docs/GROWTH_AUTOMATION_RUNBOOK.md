# APAC Growth統合基盤 — 実装と運用の境界

2026-10-31 / branch codex/managed-service-mvp

## 実行した統合範囲

```sh
# ネットワークwriteもlive送信flagもない、ローカルfixture統合。
node scripts/growth-cycle.mjs --dry-run --start-date 2026-11-02
# オフラインの調査再確認キュー。
node scripts/research-refresh.mjs
# 明示的な公開情報read（既知7ホストのみ、最大20 requests、redirectしない）。
node --use-env-proxy scripts/research-refresh.mjs --read-public
# 従来の開発DB集計は独立した既存CLI。productionとは扱わない。
node --use-env-proxy scripts/acquisition-report.mjs --read-dev-kpis
```

`logs/growth/growth-fixture-state.json` / `growth-cycle-latest.json` / `.md` と調査結果をローカル保存する。Git対象外、private file、既存single-host lock、claim前の永続化を使用。これを本番DB・承認情報としてimportしない。人間の承認を自動作成する本番jobではない。

今回のdrill: 6社の既存根拠をimport、domain重複排除、具体的SCM根拠のある候補へ合成人物1件、メール1件の模擬承認/送信、SNS9件の模擬承認/Buffer予約/Published照合/計測、follow-up draft1件を作り、reply/stopで停止。再実行で同じ11件を保持する。検索3原稿は既存12案の一部として準備段階を維持。模擬の数値を実獲得数に合算しない。

## 状態と安全性

- CRM: company/contact、公開根拠と未確認事項、透明なICP score、状態、reply/stop/bounce/meeting履歴。sourceが変わればpending承認を無効化。実個人の収集・登録は行っていない。
- 承認: Draft → Review → Approved → Scheduled → Published → Measured。本文、宛先/チャネル、画像、URL、日時をhashに含め、変更時は再承認。画像の本番配信は未実装で拒否。
- contact consent/suppression/stop/bounce/country/法務review/sender情報/停止入口をdispatch直前にも検証。
- Sendingを先に永続化。unknown/heldを自動再試行しない。provider IDとchannel/content照合なしにPublishedにしない。
- 日時を変えて同一本文を再登録してもduplicateを拒否。10/hour・50/day・同一宛先24h制限をfixtureでも維持。既存SQLのquotaを緩和しない。
- ローカルfixture actorのroleは実Auth認可ではない。productionのserver-backed CRM/承認は未接続。ブラウザからroleや承認を渡して使えるAPIは作っていない。
- 高リスク検査は既存outboundルールを共有し、法的/金銭/PO/仕入先/機密/不確かなAI・未検証成果を拒否。新CRM原稿を既存送信allowlistに自動追加しない。

## Buffer — ChatGPT接続と実行環境は別

このセッションにはBuffer操作toolが提供されていない。ChatGPT側サービス画面の接続状態はここから断定しない。CodexプロセスではBUFFER_API_KEY/ORGANIZATION_ID/X_CHANNEL_ID/THREADS_CHANNEL_ID/LINKEDIN_CHANNEL_IDがすべて未設定で、アカウント・channel・plan・insights権限のlive確認は未実施。

公式ドキュメントでGraphQL/Bearer API key、account organizations（owner emailを要求しない最小取得）とchannels discovery、service enumのtwitter/threads/linkedin、post/status/metrics queryとtext schedulingを確認した。実装は選択したchannelがdiscovery結果・service・unpaused状態と一致することを検証する。LinkedInをX copyの単純流用にせず、既存チャネル別原稿を使う。

`createBufferAdapter` のmutationは既定拒否。将来の信頼されたserver側 `authorizePublication` が、保存済み承認hash/claimに対応する値を返す必要がある。ブラウザのapproved=trueではない。今回のcallbackは明示的なfixtureしか提供しない。本文URLの一致、日時、文字数、network/channelを確認する。画像workflowはverified immutable asset設計まで拒否する。

- createPost receiptは受付証跡で、Publishedではない。
- post queryでid/channel/text/statusを照合し、sentになった証拠を確認してからPublished。
- metricsはpersonal API keyによる自分用workflow向けで、insights権限/ネットワークの供給項目に依存する。欠損を0にしない。Impressions等のraw type/value/unitを保持する。
- Website Visits/Signups/Demo/Qualified LeadsはBufferの数値と同義ではなく、承認済みUTMとweb側同一cohortから別途joinする。`by_post`がない集計を各投稿に配賦しない。
- 公式Post Metrics文書にはdeprecated link_clicksの制約がある。3ネットワークで同じclick指標が取れるとは約束しない。現在の実SNS指標はすべて未取得。
- paid plan/connected channel上限はアカウント未接続のため未確認。料金やupgradeを推測・実施しない。

資料: https://developers.buffer.com/examples/get-channels.html / examples/create-text-post.html / examples/get-post-metrics.html / guides/posts-and-scheduling.html / guides/post-metrics.html / types/Service.html

### 必要な一度きりの設定（secure settingsのみ）

1. 所有者がBuffer API利用と対象3チャネルを承認。API keyを`BUFFER_API_KEY`へ安全に保存。チャット/ソース/VITE_に貼らない。
2. `organizations()`の取得結果から `BUFFER_ORGANIZATION_ID`を本人のorganizationとして確認し、channels queryで取得した実IDから `BUFFER_X_CHANNEL_ID` / `BUFFER_THREADS_CHANNEL_ID` / `BUFFER_LINKEDIN_CHANNEL_ID` を選択する。IDを推測しない。
3. metricsが必要ならpersonal automation利用条件とinsights権限/planを確認する。新権限は別承認。
4. 本番の承認/claim backendをレビュー・適用し、1件ずつ正確なchannel/content/images/URL/time/hashを人が承認する。現在のfixture承認を流用しない。
5. 承認済み限定testを実行し、provider ID、最終state、計測可否を確認してから拡大する。今回live testはしていない。

## Supabase / CRM / 本番とテストの分離

既存Supabase foundationへの開発用readは確認済み。新CRMを既存の顧客運用demo/lead tablesへ混ぜない。

- `docs/proposals/APAC_GROWTH_CRM.sql`: **未承認、未適用**の7テーブル案。登録migrationディレクトリ外。default unknownのpopulation分類、company/contact、campaign、承認、attempt、activity。
- 読み取りはGrowth Adminかつ対象workspace owner/admin。普通のworkspace ownerだけでは不可。ブラウザDML/自己昇格/新しいsecurity-definer関数は与えない。
- 使い捨てlocal SQLでrole/組織分離をテストした。hostedのschema/RLSは一切変更していない。
- 適用前にはauth.uid()を保持するCRUD/review/claim RPC、read-only集計経路、停止・不明配送照合、監査/保持期間、データ移行/rollback方針を完成・レビューする必要がある。SQL案だけではproduction CRMは稼働しない。
- 実ユーザーがdemoを使うことと、テストユーザーであることは別。productionは明示的に確認済みreal_customer populationのみ、development/fixtureは別のenvironment。未分類・データ根拠未確認は未取得。ブラウザの任意タグを本番分類の権限としない。
- 本番KPI/匿名Visitors readerと個別投稿のconversion joinは未接続。現在の開発aggregateやfixture1件を実獲得数にしない。

## 同意付きsource計測

`VITE_GROWTH_ATTRIBUTION_ENABLED`は既定OFF。現在のCloud/Production設定は変更していない。有効化には計測/通知内容・対象project・privacy reviewと本番反映承認が必要。

有効化されたdev fixtureでは、optional analyticsへの同意後だけ、X/Threads/LinkedIn/organic_searchの列挙値と時刻を最大7日localStorageへ保存する。生URL、任意campaign文字列、email等は保存しない。同一originでsignup/新tab確認後の既存RPCにreferral_sourceを付与できる。撤回/signoutで消し、古いpending propsからもsourceを除去する。通常の進捗イベントは変えない。別device/同意なし/期限切れは未帰属で、directに捏造しない。

signup_completedのDB trigger自体に新しいsourceを付けたわけではない。初回ログイン等のsourceをcohortと結ぶread pathが別途必要。匿名Visitorsはaccount件数から推測しない。PostHog等のread権限追加は別承認。

## GitHub Actions / 旧Mac runner

`.github/workflows/growth-internal.yml`はUnit/Security/Local DB/Browser/Build、内部drill、調査再確認キュー、offline KPIを定義。push/PR/manual/01:15・09:15・17:15 UTCのschedule案。contents:read、checkout credential非永続、実測したcommit SHAにpin、secrets参照なし、production/provider/deploy jobなし。失敗は内部annotationとStep Summary。外部メール・Slack通知はしない。

**まだGitHubで稼働していない。** 無許可pushしていないため登録/実行確認できない。cronはGitHubのdefault branch上のworkflow登録に依存するので、feature branchへのpushだけで定期実行開始と見なさない。Actions policy、予算、workflow登録/既定branch方針を人が確認し、必要な操作を別承認する。勝手にmainへmergeしない。

旧Mac `codex-v3.sh` / `run-v3-cycle.sh` / `send-codex-3day-report.sh` は内部dry-runだけの互換wrapperへ変更。`--approve-for-me`、recursive Codex、.env自動読込、hosted lifecycle queue変更、直接送信を取り除いた。`send-codex-activity-report.mjs` も送信入口を廃止し安全な既存集計CLIへ委譲。既存の審査済みメールworkerは維持する。

Macへの配布/pull・launchd変更・インストーラ実行はしていない。すでにインストールされた旧版の実状態は所有者確認が必要。このCloudコミットだけでMacも安全に切替済みとはしない。

## 稼働/完成判定

| 機能 | 判定 |
| --- | --- |
| 内部CRM/承認/queue/停止/重複/unknown/Buffer3ch模擬統合 | Implemented & Tested（fixture専用） |
| 同意付きcoarse source / population分離 / post join純粋集計 | Implemented & Tested、本番有効化待ち |
| Gmail OAuth refresh/scopes/sender読取 | Configured & Running（今回read-only成功、配送稼働ではない） |
| 開発Supabase集計・public research・ローカルdrill | Configured & Running（今回の単発read/dry-run、常駐jobではない） |
| CI/schedule定義 / 本番計測 / CRM schema案 / 外部test | Awaiting Human Approval、hosted稼働未確認 |
| real CRM RPC/backend、営業メールlive、返信Gmail追加scope、実unsubscribe/bounce連携、画像配信、分散queue/1万ユーザー検証 | Blocked / Not Implemented |

Gmail DB runtimeは読取でdisabled/self-test confirmedを確認。OAuthの今回read-only検証は成功したが、DBのOAuth確認markerは期限切れで、書き換えていない。実配送前には別承認のconnection-record更新/保護された限定testが必要。EMAIL_SEND_MODE=draft_onlyとsend-enabled=falseを維持し、テストのためにRLSやquotaを緩めない。
