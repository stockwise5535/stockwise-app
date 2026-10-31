# APAC営業メールの公開資料確認と承認条件

確認日: 2026-10-31。これは法的助言・適法性の認定ではない。HTTP 200は法律の適用確認や専門家承認を意味しない。

| 地域 | 公式資料の入口 | 今回の取得 | 実送信前に必要な判断 |
| --- | --- | --- | --- |
| 送信元がUSの場合 | [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) | 200 | 対象メッセージ、正確な送信者/件名、住所、停止処理などを確認。B2Bなら無条件に適用除外とはしない |
| SG | [Spam Control Act 2007](https://sso.agc.gov.sg/Act/SCA2007) | 200 | 対象・bulk/unsolicitedの判断、表示、連絡先、停止手段・対応期限を確認。自動で例外扱いしない |
| AU | [ACMA spam guidance](https://www.acma.gov.au/avoid-sending-spam) | 503 | 現行の同意・送信者表示・unsubscribe条件を公式資料と専門家で確認。取得失敗を迂回しない |
| NZ | [DIA guidance entry](https://www.dia.govt.nz/Spam-How-to-Comply) | 404 | 現行公式URLとUnsolicited Electronic Messages Actの適用・同意・表示・停止要件を再確認 |
| HK | [OFCA UEMO](https://www.ofca.gov.hk/en/consumer_focus/guide/others/uemo/) | 200 | メッセージ/宛先への適用、送信者情報、停止要求と処理方法を確認 |
| JP | [総務省 迷惑メール対策](https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/m_mail.html) | 200、文字コード要確認 | 特定電子メール法等の同意・表示・停止・例外の適用を人が確認。公開アドレスを自動で同意扱いしない |
| KR | [KISA spam窓口](https://spam.kisa.or.kr/) | 404 | 現行資料/法令、同意、広告表示、送信時間、停止等の適用を確認するまで停止 |
| TW | [法務部 Personal Data Protection Act](https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=I0050021) | 200 | 個人データ取得・利用・marketing停止等に加え適用する他規制を専門家が確認 |
| その他/不明 | なし | 未取得 | 送信不可。対象地域を確定して別途レビュー |

## 実装した保守的な内部gate

`services/growth-workflow.js` のfixtureモデルでは、明示的なopt-in、宛先国と送信元国、両者を対象とした期限内のreview証跡、確認済み送信者名・住所・アドレス、HTTPS停止手段がすべて必要。国不明、review未完、停止、suppression、bounce、未承認、内容変更、レート制限、重複、不明配送は拒否する。これは各法令を自動判定するエンジンではなく、明示opt-inを必須にする等の保守的な内部条件を模擬検証したもの（法令適合の代替ではない）。実際の送信元法人・住所・管轄は未確定のまま推測しない。

現在のCRMモデルと法律承認は **fixture専用**。`.invalid` / `.test`以外の実宛先を登録できず、外部transportを受け付けない。テスト中のreviewer/consent/法務承認は模擬データであり、人の実承認に移行できない。

本番用には、確認者・対象地域・法的根拠・取得経路・証跡URL/文書版・確認/期限・停止ルートをserver-backed記録として保持し、権限を検証するRPCが必要。公開済みメールアドレスや企業のSCM適合性は同意の代わりにならない。返信内容の自動取得には現在のGmail send/metadataを超える権限が必要で、追加承認なしにscopeを拡張しない。

## 実送信の未完了条件

- 正式なsender法人/住所/連絡先と対象国の専門家レビュー。
- 実際のunsubscribe入口、本人確認、停止の確実な反映、reply/bounce連携と署名検証。
- CRM永続化/RPC・監査・最小権限の承認と適用。
- 既存workerのdraft_only/test_recipient制約、4テンプレート・審査・同意・suppression・quotaは維持。営業メールをWelcome等に偽装して送らない。
- 新しい営業メール送信モード/テンプレート/プロバイダーは別途実装・レビュー・明示承認が必要。Gmailを1万ユーザー向け一括配信基盤としない。
