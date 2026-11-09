# GitHub → Google Apps Script（初回は手動承認）

対象: `feat/apps-script-sales-crm-gmail-bridge-20261107`、基準 `ed33fdc`。
公式 `@google/clasp@3.4.1` を隔離した tools/apps-script/package-lock.json で固定。
Google側の手修正との照合・バックアップ・初回反映は、Google認証後に行う。現時点では未検証・未デプロイ。
本番CRM、TEST CRMのデータ・Settings・Script Properties・トリガーはこのワークフローでは変更しない。

## 1. 初回Google認証（Mac、既存Gmailテストに成功した所有者アカウント）

1. https://script.google.com/home/usersettings を開き **Google Apps Script API** をONにする。メール送信やトリガーは実行されない。
2. GitHubの対象ブランチをMacに取得し、Node.js 22以上で以下を実行する。

   ```sh
   npm ci --prefix tools/apps-script --ignore-scripts
   mkdir -p "$HOME/.config/stockwise-clasp"
   chmod 700 "$HOME/.config/stockwise-clasp"
   node tools/apps-script/node_modules/@google/clasp/build/src/index.js --auth "$HOME/.config/stockwise-clasp/.clasprc.json" login
   chmod 600 "$HOME/.config/stockwise-clasp/.clasprc.json"
   ```

   ブラウザで所有者アカウントを選択し、公式claspの認証を完了する。ローカルホストへの戻りを許可する。
   認証JSON、アクセストークン、リフレッシュトークンをチャットへ貼らない。ファイルはGit外に保管する。
   APIが無効・組織ポリシーで拒否される場合はその設定だけを解決する。権限回避は行わない。
3. TEST CRMと本番CRMをそれぞれ開き「拡張機能 → Apps Script → プロジェクトの設定 → スクリプトID」を確認する。
   **別のスクリプトID・別のスプレッドシートID** が必要。既存プロジェクトを勝手に作り直さない。
   バインド先はGoogle APIの `parentId` と照合される。standaloneスクリプトはこの構成では拒否する。

## 2. GitHubの設定（認証値はSecretsへ直接）

Repository Settings → Secrets and variables → Actions → Variables に以下を登録する。

| Repository Variable | 内容 |
|---|---|
| APPS_SCRIPT_TEST_SCRIPT_ID | TEST CRMに紐付いたApps Script ID |
| APPS_SCRIPT_PRODUCTION_SCRIPT_ID | 本番CRMに紐付いた別のApps Script ID |
| STOCKWISE_TEST_CRM_ID | `12uDNmpfEANnzzTRoT6eyjmlNg1wj2B9f6BUPWH9X3pk` |
| STOCKWISE_CRM_ID | 本番CRMのSpreadsheet ID（TESTとは別） |
| APPS_SCRIPT_TEST_AUTO_DEPLOY | 初期は未登録または `false`。初回手動反映成功後だけ `true` |

TESTの2 IDはユーザー確認済みの値をworkflowの既定値に設定済み。Variablesで上書きする場合もGoogle APIのバインド先照合を必須とする。本番IDが未登録なら本番操作は拒否される。Google APIのparentIdで固定TEST CRMへの結び付きを必ず確認する。本番準備時には4変数すべてを設定し、重複を拒否する。

これらはデプロイ先の識別用で、**Script Propertiesへ転記する処理はない**。
既存コードの `STOCKWISE_CRM_ID` Script Property は旧来の実行対象設定であり、TEST側では未設定またはTEST IDであることを確認する。
TESTに本番IDが入っていたら実行を止める。今回のワークフローはプロパティを修正しない。

Settings → Environmentsで先に以下を作成する。

- `apps-script-test`: mainだけを許可。初回成功後のTEST自動更新用。毎回のreviewerは不要。
- `apps-script-production`: required reviewersに所有者を設定、mainだけを許可。本人承認が必要なら prevent self-review はOFFにする。

各EnvironmentのSecretsに `CLASP_AUTH_JSON`（公式認証JSON全文）と `APPS_SCRIPT_BACKUP_KEY` を登録する。
TEST EnvironmentはTEST所有者の認証。本番は本番所有者の認証。可能ならアカウント権限も分離する。
環境保護ルールの利用可否はGitHubプラン・リポジトリ可視性に依存する。利用不可なら本番への反映は停止する。手動起動だけでrequired reviewersを代替しない。
**本番は常に手動workflow_dispatch＋mainの完全SHA一致が必要**。

