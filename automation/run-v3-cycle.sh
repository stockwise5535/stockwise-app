#!/bin/zsh
set -euo pipefail

REPO="${HOME}/stockwise-v2"
MODE="${1:-scheduled}"
LOG_DIR="${REPO}/logs"
STAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
LOG_FILE="${LOG_DIR}/v3-${MODE}-${STAMP}.log"
LOCK_DIR="${LOG_DIR}/v3-scheduled.lock"

mkdir -p "${LOG_DIR}"
cd "${REPO}"

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  echo "STOP: V3 scheduled cycle already running" | tee -a "${LOG_FILE}"
  exit 0
fi
trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT INT TERM

exec > >(tee -a "${LOG_FILE}") 2>&1

echo "=== Stockwise V3 scheduled cycle: ${MODE} ==="
echo "Start: $(date)"
echo "Branch: $(git branch --show-current)"

if [ "$(git branch --show-current)" != "codex/managed-service-mvp" ]; then
  echo "STOP: wrong branch"
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=all | grep -v '^?? logs/' | grep -v '^?? supabase/.temp/' || true)" ]; then
  echo "STOP: uncommitted changes"
  git status --short
  exit 1
fi

git fetch origin codex/managed-service-mvp --quiet || {
  echo "STOP: git fetch failed"
  exit 1
}

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/codex/managed-service-mvp)"
if [ "${LOCAL}" != "${REMOTE}" ]; then
  echo "STOP: local/remote branch mismatch; no automatic merge/rebase"
  exit 1
fi

# Development automation: safe code/test/docs work only. No production deploy.
if [ "${MODE}" = "morning" ] || [ "${MODE}" = "night" ]; then
  /bin/zsh "${REPO}/automation/codex-v3.sh"
fi

# Always run the offline V3 preparation/summary path. This cannot publish live.
node "${REPO}/scripts/outbound-automation.mjs"

# Prepare eligible lifecycle queue entries only. Force live sending OFF even if
# .env.local later changes. This command does not dispatch messages.
python3 - <<'PY'
from pathlib import Path
import os, subprocess, sys

repo = Path.home() / "stockwise-v2"
env = os.environ.copy()
env_file = repo / ".env.local"

if env_file.exists():
    for line in env_file.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        env[k] = v

# Hard safety override for scheduled runs.
env["EMAIL_SEND_MODE"] = "draft_only"
env["NEXOPS_GMAIL_SEND_ENABLED"] = "false"

r = subprocess.run(
    ["node", "scripts/outbound-worker.mjs", "--prepare-lifecycle"],
    cwd=repo,
    env=env,
    text=True,
)
sys.exit(r.returncode)
PY

echo "End: $(date)"
