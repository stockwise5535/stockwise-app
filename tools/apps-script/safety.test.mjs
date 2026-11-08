import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FILES,TEST_CRM,hash,digest,fromRemote,validateSource,validateTargets,authorizeWrite,encryptBackup,decryptBackup,requireProductionProtection} from './safety.mjs';
const source=Object.fromEntries(FILES.map(f=>[f,readFileSync(new URL('../../apps-script/sales-crm/'+f,import.meta.url),'utf8')]));
const baseline=()=>({operation:'bootstrap',target:'test',event:'workflow_dispatch',ref:'refs/heads/main',confirmedSha:'head',head:'head',
 review:{status:'reviewed',bindingHash:'binding',remoteDigest:'remote',approvedSourceDigest:'source',settingsVerifiedOff:true,manualEditsReconciled:true,ownerGmailTestPreserved:true,testRuntimeVerified:true,testSourceDigest:'source',testDeploymentRunId:'12345'},
 binding:'binding',remote:'remote',source:'source',knownSources:['source','remote'],patchReviewed:true});
test('all current files load together and incomplete or obsolete bundled payload is refused',()=>{
 const ctx=validateSource(source);assert.equal(typeof ctx.SalesEngine.processQueue,'function');
 assert.throws(()=>validateSource({...source,'bundle.js':'var SalesCore = {};'}),/UNRECONCILED/);
 assert.throws(()=>validateSource({...source,'Engine.js':''}),/INCOMPLETE/);
 assert.throws(()=>validateSource({...source,'Engine.js':'var SalesEngine = {};'}),/INCOMPLETE/);
 assert.throws(()=>validateSource({...source,'Core.js':'var broken = ('}),SyntaxError);
});
test('normalization accepts key order and CRLF but preserves literal whitespace and constraints of source',()=>{
 assert.equal(digest({...source,'Main.js':source['Main.js'].replace(/\n/g,'\r\n')}),digest(source));
 assert.notEqual(digest({...source,'Main.js':source['Main.js']+'\n'}),digest(source));
 assert.equal(hash('a').length,64);
 assert.throws(()=>fromRemote([{name:'x',type:'SERVER_JS',source:''},{name:'x',type:'SERVER_JS',source:''}]),/INVALID_REMOTE/);
});
test('wrong/missing/colliding TEST and production identities are rejected',()=>{
 const e={APPS_SCRIPT_TEST_SCRIPT_ID:'a'.repeat(30),APPS_SCRIPT_PRODUCTION_SCRIPT_ID:'b'.repeat(30),STOCKWISE_TEST_CRM_ID:TEST_CRM,STOCKWISE_CRM_ID:'c'.repeat(30)};
 assert.equal(validateTargets(e,'test').parentId,TEST_CRM);
 assert.equal(validateTargets({APPS_SCRIPT_TEST_SCRIPT_ID:e.APPS_SCRIPT_TEST_SCRIPT_ID,STOCKWISE_TEST_CRM_ID:TEST_CRM},'test').parentId,TEST_CRM);
 assert.throws(()=>validateTargets({APPS_SCRIPT_TEST_SCRIPT_ID:e.APPS_SCRIPT_TEST_SCRIPT_ID,STOCKWISE_TEST_CRM_ID:TEST_CRM},'production'),/CONFIG/);
 assert.throws(()=>validateTargets({...e,STOCKWISE_CRM_ID:TEST_CRM},'production'),/COLLISION/);
 assert.throws(()=>validateTargets({...e,APPS_SCRIPT_PRODUCTION_SCRIPT_ID:e.APPS_SCRIPT_TEST_SCRIPT_ID},'test'),/COLLISION/);
 assert.throws(()=>validateTargets({...e,STOCKWISE_TEST_CRM_ID:'d'.repeat(30)},'test'),/COLLISION/);
 assert.throws(()=>validateTargets({},'test'),/CONFIG/);
});
test('bootstrap requires explicit main SHA approval and reconciled live review',()=>{
 assert.doesNotThrow(()=>authorizeWrite(baseline()));
 for(const change of [{event:'push'},{confirmedSha:'wrong'},{ref:'refs/heads/feature'},{patchReviewed:false},{remote:'manual-edit'},
 {review:{...baseline().review,status:'pending'}},{review:{...baseline().review,settingsVerifiedOff:false}},
 {review:{...baseline().review,bindingHash:'wrong'}}]) assert.throws(()=>authorizeWrite({...baseline(),...change}));
});
test('TEST auto updates require a known reviewed Git lineage; unexpected manual edits stop',()=>{
 const b={...baseline(),operation:'deploy',event:'push'};
 assert.doesNotThrow(()=>authorizeWrite(b));
 assert.throws(()=>authorizeWrite({...b,remote:'unknown-manual-change'}),/UNREVIEWED/);
 assert.throws(()=>authorizeWrite({...b,knownSources:['remote']}),/UNREVIEWED/);
 assert.throws(()=>authorizeWrite({...b,target:'production'}),/MANUAL/);
 assert.doesNotThrow(()=>authorizeWrite({...b,target:'production',event:'workflow_dispatch'}));
});
test('full source backup encrypts, round trips and rejects tampering/wrong key',()=>{
 const key=Buffer.alloc(32,12).toString('base64'),data={content:source,secret:'do-not-log'};
 const backup=encryptBackup(data,key);assert.ok(!backup.includes('do-not-log'));assert.deepEqual(decryptBackup(backup,key),data);
 assert.throws(()=>decryptBackup(backup,Buffer.alloc(32,13).toString('base64')));
 const tampered=JSON.parse(backup);tampered.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>decryptBackup(JSON.stringify(tampered),key));
 assert.throws(()=>encryptBackup(data,'bad'),/BACKUP_KEY/);
});
test('delivery is source-only, with no forced push, function run, CRM write or auto retry',()=>{
 const script=readFileSync(new URL('./deliver.mjs',import.meta.url),'utf8');
 assert.match(script,/retry:false/);
 const wrapper=readFileSync(new URL('./clasp-once.mjs',import.meta.url),'utf8');
 assert.match(wrapper,/google.options\(\{retry:false,timeout:30000\}\)/);
 assert.match(wrapper,/here.resolve\('googleapis'\) !== clasp.resolve\('googleapis'\)/);assert.match(script,/POST_PUSH_MISMATCH/);assert.match(script,/REMOTE_CHANGED_DURING_REVIEW/);
 assert.ok(!script.includes("'--force'"));assert.ok(!script.includes('projects.updateContent('));assert.ok(!script.includes('scripts.run('));
 const workflow=readFileSync(new URL('../../.github/workflows/apps-script-delivery.yml',import.meta.url),'utf8');
 assert.match(workflow,/APPS_SCRIPT_TEST_AUTO_DEPLOY == 'true'/);assert.ok(!workflow.includes('pull_request_target'));
 assert.match(workflow,/apps-script-test-bootstrap/);assert.match(workflow,/cancel-in-progress: false/);
});

test('production requires an actual GitHub required-reviewer rule and tested source proof',()=>{
 assert.throws(()=>requireProductionProtection({protection_rules:[]}),/PROTECTION_MISSING/);
 assert.throws(()=>requireProductionProtection({protection_rules:[{type:'required_reviewers',reviewers:[]}]}),/PROTECTION_MISSING/);
 assert.doesNotThrow(()=>requireProductionProtection({protection_rules:[{type:'required_reviewers',reviewers:[{type:'User',reviewer:{id:1}}]}]}));
 const b={...baseline(),target:'production'};
 assert.throws(()=>authorizeWrite({...b,review:{...b.review,testRuntimeVerified:false}}),/TEST_RUNTIME/);
 assert.throws(()=>authorizeWrite({...b,source:'untested'}),/TEST_RUNTIME/);
});
