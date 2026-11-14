import test from 'node:test';import assert from 'node:assert/strict';
import {safeFailureCode,remoteSourceState,credentialMatchesCreator,credentialAccountHint} from './diagnostics.mjs';
test('only fixed error labels are exposed, never credentials, URLs or arbitrary upper-case text',()=>{
 const secret='SENSITIVE_ACCESS_TOKEN_DO_NOT_PRINT';
 for(const e of [new Error(secret),new Error('https://host/?sig='+secret),{stderr:Buffer.from(secret)},{}]){
  const code=safeFailureCode(e);assert.equal(code,'GOOGLE_OR_CLASP_OPERATION_FAILED_REVIEW_PRIVATELY_NO_RETRY');assert.ok(!code.includes(secret));
 }
});
test('Google status, known guard failures and safe CLI markers are classified without raw output',()=>{
 assert.equal(safeFailureCode({response:{status:403},message:'secret'}),'GOOGLE_HTTP_403');
 assert.equal(safeFailureCode(new Error('REMOTE_CHANGED_DURING_REVIEW')),'REMOTE_CHANGED_DURING_REVIEW');
 assert.equal(safeFailureCode({stderr:Buffer.from('Request had insufficient authentication scopes. token=secret')}),'GOOGLE_SCOPE_INSUFFICIENT');
 assert.equal(safeFailureCode({stderr:'The caller does not have permission. secret'}),'GOOGLE_PERMISSION_DENIED');
 assert.equal(safeFailureCode({stderr:'invalid_grant secret'}),'GOOGLE_REAUTH_REQUIRED');
 assert.equal(safeFailureCode({stderr:'SyntaxError: secret source content'}),'GOOGLE_SOURCE_SYNTAX_REJECTED');
});
test('a read-only comparison distinguishes baseline, applied source and external changes',()=>{
 assert.equal(remoteSourceState('old','new','old'),'REVIEWED_BASELINE');
 assert.equal(remoteSourceState('new','new','old'),'APPROVED_SOURCE');
 assert.equal(remoteSourceState('other','new','old'),'UNREVIEWED_CHANGE');
});

test('user setting disabled and Cloud service disabled are different failure classes',()=>{
 assert.equal(safeFailureCode({stderr:'User has not enabled the Apps Script API. Enable it by visiting https://script.google.com/home/usersettings.'}),'GOOGLE_USER_SCRIPT_API_DISABLED');
 assert.equal(safeFailureCode({stderr:'Apps Script API has not been used in project 123 before or it is disabled.'}),'GOOGLE_CLOUD_SCRIPT_API_DISABLED');
});
test('credential owner comparison reveals only a boolean, never an email',()=>{
 assert.equal(credentialMatchesCreator({email:'owner@example.test'},{createUser:{email:'OWNER@example.test'}}),'true');
 assert.equal(credentialMatchesCreator({email:'other@example.test'},{createUser:{email:'owner@example.test'}}),'false');
 assert.equal(credentialMatchesCreator(undefined,{}),'unknown');
});

test('account hint helps distinguish Google profiles without exposing the full address',()=>{
 assert.equal(credentialAccountHint({email:'stockwise-private@gmail.com'}),'st***@gmail.com');
 assert.equal(credentialAccountHint({email:'ab@gmail.com'}),'***@gmail.com');
 assert.equal(credentialAccountHint({email:'evil\n::error@gmail.com'}),'unavailable');
 assert.equal(credentialAccountHint(undefined),'unavailable');
});
