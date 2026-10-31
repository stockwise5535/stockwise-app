# Stockwise / Nexops — 承認制のユーザー獲得運用

更新: 2026-10-31（America/Los_Angeles）。UTCの取得日時は各データに明記。

**最新差分:** [GROWTH_AUTOMATION_RUNBOOK.md](GROWTH_AUTOMATION_RUNBOOK.md)参照。10/31にfixture CRM/承認/Buffer LinkedIn/同意付きsourceとCI定義を追加。旧runnerのapproval bypass・queue準備・直接メール送信経路は開発ブランチで廃止した。Mac配布・hosted CI実行・本番反映は未実施。以下の監査表と既存課題は10/29時点の履歴であり、最新の稼働/承認待ちはrunbookを優先する。

## 今回の境界

最新ユーザー指示を適用し、外部公開・送信・Production反映・有料広告/課金・新しい外部連携/権限・schema/RLS変更は事前承認が必要。既存V3の無人配信目標を、今回の実行許可とは扱わない。内部の調査、集計、原稿、改善案、テスト、開発ブランチのコミットのみ実施した。送信・投稿・公開・スケジューラ設置はしない。

## 既存機能の監査

| 項目 | 実装 | 今回の稼働確認 / 未完了 |
| --- | --- | --- |
| `/en`, `/ja` LP / 30日無料 / signup・demo・相談CTA | 既存 | ローカルの導線・モバイルと認証済み回帰を確認。公開済み本番の挙動/成果は未確認 |
| Starter、TODAY→例外→推奨対応、進捗、顧客/内部UI分離 | 既存 | 実SQLを用いたローカルAuth/PostgREST fixtureで回帰。実メールを伴う新規登録は実施しない |
| Supabase Growth Admin KPI RPC / 週次SQL | 既存 | RPCは既存権限付き・一部all-time集計。匿名VisitorsはNULL。期間/母集団の異なる数字を混ぜて転換率にしない |
| 定期Codex活動メールのKPI | 既存 | 今回は集計関数だけ共通化。送信エントリーポイントは実行/importしない |
| Gmail OAuth・送信安全層・審査履歴 | 既存・過去に限定self-test成功 | 今回OAuth更新/送信/設定変更なし。現在のfreshness/配送可否は未確認。Gmailは1万ユーザー向け一括配信基盤ではない |
| Buffer GraphQL adapter | 既存・モック検証済み | BUFFER_API_KEY/organization/X/Threads設定は現在プロセスで未設定。live channel discovery、予約、公開、最終状態照合は未確認/未完了 |
| X/Threads V3 local preparation | 既存 | 既存の静的copy/lockを再利用。新規下書きは既存公開allowlistへ投入しない。LinkedInのBuffer連携は未実装 |
| UTM / source | referral_sourceは既存eventモデルで許容 | 自動UTM捕捉・登録/デモへの永続化・チャネル別転換は未検証/未実装。今回のUTMリンク生成だけで計測完成とはしない |
| PostHog | optional consent付きSDKは既存 | 現在プロセスにpublic keyなし。集計readerは未実装。Visitors/Traffic Sourceは「未取得」 |
| GitHub Actions | `.github/workflows`なし | 実行済みCIはない。承認用 `automation/acquisition-ci.example.yml` のみ準備。Actionsの有効化/起動やartifact送信はしていない |
| Mac launchd / V3 runners | installer/runnerファイルは既存 | Macのインストール・稼働状態はこのCloud環境から未確認。今回いずれも実行しない |

### 既存自動化の注意事項

- `automation/codex-v3.sh` は `--approve-for-me` を含む。今回の事前承認ルール/既存のapproval-bypass禁止との整合確認が必要で、使用しない。
- `automation/run-v3-cycle.sh` は lifecycle queue準備まで実行する。read-only KPI目的で実行しない。
- `scripts/send-codex-activity-report.mjs` は直接メール送信まで進むエントリーポイントで、一般workerのdraft_onlyを測定用dry-runとして利用できない。測定には新しい安全なCLIを使う。既存Mac定期送信の実運用は所有者が別途確認し、承認なく起動/継続しないこと。
- このタスクは既存送信設定を有効化/無効化したものでも、旧runner全体を再認証したものでもない。

## 実行方法 — 外部writeなし

