import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),Core=require('../apps-script/sales-crm/Core.js');
const source=readFileSync(new URL('../apps-script/sales-crm/Main.js',import.meta.url),'utf8');
const TEST_ID='12uDNmpfEANnzzTRoT6eyjmlNg1wj2B9f6BUPWH9X3pk';
function world(settings,options={}){
 const writes=[],opened=[],sheets=new Map();let released=0;
 function sheet(name,initial=[]){
  const rows=initial.map(r=>[...r]),formulas=new Map();
  const s={name,rows,formulas,getLastColumn:()=>Math.max(0,...rows.map(r=>r.length)),getLastRow:()=>rows.length,
   getRange(r,c,nr=1,nc=1){const range={
    getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>rows[r+i-1]?.[c+j-1]??'')),
    getFormulas:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>formulas.get((r+i)+':'+(c+j))||'')),
    getValue:()=>rows[r-1]?.[c-1]??'',
    setValue(v){while(rows.length<r)rows.push([]);rows[r-1][c-1]=v;writes.push({sheet:name,row:r,col:c,value:v});return range;},
    setFormulas(matrix){matrix.forEach((row,i)=>row.forEach((v,j)=>s.getRange(r+i,c+j).setValue(v)));return range;},
    setFontWeight:()=>range,setNumberFormat:()=>range,setDataValidation:()=>range};return range;},
   getDataRange:()=>s.getRange(1,1,Math.max(rows.length,1),Math.max(s.getLastColumn(),1)),
   appendRow(row){rows.push([...row]);writes.push({sheet:name,append:[...row]});},
   setFrozenRows(){},clear(){rows.length=0;formulas.clear();},autoResizeColumn(){}};
  sheets.set(name,s);return s;
 }
 if(settings!==null)sheet('Settings',[['key','value','description'],...(settings||[])]);
 const ss={getId:()=>options.activeId||TEST_ID,getSheetByName:n=>sheets.get(n)||null,insertSheet:n=>sheet(n),toast(){}};
 const ctx={SalesCore:Core,SalesEngine:require('../apps-script/sales-crm/Engine.js'),SpreadsheetApp:{getActiveSpreadsheet:()=>options.noActive?null:ss,
  openById(id){opened.push(id);if(id!==TEST_ID)throw Error('PRODUCTION_OPEN_FORBIDDEN');return ss;},
  newDataValidation:()=>({requireValueInList(){return this;},build(){return {};}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:()=>options.configuredId||null})},
 LockService:{getScriptLock:()=>({tryLock:()=>!options.locked,releaseLock(){released++;}})},
 GmailApp:new Proxy({},{get(){throw Error('MAIL_FORBIDDEN');}}),
 ScriptApp:new Proxy({},{get(){throw Error('TRIGGER_MUTATION_FORBIDDEN');}}),
 Logger:{log(){}},Date};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,sheets,writes,opened,ss,sheet,get released(){return released;}};
}
const value=(w,key)=>w.sheets.get('Settings').rows.find(r=>r[0].trim()===key)?.[1];
test('new setup defaults name/company to NexOps while address and safe switch defaults stay unchanged',()=>{
 const w=world(null);w.ctx.setupSheets();assert.equal(value(w,'SENDER_NAME'),'NexOps');assert.equal(value(w,'SENDER_COMPANY'),'NexOps');
 assert.equal(value(w,'SENDER_ADDRESS'),'');assert.equal(value(w,'LIVE_SENDING'),'false');assert.equal(value(w,'FOLLOW_UP_ENABLED'),'false');assert.equal(w.released,1);
 assert.equal(Core.DEFAULT_SETTINGS.SENDER_ADDRESS[0],'');
});
test('setup fills only empty sender cells, preserves existing values/descriptions and is repeatable',()=>{
 const w=world([['SENDER_NAME','Existing Sender','keep name note'],['SENDER_COMPANY','','keep company note'],['SENDER_ADDRESS','Existing address','keep'],['LIVE_SENDING','TRUE','keep'],['FOLLOW_UP_ENABLED','TRUE','keep']]);
 w.ctx.setupSheets();assert.equal(value(w,'SENDER_NAME'),'Existing Sender');assert.equal(value(w,'SENDER_COMPANY'),'NexOps');assert.equal(value(w,'SENDER_ADDRESS'),'Existing address');
 assert.equal(value(w,'LIVE_SENDING'),'TRUE');assert.equal(value(w,'FOLLOW_UP_ENABLED'),'TRUE');assert.equal(w.sheets.get('Settings').rows[2][2],'keep company note');
 const snapshot=JSON.stringify(w.sheets.get('Settings').rows);w.ctx.setupSheets();assert.equal(JSON.stringify(w.sheets.get('Settings').rows),snapshot);
});
test('TEST-only function fills missing/blank sender keys without touching other sheets, address, switches, Gmail or triggers',()=>{
 const w=world([['SENDER_NAME','','original description'],['SENDER_ADDRESS','','keep'],['LIVE_SENDING','TRUE','keep'],['FOLLOW_UP_ENABLED','FALSE','keep'],['OTHER','custom','keep']]);
 const leads=w.sheet('Leads',[['existing'],['unchanged']]);const q=w.sheet('EmailQueue',[['existing'],['unchanged']]);
 const result=JSON.parse(JSON.stringify(w.ctx.applyNexOpsSenderDefaultsToTestCrm()));assert.deepEqual(result,{added:['SENDER_COMPANY'],filled:['SENDER_NAME']});
 assert.equal(value(w,'SENDER_NAME'),'NexOps');assert.equal(value(w,'SENDER_COMPANY'),'NexOps');assert.equal(value(w,'SENDER_ADDRESS'),'');assert.equal(value(w,'LIVE_SENDING'),'TRUE');assert.equal(value(w,'FOLLOW_UP_ENABLED'),'FALSE');
 assert.deepEqual(leads.rows,[['existing'],['unchanged']]);assert.deepEqual(q.rows,[['existing'],['unchanged']]);assert.ok(w.writes.every(x=>x.sheet==='Settings'));assert.equal(w.opened.length,0);
 const before=JSON.stringify(w.sheets.get('Settings').rows);const writes=w.writes.length;w.ctx.applyNexOpsSenderDefaultsToTestCrm();assert.equal(JSON.stringify(w.sheets.get('Settings').rows),before);assert.equal(w.writes.length,writes);
});
test('existing sender values including formulas, whitespace, zero and false are never overwritten',()=>{
 for(const v of ['Custom name','   ',0,false]){
  const w=world([['SENDER_NAME',v,'keep'],['SENDER_COMPANY','Custom Co','keep']]);w.ctx.applyNexOpsSenderDefaultsToTestCrm();assert.equal(value(w,'SENDER_NAME'),v);assert.equal(value(w,'SENDER_COMPANY'),'Custom Co');assert.equal(w.writes.length,0);
 }
 const w=world([['SENDER_NAME','','formula'],['SENDER_COMPANY','','formula']]);w.sheets.get('Settings').formulas.set('2:2','=""');w.sheets.get('Settings').formulas.set('3:2','=""');w.ctx.applyNexOpsSenderDefaultsToTestCrm();assert.equal(w.writes.length,0);
});
test('missing address and switch rows are not added by the TEST-only function',()=>{
 const w=world([]);w.ctx.applyNexOpsSenderDefaultsToTestCrm();assert.deepEqual(w.sheets.get('Settings').rows.map(r=>r[0]),['key','SENDER_NAME','SENDER_COMPANY']);
});
test('production binding/configuration or missing active sheet fails before any write/open',()=>{
 for(const options of [{activeId:'PRODUCTION_CRM'},{configuredId:'PRODUCTION_CRM'},{activeId:'OTHER_TEST'},{noActive:true}]){
  const w=world([],options);assert.throws(()=>w.ctx.applyNexOpsSenderDefaultsToTestCrm(),/TEST_CRM_ONLY/);assert.equal(w.writes.length,0);assert.equal(w.opened.length,0);assert.equal(w.released,1);
 }
 const w=world([],{configuredId:TEST_ID});w.ctx.applyNexOpsSenderDefaultsToTestCrm();assert.equal(value(w,'SENDER_NAME'),'NexOps');
});
test('incompatible/missing settings and duplicate sender keys fail without partial Settings changes',()=>{
 const missing=world(null);assert.throws(()=>missing.ctx.applyNexOpsSenderDefaultsToTestCrm(),/SETTINGS_SHEET_MISSING/);assert.equal(missing.writes.length,0);
 const bad=world([]);bad.sheets.get('Settings').rows[0]=['Key','Value','Description'];assert.throws(()=>bad.ctx.applyNexOpsSenderDefaultsToTestCrm(),/INCOMPATIBLE_SETTINGS_SCHEMA/);assert.equal(bad.writes.length,0);
 const dup=world([['SENDER_NAME','','keep'],[' SENDER_NAME ','Existing name','keep']]);assert.throws(()=>dup.ctx.applyNexOpsSenderDefaultsToTestCrm(),/DUPLICATE_SENDER_SETTING/);assert.equal(dup.writes.length,0);
});
test('TEST function respects the shared script lock and does not mutate when another job is active',()=>{
 const w=world([],{locked:true});const r=w.ctx.applyNexOpsSenderDefaultsToTestCrm();assert.equal(r.skipped,'LOCKED');assert.equal(w.writes.length,0);
});