バックアップ鍵は32バイトのランダム値をBase64化する。Macのターミナルでは表示せずファイルへ保存できる。

```sh
umask 077
openssl rand -base64 32 > "$HOME/.config/stockwise-clasp/backup-key.txt"
```

GitHub CLIを使用する場合（それぞれのEnvironmentで実行）:

```sh
gh secret set CLASP_AUTH_JSON --repo stockwise5535/stockwise-app --env apps-script-test < "$HOME/.config/stockwise-clasp/.clasprc.json"
gh secret set APPS_SCRIPT_BACKUP_KEY --repo stockwise5535/stockwise-app --env apps-script-test < "$HOME/.config/stockwise-clasp/backup-key.txt"
```

鍵はパスワード管理ツールにも保存する。鍵を失うと暗号化バックアップは復元できない。
鍵・認証JSON・復号済みソースはGitに入れない。ローカル認証後にrefresh tokenを失効するとActionsも再認証が必要になる。

## 3. Google側の手修正を確認する（書き込みなし）

ワークフローをmainへレビューして取り込んだ後、Actions → **Apps Script reviewed delivery** → Run workflow:
branch `main`、target `test`、operation `inspect`。confirm_shaは空欄。

- 実際のGoogleバインド先を検証する。
- 現在の全ソース・マニフェストをAES-256-GCMで暗号化バックアップする。
- `report.json` にbindingHash、remoteDigest、sourceDigest、変更ファイル名だけを記録する。
- Googleソース変更・CRM読み書き・メール送信・トリガー作成は行わない。

Artifactsから `backup.enc.json` と `report.json` をダウンロードする。保存期間は30日なので、安全な場所にも保存する。
MacのGit外の場所で復号する（出力先は未作成ディレクトリを指定）:

```sh
export APPS_SCRIPT_BACKUP_KEY="$(< "$HOME/.config/stockwise-clasp/backup-key.txt")"
node tools/apps-script/restore-backup.mjs /path/to/backup.enc.json "$HOME/.config/stockwise-clasp/review-test"
unset APPS_SCRIPT_BACKUP_KEY
```

復号済みCore.js/Engine.js/Main.jsとGitHubコードをローカルエディタで比較し、Google側の必要な手修正をGit側に取り込む。
秘密情報がハードコードされていたらGitにコピーせず、保管方法を別途修正してから進める。
パッチ照合記録はdeployment/patch-review.json。添付CSVやメール原稿は取り込んでいない。

反映対象はCore.js、Engine.js、Main.js、既存のコード.js、appsscript.jsonの5ファイル。既存コード.jsはそのまま保持する。
Google側にCode.gs、古いbundle、HTMLなど追加ファイルがあれば書き込みを停止する。必要な処理を失わない統合方法をレビューするまで進めない。
マニフェストのOAuth scope・タイムゾーン等が異なる場合も停止する。実環境の必要な設定を保った候補をレビューする。
単なるJSONキー順序・改行差は正規化して比較する。push時は既存マニフェストのバイト列を維持し、--forceは使わない。

## 4. 初回TEST反映（手動承認）

1. TESTのSettingsでLIVE_SENDINGとFOLLOW_UP_ENABLEDがFALSE、現在の所有者向けGmailテスト実装・設定を保持したことを確認する。設定を変更しない。送信テスト自体は自動実行しない。
2. 差分統合後に必要ならinspectを再実行し、最新reportの3ハッシュを `deployment/test.review.json` に設定する。
   `status="reviewed"`、`settingsVerifiedOff=true`、`manualEditsReconciled=true`、`ownerGmailTestPreserved=true` は実際に確認した場合だけ設定する。
   `approvedSourceDigest` にはreportの `sourceDigest` を使う。ハッシュ値は秘密値ではない。
3. レビュー記録をGitにコミットしmainへ取り込む。Google側のコード編集をいったん止める。
4. mainの完全コミットSHAを取得。Actionsをtarget=`test`、operation=`bootstrap`、confirm_sha=そのSHAで手動実行する（TEST用は既存apps-script-test Environmentを使用）。
5. 更新直前にもGoogle側のダイジェストを再確認し、一致時だけ1回clasp pushする。Google APIに原子的CASがないため、実行中は手動編集しない。
6. 更新後に再取得しソース一致・構文・関数定義を確認する。設定やGmailの実行確認とは区別する。
7. TESTのApps Scriptエディタで **verifyTestCrmDeployment** を手動実行する。出力はversion/modulesLoaded/testCrm/liveSendingOff/followUpOffのみ。すべてtrueであることを確認する。シート初期化・送信・トリガーは実行しない。
8. 合格後だけRepository Variable `APPS_SCRIPT_TEST_AUTO_DEPLOY=true` にする。以後main更新時にテスト成功後TESTへ反映する。

