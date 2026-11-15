import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseIssueNumber, collectHandoff, storeReceipt, withLock, main } from '../scripts/nexops-local-worker.mjs';

test('only strict numeric issue IDs accepted', () => {
  assert.equal(parseIssueNumber('23'), 23);
  for (const bad of ['0', '1;rm -rf /', '../23', '-2', '1234567890', '1\n2', 'abc']) assert.throws(() => parseIssueNumber(bad));
});
test('worker disabled by default without environment changes', () => {
  const old = process.env.NEXOPS_LOCAL_WORKER_ENABLED;
  delete process.env.NEXOPS_LOCAL_WORKER_ENABLED;
  try { assert.equal(main(['--once', '23']).reason, 'LOCAL_WORKER_DISABLED'); } finally { if (old !== undefined) process.env.NEXOPS_LOCAL_WORKER_ENABLED = old; }
});
test('worker refuses polling or autonomous arguments', () => {
  assert.equal(main(['--watch', '23']).reason, 'USE_MANUAL_ONCE_ONLY');
  assert.equal(main(['--once', '23', '--run-codex']).reason, 'USE_MANUAL_ONCE_ONLY');
});
test('emergency stop blocks before gh interaction', () => {
  const env = { NEXOPS_LOCAL_WORKER_ENABLED: process.env.NEXOPS_LOCAL_WORKER_ENABLED, NEXOPS_AI_EMERGENCY_STOP: process.env.NEXOPS_AI_EMERGENCY_STOP };
  process.env.NEXOPS_LOCAL_WORKER_ENABLED = 'true'; delete process.env.NEXOPS_AI_EMERGENCY_STOP;
  try { assert.equal(main(['--once', '23']).reason, 'EMERGENCY_STOP'); } finally { for(const [k,v] of Object.entries(env)){if(v===undefined) delete process.env[k];else process.env[k]=v;} }
});
test('valid synthetic read returns only handoff (never AI execution)', () => {
  const task = { schema_version: 1, department: 'IT', action: 'code-audit', objective: 'Review current source and tests', dry_run: true };
  const body = '\n```nexops-task\n' + JSON.stringify(task) + '\n```\n';
  const get = (args) => {
    const path = args[1];
    if (path === 'user') return JSON.stringify({ login: 'test-operator' });
    if (path.endsWith('/permission')) return JSON.stringify({ permission: 'write' });
    if (path.endsWith('/issues/23')) return JSON.stringify({number:23,state:'open',labels:[{name:'nexops:run-requested'}],body});
    throw new Error('UNEXPECTED_API');
  };
  const receipt = collectHandoff({ issueNumber: 23, stop:false, get });
  assert.equal(receipt.status, 'VALIDATED_DRY_RUN');
  assert.equal(receipt.codexExecuted, false);
  assert.equal(receipt.githubWrites, false);
  assert.equal(receipt.executionAllowed, false);
  assert.ok(receipt.idempotencyKey);
});
test('malicious username or permission denied fails closed', () => {
  const badGet = (args) => args[1] === 'user' ? JSON.stringify({ login: 'abc;echo x' }) : '{}';
  assert.throws(() => collectHandoff({ issueNumber:23, stop:false, get:badGet }), /GITHUB_IDENTITY_INVALID/);
});
test('ledger preserves same revision rather than repeating the handoff', () => {
  const dir = mkdtempSync(join(tmpdir(),'nexops-test-'));
  try {
    const receipt = { issueNumber:23,idempotencyKey:'a',status:'VALIDATED_DRY_RUN' };
    assert.equal(storeReceipt(dir,receipt).duplicate,false);
    assert.equal(storeReceipt(dir,receipt).duplicate,true);
    assert.equal(JSON.parse(readFileSync(join(dir,'issue-23.json'),'utf8')).idempotencyKey,'a');
    assert.equal(storeReceipt(dir,{...receipt,idempotencyKey:'b'}).duplicate,false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('second lock fails closed; crash leftovers require manual recovery', () => {
  const dir = mkdtempSync(join(tmpdir(),'nexops-lock-'));
  try { withLock(dir,()=>assert.throws(()=>withLock(dir,()=>{}),/WORKER_ALREADY_RUNNING/)); }
  finally {rmSync(dir,{recursive:true,force:true});}
});
