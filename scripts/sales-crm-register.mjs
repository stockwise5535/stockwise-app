import{readFile,writeFile}from'node:fs/promises';import{registerResearch}from'../server/sales-crm-registration.mjs';import{registrationClient}from'../server/sales-crm-registration-client.mjs';
import{discoverBusinessLeads}from'../server/sales-lead-discovery.mjs';import{registrationState}from'../server/sales-crm-registration.mjs';import{verifiedResearchCandidates}from'../server/sales-lead-handoff.mjs';
try{
 if(process.env.DEBUG||process.env.NODE_DEBUG)throw Error('DEBUG_LOGGING_FORBIDDEN');
 if(process.env.STOCKWISE_SALES_CRM_IMPORT_ENABLED!=='true'||process.env.SALES_CRM_TARGET!=='production')throw Error('PRODUCTION_REGISTRATION_DISABLED');
 const file=(process.env.RUNNER_TEMP||'/tmp')+'/stockwise-research-daily.json';
 const client=await registrationClient({target:'production',authJson:process.env.SALES_SHEETS_AUTH_JSON});
 const state=await client.read();const checked=registrationState(state,'production');
 const{sources}=JSON.parse(await readFile(new URL('../apps-script/sales-crm/deployment/discovery-sources.json',import.meta.url),'utf8'));
 const result=await discoverBusinessLeads({sources,existingRows:checked.rows});
 await writeFile(file,JSON.stringify(result,null,2),{mode:0o600});
 if(result.status!=='completed')throw Error('DISCOVERY_INCOMPLETE');
 const{reviews}=JSON.parse(await readFile(new URL('../apps-script/sales-crm/deployment/official-company-reviews.json',import.meta.url),'utf8'));
 result.candidates=verifiedResearchCandidates(result.candidates,reviews).slice(0,20);
 if(!result.candidates.length)throw Error('OFFICIAL_VERIFICATION_PENDING');
 const report=await registerResearch({target:'production',result,client});
 await writeFile((process.env.RUNNER_TEMP||'/tmp')+'/stockwise-registration-daily.json',JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));
}catch{console.error('CRM_REGISTRATION_STOPPED: read authentication, gates, claims and rows before resuming; no automatic write retry.');process.exitCode=1;}
