// Repository-controlled sources, no arbitrary command-line URL and no write credentials.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {runDailyCandidateResearch} from '../server/sales-daily-research.mjs';
try{
 const config=JSON.parse(await readFile(new URL('../apps-script/sales-crm/deployment/research-sources.json',import.meta.url),'utf8'));
 const result=await runDailyCandidateResearch({sources:config.sources});
 const out=process.env.RUNNER_TEMP || '/tmp';
 await mkdir(out,{recursive:true});
 await writeFile(out+'/stockwise-research-daily.json',JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify({status:result.status,candidates:result.candidates.length,approvedToEmail:false}));
 if(result.status!=='completed')process.exitCode=1;
}catch{console.error('DAILY_RESEARCH_CONFIGURATION_OR_RUNTIME_FAILED');process.exitCode=1;}
