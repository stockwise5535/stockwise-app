import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/nexops-issue-dispatch.yml',import.meta.url),'utf8');
test('job-level environment uses only contexts available before runner assignment',()=>{
 const beforeSteps=workflow.split('    steps:')[0];assert.doesNotMatch(beforeSteps,/\$\{\{\s*runner\./);
});
test('receipt path is bound at the execution step where runner.temp is supported',()=>{
 const readStep=workflow.split('      - name: Read and validate request; never execute')[1].split('      - name:')[0];
 assert.match(readStep,/env:\s*\n\s*NEXOPS_RECEIPT_PATH: \$\{\{ runner\.temp \}\}\/nexops-phase-a-receipt\.json/);
 assert.match(workflow,/path: \$\{\{ runner\.temp \}\}\/nexops-phase-a-receipt\.json/);
});
test('dispatch stays read-only with execution disabled and emergency stop active',()=>{
 assert.match(workflow,/permissions:\n  contents: read\n  issues: read/);
 assert.match(workflow,/NEXOPS_AI_EXECUTION_ENABLED: 'false'/);assert.match(workflow,/NEXOPS_AI_EMERGENCY_STOP: 'true'/);
 assert.doesNotMatch(workflow,/pull_request_target|schedule:|issues: write|contents: write/);
});

import {mkdtempSync,writeFileSync,readFileSync as read,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import{fileURLToPath}from'node:url';
function runDispatch({missingLabel=false,denied=false,authorRole="write",eventName="workflow_dispatch",edited=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'nexops-dispatch-'));
 try{
  const issue={number:23,user:{login:'requester'},state:'open',labels:missingLabel?[]:[{name:'nexops:run-requested'}],body:'```nexops-task\n'+JSON.stringify({schema_version:1,department:'IT',action:'code-audit',objective:'PRIVATE_OBJECTIVE_DO_NOT_LOG',dry_run:true})+'\n```'};
  const preload=join(dir,'mock.mjs');
  writeFileSync(preload,'globalThis.fetch=async(url)=>({ok:'+(!denied)+',json:async()=>url.includes("/issues/")?'+JSON.stringify(issue)+':{permission:url.includes("/collaborators/requester/")?'+JSON.stringify(authorRole)+':"write"}});');
  const event=join(dir,'event.json'),receipt=join(dir,'receipt.json');writeFileSync(event,JSON.stringify({inputs:{issue_number:'23'},action:'labeled',label:{name:'nexops:run-requested'},issue:{...issue,body:edited?'previous Issue body':issue.body}}));
  const child=spawnSync(process.execPath,['--import',preload,fileURLToPath(new URL('../scripts/nexops-issue-dispatch.mjs',import.meta.url))],{encoding:'utf8',timeout:10000,env:{...process.env,GITHUB_ACTIONS:'true',GITHUB_EVENT_PATH:event,GITHUB_EVENT_NAME:eventName,GITHUB_REPOSITORY:'stockwise5535/stockwise-app',GITHUB_ACTOR:'operator',GITHUB_TOKEN:'PRIVATE_SYNTHETIC_TOKEN',NEXOPS_AI_EMERGENCY_STOP:'true',NEXOPS_RECEIPT_PATH:receipt,GITHUB_STEP_SUMMARY:join(dir,'summary.md')}});
  assert.equal(child.status,0);assert.ok(!child.stdout.includes('PRIVATE_'));assert.ok(!child.stderr.includes('PRIVATE_'));
  return{receipt:JSON.parse(read(receipt,'utf8')),stdout:child.stdout};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('live dispatcher writes a safe stopped receipt and observable fixed annotation',()=>{
 const result=runDispatch();assert.equal(result.receipt.reason,'EMERGENCY_STOP');assert.equal(result.receipt.executionAllowed,false);
 assert.match(result.stdout,/::notice title=NexOps dry-run receipt::status=BLOCKED;reason=EMERGENCY_STOP;executionAllowed=false/);
});
test('missing opt-in and denied GitHub reads remain explicit non-executing results',()=>{
 assert.equal(runDispatch({missingLabel:true}).receipt.reason,'LABEL_MISSING');
 assert.equal(runDispatch({denied:true}).receipt.reason,'READ_OR_VALIDATION_FAILED');
});

test('dispatcher refuses an unprivileged author despite a privileged actor',()=>assert.equal(runDispatch({authorRole:'read'}).receipt.reason,'UNAUTHORIZED_AUTHOR'));
test('dispatcher refuses Issue body edited between label event and fetch',()=>assert.equal(runDispatch({eventName:'issues',edited:true}).receipt.reason,'ISSUE_CHANGED_SINCE_EVENT'));
