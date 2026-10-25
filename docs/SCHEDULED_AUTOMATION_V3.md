# Scheduled V3 automation (Buffer deferred)

The local scheduler may be installed explicitly after pulling this branch. It is
not installed by repository code or by tests.

Schedules:
- 07:00 local: safe Codex V3 development run + offline outbound preparation +
  lifecycle queue preparation.
- 13:00 local: offline outbound preparation + lifecycle queue preparation.
- 01:00 local: safe Codex V3 development run + offline outbound preparation +
  lifecycle queue preparation.

All scheduled lifecycle preparation forcibly overrides
`EMAIL_SEND_MODE=draft_only` and `NEXOPS_GMAIL_SEND_ENABLED=false`. The
scheduler therefore cannot dispatch Gmail even if the local env file is later
changed. Buffer configuration is optional and no Buffer publication is attempted.

Install on macOS with:

```sh
cd ~/stockwise-v2
git pull --ff-only origin codex/managed-service-mvp
/bin/zsh automation/install-launchd-v3.sh
```

The scheduler fails closed when the branch is dirty, the branch is wrong, or the
local branch differs from the remote branch. It never merges/rebases automatically.
It uses a shared lock to prevent overlapping scheduled cycles.

Because a Gmail refresh token was exposed during setup, live Gmail dispatch must
remain disabled until that token is revoked and replaced through the approved
secret flow. Queue preparation does not require live dispatch.
