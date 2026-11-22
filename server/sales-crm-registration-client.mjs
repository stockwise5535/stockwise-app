import{productionCrmId,CRM_BINDING}from'./sales-crm-binding.mjs';import{TEST_CRM_ID}from'./sales-test-crm-import.mjs';
import{sheetsAccessToken}from'./sales-sheets-auth.mjs';
// Fixed host/target and zero automatic retries, including token and write requests.
export async function registrationClient({target,authJson,fetchImpl=fetch}){
 const id=target==='production'?productionCrmId():target==='isolation'?TEST_CRM_ID:null;
 if(!id)throw Error('FIXED_TARGET_REQUIRED');
 const token=await sheetsAccessToken({authJson,dedicated:target==='production',expectedPrincipal:target==='production'?CRM_BINDING.serviceAccountEmail:undefined,expectedProject:target==='production'?CRM_BINDING.credentialsProjectId:undefined,fetchImpl});
 const api=async(method,path,body)=>{
  const r=await fetchImpl('https://sheets.googleapis.com/v4/spreadsheets/'+id+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(!r.ok)throw Error(method==='GET'?'SHEETS_READ_FAILED':'SHEETS_WRITE_UNCONFIRMED');return r.json();
 };
 const values=async range=>(await api('GET','/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE')).values||[];
 return{read:async()=>{
  const metadata=await api('GET','?fields=spreadsheetId,sheets.properties,developerMetadata');
  const lead=metadata.sheets.find(s=>s.properties.title==='Leads'),settings=metadata.sheets.find(s=>s.properties.title==='Settings');
  if(!lead||!settings)throw Error('CRM_TABS_REQUIRED');
  if(lead.properties.gridProperties.rowCount>2001)throw Error('CRM_READ_LIMIT_REQUIRES_REVIEW');
  const col=String.fromCharCode(64+Math.min(26,lead.properties.gridProperties.columnCount));
  return{metadata,leads:await values('Leads!A1:'+col+lead.properties.gridProperties.rowCount),settings:await values('Settings!A1:B'+Math.min(100,settings.properties.gridProperties.rowCount))};
 },batch:requests=>api('POST',':batchUpdate',{requests})};
}
