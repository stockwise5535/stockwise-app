#!/bin/zsh
set -euo pipefail
REPO="${HOME}/stockwise-v2"
AGENTS="${HOME}/Library/LaunchAgents"
LOG_DIR="${REPO}/logs"
/bin/mkdir -p "${AGENTS}" "${LOG_DIR}"
NODE_BIN="$(command -v node || true)"
PYTHON_BIN="$(command -v python3 || true)"
if [[ -z "${NODE_BIN}" || -z "${PYTHON_BIN}" ]]; then
  echo "STOP: node/python3 missing"
  exit 1
fi
PATH_VALUE="${NODE_BIN:h}:${PYTHON_BIN:h}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.local/bin:${HOME}/.npm-global/bin"
PLIST="${AGENTS}/com.stockwise.codex3dayreport.plist"
/bin/cat > "${PLIST}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.stockwise.codex3dayreport</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>${REPO}/automation/send-codex-3day-report.sh</string></array>
  <key>WorkingDirectory</key><string>${REPO}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${PATH_VALUE}</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>19</integer><key>Minute</key><integer>10</integer></dict>
  <key>StandardOutPath</key><string>${LOG_DIR}/launchd-codex-3day-report.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/launchd-codex-3day-report.err.log</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
EOF
/usr/bin/plutil -lint "${PLIST}"
/bin/launchctl bootout "gui/$(/usr/bin/id -u)" "${PLIST}" >/dev/null 2>&1 || true
/bin/launchctl bootstrap "gui/$(/usr/bin/id -u)" "${PLIST}"
/bin/launchctl enable "gui/$(/usr/bin/id -u)/com.stockwise.codex3dayreport" >/dev/null 2>&1 || true
echo "Codex 3-day email checker installed (daily 19:10; sends only when 72h due)."
