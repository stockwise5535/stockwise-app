import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest, RUN_LABEL } from '../scripts/nexops-issue-validator.mjs';

const task = (override = {}) => ({ schema_version: 1, department: 'IT', action: 'code-audit', objective: 'Review current source and tests', dry_run: true, ...override });
const issue = (body = `\n\`\`\`nexops-task\n${JSON.stringify(task())}\n\`\`\`\n`) => ({ number: 23, user:{login:'requester'}, state: 'open', labels: [{ name: RUN_LABEL }], body });
const args = (o = {}) => {
 const currentIssue=o.issue ?? issue();
 return { repository:'stockwise5535/stockwise-app',expectedRepository:'stockwise5535/stockwise-app',
 eventName:'issues',eventAction:'labeled',eventLabel:RUN_LABEL,actorPermission:'write',authorPermission:'write',
 expectedIssueNumber:23,issue:currentIssue,eventIssue:currentIssue,emergencyStop:false,...o };
};

const good = validateRequest(args());
test('valid issue yields dry-run only with stable idempotency', () => {
  assert.equal(good.status, 'VALIDATED_DRY_RUN');
  assert.equal(good.executionAllowed, false);
  assert.equal(good.idempotencyKey, validateRequest(args()).idempotencyKey);
});
test('emergency stop defaults to blocking', () => assert.equal(validateRequest(args({ emergencyStop: true })).reason, 'EMERGENCY_STOP'));
test('wrong repo blocked', () => assert.equal(validateRequest(args({ repository: 'someone/other' })).reason, 'WRONG_REPOSITORY'));
test('missing label blocked', () => assert.equal(validateRequest(args({ issue: { ...issue(), labels: [] } })).reason, 'LABEL_MISSING'));
test('unprivileged actor blocked', () => assert.equal(validateRequest(args({ actorPermission: 'read' })).reason, 'UNAUTHORIZED_ACTOR'));
test('non-opt-in label event blocked', () => assert.equal(validateRequest(args({ eventLabel: 'bug' })).reason, 'NOT_OPTED_IN_EVENT'));
test('pull requests rejected', () => assert.equal(validateRequest(args({ issue: { ...issue(), pull_request: {} } })).reason, 'INVALID_ISSUE'));
test('incorrect schema rejected', () => assert.equal(validateRequest(args({ issue: issue(`\n\`\`\`nexops-task\n${JSON.stringify(task({ action: 'free-shell' }))}\n\`\`\`\n`) })).reason, 'INVALID_SCHEMA'));
test('untrusted shell text has no command execution surface', () => {
  const withInjection = issue(`run $(rm -rf /)\n\`\`\`nexops-task\n${JSON.stringify(task())}\n\`\`\`\n`);
  const result = validateRequest(args({ issue: withInjection }));
  assert.equal(result.executionAllowed, false);
});
test('multiple task blocks rejected', () => assert.equal(validateRequest(args({ issue: issue(issue().body + issue().body) })).reason, 'INVALID_TASK_BLOCK'));
test('oversized issue rejected', () => assert.equal(validateRequest(args({ issue: issue('x'.repeat(10001)) })).reason, 'INVALID_BODY'));
test('manual event still requires opt-in label', () => assert.equal(validateRequest(args({ eventName: 'workflow_dispatch', issue: { ...issue(), labels: [] } })).reason, 'LABEL_MISSING'));
test('different revisions produce distinct receipt keys', () => {
  const other = validateRequest(args({ issue: issue(`\n\`\`\`nexops-task\n${JSON.stringify(task({ objective: 'Different scoped audit request' }))}\n\`\`\`\n`) }));
  assert.notEqual(good.idempotencyKey, other.idempotencyKey);
});

test('an authorized label actor cannot authorize an unprivileged Issue author',()=>assert.equal(validateRequest(args({authorPermission:'read'})).reason,'UNAUTHORIZED_AUTHOR'));
test('missing author permission fails closed',()=>assert.equal(validateRequest(args({authorPermission:undefined})).reason,'UNAUTHORIZED_AUTHOR'));
test('malformed author identity is rejected before dispatch planning',()=>assert.equal(validateRequest(args({issue:{...issue(),user:{login:'../other'}}})).reason,'INVALID_ISSUE_AUTHOR'));
test('response Issue number must match the requested Issue',()=>assert.equal(validateRequest(args({expectedIssueNumber:24})).reason,'ISSUE_NUMBER_MISMATCH'));
test('edited Issue content after label event is blocked',()=>assert.equal(validateRequest(args({eventIssue:{...issue(),body:'previous content'}})).reason,'ISSUE_CHANGED_SINCE_EVENT'));
test('missing or mismatched event snapshot is blocked for Issue events',()=>{
 assert.equal(validateRequest(args({eventIssue:undefined})).reason,'ISSUE_CHANGED_SINCE_EVENT');
 assert.equal(validateRequest(args({eventIssue:{...issue(),user:{login:'other'}}})).reason,'ISSUE_CHANGED_SINCE_EVENT');
});
test('manual read validates current content without implying any execution approval',()=>{
 const result=validateRequest(args({eventName:'workflow_dispatch',eventIssue:undefined}));assert.equal(result.status,'VALIDATED_DRY_RUN');assert.equal(result.executionAllowed,false);
});
