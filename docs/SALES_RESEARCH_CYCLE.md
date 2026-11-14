# 営業調査サイクル — 0006レビュー

## 対象と現在の状態

基準は `stockwise5535/stockwise-app` の main `10e0a86`。PR #13 の
`SalesCore.planResearchCompanyImport` / `SalesEngine.importResearchCompanies` を再利用し、
Apps Script・既存CRMスキーマ・送信設定は変更しない。

添付ZIPの候補20社（JP9 / SG6 / AU5）は、TEST CRMへ別途登録済みの20社とは別の集合。
社名・ドメインとも重複0を確認したが、このブランチからCRMへ追加していない。
添付の「Google接続なし・登録0件」は添付作成環境の記録であり、現在のCRMの状態ではない。
TEST CRMには既存20社と下書き20件があり、送信・フォローアップはFALSE。
その取り込みはSheetsコネクタによるもので、Apps Script上の関数実行成功の証跡ではない。

## 確認レベルと出力

- A: 会社自身のページで確認したと台帳に記録された候補。人が根拠をレビューする。
- B: 公的機関・業界団体の資料まで。公式ページ確認待ちで保留。
- C: 第三者ディレクトリまで。公式ページ確認待ちで保留。
- レビュー用CSVには、妥当なスキーマ・A・`verified` の条件を満たす候補だけを出す。
  呼び出し側で `tiers` を渡してもB/Cを許可できない。上限は20件。
- 台帳の初期内訳はA6 / B7 / C7。B/Cの14社は保留。
  2026-11-14の独立した再取得ではAのうち3社のページを取得でき、残る3社は取得不能。
  取得不能を会社不存在や再確認成功とは扱わず、以前の確認記録も自動昇格させない。
- 台帳にはメール・連絡根拠・送信承認・在庫課題の仮説を保存しない。
  未知の項目、メールを埋め込んだURL、CSV式として危険な値を拒否する。

出力は `import-review-YYYY-MM-DD.csv`、日報、`runs.jsonl`。
「本番登録済み」「本番承認済み」のファイルとしては扱わない。
既存TESTダイアログ `openTestResearchImport` は **ちょうど20社** が必要なため、
6社のレビュー用CSVをそのまま渡してはならない。添付のTEST用20社CSVにはB/Cも含まれるため、
公式ページ確認を終えるまで取り込まない。

## 実行と制限

```sh
node scripts/sales-research-cycle.mjs --ledger <作業用ledger.json> --inbox <inbox.json> --out <作業用出力先>
```

`--no-recheck` は外部接続をせず入力・重複処理だけを検証する。
指定した入力ファイルが無ければ失敗する。レビュー済み台帳の原本を実験で上書きせず、作業コピーを使う。

- 新規20社/回、再確認10社/回、30日間隔、CSV20社/バッチ。引数で上限を拡張できない。
- 新規発見は入力ファイルの取り込みであり、検索エンジンによる自動発見ではない。
  既存の `sales-daily-research` を重複起動しない。
- 外部再確認はHTTPSのみ。認証情報付きURL・内部宛先を拒否し、DNSの全回答を検査して
  公開IPに接続を固定する。リダイレクトを追わず、10秒・300KBで制限する。
- 会社名の最初の単語だけで合格にしない。HTMLの本文に正規化した社名があるかを確認する。
  到達確認は公式サイトの所有者確認や営業送信許可の代わりではない。
- 一時的な403/429/5xx、ネットワーク不通、過大応答では確認状態を降格させない。
  404/410や社名不一致が3回続いた場合だけ要確認にする。B/CをAへ自動昇格しない。
- 緊急停止は `NEXOPS_RESEARCH_EMERGENCY_STOP=true` または出力先の `EMERGENCY_STOP`。
  ロックは所有者を記録し、2時間を超えても生存中のプロセスから奪わない。
  不明なロックは手動確認する。台帳は一時ファイルからrenameして更新する。
- 再確認に未完了があれば警告・終了コード3。処理失敗は1。

## 定期実行・本番

`.github/workflows/sales-research-cycle.yml` は手動起動のみ。
`STOCKWISE_RESEARCH_CYCLE_ENABLED=true` が必要で、既定OFF・contents:read・秘密値なし。
台帳更新はそのランナー内だけで、Gitへの書き戻しやCRMへの書き込みはしない。
時刻トリガーは追加せず、既存のスケジュール保護テストも緩めない。

有料AI/APIの呼び出しはない。GitHub Actions等の利用枠・料金は別途確認する。
このブランチでは本番取り込み入口、DB変更、メール送信、SNS変更、デプロイを行わない。
0005計測パッチは未確認・未統合のままであり、同じ番号を含むSQLファイルと混同しない。

## 検証

`node --test tests/sales-research-cycle.test.mjs`、`npm test`、`npm run test:sales`、
`node --test tools/apps-script/*.test.mjs`、`npm run build`、`npm run test:security`。
ローカルテスト・再取り込み計画の成功を、Google Apps Script実機・本番反映・実送信の成功として報告しない。