```sh
# デフォルトはoffline。設定されたAPI資格情報があっても接続しない。
node scripts/acquisition-report.mjs --start-date 2026-11-02

# 許可済み既存development projectの集計readのみ。HEAD/GET、IDはメモリ内の重複排除用。
node --use-env-proxy scripts/acquisition-report.mjs --read-dev-kpis \
  --from 2026-10-23T00:00:00Z --to 2026-10-30T00:00:00Z \
  --start-date 2026-11-02
```

`logs/acquisition/acquisition-latest.json` と `.md` を作成する（Git対象外）。原稿、hash、提案時刻、ICP、公開根拠/仮説/適合度、KPIの定義/未取得理由、次の改善アクションを含む。共有する場合も別途承認する。任意の `--output` はローカル出力先であり、公開先ではない。

- `--publish` / `--send` / `--approve` の機能はない。Buffer/Gmailに接続する実行経路はない。
- 同じdevelopment URLとNEXOPS_DEV_PROJECT_REFの一致、既存server service-role keyが必要。設定不足/不一致は未取得。既存の管理集計readであり、通常ユーザーのRLS検証としては扱わない。
- 期間は `[from,to)`。raw user/leadレコードを出力しない。個別イベントはuser_idだけを読み、集計後に破棄する。
- HEAD exact count、安定した順序とContent-Rangeを確認するページング、ユニークユーザー集計、20,000行上限を使用。上限超過や取得途中の総件数変化、権限/通信エラーは部分値を採用せず「未取得」。各KPIの失敗は独立して扱う。
- ローカル単一ホストの既存lockとprivate atomic writeを再利用。重複実行は保留。クラッシュ後のlock/tempファイルは所有者がプロセス状態を確認して扱う。分散本番queueではない。
- `scripts/send-codex-activity-report.mjs` も共通readerを利用するようにしたが、送信処理/権限/設定は変えておらず、今回実行していない。

## ICP — 規模よりSCM機能

| セグメント | 必須の公開根拠 | 課題仮説（企業の実情とは断定しない） | 確認質問 / 除外 |
| --- | --- | --- | --- |
| Startups | 自社調達・在庫・発注・仕入先/計画業務。startup/少人数状態は別途検証 | 少人数で複数の例外と仕入先フォローを優先付けする負担 | 誰が購買/在庫/仕入先を担当するか。SCM業務のないsoftware-only企業は除外 |
| E-commerce | 現物商品の自社在庫・購買・物流/倉庫・仕入先担当 | 在庫リスクと遅延POの対応を一元化したい可能性 | 自社の業務責任範囲はどこか。デジタル商材のみ/業務所有者不明は未適合 |
| Manufacturing | 調達・生産/資材計画・在庫・仕入先部門や公式方針 | 材料/仕入先リスクの対応・判断履歴を整理する必要の可能性 | 関連部門/責任者/導入範囲を確認。SCM製品の販売だけでは自社SCMの根拠にしない |

求人、公式事業説明、調達方針、物流/在庫の公式記述を確認し、引用・URL・取得日時・HTTP状態を保存する。第三者の推測、サイト内のナビ項目だけ、会社規模だけで購買ニーズを認定しない。403/404は迂回しない。連絡先個人情報の収集や営業接触はしない。

## 実調査の候補

機械可読根拠は `data/acquisition/research.json`。全候補とも接触未承認・購買意向未確認。

| 区分 | 企業 / 公式サイト | 確認できた根拠 | 適合度と未確認点 |
| --- | --- | --- | --- |
| Startup候補 | Secretlab / secretlab.co | 公式careersのOperations & Logisticsカテゴリー、過去startup記事掲載 | 弱い関連シグナル。現在のstartup/少人数状態・具体的SCM業務は要確認。適合確定ではない |
| Startup候補 | PRISM+ / prismplus.sg | careers旧URL404、新URL200でもSCM根拠は得られず | 未適合/根拠待ち。推測でSCM担当ありとしない |
| E-commerce候補 | Love, Bonito / lovebonito.com | 公式careersからリンクされたWorkable求人に調達、棚卸、在庫差異調査の担当記述 | 自社SCM業務の強い公開根拠。課題/予算/具体的e-commerce部門の範囲は未確認 |
| E-commerce候補 | ZALORA / corporate.zalora.com | 公式careers取得403 | 未適合/根拠待ち。一般的なブランド認知で機能やニーズを認定しない |
| Manufacturing候補 | OMRON / omron.com | 正規のSupply Chain Management/Working Together with Suppliersページが200 | 公式方針の関連シグナル。具体的担当/運用課題・導入適合は未確認 |
| Manufacturing候補 | Daikin / daikin.com | 正規Supply Chain CSR Promotion Guidelinesページが200 | 公式方針の関連シグナル。課題/購買意向は未確認 |

