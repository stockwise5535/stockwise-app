import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessReadiness, main, probe } from '../scripts/nexops-readiness.mjs';

const mock = (command, args) => {
  if (command === 'git' && args[0] === 'rev-parse') return { status: 1, stdout: '' };
  if (command === 'gh' && args[0] === 'auth') return { status: 0, stdout: 'PRIVATE_TOKEN', stderr: 'PRIVATE_ACCOUNT' };
  return { status: 0, stdout: 'OK', stderr: '' };
};
test('strict read-only version probe', () => assert.deepEqual(probe('gh', ['--version'], { runner: mock }), { available: true }));
test('missing binaries are blocked', () => {
  const absent = () => ({ status: null, error: { code: 'ENOENT' } });
  assert.deepEqual(probe('codex', ['--version'], { runner: absent }), { available: false });
});
test('Mac probe never marks autonomous execution enabled', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nexops-readiness-'));
  try {
    const report = assessReadiness({ root: dir, runner: mock, platform: 'darwin', nodeMajor: 22 });
    assert.equal(report.status, 'BLOCKED');
    assert.equal(report.autonomousExecutionEnabled, false);
    assert.equal(report.paidApiActivated, false);
    assert.equal(report.githubAuthentication, 'CLI_AUTH_PRESENT_UNSCOPED');
    assert.ok(!JSON.stringify(report).includes('PRIVATE_'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('missing Mac, Node and clean checkout are explicitly blocked', () => {
  const report = assessReadiness({ root: '/missing', runner: mock, platform: 'linux', nodeMajor: 20 });
  assert.ok(report.blockers.includes('MAC_NOT_VERIFIED'));
  assert.ok(report.blockers.includes('NODE_22_REQUIRED'));
  assert.ok(report.blockers.includes('CLEAN_ISOLATED_CHECKOUT_REQUIRED'));
});
test('no arbitrary CLI invocation from arguments', () => {
  assert.equal(main(['--run-codex', '; echo hacked']).reason, 'USAGE_READINESS_ONLY');
  assert.equal(main([]).reason, 'USAGE_READINESS_ONLY');
});
