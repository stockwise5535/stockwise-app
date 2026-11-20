import{readFile,writeFile}from'node:fs/promises';import{registerResearch}from'../server/sales-crm-registration.mjs';import{registrationClient}from'../server/sales-crm-registration-client.mjs';
try{
 if(process.env.DEBUG||process.env.NODE_DEBUG)throw Error('DEBUG_LOGGING_FORBIDDEN');
 if(process.env.STOCKWISE_SALES_CRM_IMPORT_ENABLED!=='true'||process.env.SALES_CRM_TARGET!=='production')throw Error('PRODUCTION_REGISTRATION_DISABLED');
 const file=(process.env.RUNNER_TEMP||'/tmp')+'/stockwise-research-daily.json';
 const result=JSON.parse(await readFile(file,'utf8'));
 const client=await registrationClient({target:'production',authJson:process.env.SALES_SHEETS_AUTH_JSON});
 const report=await registerResearch({target:'production',result,client});
 await writeFile((process.env.RUNNER_TEMP||'/tmp')+'/stockwise-registration-daily.json',JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));
}catch{console.error('CRM_REGISTRATION_STOPPED: read authentication, gates, claims and rows before resuming; no automatic write retry.');process.exitCode=1;}
