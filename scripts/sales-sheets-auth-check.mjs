import{lstat,readFile}from'node:fs/promises';
import{checkDedicatedSheetsAuth}from'../server/sales-sheets-auth-check.mjs';
try{
 if(process.env.DEBUG||process.env.NODE_DEBUG||process.argv.length!==3)throw Error();
 const path=process.argv[2],stat=await lstat(path);
 if(!stat.isFile()||(stat.mode&0o077)!==0||stat.uid!==process.getuid()||stat.size>64000)throw Error();
 const authJson=await readFile(path,'utf8');
 console.log(JSON.stringify(await checkDedicatedSheetsAuth({authJson})));
}catch{
 console.error('DEDICATED_SHEETS_READ_CHECK_FAILED: confirm private service-account credentials, Sheets API enablement and isolated spreadsheet access; no CRM writes or retries performed.');
 process.exitCode=1;
}
