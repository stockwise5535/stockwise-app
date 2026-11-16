# Issue #28 review and disabled Mac preparation

## Source review of Draft PR #30

The generated report reviewed only `nexops-issue-validator.mjs` and
`nexops-local-worker.mjs` at bfdfaa49120a6aaf5dc2e1d6e467ee48090d6ac7.
It was explicitly unverified. No report claims are acceptance tests.

- Approval: accurate for Phase B. `collectHandoff` creates a dry-run receipt,
  not an execution approval. Its output cannot run a Phase C job. Phase C uses
  `parseJob`, `selectApproval` and `fetchJob`, checks owner and writer roles,
  binds approval to the body revision, rejects edited/expired comments and
  revalidates before model use and every external write. Thus the report's
  recommendation to add approval is already satisfied in the execution path.
- Replay: the Phase B missing directory fsync and incomplete directory checks
  were real. This change verifies a canonical private owned directory before
  lock/receipt operations and synchronizes the directory after ledger rename.
  Phase C already fsyncs its journal and directory and consumes the job key
  permanently, including UNKNOWN and FAILED outcomes.
- Filesystem races: checking a path is not a complete defense against malicious
  same-user replacement between checks and use. Canonical directory/ownership/
  permissions checks reduce exposure; they do not guarantee protection against
  an attacker controlling the Mac account, parent directories or state files.
- Process trust: accurate. The child commands use PATH. The prepared template
  uses only explicit absolute binary directories, including the actual Codex
  directory. Existing CLI binaries, authentication and the Mac account remain
  trusted dependencies; no authentication credentials are copied into the plist.
- Execution boundary: accurate for the excerpts, not the whole system. Phase C
  is a separate guarded execution path. "No tools/tests" describes the report
  model, while host verification ran 89 synthetic tests; these are not conflicting
  claims once the two actors are distinguished. The report is left as original
  evidence; this source review records its limits and corrections.

No application-code vulnerability or demonstrated exploit was established.
No generated finding is silently promoted into a verified production claim.

## Current preparation

The existing Phase C development branch is used; no main merge is needed for
this preparation. The local private disabled template is generated only after
committing the reviewed code so its worker SHA is an exact clean commit.
It is outside `~/Library/LaunchAgents`, has `Disabled=true`, all execution/write/
hosting gates OFF and emergency stop ON. It is not installed or loaded.

Every future tick uses `--poll-once`: at most one approved job, at most two
claimed jobs per UTC day across ticks, one exclusive persistent lock, the same
existing journal and STOP latch, and no retry of uncertain model/GitHub writes.
Deleting state, using a different state directory or a second Mac can defeat
local deduplication and limits; use this one Mac and preserve its journal.
Issue #28 is already REVIEW and must never be rerun for acceptance.

An altered Issue body needs a new plan and personal owner approval. The
scheduler never creates approval. Approvals expire within 24 hours of their
actual GitHub creation time. Expired or edited approval blocks execution.

## Concrete future activation (NOT performed)

1. Review the local commit and tests, keep the dedicated checkout clean and pin
   NEXOPS_WORKER_COMMIT to that exact SHA. Recheck GitHub identity, ChatGPT login,
   CLI availability and allowed network access under the actual logged-in Mac
   account. The launchd agent does not inherit this Codex session's network grant.
2. Read current main and hosting mappings. Confirm the job-branch exclusion still
   applies and no preview will be created. Resolve any STOP, stale lock or UNKNOWN
   entry by read-only reconciliation and investigation; never delete the journal
   or blindly remove a stop latch. Confirm no other scheduler/worker is active.
3. Only with explicit activation authorization, copy the disabled template to
   `~/Library/LaunchAgents/com.nexops.artifact-worker.plist` with mode 0600.
   In that copy set Disabled=false, NEXOPS_AI_EXECUTION_ENABLED=true,
   NEXOPS_AI_EMERGENCY_STOP=false, NEXOPS_GITHUB_REPORT_WRITES=true and
   NEXOPS_HOSTING_GUARDS_VERIFIED=true. Keep NEXOPS_MAX_DAILY_JOBS=2,
   RunAtLoad=false and KeepAlive=false. Validate it with `plutil -lint`.
4. Enable and load it (these commands activate scheduling):

   ```sh
   launchctl enable "gui/$(id -u)/com.nexops.artifact-worker"
   launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.nexops.artifact-worker.plist"
   ```

5. Read `launchctl print gui/$(id -u)/com.nexops.artifact-worker`, local status,
   run.log and error.log; review every generated Draft PR and Issue receipt.

Effects: while the user is logged in and the Mac is awake/online, a tick runs
every 600 seconds. It reads pending issues and may consume ChatGPT allowance,
perform configured read-only research, and publish report-only Draft PRs and
Issue receipts. It does not merge, deploy, write CRM, send mail/SNS or install
other schedules. Only IT/code-audit has live acceptance evidence; other allowed
routes retain their configuration checks and have not had live acceptance.

Immediate stop, if later activated:

```sh
/usr/local/bin/node /Users/yukosano/stockwise-pr26-acceptance/scripts/nexops-executor.mjs --stop
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.nexops.artifact-worker.plist"
launchctl disable "gui/$(id -u)/com.nexops.artifact-worker"
```

STOP is durable and checked before effects; an already-in-flight external write
cannot be recalled. Unknown results require read-only reconciliation, never
automatic retries. Loading/unloading the agent must not clear the latch.
