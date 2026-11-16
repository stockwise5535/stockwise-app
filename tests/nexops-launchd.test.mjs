import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{launchdTemplate}from'../scripts/nexops-launchd.mjs';
test('Mac template is disabled, single-tick and never activates a daemon',()=>{
 const text=launchdTemplate({nodePath:'/opt/node',scriptPath:'/Users/Owner & Co/worker.mjs',workerCommit:'a'.repeat(40)});
 assert.match(text,/<string>--poll-once<\/string>/);assert.match(text,/<integer>600<\/integer>/);assert.match(text,/<key>RunAtLoad<\/key><false\/>/);assert.match(text,/Owner &amp; Co/);
 assert.match(text,/<key>Disabled<\/key><true\/>/);
 for(const [key,value]of [['NEXOPS_AI_EXECUTION_ENABLED','false'],['NEXOPS_AI_EMERGENCY_STOP','true'],['NEXOPS_GITHUB_REPORT_WRITES','false'],['NEXOPS_HOSTING_GUARDS_VERIFIED','false']])assert.ok(text.includes(`<key>${key}</key><string>${value}</string>`));
 const source=readFileSync(new URL('../scripts/nexops-launchd.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/spawn|execFile|launchctl|Library\/LaunchAgents/);
});
test('runtime paths preserve authentication home and canonical temporary directories',()=>{
 const xml=launchdTemplate({nodePath:'/node',scriptPath:'/worker',workerCommit:'a'.repeat(40),homeDir:'/Users/Owner',tempDir:'/private/tmp'});
 assert.ok(xml.includes('<key>HOME</key><string>/Users/Owner</string>'));
 assert.ok(xml.includes('<key>TMPDIR</key><string>/private/tmp</string>'));
 for(const paths of [{homeDir:'.'},{tempDir:'tmp'}])assert.throws(()=>launchdTemplate({nodePath:'/node',scriptPath:'/worker',workerCommit:'a'.repeat(40),...paths}),/ABSOLUTE_RUNTIME_PATHS_REQUIRED/);
});
test('relative paths or unpinned versions cannot create a launch template',()=>{assert.throws(()=>launchdTemplate({nodePath:'node',scriptPath:'/worker',workerCommit:'a'.repeat(40)}));assert.throws(()=>launchdTemplate({nodePath:'/node',scriptPath:'/worker',workerCommit:'main'}));});
test('launch template carries an absolute binary search path and private log paths',()=>{const xml=launchdTemplate({nodePath:'/opt/homebrew/bin/node',scriptPath:'/Users/Owner/worker.mjs',workerCommit:'a'.repeat(40),stateDir:'/Users/Owner/.nexops/state',searchPath:'/opt/homebrew/bin:/usr/bin:/bin'});assert.match(xml,/<key>PATH<\/key><string>\/opt\/homebrew\/bin:\/usr\/bin:\/bin<\/string>/);assert.ok(xml.includes('/Users/Owner/.nexops/state/run.log'));assert.throws(()=>launchdTemplate({nodePath:'/node',scriptPath:'/worker',workerCommit:'a'.repeat(40),searchPath:'.:/bin'}));});
