import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { validateRequest } from './nexops-issue-validator.mjs';

const env = process.env;
const receipt = (value) => {
  const safe = JSON.stringify(value, null, 2);
  console.log(safe);
  // Same fixed validation fields as the receipt; no Issue text, tokens or URLs.
  if (env.GITHUB_ACTIONS === 'true') console.log(`::notice title=NexOps dry-run receipt::status=${value.status};reason=${value.reason ?? 'N/A'};executionAllowed=${value.executionAllowed === true}`);
  if (env.NEXOPS_RECEIPT_PATH) writeFileSync(env.NEXOPS_RECEIPT_PATH, safe + '\n', { mode: 0o600 });
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### NexOps Phase A (read-only)\n\nStatus: **${value.status}**; Reason: ${value.reason ?? 'N/A'}\n\nNo agent or external write was executed.\n`);
};

try {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const repository = env.GITHUB_REPOSITORY;
  const expectedRepository = 'stockwise5535/stockwise-app';
  const eventName = env.GITHUB_EVENT_NAME;
  const issueNumber = eventName === 'workflow_dispatch' ? Number(event.inputs?.issue_number) : event.issue?.number;
  const actor = env.GITHUB_ACTOR;
  const token = env.GITHUB_TOKEN;
  if (repository !== expectedRepository || !Number.isSafeInteger(issueNumber) || issueNumber < 1 || !/^[A-Za-z0-9-]+$/.test(actor ?? '') || !token) {
    receipt({ status: 'BLOCKED', reason: 'INVALID_CONTEXT', executionAllowed: false });
    process.exit(0);
  }
  const request = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('GITHUB_READ_FAILED');
    return response.json();
  };
  const [issue, permission] = await Promise.all([
    request(`issues/${issueNumber}`),
    request(`collaborators/${encodeURIComponent(actor)}/permission`),
  ]);
  const author = issue.user?.login;
  const authorAccess = author === actor ? permission :
    typeof author === 'string' && /^[A-Za-z0-9-]{1,39}$/.test(author) ?
      await request(`collaborators/${encodeURIComponent(author)}/permission`) : {permission:null};
  const result = validateRequest({
    repository,
    expectedRepository,
    eventName,
    eventAction: event.action,
    eventLabel: event.label?.name,
    actorPermission: permission.permission,
    authorPermission: authorAccess.permission,
    expectedIssueNumber: issueNumber,
    eventIssue: event.issue,
    issue,
    emergencyStop: env.NEXOPS_AI_EMERGENCY_STOP !== 'false',
  });
  receipt(result);
} catch {
  receipt({ status: 'BLOCKED', reason: 'READ_OR_VALIDATION_FAILED', executionAllowed: false });
}
