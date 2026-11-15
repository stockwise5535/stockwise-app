import { createHash } from 'node:crypto';

export const ALLOWED_DEPARTMENTS = Object.freeze(['SALES', 'MKT-CONTENT', 'MKT-GROWTH', 'IT', 'PRODUCT', 'CEO']);
export const RUN_LABEL = 'nexops:run-requested';
const allowedActions = Object.freeze(['research-report', 'draft-content', 'metrics-audit', 'code-audit', 'product-prd', 'executive-report']);
const departmentActions = Object.freeze({
  SALES: 'research-report',
  'MKT-CONTENT': 'draft-content',
  'MKT-GROWTH': 'metrics-audit',
  IT: 'code-audit',
  PRODUCT: 'product-prd',
  CEO: 'executive-report',
});
const permittedRoles = new Set(['admin', 'maintain', 'write']);
const MAX_BODY_LENGTH = 10000;

export function validateRequest({ repository, expectedRepository, eventName, eventAction, eventLabel, actorPermission, issue, emergencyStop = true }) {
  const blocked = (reason) => ({ status: 'BLOCKED', reason, executionAllowed: false });
  if (repository !== expectedRepository || !/^[-\w.]+\/[-\w.]+$/.test(repository ?? '')) return blocked('WRONG_REPOSITORY');
  if (!(['issues', 'workflow_dispatch'].includes(eventName))) return blocked('INVALID_EVENT');
  if (eventName === 'issues' && (eventAction !== 'labeled' || eventLabel !== RUN_LABEL)) return blocked('NOT_OPTED_IN_EVENT');
  if (!permittedRoles.has(actorPermission)) return blocked('UNAUTHORIZED_ACTOR');
  if (!issue || issue.pull_request || issue.state !== 'open' || !Number.isSafeInteger(issue.number) || issue.number <= 0) return blocked('INVALID_ISSUE');
  if (!Array.isArray(issue.labels) || !issue.labels.some((l) => (typeof l === 'string' ? l : l?.name) === RUN_LABEL)) return blocked('LABEL_MISSING');
  if (typeof issue.body !== 'string' || issue.body.length > MAX_BODY_LENGTH) return blocked('INVALID_BODY');
  const match = issue.body.match(/(?:^|\n)```nexops-task\n([\s\S]*?)\n```(?:\n|$)/g);
  if (!match || match.length !== 1) return blocked('INVALID_TASK_BLOCK');
  const jsonText = match[0].replace(/^\n?```nexops-task\n/, '').replace(/\n```\n?$/, '');
  let task;
  try { task = JSON.parse(jsonText); } catch { return blocked('INVALID_JSON'); }
  if (!task || Array.isArray(task) || typeof task !== 'object') return blocked('INVALID_SCHEMA');
  const keys = Object.keys(task).sort();
  if (keys.join(',') !== ['action', 'department', 'dry_run', 'objective', 'schema_version'].sort().join(',')) return blocked('INVALID_SCHEMA');
  if (task.schema_version !== 1 || !ALLOWED_DEPARTMENTS.includes(task.department) || !allowedActions.includes(task.action) || task.action !== departmentActions[task.department] || task.dry_run !== true) return blocked('INVALID_SCHEMA');
  if (typeof task.objective !== 'string' || task.objective.length < 5 || task.objective.length > 200 || /[\r\n\x00-\x1f]/.test(task.objective)) return blocked('INVALID_OBJECTIVE');
  if (emergencyStop) return blocked('EMERGENCY_STOP');
  const revision = createHash('sha256').update(issue.body, 'utf8').digest('hex');
  return {
    status: 'VALIDATED_DRY_RUN',
    issueNumber: issue.number,
    department: task.department,
    action: task.action,
    revision,
    idempotencyKey: createHash('sha256').update(`${repository}/${issue.number}/${revision}/dry-run`).digest('hex'),
    executionAllowed: false,
    reason: 'PHASE_A_REPORT_ONLY',
  };
}
