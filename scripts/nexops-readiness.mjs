import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_OUTPUT = 8192;
const MAX_MS = 5000;

export function probe(command, args, options = {}) {
  const runner = options.runner ?? spawnSync;
  const result = runner(command, args, {
    shell: false,
    encoding: 'utf8',
    timeout: MAX_MS,
    maxBuffer: MAX_OUTPUT,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return { available: false };
  return { available: true };
}

export function assessReadiness({ root, runner = spawnSync, platform = process.platform, nodeMajor = Number(process.versions.node.split('.')[0]) }) {
  const report = {
    phase: 'NexOps Mac readiness (read-only)',
    status: 'BLOCKED',
    node22OrNewer: Number.isInteger(nodeMajor) && nodeMajor >= 22,
    macOS: platform === 'darwin',
    commands: {},
    cleanRepo: false,
    githubAuthentication: 'NOT_VERIFIED',
    codexAuthentication: 'NOT_VERIFIED',
    codexQuota: 'NOT_VERIFIED',
    autonomousExecutionEnabled: false,
    paidApiActivated: false,
    blockers: [],
  };
  const check = (cmd, args) => probe(cmd, args, { runner }).available;
  report.commands.git = check('git', ['--version']);
  report.commands.gh = check('gh', ['--version']);
  report.commands.codex = check('codex', ['--version']);
  if (!report.node22OrNewer) report.blockers.push('NODE_22_REQUIRED');
  if (!report.macOS) report.blockers.push('MAC_NOT_VERIFIED');
  if (!report.commands.git) report.blockers.push('GIT_NOT_FOUND');
  if (!report.commands.gh) report.blockers.push('GH_NOT_FOUND');
  if (!report.commands.codex) report.blockers.push('CODEX_NOT_FOUND');
  if (report.commands.git && root && existsSync(root)) {
    const dir = resolve(root);
    const repoResult = runner('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      shell: false, encoding: 'utf8', timeout: MAX_MS, maxBuffer: MAX_OUTPUT,
    });
    if (repoResult.status === 0 && !repoResult.error && repoResult.stdout.trim() === dir) {
      const worktree = runner('git', ['-C', dir, 'status', '--porcelain=v1', '--untracked-files=all'], {
        shell: false, encoding: 'utf8', timeout: MAX_MS, maxBuffer: MAX_OUTPUT,
      });
      report.cleanRepo = worktree.status === 0 && !worktree.error && worktree.stdout.length === 0;
    }
  }
  if (!report.cleanRepo) report.blockers.push('CLEAN_ISOLATED_CHECKOUT_REQUIRED');
  if (report.commands.gh) {
    // Never expose gh auth status output: it may contain private account data.
    const auth = runner('gh', ['auth', 'status'], { shell: false, encoding: 'utf8', timeout: MAX_MS, maxBuffer: MAX_OUTPUT });
    report.githubAuthentication = auth.status === 0 && !auth.error ? 'CLI_AUTH_PRESENT_UNSCOPED' : 'NOT_VERIFIED';
  }
  report.blockers.push('CODEX_AUTH_AND_ENTITLEMENTS_UNVERIFIED');
  report.blockers.push('NO_DURABLE_APPROVAL_OR_PRODUCTION_EXECUTOR');
  report.status = 'BLOCKED'; // Intentionally never approves live automation.
  return report;
}

export function main(args = process.argv.slice(2)) {
  if (args.length !== 2 || args[0] !== '--repo') {
    return { status: 'BLOCKED', reason: 'USAGE_READINESS_ONLY', autonomousExecutionEnabled: false };
  }
  return assessReadiness({ root: args[1] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(main(), null, 2) + '\n');
}