稼働中コードが承認済みGit履歴と異なれば自動反映は停止する。手修正をGitに取り込んで再承認する。
source pushはエディタHEADを更新するため、**既存トリガーは次回実行時から新コードを使う**。トリガーを新規作成しないことと既存トリガーが動かないことは異なる。
LIVE_SENDING/FOLLOW_UP_ENABLEDはこの作業で変更しない。現状がFALSEでない場合、承認記録にTRUEと記載して進めない。

## 5. 本番反映と障害時

TEST合格後、本番もinspect→差分レビュー→production.review.json更新→手動bootstrapを行う。
本番用review記録には `testRuntimeVerified=true`、同一候補の `testSourceDigest`、検証済みTESTのActions `testDeploymentRunId` も必要。Google上でのTEST実行確認前は設定しない。GitHub APIでEnvironmentにrequired reviewersが実在することを確認できない場合も停止する。
以後の本番更新もtarget=production、operation=deploy、mainの完全SHA指定・所有者の承認が必須。pushイベントから本番は実行できない。
本番CRMのデータ・送信設定を更新することは承認に含めない。

バックアップ後・書き込み前の停止はGoogleコードを変更していない。
`PUSH_ATTEMPTED_RESULT_UNCONFIRMED` は送信結果不明。**自動再試行しない**。inspectで現在のソースを読み取り確認して判断する。
更新後不一致・Gmail動作不明の場合も自動再試行・自動ロールバック・メール再送はしない。
復元は保存済み暗号化バックアップをローカル復号し、現状との差分・送信設定・バインド先を確認して別途承認のうえ実施する。restore-backup.mjsは復号のみでGoogle書き込み機能を持たない。

`clasp push` はソース反映であり、Web App/API executableの作成は不要。Gmail所有者テストは所有者アカウントで手動実行する場合だけメール送信になる。今回は実行していない。
GitHub Actionsの利用枠・料金は契約に依存する。AI APIは使用しない。

## ローカル確認

```sh
npm run test:sales
node --test tools/apps-script/*.test.mjs
node --check tools/apps-script/deliver.mjs
```

Googleの認証、実コード比較、バックアップ取得、TEST反映、Google上の関数実行、既存Gmail送信の実動作はGoogle接続後に確認する。Nodeのテスト成功を実環境確認済みとは扱わない。

## 営業送信の段階的な有効化（コード反映とは別）

コード反映だけでは送信許可を与えない。既存Settingsの `LIVE_SENDING` / `FOLLOW_UP_ENABLED` / `LEGAL_REVIEW_COMPLETED` は自動でTRUEにしない。
新コードはScript Propertiesに別の送信許可がないとLIVE送信を停止する。`STOCKWISE_SALES_EMERGENCY_STOP` は未設定でも停止扱い。

所有者が実際に国別法令・送信者住所・配信停止を確認した後だけ、以下を手動で準備する。これは法令適合を自動判定する仕組みではなく、確認記録を必須にするゲート。

- `STOCKWISE_SALES_LAUNCH_REVIEW`: JSON。senderAddressVerified=true、unsubscribeTestVerified=true、reviewedBy、reviewedAt（ISO日時、180日以内）、evidenceReference、countriesを記録する。countriesは国→確認済みcontact_basis配列。公開連絡先の存在だけを送信許可とみなさない。
- `STOCKWISE_SALES_PILOT_QUEUE_IDS`: レビュー済みキューIDのJSON配列、最大3件。`approval_status=APPROVED`、approved_by、明示的に記録したapproved_hashが必要。
- Settingsには実際の送信者住所、国別の確認結果と整合した設定を入力する。コードがこれらを補完・承認することはない。

例は形だけを示すもの。実際の確認なしに貼り付けない。

```json
{
  "senderAddressVerified": false,
  "unsubscribeTestVerified": false,
  "reviewedBy": "",
  "reviewedAt": "",
  "evidenceReference": "",
  "countries": {}
}
```

TESTで送信先・本文・配信停止・返信・失敗時停止を検証後、所有者がメニュー `Arm reviewed pilot (max 3)` を実行して確認する。
この操作もLIVE_SENDING等は変更しない。実送信は所有者が別途既存スイッチを設定してから、指定した最大3件だけを処理する。
試行対象以外のキュー、本文変更後のキュー、未確認国・連絡根拠は送信しない。
Gmailのmessage/thread ID取得はGmail受付の確認であり、宛先への到達保証ではない。

