import test from'node:test';import assert from'node:assert/strict';
import{mkdtempSync,mkdirSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{execFileSync}from'node:child_process';
import{reviewInputDigest,reviewedExecutionDigest}from'../server/sales-review-binding.mjs';
import{CRM_BINDING,productionCrmId}from'../server/sales-crm-binding.mjs';
const path='apps-script/sales-crm/deployment/crm-binding.json';
test('review digest binds execution code and target identity, not the attestation that records the digest',()=>{
 const base=[[path,JSON.stringify(CRM_BINDING)],['server/sales-example.mjs','export const limit=1;']];
 const digest=reviewInputDigest(base);
 const receipt={...CRM_BINDING,independentReviewer:'independent reviewer',independentReviewStatus:'approved',independentReviewCommit:'a'.repeat(40),independentReviewDigest:digest,productionWritesAuthorized:true};
 assert.equal(reviewInputDigest([[path,JSON.stringify(receipt)],base[1]]),digest);
 assert.notEqual(reviewInputDigest([base[0],['server/sales-example.mjs','export const limit=50;']]),digest);
 assert.notEqual(reviewInputDigest([[path,JSON.stringify({...CRM_BINDING,spreadsheetId:'another-target'})],base[1]]),digest);
});
test('a real but stale reviewed commit cannot authorize a changed implementation',t=>{
 const root=mkdtempSync(tmpdir()+'/stockwise-review-binding-');t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const dir of ['server','scripts','apps-script/sales-crm/deployment','.github/workflows','tools/apps-script'])mkdirSync(root+'/'+dir,{recursive:true});
 writeFileSync(root+'/'+path,JSON.stringify(CRM_BINDING));writeFileSync(root+'/server/sales-example.mjs','export const limit=1;');
 const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
 git(['init']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','reviewed snapshot']);
 const old=git(['rev-parse','HEAD']).trim(),digest=reviewedExecutionDigest({root,commit:old});assert.equal(digest,reviewedExecutionDigest({root}));
 writeFileSync(root+'/server/sales-example.mjs','export const limit=50;');assert.notEqual(digest,reviewedExecutionDigest({root}));
 assert.throws(()=>productionCrmId({...CRM_BINDING,independentReviewStatus:'approved',independentReviewer:'reviewer',independentReviewCommit:old,independentReviewDigest:digest,dedicatedCredentialConfirmed:true}),/REVIEWED_SOURCE_CHANGED/);
 assert.throws(()=>reviewedExecutionDigest({root,commit:'0'.repeat(40)}),/UNAVAILABLE/);
});
