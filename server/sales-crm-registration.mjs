// Append-only registration. No mail/queue APIs, arbitrary targets or scheduler control.
import{createRequire}from'node:module';import{createHash}from'node:crypto';
import{TEST_CRM_ID}from'./sales-test-crm-import.mjs';
const Core=createRequire(import.meta.url)('../apps-script/sales-crm/Core.js');
export const PRODUCTION_CRM_ID='1kFsOxMgepkR1G6RPUXeoY3j5KTtl__82cB8VgaLEBdg';
export const DAILY_REGISTRATION_LIMIT=1;
const KEY='stockwiseResearchClaim',SLOT='stockwiseResearchDay';
export const LEGACY_HEADERS=['Lead ID','Company','Country','Industry','Website','Contact Name','Email','Source URL','Research Notes','Contact Basis','Status','Approved','Last Sent','Next Follow-up','Reply Status','Opt Out','Notes'];
const canonical=Core.TABLES.Leads.slice(0,19);
const legacyMap=['lead_id','company','country','industry','website','contact_name','contact_email','source_url','owner_notes','contact_basis','status','approved','last_contacted_at','next_follow_up','reply_status','opt_out','notes'];
const hash=s=>createHash('sha256').update(s).digest('hex');
const metadataId=s=>parseInt(hash(s).slice(0,8),16)%2147483646+1;
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function registrationState(state,target){
 const expected=target==='production'?PRODUCTION_CRM_ID:target==='isolation'?TEST_CRM_ID:null;
 if(!expected||state.metadata.spreadsheetId!==expected)throw Error('FIXED_REGISTRATION_TARGET_REQUIRED');
 const settings=state.settings;
 if(![['key','value'],['Setting','Value']].some(h=>eq(h,settings[0])))throw Error('SETTINGS_HEADERS_REQUIRED');
 const gate=key=>{const r=settings.slice(1).filter(r=>r[0]===key);if(r.length!==1)throw Error('EXPLICIT_UNIQUE_GATES_REQUIRED');return String(r[0][1]).toLowerCase();};
 for(const k of ['LIVE_SENDING','FOLLOW_UP_ENABLED','LEGAL_REVIEW_COMPLETED'])if(gate(k)!=='false')throw Error('SENDING_MUST_REMAIN_OFF');
 if(gate('RESEARCH_IMPORT_ENABLED')!=='true')throw Error('RESEARCH_IMPORT_STOPPED');
 const headers=state.leads[0];const legacy=eq(headers,LEGACY_HEADERS);
 if(!(legacy||eq(headers,canonical))||state.leads.length>=2001)throw Error('CRM_SCHEMA_OR_READ_LIMIT');
 const fields=legacy?legacyMap:canonical;
 const rows=state.leads.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map(r=>Object.fromEntries(fields.map((k,i)=>[k,r[i]??''])));
 if(rows.some(r=>!r.lead_id||!r.company||!r.country)||new Set(rows.map(r=>r.lead_id)).size!==rows.length)throw Error('EXISTING_ROWS_REQUIRE_REVIEW');
 const sheet=state.metadata.sheets.find(s=>s.properties.title==='Leads');if(!sheet)throw Error('LEADS_SHEET_REQUIRED');
 const markers=state.metadata.developerMetadata||[];
 for(const m of markers.filter(m=>m.metadataKey===KEY)){
  let v;try{v=JSON.parse(m.metadataValue);}catch{throw Error('INVALID_CLAIM');}
  if(v.phase!=='COMMITTED')throw Error('CLAIM_PENDING_NO_RETRY');
  if(rows.filter(r=>Core.companyResearchKey(r)===v.key).length!==1)throw Error('CLAIM_ROW_MISSING_NO_RETRY');
 }
 return{expected,headers,legacy,rows,sheetId:sheet.properties.sheetId,markers};
}
export function planRegistration(state,result,{target,now=new Date()}={}){
 const checked=registrationState(state,target),{rows,markers,headers,legacy,sheetId}=checked;
 if(result?.status!=='completed'||result.approvedToEmail!==false||!Array.isArray(result.candidates)||!result.candidates.length||result.candidates.length>20)throw Error('BOUNDED_COMPLETE_RESEARCH_REQUIRED');
 const candidates=result.candidates.map(c=>{
  if(c.approvedToEmail!==false||c.researchStatus!=='unverified')throw Error('UNAPPROVED_RESEARCH_REQUIRED');
  return{company:c.companyName,country:c.countryCode,source_url:c.evidenceUrls[0],website:c.officialWebsite,domain:new URL(c.officialWebsite).hostname,segment:c.segment,industry:c.segment};
 });
 const staged=Core.planResearchCompanyImport(rows,candidates,canonical,now.toISOString());
 const day=now.toISOString().slice(0,10),used=markers.filter(m=>m.metadataKey===SLOT&&m.metadataValue.startsWith(day+':')).length;
 if(used>DAILY_REGISTRATION_LIMIT)throw Error('INVALID_DAILY_RESERVATIONS');
 const selected=staged.appendRows.slice(0,Math.max(0,DAILY_REGISTRATION_LIMIT-used));
 const reserve=[],commit=[],newRows=[];
 const create=(namespace,value,identity)=>{
  const id=metadataId(identity);if(markers.some(m=>m.metadataId===id)||reserve.some(r=>r.createDeveloperMetadata.developerMetadata.metadataId===id))throw Error('METADATA_COLLISION_REQUIRES_REVIEW');
  reserve.push({createDeveloperMetadata:{developerMetadata:{metadataId:id,metadataKey:namespace,metadataValue:value,visibility:'DOCUMENT',location:{spreadsheet:true}}}});return id;
 };
 selected.forEach((r,i)=>{
  const key=Core.companyResearchKey(r),claim={key,day,phase:'CLAIMED'};
  const claimId=create(KEY,JSON.stringify(claim),'company:'+key);
  create(SLOT,day+':'+hash(key),'slot:'+day+':'+(used+i+1));
  commit.push({updateDeveloperMetadata:{dataFilters:[{developerMetadataLookup:{metadataId:claimId}}],developerMetadata:{metadataValue:JSON.stringify({...claim,phase:'COMMITTED'})},fields:'metadataValue'}});
  if(legacy){const mapped={...r,industry:r.segment,approved:false,opt_out:false,notes:'Unverified research; no outreach approval.'};newRows.push(legacyMap.map(k=>mapped[k]??''));}
  else newRows.push(headers.map(k=>r[k]??''));
 });
 if(newRows.length)commit.unshift({appendCells:{sheetId,rows:newRows.map(r=>({values:r.map(v=>({userEnteredValue:typeof v==='boolean'?{boolValue:v}:{stringValue:String(v)}}))})),fields:'userEnteredValue'}});
 return{target,spreadsheetId:checked.expected,day,requested:candidates.length,skipped:staged.skipped,deferred:staged.appendRows.length-selected.length,inserted:newRows.length,reserve,commit,newRows,expectedKeys:selected.map(Core.companyResearchKey),before:state};
}
export function verifyRegistration(plan,after){
 const current=registrationState(after,plan.target),before=registrationState(plan.before,plan.target);
 if(!eq(before.headers,current.headers))throw Error('HEADERS_CHANGED');
 const reserved=plan.reserve.map(r=>r.createDeveloperMetadata.developerMetadata).map(m=>m.metadataKey===KEY?{...m,metadataValue:JSON.stringify({...JSON.parse(m.metadataValue),phase:'COMMITTED'})}:m);
 for(const expected of [...before.markers.filter(m=>[KEY,SLOT].includes(m.metadataKey)),...reserved]){
  if(!current.markers.some(m=>m.metadataId===expected.metadataId&&m.metadataKey===expected.metadataKey&&m.metadataValue===expected.metadataValue))throw Error('CLAIM_READBACK_FAILED');
 }
 for(const row of before.rows){const matches=current.rows.filter(r=>r.lead_id===row.lead_id);if(matches.length!==1||!eq(matches[0],row))throw Error('EXISTING_ROW_CHANGED');}
 for(const key of plan.expectedKeys){
  const matched=current.rows.filter(r=>Core.companyResearchKey(r)===key);
  if(matched.length!==1||matched[0].status!=='RESEARCH'||matched[0].contact_email||matched[0].contact_name||matched[0].contact_basis||matched[0].last_contacted_at||String(matched[0].approved||'false').toLowerCase()!=='false')throw Error('NEW_ROW_READBACK_FAILED');
 }
 return{inserted:plan.inserted,skipped:plan.skipped,deferred:plan.deferred,totalRows:current.rows.length,existingRowsUnchanged:true,approvedToEmail:false};
}
export async function registerResearch({target,result,client,now=new Date()}){
 const initial=await client.read(),plan=planRegistration(initial,result,{target,now});
 if(!plan.inserted)return verifyRegistration(plan,await client.read());
 if(!eq(initial,await client.read()))throw Error('CONCURRENT_UPDATE_REPLAN_REQUIRED');
 // Persist intent and daily slots FIRST. Any pending intent blocks later runs.
 // Unique IDs serialize cooperating writers; uncertain effects are never retried.
 await client.batch(plan.reserve);
 const claimed=await client.read();
 for(const r of plan.reserve){const expected=r.createDeveloperMetadata.developerMetadata;
  if(!(claimed.metadata.developerMetadata||[]).some(m=>m.metadataId===expected.metadataId&&m.metadataKey===expected.metadataKey&&m.metadataValue===expected.metadataValue))throw Error('RESERVATION_READBACK_FAILED');
 }
 if(!eq(claimed.leads,initial.leads)||!eq(claimed.settings,initial.settings))throw Error('CHANGED_AFTER_CLAIM_STOP');
 // Recheck emergency gate without treating our own pending claims as replay.
 registrationState({...claimed,metadata:{...claimed.metadata,developerMetadata:(claimed.metadata.developerMetadata||[]).filter(m=>!plan.reserve.some(r=>r.createDeveloperMetadata.developerMetadata.metadataId===m.metadataId))}},target);
 await client.batch(plan.commit);
 return verifyRegistration(plan,await client.read());
}
