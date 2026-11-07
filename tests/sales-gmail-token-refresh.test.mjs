import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptSalesSecret} from '../server/sales-secret-envelope.mjs';
import {refreshSalesGmailAccessToken} from '../server/sales-gmail-token-refresh.mjs';
const key=randomBytes(32).toString('base64');
const env={STOCKWISE_SALES_OAUTH_SETUP_ENABLED:'true',STOCKWISE_SALES_ENCRYPTION_KEY:key,STOCKWISE_SALES_GMAIL_CLIENT_SECRET:'test-secret'};
const dbRequest=async()=>({ok:true,data:[{account_email:'nexops2026test@gmail.com',granted_scope:'openid email https://www.googleapis.com/auth/gmail.send',encrypted_refresh_token:encryptSalesSecret('refresh-secret',key,'gmail:nexops2026test@gmail.com')}]});
test('refreshes without returning refresh token',async()=>{
 let count=0;
 const result=await refreshSalesGmailAccessToken({env,dbRequest,fetchImpl:async(url,opts)=>{
  count++;assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(new URLSearchParams(opts.body).get('refresh_token'),'refresh-secret');
  return {ok:true,json:async()=>({access_token:'access',expires_in:3600})};
 }});
 assert.deepEqual(result,{ok:true,accessToken:'access',expiresIn:3600});assert.equal(count,1);
});
test('refuses disabled OAuth',async()=>assert.equal((await refreshSalesGmailAccessToken({env:{},dbRequest})).ok,false));
test('refuses wrong mailbox',async()=>{
 let count=0;
 const result=await refreshSalesGmailAccessToken({env,dbRequest:async()=>({ok:true,data:[{account_email:'other@gmail.com'}]}),fetchImpl:async()=>{count++;}});
 assert.equal(result.ok,false);assert.equal(count,0);
});
test('refuses missing Gmail scope',async()=>{
 const result=await refreshSalesGmailAccessToken({env,dbRequest:async()=>({ok:true,data:[{account_email:'nexops2026test@gmail.com',granted_scope:'openid'}]})});
 assert.equal(result.ok,false);
});
test('rejects revoked refresh token without leaking response',async()=>{
 const result=await refreshSalesGmailAccessToken({env,dbRequest,fetchImpl:async()=>({ok:false,status:400})});
 assert.deepEqual(result,{ok:false,error:'gmail_refresh_rejected'});
});