test('launch-prep identity alias remains TEST-only and preserves existing settings',()=>{
 const w=world([['SENDER_NAME','Existing name',''],['SENDER_COMPANY','Existing company',''],['SENDER_ADDRESS','',''],['LIVE_SENDING','FALSE',''],['FOLLOW_UP_ENABLED','FALSE','']]);
 w.ctx.setSenderIdentityNexOps();assert.equal(w.writes.length,0);
 const p=world([],{activeId:'production'});assert.throws(()=>p.ctx.setSenderIdentityNexOps(),/TEST_CRM_ONLY/);assert.equal(p.writes.length,0);
});
test('deployment verification reads settings without touching CRM, Gmail or triggers',()=>{
 const w=world([['LIVE_SENDING','FALSE',''],['FOLLOW_UP_ENABLED',false,'']]);
 const result=w.ctx.verifyTestCrmDeployment();assert.equal(result.modulesLoaded,true);assert.equal(result.liveSendingOff,true);assert.equal(result.followUpOff,true);
 assert.equal(w.writes.length,0);assert.deepEqual(w.opened,[]);
 const unsafe=world([['LIVE_SENDING','TRUE',''],['FOLLOW_UP_ENABLED','FALSE','']]);assert.equal(unsafe.ctx.verifyTestCrmDeployment().liveSendingOff,false);assert.equal(unsafe.writes.length,0);
 const duplicate=world([['LIVE_SENDING','FALSE',''],['LIVE_SENDING','FALSE','']]);assert.equal(duplicate.ctx.verifyTestCrmDeployment().liveSendingOff,false);
});
test('optional lead headers accept exact legacy prefix and reject incompatible schemas',()=>{
 const w=world([]),headers=[...Core.TABLES.Leads];
 assert.equal(w.ctx.compatibleHeaders_('Leads',headers.slice(0,-2)),true);
 assert.equal(w.ctx.compatibleHeaders_('Leads',headers.slice(0,-1)),true);
 assert.equal(w.ctx.compatibleHeaders_('Leads',headers.slice(0,-3)),false);
 assert.equal(w.ctx.compatibleHeaders_('Leads',['Company',...headers.slice(1)]),false);
 assert.equal(w.ctx.compatibleHeaders_('Leads',[...headers.slice(0,-2),'unexpected']),false);
});
test('personal opening is used in first drafts only without changing default identity or safety flags',()=>{
 const settings=Core.settingsFrom([]);
 for(const language of ['ja','en']){
  const lead={company:'Sample',language,contact_basis:'INBOUND_REQUEST',custom_opening:'Reviewed personal opening'};
  assert.match(Core.buildEmail(lead,settings,1).body,/Reviewed personal opening/);
  assert.doesNotMatch(Core.buildEmail(lead,settings,2).body,/Reviewed personal opening/);
 }
 assert.equal(Core.DEFAULT_SETTINGS.SENDER_ADDRESS[0],'');
 assert.equal(Core.isTrue(Core.DEFAULT_SETTINGS.LIVE_SENDING[0]),false);
 assert.equal(Core.isTrue(Core.DEFAULT_SETTINGS.FOLLOW_UP_ENABLED[0]),false);
});
test('manual setup can extend legacy Leads headers without modifying existing lead data',()=>{
 const w=world([['SENDER_NAME','Owner',''],['SENDER_COMPANY','Company',''],['SENDER_ADDRESS','',''],['LIVE_SENDING','FALSE',''],['FOLLOW_UP_ENABLED','FALSE','']]);
 const oldHeaders=[...Core.TABLES.Leads].slice(0,-2),lead=oldHeaders.map((_,i)=>i===0?'existing-lead':'');
 w.sheet('Leads',[oldHeaders,lead]);w.ctx.setupSheets();
 assert.deepEqual(w.sheets.get('Leads').rows[1],lead);
 assert.deepEqual(w.sheets.get('Leads').rows[0],[...Core.TABLES.Leads]);
 assert.equal(value(w,'SENDER_NAME'),'Owner');assert.equal(value(w,'SENDER_ADDRESS'),'');assert.equal(value(w,'LIVE_SENDING'),'FALSE');assert.equal(value(w,'FOLLOW_UP_ENABLED'),'FALSE');
});
test('initialization is TEST-only and initializes missing gates OFF without Gmail or triggers',()=>{
 const w=world(null);const result=w.ctx.initializeAndVerifyTestCrm();
 assert.equal(result.modulesLoaded,true);assert.equal(result.liveSendingOff,true);assert.equal(result.followUpOff,true);assert.equal(result.legalReviewOff,true);
 assert.equal(value(w,'SENDER_ADDRESS'),'');
 const p=world(null,{activeId:'production'});assert.throws(()=>p.ctx.initializeAndVerifyTestCrm(),/TEST_CRM_ONLY/);assert.equal(p.writes.length,0);
 const configured=world(null,{configuredId:'production'});assert.throws(()=>configured.ctx.initializeAndVerifyTestCrm(),/TEST_CRM_ONLY/);assert.equal(configured.writes.length,0);
});
test('all legacy tables and dashboard are checked before the first initial setup write',()=>{
 for(const name of ['Settings','Dashboard']){
  const w=world(null);w.sheet(name,[['Legacy schema','keep'],['existing','data']]);
  assert.throws(()=>w.ctx.initializeAndVerifyTestCrm(),/INCOMPATIBLE/);
  assert.equal(w.writes.length,0);assert.equal(w.sheets.has('Leads'),false);
 }
});
