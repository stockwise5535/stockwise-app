import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {newGmailOAuthTransaction,validateGmailOAuthCallback} from '../server/sales-google-oauth-transaction.mjs';
test('generates random OAuth state and PKCE S256 challenge',()=>{
 const a=newGmailOAuthTransaction(1000),b=newGmailOAuthTransaction(1000);
 assert.notEqual(a.state,b.state);assert.notEqual(a.verifier,b.verifier);
 assert.equal(a.challenge,createHash('sha256').update(a.verifier).digest('base64url'));
 assert.equal(a.expiresAt,601000);
});
test('valid state permits callback validation',()=>{
 const r=newGmailOAuthTransaction(1000);
 assert.equal(validateGmailOAuthCallback({code:'test-code',state:r.state},r,2000).ok,true);
});
test('rejects incorrect state',()=>{
 const r=newGmailOAuthTransaction(1000);
 assert.equal(validateGmailOAuthCallback({code:'test-code',state:'bad'},r,2000).ok,false);
});
test('rejects expired or used state',()=>{
 const r=newGmailOAuthTransaction(1000);
 assert.equal(validateGmailOAuthCallback({code:'x',state:r.state},r,601001).ok,false);
 assert.equal(validateGmailOAuthCallback({code:'x',state:r.state},{...r,used:true},2000).ok,false);
});
test('rejects OAuth errors',()=>{
 const r=newGmailOAuthTransaction(1000);
 assert.equal(validateGmailOAuthCallback({error:'access_denied',state:r.state},r,2000).ok,false);
});
