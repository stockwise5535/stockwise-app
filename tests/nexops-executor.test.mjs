import test from 'node:test';import assert from 'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';
import{executeOnce,pollOnce,inspectJob,reconcileIssue,readExecutionStatus,withExecutorLock,safeError}from'../scripts/nexops-executor.mjs';
import{REPO,OWNER,parseJob}from'../scripts/nexops-job.mjs';
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),D='d'.repeat(40),E='e'.repeat(40);
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nexops-executor-')),stateDir=path.join(root,'private');
 const f={root,stateDir,clock:new Date('2026-11-15T12:00:00Z'),writes:[],reads:[],generations:0,checks:0,notices:0,prs:[],published:[],privateRepo:false,operator:OWNER,operatorRole:'admin',authorRole:'write',commentEdited:false,sourceConfigured:true,badDiff:false,failAt:null,generateError:null,generated:null,onGenerate:null};
 f.env={NEXOPS_AI_EXECUTION_ENABLED:'true',NEXOPS_AI_EMERGENCY_STOP:'false',NEXOPS_GITHUB_REPORT_WRITES:'true',NEXOPS_HOSTING_GUARDS_VERIFIED:'true',NEXOPS_MAX_DAILY_JOBS:'2'};
 f.setIssue=(n,department='IT',objective='Review public repository source safely')=>{f.issue={number:n,state:'open',user:{login:'requester'},labels:[{name:'nexops:run-requested'}],body:'```nexops-job\n'+JSON.stringify({schema_version:2,department,action:{IT:'code-audit',SALES:'research-report','MKT-GROWTH':'metrics-audit'}[department],objective,mode:'artifact-pr'})+'\n```'};f.job=parseJob(f.issue,n);f.approval={id:n+100,user:{login:OWNER},created_at:'2026-11-15T11:59:00Z',updated_at:'2026-11-15T11:59:00Z',body:'```nexops-approval\n'+JSON.stringify({revision:f.job.revision,mode:'artifact-pr',expires_at:'2026-11-15T13:00:00Z'})+'\n```'};};
 f.setIssue(42);
 f.api=async(method,url,body)=>{
  if(method==='GET'){
   f.reads.push(url);
   if(url===`repos/${REPO}`)return{full_name:REPO,private:f.privateRepo,default_branch:'main'};
   if(url==='user')return{login:f.operator};
   if(url.includes('/collaborators/'))return{permission:url.includes('/requester/')?f.authorRole:f.operatorRole};
   if(url.includes('/comments?'))return[{...f.approval,updated_at:f.commentEdited?'2026-11-15T12:00:00Z':f.approval.updated_at},...f.published];
   if(url.includes('/issues?'))return f.pollIssues||[f.issue];
   if(url.endsWith('/issues/'+f.issue.number))return structuredClone(f.issue);
   if(url.includes('/contents/')){const file=url.split('/contents/')[1].split('?')[0];const text=file.endsWith('research-sources.json')?JSON.stringify({sources:f.sourceConfigured?[{url:'https://reviewed.example/data'}]:[]}):'Public source excerpt only. No live operational data.';return{path:file,encoding:'base64',content:Buffer.from(text).toString('base64')};}
   if(url.endsWith('/git/ref/heads/main'))return{object:{sha:B}};
   if(url.endsWith('/git/commits/'+B))return{tree:{sha:C}};
   if(url.includes('/compare/'))return{files:f.badDiff?[{filename:'src/App.jsx',status:'modified'}]:[{filename:f.job.path,status:'added'}]};
   if(url.includes('/pulls?'))return f.prs;
   throw Error('UNEXPECTED_TEST_GET');
  }
  f.writes.push({method,url,body});
  const stage=url.endsWith('/git/trees')?'trees':url.endsWith('/git/commits')?'commits':url.endsWith('/git/refs')?'refs':url.endsWith('/pulls')?'pulls':url.endsWith('/comments')?'comments':'unknown';
  if(stage==='pulls')f.prs.push({number:77});
  if(stage==='comments')f.published.push({user:{login:OWNER},body:body.body});
  if(f.failAt===stage)throw Error('GITHUB_WRITE_UNCONFIRMED');
  if(stage==='trees')return{sha:D};if(stage==='commits')return{sha:E};if(stage==='refs')return{ref:body.ref};if(stage==='pulls')return{number:77};if(stage==='comments')return{id:999};throw Error('UNEXPECTED_TEST_WRITE');
 };
 f.deps={api:f.api,now:()=>new Date(f.clock),runtime:()=>A,proof:()=>{f.checks++;return{tests:50,failed:0};},generate:async()=>{f.generations++;if(f.onGenerate)await f.onGenerate();if(f.generateError)throw Error(f.generateError);return f.generated||{summary:'A draft review summary.',report:'This limited source review is unverified and requires human review. No actual production change was made.'};},research:async()=>({status:'completed',candidates:[{}],sources:[{status:'read'}]}),notice:()=>{f.notices++;}};
 f.run=()=>executeOnce(f.issue.number,{stateDir,env:f.env,deps:f.deps});
 f.status=()=>readExecutionStatus(stateDir);
 f.close=()=>fs.rmSync(root,{recursive:true,force:true});
 f.options=()=>({stateDir,env:f.env,deps:f.deps});return f;
}
async function use(fn){const f=fixture();try{return await fn(f);}finally{f.close();}}
test('default OFF and emergency stop perform zero GitHub, model or state writes',()=>use(async f=>{
 f.env={};assert.equal((await f.run()).reason,'EXECUTOR_DISABLED');assert.equal(f.reads.length,0);assert.equal(f.generations,0);assert.ok(!fs.existsSync(f.stateDir));
 f.env={NEXOPS_AI_EXECUTION_ENABLED:'true'};assert.equal((await f.run()).reason,'EMERGENCY_STOP');assert.equal(f.reads.length,0);
}));
test('report-publication and hosting guards must be explicit',()=>use(async f=>{
 delete f.env.NEXOPS_GITHUB_REPORT_WRITES;assert.equal((await f.run()).reason,'REPORT_PUBLICATION_DISABLED');
 f.env.NEXOPS_GITHUB_REPORT_WRITES='true';delete f.env.NEXOPS_HOSTING_GUARDS_VERIFIED;assert.equal((await f.run()).reason,'HOSTING_BRANCH_GUARDS_UNVERIFIED');assert.equal(f.reads.length,0);
}));
test('successful approved job runs checks once, generates once, publishes one fixed-file draft PR and reports REVIEW',()=>use(async f=>{
 const r=await f.run();assert.equal(r.status,'REVIEW');assert.equal(r.prUrl,`https://github.com/${REPO}/pull/77`);assert.equal(f.generations,1);assert.equal(f.checks,1);assert.equal(f.writes.length,5);
 const tree=f.writes[0].body;assert.equal(tree.tree.length,1);assert.equal(tree.tree[0].path,f.job.path);assert.match(tree.tree[0].content,/UNVERIFIED DRAFT/);
 const pr=f.writes.find(w=>w.url.endsWith('/pulls')).body;assert.equal(pr.base,'main');assert.equal(pr.draft,true);assert.equal(f.published.length,1);assert.match(f.published[0].body,/\*\*REVIEW\*\*/);assert.equal(f.status().phases.REVIEW,1);
}));
test('persistent claim prevents replay even after code is reloaded',()=>use(async f=>{
 assert.equal((await f.run()).status,'REVIEW');const reload=await import('../scripts/nexops-executor.mjs?restart-test');
 const r=await reload.executeOnce(42,f.options());assert.equal(r.reason,'JOB_ALREADY_RECORDED_NO_RETRY');assert.equal(f.generations,1);assert.equal(f.writes.length,5);
}));
test('owner, author, private-repository and modified approval checks fail before AI or writes',async()=>{
 for(const change of[f=>f.operator='outsider',f=>f.authorRole='read',f=>f.privateRepo=true,f=>f.commentEdited=true])await use(async f=>{change(f);assert.equal((await f.run()).status,'BLOCKED');assert.equal(f.generations,0);assert.equal(f.writes.length,0);});
});
test('dry-run issue is never upgraded into an execution job',()=>use(async f=>{
 f.issue.body='```nexops-task\n{"schema_version":1,"dry_run":true}\n```';assert.equal((await f.run()).reason,'EXECUTION_CONTRACT_REQUIRED');assert.equal(f.generations,0);assert.equal(f.writes.length,0);
}));
test('daily cap is reserved durably and cannot be raised above two',()=>use(async f=>{
 assert.equal((await f.run()).status,'REVIEW');f.setIssue(43);assert.equal((await f.run()).status,'REVIEW');f.setIssue(44);assert.equal((await f.run()).reason,'DAILY_JOB_LIMIT');assert.equal(f.generations,2);
 f.env.NEXOPS_MAX_DAILY_JOBS='3';assert.equal((await f.run()).reason,'INVALID_DAILY_JOB_LIMIT');
}));
test('expired or edited approval during generation prevents all GitHub writes',async()=>{
 for(const update of[f=>f.commentEdited=true,f=>f.clock=new Date('2026-11-15T14:00:00Z'),f=>f.issue.body+='\nchanged',f=>f.authorRole='read'])await use(async f=>{f.onGenerate=()=>update(f);const r=await f.run();assert.equal(r.status,'BLOCKED');assert.equal(f.generations,1);assert.equal(f.writes.length,0);assert.equal(f.status().status,'STOPPED');});
});
test('stop file appearing during generation prevents all publication',()=>use(async f=>{
 f.onGenerate=()=>fs.writeFileSync(path.join(f.stateDir,'STOP'),'{}',{mode:0o600});assert.equal((await f.run()).reason,'EMERGENCY_STOP');assert.equal(f.writes.length,0);
}));
test('invalid or secret-bearing model output is quarantined with no publication or retry',async()=>{
 for(const output of[{summary:'Safe summary',report:'Email me at private@example.test for credentials.'},{summary:'Safe summary',report:'Do this command now.',extra:'unapproved'},{summary:'Safe summary',report:'This includes PRIVATE_CONFIG_VALUE_FOR_TEST'}])await use(async f=>{f.generated=output;f.env.BUFFER_API_KEY='PRIVATE_CONFIG_VALUE_FOR_TEST';const r=await f.run();assert.equal(r.status,'BLOCKED');assert.equal(f.writes.length,0);assert.equal(f.notices,1);assert.equal(f.status().status,'STOPPED');assert.equal((await f.run()).reason,'EMERGENCY_STOP');assert.equal(f.generations,1);});
});
test('application-code changes cannot reach a branch or PR',()=>use(async f=>{
 f.badDiff=true;assert.equal((await f.run()).reason,'UNEXPECTED_PR_CHANGES');assert.deepEqual(f.writes.map(w=>w.url.split('/').at(-1)),['trees','commits']);assert.equal(f.status().status,'STOPPED');
}));
test('unknown PR response is never retried, even after manual stop removal',()=>use(async f=>{
 f.failAt='pulls';const r=await f.run();assert.equal(r.reason,'GITHUB_WRITE_UNCONFIRMED');assert.equal(f.prs.length,1);assert.equal(f.status().phases.UNKNOWN,1);
 fs.unlinkSync(path.join(f.stateDir,'STOP'));f.failAt=null;assert.equal((await f.run()).reason,'JOB_ALREADY_RECORDED_NO_RETRY');assert.equal(f.prs.length,1);assert.equal(f.generations,1);
}));
test('unknown Issue report is not resent; read-only reconciliation reveals existing PR/comment',()=>use(async f=>{
 f.failAt='comments';assert.equal((await f.run()).reason,'GITHUB_WRITE_UNCONFIRMED');assert.equal(f.published.length,1);const writes=f.writes.length;
 const r=await reconcileIssue(42,f.options());assert.equal(r.status,'READ_ONLY_RECONCILIATION');assert.equal(r.results[0].reportFound,true);assert.deepEqual(r.results[0].prNumbers,[77]);assert.equal(r.stopCleared,false);assert.equal(f.writes.length,writes);assert.equal(f.status().status,'STOPPED');
}));
test('concurrent process and stale lock are fail-closed',()=>use(async f=>{
 let release,entered;const ready=new Promise(r=>entered=r);const first=withExecutorLock(f.stateDir,async()=>{entered();await new Promise(r=>release=r);});await ready;
 assert.equal((await f.run()).reason,'EXECUTOR_ALREADY_RUNNING_OR_STALE_LOCK');assert.equal(f.generations,0);release();await first;
 fs.writeFileSync(path.join(f.stateDir,'executor.lock'),'stale',{mode:0o600});assert.equal((await f.run()).reason,'EXECUTOR_ALREADY_RUNNING_OR_STALE_LOCK');
}));
test('missing research sources blocks safely; configured Sales reuses deterministic reader without Codex or CRM writes',async()=>{
 await use(async f=>{f.setIssue(42,'SALES');f.sourceConfigured=false;assert.equal((await f.run()).reason,'RESEARCH_SOURCES_NOT_CONFIGURED');assert.equal(f.generations,0);assert.equal(f.writes.length,0);});
 await use(async f=>{f.setIssue(42,'SALES');assert.equal((await f.run()).status,'REVIEW');assert.equal(f.generations,0);assert.match(f.writes[0].body.tree[0].content,/Research-only candidates: 1/);});
});
test('public plan never requests model invocation or GitHub writes',()=>use(async f=>{
 const r=await inspectJob(42,f.deps);assert.equal(r.executionAllowed,false);assert.equal(r.revision,f.job.revision);assert.equal(f.generations,0);assert.equal(f.writes.length,0);assert.ok(!fs.existsSync(f.stateDir));
}));
test('poll processes at most one approved job and defaults OFF',()=>use(async f=>{
 const off=await pollOnce({stateDir:f.stateDir,env:{},deps:f.deps});assert.equal(off.reason,'EXECUTOR_DISABLED');assert.equal(f.reads.length,0);
 const r=await pollOnce(f.options());assert.equal(r.status,'REVIEW');assert.equal(f.generations,1);assert.equal(f.prs.length,1);
}));
test('poll response count is capped and failures do not expose private errors',()=>use(async f=>{
 f.pollIssues=Array.from({length:11},()=>f.issue);assert.equal((await pollOnce(f.options())).reason,'INVALID_ISSUE_LIST');assert.equal(f.generations,0);
 assert.equal(safeError(Error('PRIVATE_CONFIG_VALUE_FOR_TEST')),'EXECUTOR_FAILED');
}));
test('failed host checks cannot invoke Codex or publish',()=>use(async f=>{
 f.deps.proof=()=>({tests:0,failed:0});assert.equal((await f.run()).reason,'LOCAL_SAFETY_TESTS_FAILED');assert.equal(f.generations,0);assert.equal(f.writes.length,0);assert.equal(f.status().status,'STOPPED');
}));
test('state-directory symlinks cannot redirect execution receipts',()=>use(async f=>{
 const actual=path.join(f.root,'actual');fs.mkdirSync(actual,{mode:0o700});fs.symlinkSync(actual,f.stateDir);assert.equal((await f.run()).reason,'PRIVATE_STATE_DIRECTORY_REQUIRED');assert.equal(f.generations,0);
}));
test('private input is rejected before forwarding any data to Codex',()=>use(async f=>{
 f.env.BUFFER_API_KEY='PRIVATE_CONFIG_VALUE_FOR_TEST';f.setIssue(42,'IT','Review PRIVATE_CONFIG_VALUE_FOR_TEST safely');assert.equal((await f.run()).reason,'PRIVATE_INPUT_REQUIRES_REVIEW');assert.equal(f.generations,0);assert.equal(f.writes.length,0);
}));
test('whole-job deadline and a missing Codex result stop without publication',async()=>{
 await use(async f=>{f.onGenerate=()=>f.clock=new Date('2026-11-15T12:11:00Z');assert.equal((await f.run()).reason,'JOB_TIME_LIMIT');assert.equal(f.writes.length,0);});
 await use(async f=>{f.generateError='CODEX_RESULT_UNCONFIRMED';assert.equal((await f.run()).reason,'CODEX_RESULT_UNCONFIRMED');assert.equal(f.status().phases.UNKNOWN,1);assert.equal((await f.run()).reason,'EMERGENCY_STOP');assert.equal(f.generations,1);});
});
test('every uncertain GitHub write phase is quarantined instead of retried',async()=>{
 for(const stage of ['trees','commits','refs'])await use(async f=>{f.failAt=stage;assert.equal((await f.run()).reason,'GITHUB_WRITE_UNCONFIRMED');const count=f.writes.length;assert.equal((await f.run()).reason,'EMERGENCY_STOP');assert.equal(f.writes.length,count);assert.equal(f.status().phases.UNKNOWN,1);});
});
