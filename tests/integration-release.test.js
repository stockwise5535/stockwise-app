import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
test('integration preserves main routes and allows only metrics sync plus opt-in read-only research',()=>{
  const v=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
  assert.deepEqual(v.rewrites,[{source:'/api/(.*)',destination:'/api/$1'},{source:'/(.*)',destination:'/'}]);
  assert.deepEqual(v.crons,[{path:'/api/internal/social-metrics-sync',schedule:'50 8 * * *'}]);
  assert.ok(!v.crons.some(c=>c.path==='/api/internal/social-cycle'));
  assert.equal(v.git.deploymentEnabled['codex/integrate-social-autopilot-main'],false);
  assert.equal(v.git.deploymentEnabled['codex/managed-service-mvp'],false);
  const directory=new URL('../.github/workflows',import.meta.url);
  if(existsSync(directory))for(const file of readdirSync(directory)) {
    const workflow=readFileSync(new URL(file,directory.href+'/'),'utf8');
    if(file==='sales-daily-research.yml') {
      assert.match(workflow,/cron: '25 23 \* \* \*'/);
      assert.match(workflow,/if: vars\.STOCKWISE_SALES_RESEARCH_ENABLED == 'true'/);
      assert.match(workflow,/contents: read/);
      assert.match(workflow,/node scripts\/sales-daily-research\.mjs/);
      assert.doesNotMatch(workflow,/secrets\.|social-cycle|clasp|GMAIL|LIVE_SENDING|write-all|contents: write/);
      const sources=JSON.parse(readFileSync(new URL('../apps-script/sales-crm/deployment/research-sources.json',import.meta.url))).sources;
      assert.ok(Array.isArray(sources)&&sources.length<=5);
      assert.ok(sources.every(source=>source.freeSourceVerified===true&&source.termsReviewed===true));
    } else assert.doesNotMatch(workflow,/schedule:|cron:/);
  }
});
test('SQL and schedule proposals cannot be auto-applied as registered migrations/config',()=>{
  // Sales migrations are isolated and must be manually reviewed/applied; the social\n  // SQL proposals must remain unregistered and must not be auto-applied.\n  const migrations=new URL('../supabase/migrations/',import.meta.url);\n  if(existsSync(migrations)) {\n    const names=readdirSync(migrations);\n    assert.ok(names.every(name=>/^(?:20261106000[1-5]|202611070006)_sales_[a-z_]+\\.sql$/.test(name)), 'Only isolated sales migrations may be registered');\n    assert.equal(names.length,6);\n  }
  assert.equal(existsSync(new URL('../docs/proposals/SOCIAL_DASHBOARD_FOUNDATION.sql',import.meta.url)),true);
  assert.equal(existsSync(new URL('../docs/proposals/SOCIAL_AUTOPILOT.sql',import.meta.url)),true);
});
