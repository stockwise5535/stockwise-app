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
