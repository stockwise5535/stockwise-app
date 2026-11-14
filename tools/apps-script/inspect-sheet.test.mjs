import test from 'node:test';import assert from 'node:assert/strict';import {inspectTestSheet} from './inspect-sheet.mjs';
test('read-only CRM check returns layout/count/gate state without private cell values',async()=>{
 const calls=[],privateEmail='private-person@example.test';
 const api={spreadsheets:{get:async(params)=>{calls.push(params);return{data:{sheets:[{properties:{title:'Leads'}},{properties:{title:'Settings'}}]}};},values:{get:async(params)=>{calls.push(params);return{data:{values:params.range.startsWith('Leads')?[['company','contact_email'],['Private Company',privateEmail]]:[['key','value','description'],['LIVE_SENDING','FALSE','secret description'],['FOLLOW_UP_ENABLED','FALSE'],['LEGAL_REVIEW_COMPLETED','FALSE']]}};}}}};
 const r=await inspectTestSheet(api,'fixed-test-id',['company','contact_email']);assert.equal(r.columns,2);assert.equal(r.companyRowsWithinReadLimit,1);assert.equal(r.gates.LIVE_SENDING,'OFF');assert.ok(!JSON.stringify(r).includes(privateEmail));assert.ok(!JSON.stringify(r).includes('Private Company'));assert.equal(calls.length,3);
});
test('permission failures are classified without returning SDK messages or URLs',async()=>{
 const api={spreadsheets:{get:async()=>{throw{response:{status:403},message:'private credentials'};}}};
 assert.deepEqual(await inspectTestSheet(api,'test',[]),{access:'not_confirmed',httpStatus:403});
});