最初の実到達・配信停止処理を所有者が確認した後だけ `STOCKWISE_SALES_PILOT_DELIVERY_VERIFIED=true` を手動設定し、`Approve recurring after pilot` で再承認する。
通常運用でも各キューの宛先・本文・連絡根拠・抑止リスト・時間帯・件数制限のチェックは毎回継続する。
FAILED/SENDINGが残る場合は全体を停止する。記録を消したりQUEUEDへ戻したりして再送せず、Gmail実結果を確認する。

`STOP prospect sending` は即時停止専用。コード更新や日次処理で停止を解除しない。
アラートは必ず実行ログへ記録する。所有者メール通知は `STOCKWISE_SALES_ALERTS_ENABLED=true` を手動設定した場合だけ有効（1日最大1試行、結果不明時に再送しない）。
`runDailySalesReport` は個人情報を含めない当日件数をActivityLogへ1日1回記録する。`STOCKWISE_SALES_REPORT_EMAIL_ENABLED=true` の場合だけ所有者にも送る。
これらの所有者通知は営業メールとは別設定であり、今回の作業では送信しない。

既存 `hourlyRun` は返信・配信停止確認を先行させ、失敗時は送信を停止する。`dailyRun` は既存の重複処理・下書き作成・日次件数集計を実行する。
トリガーはコード反映では作られない。初期確認後の所有者による `installTriggers` 操作が必要。

Buffer/SNSの送信・cron・DB、Claude Code側のPhase 2／既存APAC候補取得処理は変更しない。
現状のAPAC AI providerは有料APIを呼ぶため、この作業では起動しない。無料の継続調査には、利用許諾済みのデータソースとPhase 2の実際の実装・所有者との接続確認が必要。
候補の調査結果をメール送信許可や本文承認へ自動昇格させない。

確認済みTESTスクリプトID: `10-3xUUzlKVCXZItlI4d1vaOknJ-VfAAqPre-0Gz5Pzl5lvFQChPIikXA`。登録先はRepository Variable `APPS_SCRIPT_TEST_SCRIPT_ID`。
Google認証はMacで完了した旨をユーザーから受領。クラウドの認証やGitHub Secrets登録を確認できたことは意味しない。

## 日次の無料データソース調査

`Daily reviewed sales research` は毎日23:25 UTCに起動可能。ただしRepository Variable `STOCKWISE_SALES_RESEARCH_ENABLED=true` がなければジョブは実行しない。
`deployment/research-sources.json` は初期空配列。無料・利用条件確認済みのHTTPS JSONソースだけを所有者がレビューして設定する。最大5ソース・各10秒・32KB・20候補。
各ソースはurl、freeSourceVerified=true、termsReviewed=true、reviewedBy、reviewedAt（180日以内）を必要とする。キー付きURL・認証・リダイレクトは使用しない。
レスポンスは既存Phase 2の `parseApacAiCandidates` と同じ `{candidates:[{companyName,countryCode,segment,officialWebsite,evidenceUrls}]}`。
有料AI APIへは接続しない。候補は常にunverified・approvedToEmail=false。CRMや営業送信キューへ自動投入しない。
実際のデータソースは未設定であり、外部実行は未検証。既存Phase 2が別ジョブで動いている場合はソースと担当範囲を確認してから有効化する。
結果はActions artifactへ保存。読取失敗時はジョブを失敗させ、Actionsの通知対象にする（GitHub通知設定は所有者が確認）。
既存Bufferの投稿・予約・実績同期は別の既存経路を維持し、このワークフローから呼び出さない。

現行Google TESTソースの照合（2026-11-08）：添付exportはinspect実行42545311161のremoteDigestと一致。コード.jsのmyFunction（空関数）を無変更で保持し、マニフェストもLos Angeles・自動scope推論設定を維持する。元ソースにGmailテスト関数は存在しない。既存関数の削除や改名は行わない。
ユーザー確認で送信3ゲートは未設定。TEST初回bootstrapはコード追加のみで、Settingsの有効化やGmail送信は行わない。反映後、所有者がinitializeAndVerifyTestCrmを実行してGoogle実行権限を承認する。指定TEST以外・互換性のないシート/ダッシュボードでは書き込み前に停止。新規Settingsは既存の安全なfalse初期値で作成される。実行完了まではruntime未検証のままとする。
