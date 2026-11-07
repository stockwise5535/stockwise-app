import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSalesReadiness} from '../server/sales-readiness.mjs';
test('never marks production ready from environment flags alone',()=>{
 const r=assessSalesReadiness({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private',STOCKWISE_SALES_ENCRYPTION_KEY:'private',STOCKWISE_SALES_OAUTH_ADMIN_KEY:'private',STOCKWISE_SALES_GMAIL_CLIENT_SECRET:'private',STOCKWISE_SALES_UNSUBSCRIBE_SECRET:'private',STOCKWISE_SALES_SEND_ENABLED:'true'});
 assert.equal(r.readyForProduction,false);assert.equal(r.checks.productionSendingDisabled,false);
 assert.equal(JSON.stringify(r).includes('private'),false);
});
test('reports missing secret names only',()=>{
 const r=assessSalesReadiness({});
 assert.equal(r.readyForProduction,false);assert.ok(r.missing.includes('STOCKWISE_SALES_GMAIL_CLIENT_SECRET'));
});
