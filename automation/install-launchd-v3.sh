#!/bin/zsh
set -euo pipefail

REPO="${HOME}/stockwise-v2"
AGENTS="${HOME}/Library/LaunchAgents"
LOG_DIR="${REPO}/logs"
mkdir -p "${AGENTS}" "${LOG_DIR}"

write_agent() {
  local label="$1"
  local mode="$2"
  local hour="$3"
  local path="${AGENTS}/${label}.plist"

  cat > "${path}" <<EOF
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

  plutil -lint "${path}"
  launchctl bootout "gui/$(id -u)" "${path}" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "${path}"
  launchctl enable "gui/$(id -u)/${label}" >/dev/null 2>&1 || true
}

write_agent "com.stockwise.v3.morning" "morning" 7
write_agent "com.stockwise.v3.midday" "midday" 13
write_agent "com.stockwise.v3.night" "night" 1

echo "INSTALLED:"
echo "  morning 07:00"
echo "  midday  13:00"
echo "  night   01:00"
echo
echo "Live Gmail sending remains forced OFF in scheduled runs."
echo "Buffer is not required and is skipped until configured."
