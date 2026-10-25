#!/bin/zsh
set -euo pipefail

REPO="${HOME}/stockwise-v2"
AGENTS="${HOME}/Library/LaunchAgents"
LOG_DIR="${REPO}/logs"

/bin/mkdir -p "${AGENTS}" "${LOG_DIR}"

# Resolve the interactive-shell tool locations once, then pass a safe PATH into
# launchd. launchd otherwise starts with a much smaller environment.
CODEX_BIN="$(command -v codex || true)"
NODE_BIN="$(command -v node || true)"
PYTHON_BIN="$(command -v python3 || true)"
GIT_BIN="$(command -v git || true)"

if [[ -z "${CODEX_BIN}" || -z "${NODE_BIN}" || -z "${PYTHON_BIN}" || -z "${GIT_BIN}" ]]; then
  echo "STOP: required local tool missing (codex/node/python3/git)."
  echo "CODEX=${CODEX_BIN:-MISSING}"
  echo "NODE=${NODE_BIN:-MISSING}"
  echo "PYTHON3=${PYTHON_BIN:-MISSING}"
  echo "GIT=${GIT_BIN:-MISSING}"
  exit 1
fi

AUTOMATION_PATH="${CODEX_BIN:h}:${NODE_BIN:h}:${PYTHON_BIN:h}:${GIT_BIN:h}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.local/bin:${HOME}/.npm-global/bin"

write_agent() {
  local label="$1"
  local mode="$2"
  local hour="$3"
  local path="${AGENTS}/${label}.plist"

  /bin/cat > "${path}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${REPO}/automation/run-v3-cycle.sh</string>
    <string>${mode}</string>
  </array>
  <key>WorkingDirectory</key><string>${REPO}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${AUTOMATION_PATH}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>${hour}</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>${LOG_DIR}/launchd-${mode}.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/launchd-${mode}.err.log</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
EOF

  /usr/bin/plutil -lint "${path}"
  /bin/launchctl bootout "gui/$(/usr/bin/id -u)" "${path}" >/dev/null 2>&1 || true
  /bin/launchctl bootstrap "gui/$(/usr/bin/id -u)" "${path}"
  /bin/launchctl enable "gui/$(/usr/bin/id -u)/${label}" >/dev/null 2>&1 || true
}

write_agent "com.stockwise.v3.morning" "morning" 7
write_agent "com.stockwise.v3.midday" "midday" 13
write_agent "com.stockwise.v3.night" "night" 1

echo "INSTALLED:"
echo "  morning 07:00"
echo "  midday  13:00"
echo "  night   01:00"
echo
echo "Tool PATH captured for launchd."
echo "Live Gmail sending remains forced OFF in scheduled runs."
echo "Buffer is not required and is skipped until configured."
