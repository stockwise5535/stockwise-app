import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
test('integration preserves main SPA/API rewrites and schedules metrics and gated daily publication',()=>{
  const v=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
  assert.deepEqual(v.rewrites,[{source:'/api/(.*)',destination:'/api/$1'},{source:'/(.*)',destination:'/'}]);
  assert.deepEqual(v.crons,[{path:'/api/internal/social-metrics-sync',schedule:'50 8 * * *'},{path:'/api/internal/social-cycle',schedule:'0 9 * * *'}]);
  assert.equal(v.git.deploymentEnabled['codex/enable-social-posting-cron'],false);
  assert.equal(v.git.deploymentEnabled['codex/integrate-social-autopilot-main'],false);
  assert.equal(v.git.deploymentEnabled['codex/managed-service-mvp'],false);
  const directory=new URL('../.github/workflows',import.meta.url);
  if(existsSync(directory))for(const file of readdirSync(directory))assert.doesNotMatch(readFileSync(new URL(file,directory.href+'/'),'utf8'),/schedule:|cron:/);
});
test('SQL and schedule proposals cannot be auto-applied as registered migrations/config',()=>{
  assert.equal(existsSync(new URL('../supabase/migrations',import.meta.url)),false);
  assert.equal(existsSync(new URL('../docs/proposals/SOCIAL_DASHBOARD_FOUNDATION.sql',import.meta.url)),true);
  assert.equal(existsSync(new URL('../docs/proposals/SOCIAL_AUTOPILOT.sql',import.meta.url)),true);
});
