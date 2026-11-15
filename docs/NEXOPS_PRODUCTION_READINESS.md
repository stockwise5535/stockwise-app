# NexOps production-readiness gate — Mac probe

Related: Issue #23, Phase A PR #24, stacked Phase B PR #25.

This is a **diagnostic only**. It does not execute Codex, Claude, GitHub writes, deploys, sends messages, enable launchd, install services, or authorize a production rollout.

## How to inspect from a dedicated, clean Mac checkout

```sh
node --test tests/nexops-issue-validator.test.mjs tests/nexops-local-worker.test.mjs tests/nexops-readiness.test.mjs
node --check scripts/nexops-readiness.mjs

node scripts/nexops-readiness.mjs --repo /absolute/path/to/clean/isolated/stockwise-app
```

Required: Node 22+, git, authenticated `gh`, Codex CLI, dedicated clean clone/worktree on Mac. Do not use or reset a dirty existing working tree. The script checks only whether CLI commands are present and whether `gh auth status` exits successfully; it does not verify fine-grained authorization, Codex login, model quota, CLI non-interactive support, account plan, secret isolation or safe sandbox execution. It reports **BLOCKED** intentionally until these independent release gates pass.

Do not paste raw `gh auth status`, CLI config files, tokens or customer data into GitHub Issues. The script prints only sanitized boolean/state flags and blocker codes.

## Remaining gates for true autonomous production operation

1. Review and test Phase A and Phase B PRs; check existing Sales/SNS/build/security regressions.
2. Confirm the correct production Vercel project(s); the two failing Vercel project statuses also occur on the current main SHA, so investigate independently before claiming deployment success.
3. Run a sandboxed Codex CLI smoke test manually in a disposable checkout, verify authentication, plan entitlement and no additional API billing; do not mistake `codex --version` for readiness.
4. Build a separately approved worker with durable approval, replay protection, bounded queue/polling, restricted repository/worktree and process timeout, forced redaction, no production credentials, safe Codex invocation and evidence checks.
5. Verify rollback/emergency stop and require owner approval for any real external impact. No automatic email sending, SNS publishing, CRM production writes, billing or deployment.
6. Configure Mac access through an operator-controlled setup; a cloud GitHub connector cannot access a user's local Mac or turn on launchd.

**Release verdict:** Phase A and B are useful preproduction components but the autonomous production executor is **NOT READY**.

## Verification and hardening — 2026-11-15

Reviewed actual Phase A head `147bb53` and Phase B head `7ba81f8`.
The reported 26 combined validator/worker/readiness cases were reproduced in
Cloud Linux, not on the user's Mac. Unit 60 and Sales 218 also passed; Build passed.
Both PRs have the same two unrelated Vercel project failures as the current main;
`stockwise-app-1qz9` and `y` previews pass. These statuses do not verify a Mac worker.

Added requested-Issue/returned-Issue binding and all-seen revision replay history,
including A→B→A and rejection-interleaving cases. Existing latest-receipt data is
migrated without resetting its prior key; corrupt/symlinked/oversized/capacity state
stops instead of erasing history. Historical revisions already discarded by the
old prototype cannot be recovered from that file. No production executor exists.

Final local checks: 32 NexOps cases (13 validator, 14 worker, 5 readiness),
60 Unit cases and 218 Sales cases passed; production Build and source/dist secret
scan passed. No full browser suite rerun: this change has no browser/UI code.
No main merge, Production deployment, Mac daemon, Codex/Claude execution,
new provider credentials, email/SNS/CRM/database change or billing activation.
Mac real authentication, plan entitlement and sandbox smoke test remain unverified.

Added PR-only/manual `NexOps safety tests` CI; it uses synthetic fixtures and no
provider secrets or schedules. Hosted result is checked separately after push.
Issue dispatcher file is not yet on main, despite appearing in workflow listings;
that listing alone does not establish a live issue-triggered production service.

## Owner-provided Mac diagnostic — 2026-11-15

The owner ran the read-only probe from a fresh Mac clone and supplied its output.
It reports macOS=true, Node22OrNewer=true, git/gh/codex available, cleanRepo=true,
and GitHub authentication CLI_AUTH_PRESENT_UNSCOPED. These are owner-provided
Mac results, distinct from the Cloud synthetic tests above.

Codex authentication and quota still report NOT_VERIFIED. Autonomous execution
is false and paidApiActivated is false. BLOCKED remains the expected release
result: no authenticated/entitled Codex smoke test or production executor has
been established. No daemon, agent execution or outgoing communication was run
by the diagnostic. Next check: capture codex login status as sanitized booleans
and authentication type only; do not paste raw credential/config output.

## Owner-provided Codex login check — 2026-11-15

The owner supplied sanitized output: authenticated=true, method=CHATGPT,
aiExecuted=false. Subscription-based CLI login is present on the Mac; this does
not establish remaining quota, plan entitlement, noninteractive sandbox success
or autonomous worker readiness. The readiness probe now distinguishes ChatGPT,
API-key and failed/unknown login without exposing raw output. API-key login does
not satisfy the subscription-only gate. Focused NexOps tests now total 35 passing.

Next is one fixed-prompt, isolated, read-only Codex smoke run, using the existing
ChatGPT/Codex allowance. No API key, new subscription, production credential,
Issue-driven task, daemon or real external communication is needed.

## Owner-provided Mac Codex smoke result — 2026-11-15

The owner supplied `{"smokePassed":true,"reason":"OK","workerEnabled":false}`
from the fixed-prompt smoke command. Codex returned the exact expected reply in
a fresh Mac directory with read-only sandbox, ChatGPT authentication forced,
OpenAI API-key/base-URL environment variables removed for that child, and shell,
web, app and MCP tools disabled by configuration. No Issue content was executed.
This establishes one successful noninteractive Codex response using the existing
account allowance; it does not establish remaining quota, service availability,
background scheduling, arbitrary task safety, PR delivery or production readiness.

Mac CLI availability, CLI ChatGPT login and this bounded response are now
owner-observed PASS checkpoints. The unattended execution/approval loop and PR
result reporting remain unimplemented; both PRs remain unmerged and no worker,
daemon, mail, SNS, database or production deployment was activated.
