# NexOps artifact executor

Implementation scope: a Mac worker produces an unverified draft/report as one
new file under `docs/nexops-results/`, opens a Draft PR and reports REVIEW on
the originating Issue. It cannot edit application code, merge, deploy, send
mail, schedule SNS, write CRM/DB or change billing. Phase A dry-run requests
never become execution requests. No scheduler is installed or enabled.

## Request and owner approval

An open Issue in stockwise5535/stockwise-app needs `nexops:run-requested`,
a write-authorized author and exactly one block like:

```nexops-job
{"schema_version":2,"department":"IT","action":"code-audit","objective":"Review the supplied dispatcher source for risks","mode":"artifact-pr"}
```

The six department/action pairs remain allowlisted in `scripts/nexops-job.mjs`.
`node scripts/nexops-executor.mjs --plan ISSUE` performs reads and returns the
body revision. The repository owner must personally add one unedited approval
comment containing the exact revision and an ISO expiration within 24 hours:

```nexops-approval
{"revision":"REPLACE_WITH_PLAN_REVISION","mode":"artifact-pr","expires_at":"REPLACE_WITH_FUTURE_ISO_TIME"}
```

The worker never creates approval. Ordinary Issues, the Issue #23 specification,
old dry-run blocks, changed bodies, expired/edited approvals and unauthorized
authors/operators are blocked. Approval is checked again before external effects.

## Runtime and limits

Use a clean dedicated Mac checkout with HTTPS origin, the exact reviewed
40-character `NEXOPS_WORKER_COMMIT`, Node and Codex CLI supporting the required
flags. Codex must be logged into ChatGPT. API-key login is rejected. Existing
subscription allowance can be consumed; availability or unlimited free usage
is not guaranteed. No paid API key is introduced.

All these gates are required for execution and remain disabled by default:

- `NEXOPS_AI_EXECUTION_ENABLED=true`
- `NEXOPS_AI_EMERGENCY_STOP=false`
- `NEXOPS_GITHUB_REPORT_WRITES=true`
- `NEXOPS_HOSTING_GUARDS_VERIFIED=true`
- `NEXOPS_WORKER_COMMIT=<reviewed exact commit>`

The hosting gate requires an operator to confirm branch mappings, deployment
behavior and free quotas: a new Draft PR branch can trigger existing Vercel
Preview automation. The executor never updates main or requests deployment.
Do not assert this gate merely because worker tests passed.

One local lock spans the whole asynchronous run. The hard limit is two claimed
jobs per UTC day (`NEXOPS_MAX_DAILY_JOBS` may lower it to one). Model timeout is
180 seconds; job deadline is ten minutes, checked before effects. Tools, web,
shell, apps and MCP are disabled for the model. Only bounded public source
excerpts from fixed paths and the screened objective enter its prompt. Secrets
are stripped from the child environment and screened in inputs and outputs.
Results are unverified drafts, not measured business facts.

SALES reuses the existing read-only candidate research function without Codex.
Its current empty source configuration blocks research; it does not silently
invent candidates. Growth reads source/configuration, not live SNS metrics.

## Operations and failure handling

- `node scripts/nexops-executor.mjs --status`: local aggregate status.
- `node scripts/nexops-executor.mjs --once ISSUE`: one guarded job.
- `node scripts/nexops-executor.mjs --poll-once`: at most one approved job.
- `node scripts/nexops-executor.mjs --stop`: persist a stop latch.
- `node scripts/nexops-executor.mjs --reconcile ISSUE`: read receipts/PRs only.

The private durable journal records intent before every external write. Any
claimed failure latches STOP. Unknown model/GitHub results are not retried; the
key remains consumed across restarts. Reconciliation never clears STOP, retries
writes or removes history. A crash lock also requires manual investigation.
Optional fixed local failure notifications use `NEXOPS_DESKTOP_NOTIFICATIONS`.
Approval checks and remote writes are not an atomic distributed transaction.

`scripts/nexops-launchd.mjs` only creates a private `.plist.disabled` template,
with execution OFF and emergency stop ON. It never calls launchctl or installs
a service. Review and separate authorization are required before activation;
the Mac must stay awake and connected. No existing schedule is duplicated.

## Acceptance status

Synthetic tests cover real adapter arguments with mocked processes, role and
revision checks, limits, secret rejection, stop, replay, uncertain writes and
read-only reconciliation. They make no AI/Buffer/Gmail calls. Mac task-to-PR
acceptance is still pending; earlier owner-provided Codex smoke only confirmed
a fixed response. Report delivery goes to the Issue and Draft PR, not directly
to a shared ChatGPT report. Production automatic operation is not claimed.
