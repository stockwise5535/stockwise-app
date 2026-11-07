import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshSalesGmailAccessToken} from '../server/sales-gmail-token-refresh.mjs';

test('Gmail token refresh remains possible with OAuth enrollment disabled',async()=>{
 let dbCalls=0;
 const result=await refreshSalesGmailAccessToken({
  env:{STOCKWISE_SALES_OAUTH_SETUP_ENABLED:'false',STOCKWISE_SALES_ENCRYPTION_KEY:'placeholder',STOCKWISE_SALES_GMAIL_CLIENT_SECRET:'placeholder'},
  dbRequest:async()=>{dbCalls++;return {ok:false};}
 });
 assert.equal(dbCalls,1);
 assert.equal(result.ok,false);
 assert.equal(result.error,'verified_gmail_credentials_unavailable');
});
test('Gmail token refresh fails closed when secret material is absent',async()=>{
 let dbCalls=0;
 const result=await refreshSalesGmailAccessToken({
  env:{STOCKWISE_SALES_OAUTH_SETUP_ENABLED:'true'},
  dbRequest:async()=>{dbCalls++;return {ok:true,data:[]};}
 });
 assert.equal(dbCalls,0);
 assert.equal(result.error,'gmail_auth_disabled');
});
