import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync, realpathSync, lstatSync, renameSync, fsyncSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateRequest } from './nexops-issue-validator.mjs';

const REPOSITORY = 'stockwise5535/stockwise-app';
const ISSUE_MAX = 999999999;
const MAX_OUTPUT = 250_000;

export function parseIssueNumber(raw) {
  if (typeof raw !== 'string' || !/^[1-9][0-9]{0,8}$/.test(raw)) throw new Error('INVALID_ISSUE_NUMBER');
  const value = Number(raw);
  if (value > ISSUE_MAX) throw new Error('INVALID_ISSUE_NUMBER');
  return value;
}
export function runGh(args, timeoutMs = 12000) {
  const result = spawnSync('gh', args, { encoding: 'utf8', shell: false, timeout: timeoutMs, maxBuffer: MAX_OUTPUT, env: process.env });
  if (result.error || result.status !== 0) throw new Error('GITHUB_READ_FAILED');
  return result.stdout.trim();
}
export function parseGhJson(text) {
  if (typeof text !== 'string' || text.length > MAX_OUTPUT) throw new Error('GITHUB_RESPONSE_INVALID');
  try { return JSON.parse(text); } catch { throw new Error('GITHUB_RESPONSE_INVALID'); }
}
export function defaultStateDir() {
  return resolve(homedir(), '.nexops', 'local-worker');
}
export function withLock(stateDir, operation) {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const lockPath = join(stateDir, 'worker.lock');
  let fd;
  try { fd = openSync(lockPath, 'wx', 0o600); } catch { throw new Error('WORKER_ALREADY_RUNNING'); }
  try { return operation(); } finally { closeSync(fd); unlinkSync(lockPath); }
}
export function sanitizeReceipt(validation, issueNumber) {
  const allowed = new Set(['status', 'reason', 'department', 'action', 'idempotencyKey', 'revision', 'executionAllowed']);
  const fields = Object.fromEntries(Object.entries(validation).filter(([key]) => allowed.has(key)));
  return { ...fields, issueNumber, mode: 'LOCAL_HANDOFF_ONLY', codexExecuted: false, githubWrites: false };
}
export function collectHandoff({ issueNumber, repository = REPOSITORY, get = runGh, stop = true }) {
  if (repository !== REPOSITORY) throw new Error('WRONG_REPOSITORY');
  parseIssueNumber(String(issueNumber));
  const user = parseGhJson(get(['api', 'user']));
  const login = user.login;
  if (typeof login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(login)) throw new Error('GITHUB_IDENTITY_INVALID');
  const issue = parseGhJson(get(['api', `repos/${repository}/issues/${issueNumber}`]));
  if (issue.number !== issueNumber) throw new Error('GITHUB_ISSUE_MISMATCH');
  const access = parseGhJson(get(['api', `repos/${repository}/collaborators/${login}/permission`]));
  const validation = validateRequest({
    repository, expectedRepository: REPOSITORY, eventName: 'workflow_dispatch',
    actorPermission: access.permission, issue, emergencyStop: stop,
  });
  return sanitizeReceipt(validation, issueNumber);
}
export function storeReceipt(stateDir, receipt) {
  parseIssueNumber(String(receipt.issueNumber));
  // Rejections must never erase a previously validated revision's replay history.
  if (receipt.status !== 'VALIDATED_DRY_RUN') return { ...receipt, duplicate: false };
  const validKey = key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
  if (!validKey(receipt.idempotencyKey)) throw new Error('INVALID_RECEIPT');
  if (!lstatSync(stateDir).isDirectory() || lstatSync(stateDir).isSymbolicLink()) throw new Error('INVALID_STATE_DIRECTORY');
  const ledgerPath = join(stateDir, `issue-${receipt.issueNumber}.json`);
  let seen = [];
  if (existsSync(ledgerPath)) {
    if (!lstatSync(ledgerPath).isFile() || lstatSync(ledgerPath).isSymbolicLink()) throw new Error('INVALID_LEDGER');
    let previous;
    try {
      const raw = readFileSync(ledgerPath, 'utf8');
      if (raw.length > 1_000_000) throw new Error('oversized');
      previous = JSON.parse(raw);
    } catch { throw new Error('INVALID_LEDGER'); }
    if (previous.issueNumber !== receipt.issueNumber || !validKey(previous.idempotencyKey)) throw new Error('INVALID_LEDGER');
    if (previous.schemaVersion === undefined) seen = [previous.idempotencyKey];
    else if (previous.schemaVersion === 2 && Array.isArray(previous.seenIdempotencyKeys) &&
      previous.seenIdempotencyKeys.length <= 4096 && previous.seenIdempotencyKeys.every(validKey) &&
      new Set(previous.seenIdempotencyKeys).size === previous.seenIdempotencyKeys.length &&
      previous.seenIdempotencyKeys.includes(previous.idempotencyKey)) seen = previous.seenIdempotencyKeys;
    else throw new Error('INVALID_LEDGER');
  }
  if (seen.includes(receipt.idempotencyKey)) return { ...receipt, duplicate: true };
  if (seen.length >= 4096) throw new Error('LEDGER_CAPACITY_REQUIRES_REVIEW');
  const record = { ...receipt, schemaVersion: 2, seenIdempotencyKeys: [...seen, receipt.idempotencyKey], receivedAt: new Date().toISOString() };
  const temp = join(stateDir, `.${receipt.issueNumber}-${process.pid}.tmp`);
  let fd;
  try {
    fd = openSync(temp, 'wx', 0o600);
    writeFileSync(fd, JSON.stringify(record, null, 2) + '\n');
    fsyncSync(fd);
  } finally { if (fd !== undefined) closeSync(fd); }
  renameSync(temp, ledgerPath);
  return { ...receipt, duplicate: false };
}

