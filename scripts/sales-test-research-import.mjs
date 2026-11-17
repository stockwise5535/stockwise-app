// Explicit manual CLI only. Never used by a scheduler or the production research config.
import fs from'node:fs/promises';import{runDailyCandidateResearch}from'../server/sales-daily-research.mjs';
import{TEST_CRM_ID,importTestResearch,planTestResearchImport,verifyTestResearchImport}from'../server/sales-test-crm-import.mjs';
const args=process.argv.slice(2);
try{
 if(args.length!==2||!['--research','--plan','--verify','--import'].includes(args[0]))throw Error('USAGE');
 if(args[0]==='--research'){
  const config=JSON.parse(await fs.readFile(new URL('../apps-script/sales-crm/deployment/research-sources.test.json',import.meta.url),'utf8'));
  const result=await runDailyCandidateResearch({sources:config.sources});
  await fs.writeFile(args[1],JSON.stringify(result),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({status:result.status,candidates:result.candidates.length,approvedToEmail:false}));
  if(result.status!=='completed'||!result.candidates.length)process.exitCode=1;
 }else if(args[0]==='--plan'||args[0]==='--verify'){
  const input=JSON.parse(await fs.readFile(args[1],'utf8'));
  console.log(JSON.stringify(args[0]==='--plan'?planTestResearchImport(input):verifyTestResearchImport(input)));
 }else{
  // Access token is read from an explicitly selected private file, never argv or logs.
  const result=JSON.parse(await fs.readFile(args[1],'utf8'));
  const tokenPath=process.env.TEST_SHEETS_TOKEN_FILE,stat=await fs.lstat(tokenPath);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('PRIVATE_TOKEN_FILE_REQUIRED');
  const token=await fs.readFile(tokenPath,'utf8');
  const api=async(method,range,body)=>{
   const url='https://sheets.googleapis.com/v4/spreadsheets/'+TEST_CRM_ID+'/values/'+encodeURIComponent(range)+(method==='POST'?':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS':'');
   const response=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token.trim(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
   if(!response.ok)throw Error('SHEETS_OPERATION_UNCONFIRMED');return response.json();
  };
  const summary=await importTestResearch({spreadsheetId:TEST_CRM_ID,result,sheets:{read:async(tab,range)=>(await api('GET',tab+'!'+range)).values||[],append:(tab,values)=>api('POST',tab+'!A:S',{values})}});
  console.log(JSON.stringify(summary));
 }
}catch{console.error('TEST_RESEARCH_IMPORT_STOPPED: inspect access, gates and readback; do not blindly retry unknown writes.');process.exitCode=1;}
