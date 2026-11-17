// TEST-only bridge. No Gmail, queue, production identifier or scheduling capability.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Core=require('../apps-script/sales-crm/Core.js');
const Engine=require('../apps-script/sales-crm/Engine.js');
export const TEST_CRM_ID='12uDNmpfEANnzzTRoT6eyjmlNg1wj2B9f6BUPWH9X3pk';
export function checkTestSettings(id,settings){
 if(id!==TEST_CRM_ID)throw Error('TEST_CRM_ONLY');
 for(const key of ['LIVE_SENDING','FOLLOW_UP_ENABLED','LEGAL_REVIEW_COMPLETED']){
  const rows=settings.filter(r=>r[0]===key);
  if(rows.length!==1||String(rows[0][1]).trim().toLowerCase()!=='false')throw Error('SENDING_GATES_MUST_BE_OFF');
 }
}
const objects=values=>values.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map(r=>Object.fromEntries(values[0].map((h,i)=>[h,r[i]??''])));
export function planTestResearchImport({spreadsheetId,settings,leads,result,now=new Date()}){
 checkTestSettings(spreadsheetId,settings);
 if(result?.status!=='completed'||result.approvedToEmail!==false||!result.candidates?.length)throw Error('COMPLETE_RESEARCH_REQUIRED');
 if(leads[0]?.length!==19)throw Error('TEST_HEADERS_REQUIRED');
 const candidates=result.candidates.map(c=>{
  if(c.approvedToEmail!==false||c.researchStatus!=='unverified')throw Error('UNVERIFIED_RESEARCH_ONLY');
  return{company:c.companyName,country:c.countryCode,source_url:c.evidenceUrls[0],website:c.officialWebsite,domain:new URL(c.officialWebsite).hostname,segment:c.segment};
 });
 const existing=objects(leads),rows=existing.map(r=>({...r})),appends=[];
 const summary=Engine.importResearchCompanies({now:()=>now,store:{headers:()=>leads[0],rows:()=>rows.map(r=>({...r})),append:(table,row)=>{if(table!=='Leads')throw Error('LEADS_ONLY');appends.push(row);rows.push(row);},flush(){}}},candidates);
 return{spreadsheetId,summary,headers:leads[0],values:appends.map(r=>leads[0].map(h=>r[h]??'')),expectedKeys:[...new Set(candidates.map(Core.companyResearchKey))]};
}
export function verifyTestResearchImport({spreadsheetId,settings,leads,plan}){
 checkTestSettings(spreadsheetId,settings);
 if(plan.spreadsheetId!==spreadsheetId||JSON.stringify(plan.headers)!==JSON.stringify(leads[0]))throw Error('TARGET_OR_HEADERS_CHANGED');
 const rows=objects(leads);
 for(const key of plan.expectedKeys){
  const matches=rows.filter(r=>Core.companyResearchKey(r)===key);
  if(matches.length!==1)throw Error('CRM_READBACK_COUNT_OR_DUPLICATE_MISMATCH');
  const r=matches[0];if(r.status!=='RESEARCH'||r.contact_email||r.contact_name||r.contact_basis||r.last_contacted_at)throw Error('RESEARCH_MUST_REMAIN_UNAPPROVED');
 }
 return{matchedAfter:plan.expectedKeys.length,totalRows:rows.length,approvedToEmail:false};
}
export async function importTestResearch({spreadsheetId,result,sheets,now}){
 const read=async()=>({spreadsheetId,result,now,settings:await sheets.read('Settings','A1:B60'),leads:await sheets.read('Leads','A1:S2001')});
 const initial=await read(),plan=planTestResearchImport(initial);
 if(plan.values.length){
  const current=await read();
  if(JSON.stringify(current.settings)!==JSON.stringify(initial.settings)||JSON.stringify(current.leads)!==JSON.stringify(initial.leads))throw Error('SHEET_CHANGED_REPLAN_REQUIRED');
  // Exactly one append attempt. A timeout/unknown result is not retried.
  await sheets.append('Leads',plan.values);
 }
 const after=await read();
 return{...plan.summary,readback:verifyTestResearchImport({...after,plan})};
}
