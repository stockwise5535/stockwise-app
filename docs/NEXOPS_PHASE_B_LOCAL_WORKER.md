# NexOps Phase B — opt-in Mac handoff worker (prototype, disabled)

Depends on the unmerged **Phase A Draft PR #24**. This Phase B is a separate stacked Draft PR, **not** a deployment or approval to enable unattended execution.

## Scope implemented
- `scripts/nexops-local-worker.mjs`: single, explicit `--once ISSUE_NUMBER` request only (no daemon, polling schedule, launchd or AI execution).
- Uses the authenticated local GitHub CLI (`gh api`) to read the current GitHub user, target Issue, and repository collaborator permissions for both operator and Issue author; invokes the strict Phase A validation path. All user-supplied Issue content remains untrusted.
- Writes a sanitized local receipt under `~/.nexops/local-worker` with mode `0600`, a single-worker lock with `0600`, and bounded persistent all-seen-revision duplicate detection. **No outbound GitHub writes**, no PRs, no email, no CRM, no SNS, no deployment and no Codex invocation.
- `localCodexProbe()` checks only whether `codex --version` exists (not authentication, subscription, headless support, quotas or actual invocation); that probe is **not** invoked by default and must not be represented as working agent automation.
- Permission / identity / network error → BLOCKED. No credentials stored by the worker.

## Safety defaults
```text
NEXOPS_LOCAL_WORKER_ENABLED=unset          -> BLOCKED
NEXOPS_AI_EMERGENCY_STOP=unset            -> BLOCKED
NEXOPS_AI_EXECUTION_ENABLED=true          -> BLOCKED (for this prototype)
```
No configuration/runner is activated by submitting this PR. Phase B does **not** change the Phase A GitHub Actions workflow, existing StockWise schedules, or any CRM/SNS behavior.

## Manual local inspection (only after operator approval, on the operator's Mac)
Prerequisites: Node 22+, GitHub CLI already authenticated with read access to `stockwise5535/stockwise-app`; Phase A code available in a **clean, isolated checkout**. Do not reset/swap over dirty source worktrees.

```bash
node --test tests/nexops-issue-validator.test.mjs tests/nexops-local-worker.test.mjs
node --check scripts/nexops-local-worker.mjs

# With no env override, this must return LOCAL_WORKER_DISABLED:
node scripts/nexops-local-worker.mjs --once 23
```

After a separate explicit decision to inspect a **synthetic, opted-in test Issue**, and only in the local isolated checkout, a human may set `NEXOPS_LOCAL_WORKER_ENABLED=true` and `NEXOPS_AI_EMERGENCY_STOP=false` for one command. Never use a real sensitive Issue, and never set `NEXOPS_AI_EXECUTION_ENABLED=true`; no AI runs even with these two inspection flags. Never add automatic launchd/cron/watch loops without a separately approved Phase B extension.

**Important:** Existing Issue #23 does not contain an `nexops-task` JSON block or run-requested label, so the validator should safely return BLOCKED. Do not label #23 or #17 to attempt autonomous execution.

## Known limits / follow-on work
1. This is a **manual, read-only handoff prototype**, not a fully functional background polling daemon and not a Codex agent launcher. Mac access is not available to the authoring environment; local CLI auth is not verified.
2. A stale lock file after unclean termination can block future runs. Remove it only after verifying there is no active worker.
3. Receipt ledger now retains all seen valid revision keys (up to 4096 per Issue), migrates the previous receipt format without erasing its key, preserves history on blocked reads, and fails closed on malformed/oversized/symlinked state or capacity. This is a read-only handoff receipt ledger, not a transactional execution/approval ledger; unrecorded older history cannot be reconstructed and safe autonomous execution still requires a separate design.
4. Account quota and Mac security posture must be checked before any automatic use. A paid ChatGPT subscription does not automatically prove no-cost unattended Codex access.
5. Future local Codex integration must independently verify official CLI, authenticated account, supported noninteractive mode, resource/path allowlists, isolated worktree, operator consent, and no production secrets; otherwise use a manual Codex handoff.
6. Claude Code is not installed, configured or invoked by this worker and must not be assumed free.
7. Production systems, outbound sales email, new SNS posting, database writes, checkout or deploy are out of scope.

## Suggested acceptance checks
- Check missing opt-in, wrong Issue/role, invalid task, stop switch, injected body, concurrent lock, repeated receipt and malformed GitHub replies are blocked.
- Run full StockWise regression suite on a suitable CI runner and review results before merging.
- Obtain explicit user approval before any future daemon/polling schedule or AI execution activation.

The shared validator binds the requested Issue number and, for labeled events,
compares current content/author with the event snapshot before accepting a dry-run.
Any permission/read failure remains BLOCKED; these checks never authorize AI execution.
