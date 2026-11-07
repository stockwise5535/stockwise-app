import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
test('integration preserves main SPA/API rewrites and schedules only read-only metrics sync',()=>{
  const v=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
  assert.deepEqual(v.rewrites,[{source:'/api/(.*)',destination:'/api/$1'},{source:'/(.*)',destination:'/'}]);
  assert.deepEqual(v.crons,[{path:'/api/internal/social-metrics-sync',schedule:'50 8 * * *'}]);
  assert.ok(!v.crons.some(c=>c.path==='/api/internal/social-cycle'));
  assert.equal(v.git.deploymentEnabled['codex/integrate-social-autopilot-main'],false);
  assert.equal(v.git.deploymentEnabled['codex/managed-service-mvp'],false);
  const directory=new URL('../.github/workflows',import.meta.url);
  if(existsSync(directory))for(const file of readdirSync(directory))assert.doesNotMatch(readFileSync(new URL(file,directory.href+'/'),'utf8'),/schedule:|cron:/);
});
test('SQL and schedule proposals cannot be auto-applied as registered migrations/config',()=>{
  // Sales migrations are isolated and must be manually reviewed/applied; the social\n  // SQL proposals must remain unregistered and must not be auto-applied.\n  const migrations=new URL('../supabase/migrations/',import.meta.url);\n  if(existsSync(migrations)) {\n    const names=readdirSync(migrations);\n    assert.ok(names.every(name=>/^(?:20261106000[1-5]|202611070006)_sales_[a-z_]+\\.sql$/.test(name)), 'Only isolated sales migrations may be registered');\n    assert.equal(names.length,6);\n  }
  assert.equal(existsSync(new URL('../docs/proposals/SOCIAL_DASHBOARD_FOUNDATION.sql',import.meta.url)),true);
  assert.equal(existsSync(new URL('../docs/proposals/SOCIAL_AUTOPILOT.sql',import.meta.url)),true);
});
