#!/bin/zsh
set -euo pipefail
export PATH="${PATH:-}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.local/bin:${HOME}/.npm-global/bin"
REPO="${HOME}/stockwise-v2"
cd "${REPO}"

python3 - <<'PY'
from pathlib import Path
import os, subprocess, sys
repo=Path.home()/"stockwise-v2"
env=os.environ.copy()
for line in (repo/".env.local").read_text().splitlines():
    s=line.strip()
    if not s or s.startswith("#") or "=" not in s: continue
    k,v=s.split("=",1)
    env[k]=v
r=subprocess.run(["node","scripts/send-codex-activity-report.mjs"],cwd=repo,env=env,text=True)
sys.exit(r.returncode)
PY
