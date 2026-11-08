import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function world() {
 const properties=new Map(),tables={Settings:[{key:'SENDER_NAME',value:'NexOps'},{key:'SENDER_COMPANY',value:'NexOps'},
  {key:'SENDER_ADDRESS',value:'Verified test postal address'},{key:'LEGAL_REVIEW_COMPLETED',value:'TRUE'},{key:'LIVE_SENDING',value:'FALSE'},{key:'FOLLOW_UP_ENABLED',value:'FALSE'}],
  Leads:[{lead_id:'L1',company:'Company',contact_email:'contact@company.example',country:'JP',contact_basis:'EXPRESS_CONSENT'}],EmailQueue:[],ActivityLog:[],Suppression:[]};
 const ctx={console,Logger:{log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  SpreadsheetApp:{getUi:()=>({ButtonSet:{YES_NO:'YES_NO'},Button:{YES:'YES'},alert:()=> 'YES'})},
  GmailApp:new Proxy({},{get(){throw Error('NO_EMAIL_DURING_ARM_OR_REPORT');}}),
  Utilities:{formatDate:()=>new Date().toISOString().slice(0,10)},Session:{getScriptTimeZone:()=> 'Asia/Tokyo'}};
 vm.createContext(ctx);
 for(const file of ['Core.js','Engine.js','Main.js'])vm.runInContext(readFileSync(new URL('../apps-script/sales-crm/'+file,import.meta.url),'utf8'),ctx);
 const store={rows:t=>tables[t].map((r,i)=>({...r,_row:i+2})),append:(t,row)=>tables[t].push(row),update:(t,row,p)=>Object.assign(tables[t][row-2],p)};
 ctx.sheetsStore_=()=>store;
 const settings=ctx.SalesCore.settingsFrom(tables.Settings),mail=ctx.SalesCore.buildEmail(tables.Leads[0],settings,1);
 const q={queue_id:'Q1',lead_id:'L1',step:1,send_key:'L1#1',to_email:tables.Leads[0].contact_email,subject:mail.subject,body:mail.body,
  status:'QUEUED',approval_status:'APPROVED',approved_by:'reviewer',approved_hash:ctx.SalesCore.contentHash(mail.subject,mail.body,tables.Leads[0].contact_email)};
 tables.EmailQueue.push(q);
 const deps={store,now:()=>new Date(),localParts:()=>({day:new Date().toISOString().slice(0,10),hour:10,dow:3}),safety:ctx.sendController_()};
 ctx.deps_=()=>deps;
 properties.set('STOCKWISE_SALES_PILOT_QUEUE_IDS',JSON.stringify(['Q1']));
 properties.set('STOCKWISE_SALES_LAUNCH_REVIEW',JSON.stringify({senderAddressVerified:true,unsubscribeTestVerified:true,reviewedAt:new Date().toISOString(),reviewedBy:'owner',evidenceReference:'review record',countries:{JP:['EXPRESS_CONSENT']}}));
 return {ctx,properties,tables,q,deps};
}
test('source delivery starts unarmed regardless of legacy LIVE switch and owner can stop immediately',()=>{
 const w=world();assert.equal(w.deps.safety.isStopped(),true);
 w.ctx.armReviewedSalesPilot();assert.equal(w.deps.safety.isStopped(),false);
 w.ctx.stopSalesSending();assert.equal(w.deps.safety.isStopped(),true);
});
test('pilot uses exact approved snapshot, preserves all legacy switches and rejects other queues',()=>{
 const w=world(),before=JSON.stringify(w.tables.Settings);assert.equal(w.ctx.armReviewedSalesPilot().count,1);
 assert.equal(JSON.stringify(w.tables.Settings),before);assert.equal(w.deps.safety.isAllowed(w.q),true);
 assert.equal(w.deps.safety.isAllowed({...w.q,queue_id:'other'}),false);
 assert.equal(w.deps.safety.isAllowed({...w.q,body:w.q.body+' edit'}),false);
});
test('country review, opt-out verification, maximum three and unresolved send all fail closed',()=>{
 for(const update of [
  w=>w.properties.delete('STOCKWISE_SALES_LAUNCH_REVIEW'),
  w=>w.properties.set('STOCKWISE_SALES_PILOT_QUEUE_IDS',JSON.stringify(['Q1','Q2','Q3','Q4'])),
  w=>w.tables.EmailQueue.push({status:'SENDING'}),
  w=>w.tables.Leads[0].country='SG',
  w=>w.q.approved_hash='changed',
 ]) {const w=world();update(w);assert.throws(()=>w.ctx.armReviewedSalesPilot());assert.equal(w.deps.safety.isStopped(),true);}
});
test('recurring requires explicit actual-delivery verification plus successful pilot receipts',()=>{
 const w=world();w.ctx.armReviewedSalesPilot();assert.throws(()=>w.ctx.armReviewedRecurringSales(),/VERIFICATION/);
 w.q.status='SENT';w.q.gmail_message_id='message';w.q.gmail_thread_id='thread';
 assert.throws(()=>w.ctx.armReviewedRecurringSales(),/VERIFICATION/);
 w.properties.set('STOCKWISE_SALES_PILOT_DELIVERY_VERIFIED','true');
 assert.equal(w.ctx.armReviewedRecurringSales().mode,'recurring');
 assert.equal(w.tables.Settings.find(r=>r.key==='LIVE_SENDING').value,'FALSE');
});
test('stop notification defaults to execution log; daily summary is idempotent and contains no personal data',()=>{
 const w=world();w.deps.safety.stop('SEND_FAILED_OR_UNKNOWN');assert.equal(w.deps.safety.isStopped(),true);
 const summary=w.ctx.runDailySalesReport();assert.equal(summary.sent,0);
 assert.equal(w.ctx.runDailySalesReport().skipped,'ALREADY_REPORTED_OR_ATTEMPTED');
 assert.equal(w.tables.ActivityLog.filter(r=>r.event==='DAILY_SUMMARY').length,1);
 assert.ok(!JSON.stringify(summary).includes('contact@'));assert.equal(w.tables.Settings.find(r=>r.key==='FOLLOW_UP_ENABLED').value,'FALSE');
});
