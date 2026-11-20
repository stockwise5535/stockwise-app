import{PRODUCTION_CRM_ID}from'./sales-crm-registration.mjs';import{TEST_CRM_ID}from'./sales-test-crm-import.mjs';
// Fixed host/target and zero automatic retries, including token and write requests.
export async function registrationClient({target,authJson,fetchImpl=fetch}){
 const id=target==='production'?PRODUCTION_CRM_ID:target==='isolation'?TEST_CRM_ID:null;
 if(!id)throw Error('FIXED_TARGET_REQUIRED');
 const a=JSON.parse(authJson),auth=a.tokens?.default||a;
 if(['client_id','client_secret','refresh_token'].some(k=>typeof auth[k]!=='string'||!auth[k].trim()))throw Error('GOOGLE_SHEETS_AUTH_REQUIRED');
 const tokenResponse=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:auth.client_id,client_secret:auth.client_secret,refresh_token:auth.refresh_token,grant_type:'refresh_token'})});
 if(!tokenResponse.ok)throw Error('GOOGLE_SHEETS_AUTH_REQUIRED');
 const token=(await tokenResponse.json()).access_token;if(!token)throw Error('GOOGLE_SHEETS_AUTH_REQUIRED');
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
