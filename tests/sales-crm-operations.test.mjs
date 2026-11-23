import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function world() {
 const properties=new Map(),tables={Settings:[{key:'SENDER_NAME',value:'NexOps'},{key:'SENDER_COMPANY',value:'NexOps'},
  {key:'SENDER_ADDRESS',value:'Verified test postal address'},{key:'LEGAL_REVIEW_COMPLETED',value:'TRUE'},{key:'LIVE_SENDING',value:'FALSE'},{key:'FOLLOW_UP_ENABLED',value:'FALSE'}],
  Leads:[{lead_id:'L1',company:'Company',contact_email:'contact@company.example',country:'JP',contact_basis:'EXPRESS_CONSENT'}],EmailQueue:[],ActivityLog:[],Suppression:[]};
 const ctx={console,Logger:{log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.has(k)?properties.get(k):null,setProperty:(k,v)=>properties.set(k,v),getProperties:()=>Object.fromEntries(properties)})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})},
  SpreadsheetApp:{getUi:()=>({ButtonSet:{YES_NO:'YES_NO'},Button:{YES:'YES'},alert:()=> 'YES'})},
  GmailApp:new Proxy({},{get(){throw Error('NO_EMAIL_DURING_ARM_OR_REPORT');}}),
  Utilities:{formatDate:()=>new Date().toISOString().slice(0,10)},Session:{getScriptTimeZone:()=> 'Asia/Tokyo',getEffectiveUser:()=>({getEmail:()=> 'owner@stockwise.test'})}};
 vm.createContext(ctx);
 for(const file of ['Core.js','Engine.js','Main.js'])vm.runInContext(readFileSync(new URL('../apps-script/sales-crm/'+file,import.meta.url),'utf8'),ctx);
 // Controller unit fixtures run inside an explicitly held invocation scope.
 ctx.SALES_ACTIVE_LOCK_=ctx.LockService.getScriptLock();
 const store={rows:t=>tables[t].map((r,i)=>({...r,_row:i+2})),append:(t,row)=>tables[t].push(row),update:(t,row,p)=>Object.assign(tables[t][row-2],p)};
 ctx.sheetsStore_=()=>store;
 const settings=ctx.SalesCore.settingsFrom(tables.Settings),mail=ctx.SalesCore.buildEmail(tables.Leads[0],settings,1);
 const q={queue_id:'Q1',lead_id:'L1',step:1,send_key:'L1#1',to_email:tables.Leads[0].contact_email,subject:mail.subject,body:mail.body,
  status:'QUEUED',approval_status:'APPROVED',approved_by:'reviewer',approved_hash:ctx.SalesCore.contentHash(mail.subject,mail.body,tables.Leads[0].contact_email)};
 tables.EmailQueue.push(q);
 const deps={store,now:()=>new Date(),localParts:()=>({day:new Date().toISOString().slice(0,10),hour:10,dow:3}),safety:ctx.sendController_()};
 ctx.deps_=()=>deps;
 properties.set('STOCKWISE_SALES_SHARED_BUDGET_REVIEWED','true');
 properties.set('STOCKWISE_SALES_EXPECTED_FROM','owner@stockwise.test');
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


test('sender identity is pinned and a different executing user cannot arm or send',()=>{
 const w=world();w.ctx.armReviewedSalesPilot();
 w.ctx.Session.getEffectiveUser=()=>({getEmail:()=> 'different@stockwise.test'});
 assert.equal(w.deps.safety.isAllowed(w.q),false);assert.equal(w.deps.safety.isStopped(),true);assert.throws(()=>w.ctx.armReviewedSalesPilot());
});
test('durable send intent survives an untouched Sheet and blocks automatic rearming',()=>{
 const w=world();w.ctx.armReviewedSalesPilot();w.deps.safety.reserveSend(w.q,{day:new Date().toISOString().slice(0,10),dailyLimit:100,sentToday:0});
 assert.equal(w.deps.safety.isStopped(),true);assert.throws(()=>w.deps.safety.reserveSend(w.q,{day:new Date().toISOString().slice(0,10),dailyLimit:100,sentToday:0}));assert.throws(()=>w.ctx.armReviewedSalesPilot());
});


test('Gmail daily budget counts real sender messages and stops at the hard cap',()=>{
 const w=world(),now=new Date('2026-11-23T18:00:00Z');
 w.ctx.Session.getScriptTimeZone=()=> 'America/Los_Angeles';
 w.ctx.Utilities.parseDate=()=>new Date('2026-11-23T08:00:00Z');
 w.ctx.Utilities.formatDate=d=>new Date(new Date(d).getTime()-8*3600000).toISOString().slice(0,10);
 const message=(i,from='owner@stockwise.test')=>({getId:()=>String(i),getFrom:()=>from,getDate:()=>now,getSubject:()=>'<ADV> Try StockWise free'});
 const messages=[message('other','other@example.test'),...Array.from({length:102},(_,i)=>message(i))];
 w.ctx.GmailApp={search:query=>{assert.match(query,/^in:sent after:/);return[{getMessages:()=>messages}];}};
 assert.equal(w.ctx.gmailAdapter_().sentToday(now),100);
});