export function localCodexProbe(get = runGh) {
  try {
    const version = spawnSync('codex', ['--version'], { encoding: 'utf8', shell: false, timeout: 5000, maxBuffer: 10000 });
    if (version.error || version.status !== 0) return { available: false, reason: 'CODEX_CLI_UNAVAILABLE' };
    const label = (version.stdout || version.stderr || '').trim().slice(0, 120);
    return { available: true, version: label, authentication: 'NOT_CHECKED', unattendedSupport: 'NOT_VERIFIED' };
  } catch { return { available: false, reason: 'CODEX_CLI_UNAVAILABLE' }; }
}
export function main(argv = process.argv.slice(2)) {
  if (argv[0] !== '--once' || argv.length !== 2) return { status: 'BLOCKED', reason: 'USE_MANUAL_ONCE_ONLY' };
  let issueNumber;
  try { issueNumber = parseIssueNumber(argv[1]); } catch { return { status: 'BLOCKED', reason: 'INVALID_ISSUE_NUMBER' }; }
  if (process.env.NEXOPS_LOCAL_WORKER_ENABLED !== 'true') return { status: 'BLOCKED', reason: 'LOCAL_WORKER_DISABLED', issueNumber };
  if (process.env.NEXOPS_AI_EMERGENCY_STOP !== 'false') return { status: 'BLOCKED', reason: 'EMERGENCY_STOP', issueNumber };
  if (process.env.NEXOPS_AI_EXECUTION_ENABLED === 'true') return { status: 'BLOCKED', reason: 'PHASE_B_NO_AUTONOMOUS_EXECUTION', issueNumber };
  const stateDir = defaultStateDir();
  try {
    return withLock(stateDir, () => {
      const receipt = collectHandoff({ issueNumber, stop: false });
      return storeReceipt(stateDir, receipt);
    });
  } catch (err) {
    const reason = err instanceof Error && /^[A-Z_]+$/.test(err.message) ? err.message : 'LOCAL_WORKER_ERROR';
    return { status: 'BLOCKED', reason, issueNumber };
  }
}
if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  console.log(JSON.stringify(main(), null, 2));
}
