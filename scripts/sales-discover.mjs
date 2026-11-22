// Read-only public discovery probe. No credentials, CRM writes or sends.
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{discoverBusinessLeads}from'../server/sales-lead-discovery.mjs';
try{
 const{sources}=JSON.parse(await readFile(new URL('../apps-script/sales-crm/deployment/discovery-sources.json',import.meta.url),'utf8'));
 const result=await discoverBusinessLeads({sources});
 const dir=process.env.RUNNER_TEMP||'/tmp';await mkdir(dir,{recursive:true});
 await writeFile(dir+'/stockwise-discovery.json',JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify({status:result.status,candidates:result.candidates.length,sources:result.sources,qualifiedForSales:result.qualifiedForSales,approvedToEmail:false}));
 if(result.status!=='completed')process.exitCode=1;
}catch{console.error('PUBLIC_DISCOVERY_STOPPED');process.exitCode=1;}
