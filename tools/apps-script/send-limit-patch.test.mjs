import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{patchDailyLimitCore,buildReviewedSendingPatch}from'./send-limit-patch.mjs';
const core="DAILY_SEND_LIMIT: ['10', 'description']; dailyLimit: num(map.DAILY_SEND_LIMIT, 10); if(s.dailyLimit > 10 || s.runLimit > 5)stop(); const countries=['JP','SG','AU']; const legal=false;";
const sha=s=>createHash('sha256').update(s).digest('hex');
test('only the three daily-limit literals change; legal, per-run and research rules are preserved',()=>{
 const updated=patchDailyLimitCore(core);assert.match(updated,/\['100'/);assert.match(updated,/DAILY_SEND_LIMIT, 100/);assert.match(updated,/dailyLimit > 100/);
 assert.ok(updated.includes("const countries=['JP','SG','AU']; const legal=false;"));assert.ok(updated.includes('runLimit > 5'));
 assert.throws(()=>patchDailyLimitCore(updated),/UNEXPECTED_CORE/);
});
test('fresh remote payload retains Unicode/custom files and does not accept source drift',()=>{
 const remote={files:[{name:'Main',type:'SERVER_JS',source:'old Main'},{name:'Engine',type:'SERVER_JS',source:'old Engine'},{name:'Core',type:'SERVER_JS',source:core},{name:'appsscript',type:'JSON',source:'{}'},{name:'コード',type:'SERVER_JS',source:'function myFunction(){}'}]};
 const replacements={Main:'reviewed Main',Engine:'reviewed Engine'},review={expectedCurrentSourceHashes:{Main:sha('old Main'),Engine:sha('old Engine'),Core:sha(core)},expectedCurrentManifestHash:sha('{}'),preparedSourceHashes:{Main:sha(replacements.Main),Engine:sha(replacements.Engine),Core:sha(patchDailyLimitCore(core))}};
 const result=buildReviewedSendingPatch(remote,replacements,review);assert.equal(result.files.length,5);assert.equal(result.files.find(f=>f.name==='コード').source,'function myFunction(){}');assert.equal(result.files.find(f=>f.name==='appsscript').source,'{}');
 assert.equal(remote.files[0].source,'old Main');const drift=structuredClone(remote);drift.files[0].source='manual edit';assert.throws(()=>buildReviewedSendingPatch(drift,replacements,review),/REMOTE_SOURCE_CHANGED/);
});

test('v2 accepts only exact reviewed full Core replacement and retains all unrelated remote files',()=>{
 const remote={files:[{name:'Main',source:'old-main'},{name:'Engine',source:'old-engine'},{name:'Core',source:core},{name:'appsscript',source:'{}'},{name:'Custom',source:'unchanged'}]};
 const replacements={Main:'new-main',Engine:'new-engine',Core:'reviewed full Core including legal gates'};
 const review={patchVersion:2,retainCoreExceptDailyLimit:false,expectedCurrentSourceHashes:{Main:sha('old-main'),Engine:sha('old-engine'),Core:sha(core)},expectedCurrentManifestHash:sha('{}'),preparedSourceHashes:Object.fromEntries(Object.entries(replacements).map(([k,v])=>[k,sha(v)]))};
 const result=buildReviewedSendingPatch(remote,replacements,review);assert.equal(result.files.find(x=>x.name==='Core').source,replacements.Core);assert.equal(result.files.find(x=>x.name==='Custom').source,'unchanged');
 assert.throws(()=>buildReviewedSendingPatch(remote,{...replacements,Core:'unreviewed'},review),/UNREVIEWED/);
});