test('daily receipts merge disjoint Gmail and CRM sends, include bounces and deduplicate message IDs',()=>{
 const w=world(),now=new Date('2026-11-23T18:00:00Z');
 w.ctx.Utilities.parseDate=()=>new Date('2026-11-23T08:00:00Z');
 w.ctx.Utilities.formatDate=d=>new Date(new Date(d).getTime()-8*3600000).toISOString().slice(0,10);
 const message=(id,subject='StockWise',body='')=>({getId:()=>id,getFrom:()=> 'owner@stockwise.test',getDate:()=>now,getSubject:()=>subject,getPlainBody:()=>body});
 w.ctx.GmailApp={search:()=>[{getMessages:()=>[message('matched'),message('gmail-only'),message('body-only','Free trial','https://stockwise-homepage.vercel.app'),message('old-brand-only','在庫管理のご案内','Stockwiseをご紹介します。')]}]};
 const queue=[{status:'SENT',sent_at:now.toISOString(),gmail_message_id:'matched'},
  {status:'BOUNCED',sent_at:now.toISOString(),gmail_message_id:'crm-only'},
  {status:'SENT',sent_at:now.toISOString(),gmail_message_id:'matched'},
  {status:'SENT',sent_at:now.toISOString()},
  {status:'SENT',sent_at:'2026-11-22T18:00:00Z',gmail_message_id:'yesterday'}];
 assert.equal(w.ctx.gmailAdapter_().sentToday(now,queue),6);
 assert.throws(()=>w.ctx.gmailAdapter_().sentToday(now,[{status:'SENT'}]),/CRM_SENT_DATE_UNCONFIRMED/);
 for(const row of [{status:'BOUNCED'},{status:'READY',gmail_message_id:'unconfirmed'},{status:'FAILED',gmail_thread_id:'unconfirmed'}])assert.throws(()=>w.ctx.gmailAdapter_().sentToday(now,[row]),/CRM_SENT_DATE_UNCONFIRMED/);
 assert.throws(()=>w.ctx.gmailAdapter_().sentToday(now,[{status:'BOUNCED',sent_at:'invalid'}]),/CRM_SENT_DATE_UNCONFIRMED/);
});
test('daily receipt scan pages past threads that only have older matching mail',()=>{
 const w=world(),now=new Date('2026-11-23T18:00:00Z'),offsets=[];
 w.ctx.Utilities.parseDate=()=>new Date('2026-11-23T08:00:00Z');
 w.ctx.Utilities.formatDate=d=>new Date(new Date(d).getTime()-8*3600000).toISOString().slice(0,10);
 const message=(id,date)=>({getId:()=>id,getFrom:()=> 'owner@stockwise.test',getDate:()=>date,getSubject:()=> 'StockWise'});
 w.ctx.GmailApp={search:(query,offset)=>{offsets.push(offset);return offset===0?Array.from({length:100},(_,i)=>({getMessages:()=>[message('old'+i,new Date('2026-11-22T18:00:00Z'))]})):[{getMessages:()=>[message('today',now)]}];}};
 assert.equal(w.ctx.gmailAdapter_().sentToday(now,[]),1);assert.deepEqual(offsets,[0,100]);
});

test('Gmail acknowledgement verifies actual sent identity and content without a second send',()=>{
 for(const wrong of [false,true]){
  const w=world();let sends=0;w.ctx.GmailApp={createDraft:(to,subject,body)=>({send:()=>{sends++;return{getFrom:()=> 'Existing Name <owner@stockwise.test>',getTo:()=>to,getSubject:()=>subject,getPlainBody:()=>wrong?'changed body':body+'\n',getId:()=> 'message-id',getThread:()=>({getId:()=> 'thread-id'})};}})};
  const run=()=>w.ctx.gmailAdapter_().send({to:'contact@company.example',subject:'Reviewed subject',body:'Reviewed body'});
  if(wrong)assert.throws(run,/CONTENT_UNCONFIRMED/);else assert.equal(run().messageId,'message-id');assert.equal(sends,1);
 }
});


