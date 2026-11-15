# NexOps Phase A — Issue Dispatcher (Dry Run Only)

Related: [Issue #23](https://github.com/stockwise5535/stockwise-app/issues/23), CEO hub #17.

## What Phase A does
Read an existing opt-in GitHub Issue and validate repository, triggering event, author permission, allowed department/action, strict JSON task schema, opt-in label, size, and emergency stop. Return a **read-only** receipt containing an idempotency key and reason. It **never runs Codex, Claude, shell commands from Issues, email, CRM writes, SNS publishing, deployment, or auto-merges**.

No existing sales/social/App Script workflow is modified. No Mac runner, API key, paid API subscription, or scheduler is enabled.

## Required task block (example, not authorization)
Add to a separately approved task Issue:
```nexops-task
{"schema_version":1,"department":"IT","action":"code-audit","objective":"Review current source and tests","dry_run":true}
```
Label: `nexops:run-requested` (opt-in; adding it is not authorization by itself). Each department has only one safe draft/review action:
- SALES: research-report
- MKT-CONTENT: draft-content
- MKT-GROWTH: metrics-audit
- IT: code-audit
- PRODUCT: product-prd
- CEO: executive-report

The dispatcher uses GitHub's Issue and collaborator-permission read API to inspect live state. Only repo write/maintain/admin permission is accepted for the triggering actor. No Issue contents are interpolated into shell commands. On missing token, unknown permission, malformed JSON, untrusted events, missing label or wrong repository, it blocks.

## Safety settings
The workflow pins:
- `NEXOPS_AI_EXECUTION_ENABLED=false`
- `NEXOPS_AI_EMERGENCY_STOP=true`
It uses GitHub token with only `contents:read` and `issues:read`; credentials are not persisted by checkout. The current workflow will therefore report `BLOCKED / EMERGENCY_STOP` for otherwise valid requests. Even when evaluating a synthetic request with the stop off in tests, the validator always returns `executionAllowed:false`. **Do not flip these values to activate execution; this requires Phase B design approval.**

Manual `workflow_dispatch` is a read-only inspection tool and not an AI execution switch. The workflow file must first be reviewed and merged to default branch before GitHub can recognize its Issue trigger. That merge is **not authorized by Issue #23**.

## Architecture / trust boundaries
```text
CEO ChatGPT → GitHub Issue (untrusted text)
                     ↓ opt-in label + authenticated actor
           GitHub Action (read-only token)
                     ↓ live Issue + permission verification
             strict task validator
                     ↓
          receipt / job summary (no job)
                     X  NO AI CLI, Mac, Gmail, social, deploy
```

Threats addressed: arbitrary shell injection in Issue body; malicious label events; cross-repo requests; unauthorized actors; duplicate event/revision receipt; malformed blocks; PR disguised as Issue; runaway permissions. The idempotency key is deterministic, not a persisted queue lock; **true exactly-once execution is not provided until Phase B with a durable job ledger**.

## Known limits / review before future phases
1. GitHub API permission reads depend on repository token visibility. 403/404 must remain fail-closed.
2. Issue sender rights are checked, but a later workflow_dispatch uses the invoker as actor; explicit owner authorization and durable approvals must be implemented before any mutating job is allowed.
3. A task body is always untrusted, including fields that look like approval.
4. Phase A does not implement an AI worker or write results as Issue comments. Output is job summary and short-retention receipt artifact only.
5. Github-hosted runner usage may consume Actions quota. No guarantee of zero usage cost without account-level quota verification. Do not invoke remote workflows automatically in this PR.
6. Mac Codex CLI auth/coverage and Claude Code plan availability cannot be verified from GitHub; Phase B must check locally. No new API keys.
7. Existing StockWise daily research workflow uses `25 23 * * *` UTC and the `STOCKWISE_SALES_RESEARCH_ENABLED` gate; this is NOT proof of the older proposed three daily JST runs.
8. Existing sales, SNS, billing, auth, Supabase and deployment controls stay unchanged.

## Local tests (no network or production systems)
Run:
```sh
node --test tests/nexops-issue-validator.test.mjs
node --check scripts/nexops-issue-validator.mjs
node --check scripts/nexops-issue-dispatch.mjs
```

Test suite covers valid dry-run receipt, emergency stop, repository boundary, opt-in label, authorization, PR exclusion, schema allowlist, injected shell text, duplicate task blocks, maximum input size, manual dispatch label enforcement and deterministic revision keys.

## Release gates
- Phase A PR requires review and test evidence.
- Do not merge/deploy or change any repository variables.
- Phase B separate approval and separate PR: Mac opt-in polling worker, durable ledger, safe working directory, CLI capability checks and rollback.
- Phase C/D require further review, especially API/runner costs, Claude availability, and external communication approvals.

## Actual dispatch fix — 2026-11-15

The first live manual dispatch was rejected before runner startup (HTTP 422):
`runner.temp` is unavailable in job-level `env`. Moved the receipt-path binding
to the read/validate step, where runner context is supported; artifact path and
read-only permissions are unchanged. Added three workflow-safety regression tests
(16 Phase A tests total). Existing Issue23 remains a specification, not a runnable
task; no label/body/permissions or execution switches were changed.
