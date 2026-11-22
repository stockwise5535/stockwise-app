// Repository-controlled sources, no arbitrary command-line URL and no write credentials.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {runDailyCandidateResearch} from '../server/sales-daily-research.mjs';
import {discoverBusinessLeads} from '../server/sales-lead-discovery.mjs';
try{
 const registration=process.env.STOCKWISE_SALES_CRM_IMPORT_ENABLED==='true';
 const profile=registration?'discovery-sources.json':'research-sources.json';
 const config=JSON.parse(await readFile(new URL('../apps-script/sales-crm/deployment/'+profile,import.meta.url),'utf8'));
 const result=registration?await discoverBusinessLeads({sources:config.sources}):await runDailyCandidateResearch({sources:config.sources});
 const out=process.env.RUNNER_TEMP || '/tmp';
 await mkdir(out,{recursive:true});
 await writeFile(out+'/stockwise-research-daily.json',JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify({status:result.status,candidates:result.candidates.length,approvedToEmail:false}));
 if(result.status!=='completed')process.exitCode=1;
}catch{console.error('DAILY_RESEARCH_CONFIGURATION_OR_RUNTIME_FAILED');process.exitCode=1;}