test('all routes must be coordinated before any pilot can be armed',()=>{
 const w=world();w.properties.delete('STOCKWISE_SALES_SHARED_BUDGET_REVIEWED');
 assert.equal(w.deps.safety.isStopped(),true);assert.throws(()=>w.ctx.armReviewedSalesPilot(),/ALL_SENDING_ROUTES/);
});
test('a caller outside the common ScriptLock cannot reserve capacity or finalize a send',()=>{
 const w=world();w.ctx.armReviewedSalesPilot();
 w.ctx.SALES_ACTIVE_LOCK_=null;
 assert.throws(()=>w.deps.safety.reserveSend(w.q,{day:new Date().toISOString().slice(0,10),dailyLimit:100,sentToday:0}),/SHARED_SEND_LOCK_REQUIRED/);
 assert.throws(()=>w.deps.safety.completeSend(w.q,{messageId:'M',threadId:'T'}),/SHARED_SEND_LOCK_REQUIRED/);
 assert.equal(w.properties.has('STOCKWISE_SALES_SHARED_DAY_BUDGET'),false);
});
test('the coordinator checks the exact acquired lock instance and clears it after the invocation',()=>{
 const w=world();w.ctx.armReviewedSalesPilot();w.ctx.SALES_ACTIVE_LOCK_=null;
 let releases=0;w.ctx.LockService.getScriptLock=()=>{let held=false;return{tryLock:()=>{held=true;return true;},hasLock:()=>held,releaseLock:()=>{held=false;releases++;}};};
 w.ctx.locked_(()=>w.deps.safety.reserveSend(w.q,{day:new Date().toISOString().slice(0,10),dailyLimit:100,sentToday:0}));
 assert.equal(releases,1);assert.equal(w.ctx.SALES_ACTIVE_LOCK_,null);
 assert.throws(()=>w.deps.safety.completeSend(w.q,{messageId:'M',threadId:'T'}),/SHARED_SEND_LOCK_REQUIRED/);
 w.ctx.locked_(()=>w.deps.safety.completeSend(w.q,{messageId:'M',threadId:'T'}));
 assert.equal(releases,2);assert.equal(w.ctx.SALES_ACTIVE_LOCK_,null);
});
test('serialized route callers share one durable 100-slot day budget despite lagging Gmail counts',()=>{
 const w=world();w.ctx.armReviewedSalesPilot();const grant=JSON.parse(w.properties.get('STOCKWISE_SALES_SEND_GRANT'));grant.mode='recurring';w.properties.set('STOCKWISE_SALES_SEND_GRANT',JSON.stringify(grant));
 const a=w.ctx.sendController_(),b=w.ctx.sendController_(),day=new Date().toISOString().slice(0,10),budget={day,dailyLimit:100,sentToday:0};
 for(let i=0;i<100;i++){
  const q={...w.q,queue_id:'Q'+i,to_email:'contact'+i+'@company.example'};const caller=i%2?a:b;
  caller.reserveSend(q,budget);caller.completeSend(q,{messageId:'M'+i,threadId:'T'+i});
 }
 const q={...w.q,queue_id:'OVER',to_email:'overflow@company.example'};
 assert.throws(()=>b.reserveSend(q,budget),/SHARED_DAILY_LIMIT_REACHED/);
 assert.equal(JSON.parse(w.properties.get('STOCKWISE_SALES_SHARED_DAY_BUDGET')).used,100);
});
test('pre-existing sends reduce the shared budget and the pilot still accepts at most three IDs',()=>{
 const w=world();w.ctx.armReviewedSalesPilot();const budget={day:new Date().toISOString().slice(0,10),dailyLimit:100,sentToday:99};
 w.deps.safety.reserveSend(w.q,budget);w.deps.safety.completeSend(w.q,{messageId:'M',threadId:'T'});
 assert.equal(JSON.parse(w.properties.get('STOCKWISE_SALES_SHARED_DAY_BUDGET')).used,100);
 w.properties.set('STOCKWISE_SALES_PILOT_QUEUE_IDS',JSON.stringify(['1','2','3','4']));assert.throws(()=>w.ctx.armReviewedSalesPilot(),/1_TO_3/);
});


test('malformed shared budget cannot silently reset capacity',()=>{
 for(const raw of ['{invalid','',JSON.stringify({day:'2099-01-01',used:0,ceiling:100}),JSON.stringify({day:'2000-02-31',used:0,ceiling:100})]){
  const w=world();w.ctx.armReviewedSalesPilot();w.properties.set('STOCKWISE_SALES_SHARED_DAY_BUDGET',raw);
  assert.throws(()=>w.deps.safety.reserveSend(w.q,{day:new Date().toISOString().slice(0,10),dailyLimit:100,sentToday:0}),/SHARED_DAILY_BUDGET_INVALID/);
  assert.equal(w.properties.get('STOCKWISE_SALES_SHARED_DAY_BUDGET'),raw);
 }
});
