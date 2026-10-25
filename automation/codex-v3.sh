#!/bin/zsh
set -euo pipefail

REPO="$HOME/stockwise-v2"
LOG_DIR="$REPO/logs"
STAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
LOG_FILE="$LOG_DIR/codex-nightly-$STAMP.log"
LOCK_DIR="$LOG_DIR/codex-v3.lock"

mkdir -p "$LOG_DIR"
cd "$REPO"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "STOP: Stockwise Codex Automation V3 はすでに実行中です。" | tee -a "$LOG_FILE"
  exit 0
fi

cleanup_lock() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup_lock EXIT INT TERM

echo "=== Stockwise Codex Automation V3 ===" | tee -a "$LOG_FILE"
echo "Start: $(date)" | tee -a "$LOG_FILE"
echo "Branch: $(git branch --show-current)" | tee -a "$LOG_FILE"

if [ "$(git branch --show-current)" != "codex/managed-service-mvp" ]; then
  echo "STOP: codex/managed-service-mvp ではありません。" | tee -a "$LOG_FILE"
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=all | grep -v '^?? logs/' | grep -v '^?? supabase/.temp/')" ]; then
  echo "STOP: 未コミット変更があります。" | tee -a "$LOG_FILE"
  git status --short | tee -a "$LOG_FILE"
  exit 1
fi

codex exec \
  --approve-for-me \
  "あなたはStockwise / NexopsのPrimary Implementerです。

最初に必ず以下を読んでください。

- docs/PRODUCT_STRATEGY.md
- docs/ROADMAP.md
- docs/NEXT_TASK.md
- docs/APAC_GROWTH_SYSTEM_REPORT.md

最上位の事業目標は、
Growth launchから30日以内にAPACで10,000ユーザー獲得を目指すことです。

ただし、安全性、顧客データ分離、認証・認可、運用品質を犠牲にしてはいけません。

現在のNEXT_TASKを、自律的に最後まで進めてください。

安全な範囲で実行してよいこと：
- コード実装
- UI/UX改善
- バグ修正
- セキュリティハードニング
- テスト追加
- ブラウザ回帰テスト
- Production build
- ドキュメント更新
- docs/NEXT_TASK.md Status更新
- docs/APAC_GROWTH_SYSTEM_REPORT.md更新
- git commit
- PRODUCT_STRATEGY / NEXT_TASKで許可済みのLifecycleメール処理
- PRODUCT_STRATEGY / NEXT_TASKで許可済みのX / Threads投稿処理
- 承認済みBuffer連携の利用
- outbound queue / idempotency / suppression / rate-limit / audit処理

必ず実行前後で確認すること：
- 認証・認可
- Supabase RLS前提
- workspace / organization分離
- secrets漏えい
- customer/internal UI分離
- demo/customer data分離
- mobile regression
- 30日APAC 10,000ユーザー目標への影響
- scalability / idempotency / retry
- Growth funnelへの影響

以下は絶対に実行しないでください。
到達した場合は変更せずSTOPし、理由を報告してください。

- Production deploy / Production promotion
- 許可済みLifecycle allowlist外の実メール送信
- 許可済みSocial allowlist外のX / Threads投稿
- Billing有効化
- 実課金
- Refund / compensation
- Supabase schema変更
- Supabase RLS変更
- OAuth設定変更
- Secretの生成・変更・コードへの埋め込み
- 顧客データ削除
- 不可逆な本番変更
- 法的事実の推測
- 承認されていない外部サービスの導入

現在のNEXT_TASKがすでにCOMPLETEの場合：
勝手に次の大規模機能を選んで実装しないでください。

その場合は
docs/ROADMAP.md と docs/PRODUCT_STRATEGY.md を参照し、
次に行うべき安全なタスクを1つ提案し、
docs/NEXT_TASK.md を書き換えず、
コード変更もせず終了してください。

タスクがREADYの場合は実装してください。

途中で通常の進捗確認は求めないでください。
安全な判断は自分で行ってください。

完了時は必ず以下を報告してください。

- 実施内容
- 変更ファイル
- テスト結果
- Production build結果
- Securityへの影響
- schema/RLSへの影響
- Growth / 10,000-user readinessへの影響
- 残存BLOCKER/HIGH
- デプロイ有無
- メール送信有無
- 課金有無
- コミットハッシュ
- 次に推奨するタスク

テスト結果や確認結果を推測で書かないでください。
実行したものだけ報告してください。"

echo "End: $(date)" | tee -a "$LOG_FILE"
