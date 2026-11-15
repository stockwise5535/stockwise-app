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