公開シグナルと「具体的な自社業務を確認」の強さは異なる。全6社をQualified Leadとは数えない。特にstartup候補を確認済みの少人数企業とは扱わない。調査assessmentは候補の発見用で、既存Supabaseの資格判定を上書きしない。

## コンテンツ・チャネル準備

12件 = 3セグメント × X/Threads/LinkedIn/検索記事アウトライン。既存のpublic product-education copyを根拠にし、TODAY、合成デモ、例外、推奨対応、人の判断だけを訴求する。成果数字、顧客事例、実ERP接続、無人PO/仕入先変更は宣伝しない。

- X: 短い問いかけとデモCTA。
- Threads: 業務の文脈→デモの手順→判断は人が行う説明。
- LinkedIn: SCM担当の責任範囲、具体的に確認できるUI、相談の条件。
- 検索: セグメント別課題のタイトル/構成案。新SEOページの公開・indexing・順位獲得は実施/保証しない。

原稿・URL・日付・時刻・検索構成はhash対象。開始日の変更でもhashを更新する。提案はAsia/Singaporeで11/2 Startup、11/3 E-commerce、11/4 Manufacturing、X09:00/Threads12:30/LinkedIn16:00/検索10:00。これは承認用案で、provider予約ではない。実際に公開する日付、チャネル、URL、copy、hashを人が承認し、再確認してから別途の公開操作に進む。

UTMは固定のチャネル/セグメント語彙のみ。例: `/en?utm_source=linkedin&utm_medium=social&utm_campaign=apac_scm_3day&utm_content=ecommerce`。個人情報や企業名をタグに入れない。URLの用意だけでは流入/転換は計測できない。現在のLP→signup/確認メール→demoのsource維持、consent付きイベント、匿名Visitorsのreaderを検証するまではチャネル別登録/デモ/First Valueを未取得とする。

## LP改善の監査結果

- 30日無料、カード不要、合成デモ、例外/判断は実装に沿っている。登録/デモ/相談のCTAは存在する。
- 3セグメントや「自社にSCM業務がある顧客」という条件はLPでは明確でない。セグメント別の小さな見出し/例示を人がレビューする改善案とする。今回公開copyを差し替えない。
- 英語LP/登録画面から公開デモに入ると日本語が初期表示される不具合を確認。既存デモの `initialLang` と `?lang=en/ja` で開発ブランチのみ修正。言語切替と従来の直接URL既定値を保持する。英日static LPリンクも合わせた。本番反映は承認待ち。
- `Book a Consultation` は予約を想起し得るが、認証後の説明/法務文書は申込のみと明記。将来の `Request a consultation` 文言案は承認用改善案。予約確約を宣伝しない。
- Visitors/source/同一コホートの分母がないためCTR、チャネル別登録率、デモ→First Value率の改善効果は断定しない。

## 次の3日と承認事項

1. **Day 1 — Audit/Measurement**: 実行済み監査・測定を基準化。まず開発fixtureを除く本番測定対象・privacy/publication条件を人が確定。unknownを0にしない。
2. **Day 2 — Preparation**: ICP/候補根拠/12下書きとUTM案をレビュー。特にstartupの機能/規模、企業の実際の課題は未確認のまま営業対象へ移さない。
3. **Day 3 — Validation**: ローカル集計/準備を反復しテスト。外部操作は別承認。source計測に変更が必要ならまず既存referral_sourceでの実装案を提示し、schema/RLSが必要な場合は実装せず承認を待つ。

次の優先アクションは、(1)正式な測定対象/公開前条件と旧runner運用の確認、(2)同意を尊重した流入元から登録/デモまでの計測検証、(3)1セグメント・1チャネル・1原稿の限定公開テストを人が承認すること。Gmail/Buffer/LinkedIn/広告へ自動送信しない。
