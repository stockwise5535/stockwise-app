// One research cycle: (1) emergency-stop check, (2) lock, (3) ingest NEW candidates from an inbox file, (4) recheck EXISTING ones,
// (5) write ledger + import CSVs + run history. Never writes to Google Sheets, sends mail, or uses a paid/AI API.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import https from 'node:https';
import {discover,dueForRecheck,applyRecheck,importBatch,toImportCsv,renderCycleReport,keyOf,LIMITS,researchUrl,validateEntry,isImportable} from '../server/sales-research-cycle.mjs';

export const MAX_PAGE_BYTES=300_000;
export function publicAddress(address){
  if(isIP(address)===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));}
  return isIP(address)===6&&/^[23]/i.test(address)&&!/^2001:(?:db8|0:)/i.test(address)&&!/^2002:/i.test(address);
}
// Pin the validated DNS address to the connection; no redirects, ambient credentials or proxy auth.
export async function fetchResearchPage(url,{signal,lookupImpl=lookup,requestImpl=https.get}={}){
  if(!researchUrl(url))throw Error('INVALID_RESEARCH_URL');
  signal=signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000);
  const u=new URL(url),addresses=await new Promise((resolve,reject)=>{
    signal.throwIfAborted();const abort=()=>reject(Error('RESEARCH_TIMEOUT'));
    signal.addEventListener('abort',abort,{once:true});
    lookupImpl(u.hostname,{all:true}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('NON_PUBLIC_RESEARCH_HOST');
  const selected=addresses[0];
  return new Promise((resolve,reject)=>{
    const req=requestImpl(u,{signal,family:selected.family,lookup:(_host,options,done)=>options.all?done(null,[selected]):done(null,selected.address,selected.family),headers:{'User-Agent':'NexOps-research-recheck/1.0','Accept':'text/html,application/xhtml+xml','Accept-Encoding':'identity'}},res=>{
      const chunks=[];let bytes=0;
      if(Number(res.headers['content-length'])>MAX_PAGE_BYTES){res.destroy();reject(Error('PAGE_TOO_LARGE'));return;}
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_PAGE_BYTES){res.destroy(Error('PAGE_TOO_LARGE'));return;}chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>{try{resolve(new Response([204,205,304].includes(res.statusCode)?null:Buffer.concat(chunks),{status:res.statusCode,headers:res.headers}));}catch(e){reject(e);}});
    });req.on('error',reject);
  });
}

export function acquireLock(name,{dir=os.tmpdir(),staleMs=2*3600e3,now=Date.now()}={}){
  const file=path.join(dir,`stockwise-research-${name}.lock`);
  try{if(now-fs.statSync(file).mtimeMs>staleMs){
    const old=JSON.parse(fs.readFileSync(file,'utf8'));let alive=true;
    try{process.kill(old.pid,0);}catch(e){alive=e.code!=='ESRCH';}
    if(!alive)fs.rmSync(file);
  }}catch{}
  const token=randomUUID();
  try{fs.writeFileSync(file,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600});}catch{return null;}
  return ()=>{try{if(JSON.parse(fs.readFileSync(file,'utf8')).token===token)fs.rmSync(file);}catch{}};
}
export function emergencyStop(env=process.env,stopFile){
  if(String(env.NEXOPS_RESEARCH_EMERGENCY_STOP||'').toLowerCase()==='true')return 'NEXOPS_RESEARCH_EMERGENCY_STOP=true';
  if(stopFile&&fs.existsSync(stopFile))return 'stop file present';
  return null;
}
export async function recheckOne(e,fetchImpl=fetchResearchPage){
  if(!researchUrl(e.website))return {ok:false,kind:'INVALID_URL'};
  try{
    const res=await fetchImpl(e.website,{method:'GET',redirect:'error',credentials:'omit',headers:{'User-Agent':'NexOps-research-recheck/1.0 (existence check only)'},signal:AbortSignal.timeout(10000)});
    if(!res.ok)return {ok:false,kind:[404,410].includes(res.status)?'HTTP':'UNAVAILABLE'};
    if(Number(res.headers.get('content-length'))>MAX_PAGE_BYTES){await res.body?.cancel();return {ok:false,kind:'TOO_LARGE'};}
    if(!/text\/html|application\/xhtml\+xml/i.test(res.headers.get('content-type')||'')){await res.body?.cancel();return {ok:false,kind:'UNAVAILABLE'};}
    const reader=res.body.getReader(),chunks=[];let bytes=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_PAGE_BYTES)return {ok:false,kind:'TOO_LARGE'};chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});}
    const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    const html=Buffer.concat(chunks).toString('utf8').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ');
    const token=normalize(String(e.company).replace(/株式会社|有限会社|pte\.?\s*ltd\.?|pty\s*ltd|\(private\)\s*limited|co\.?,?\s*ltd\.?/gi,''));
    return token.length>=3&&normalize(html).includes(token)?{ok:true,kind:'OK'}:{ok:false,kind:'NAME_MISSING'};
  }catch{return {ok:false,kind:'NETWORK'};}
}
export async function runCycle({ledgerPath,inboxPath,outDir,env=process.env,now=new Date(),fetchImpl=fetchResearchPage,doRecheck=true,date,lockDir}){
  date=date||now.toISOString().slice(0,10);
  const stop=emergencyStop(env,path.join(outDir,'EMERGENCY_STOP'));
  const history=path.join(outDir,'runs.jsonl'),log=r=>{fs.mkdirSync(outDir,{recursive:true});fs.appendFileSync(history,JSON.stringify(r)+'\n');};
  if(stop){const report=renderCycleReport({date,mode:'停止',stop});log({at:now.toISOString(),status:'stopped',reason:stop});return {status:'stopped',report};}
  const release=acquireLock('cycle',{dir:lockDir});
  if(!release){log({at:now.toISOString(),status:'skipped_already_running'});return {status:'skipped_already_running',report:''};}
  const failures=[];
  try{
    const ledgerDoc=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));let ledger=ledgerDoc.companies;
    if(!Array.isArray(ledger)||ledger.some(e=>validateEntry(e).length)||new Set(ledger.map(keyOf)).size!==ledger.length)throw Error('INVALID_RESEARCH_LEDGER');
    let discovery=null;
    if(inboxPath){
      if(!fs.existsSync(inboxPath))throw Error('RESEARCH_INBOX_MISSING');
      discovery=discover(ledger,JSON.parse(fs.readFileSync(inboxPath,'utf8')).companies||[],{now});ledger=[...ledger,...discovery.added];
    }
    let recheck=null;
    if(doRecheck){
      const due=dueForRecheck(ledger,{now});recheck={attempted:due.length,ok:0,network:0,failed:0,flagged:0};
      for(const e of due){const r=await recheckOne(e,fetchImpl),n=applyRecheck(e,r,now);
        if(r.ok)recheck.ok++;else{recheck.failed++;if(r.kind==='NETWORK')recheck.network++;}if(n.status!==e.status)recheck.flagged++;
        ledger=ledger.map(x=>keyOf(x)===keyOf(e)?n:x);}
      if(recheck.attempted&&recheck.network===recheck.attempted)failures.push('全件ネットワーク不通(実行環境から外部サイトに接続できない可能性)。台帳の状態は変更していません。');
      else if(recheck.failed)failures.push(`公式ページ再確認の未完了 ${recheck.failed}件。到達成功・実在確認とは扱いません。`);
    }
    const count=t=>ledger.filter(e=>e.verification_tier===t).length;
    const sources={total:ledger.length,A:count('A'),B:count('B'),C:count('C'),importable:ledger.filter(isImportable).length};
    fs.mkdirSync(outDir,{recursive:true});
    const staged=ledgerPath+'.'+randomUUID()+'.tmp';
    try{fs.writeFileSync(staged,JSON.stringify({...ledgerDoc,companies:ledger},null,1)+'\n',{mode:0o600});fs.renameSync(staged,ledgerPath);}
    finally{fs.rmSync(staged,{force:true});}
    // Review candidate file only: never label unexecuted candidates as a production deployment.
    fs.writeFileSync(path.join(outDir,`import-review-${date}.csv`),toImportCsv(importBatch(ledger)));
    const report=renderCycleReport({date,mode:doRecheck?'発見+再確認':'発見のみ',discovery,recheck,sources,failures});
    fs.writeFileSync(path.join(outDir,`report-${date}.md`),report);
    log({at:now.toISOString(),status:failures.length?'completed_with_warnings':'completed',added:discovery?.added.length??0,duplicates:discovery?.duplicates.length??0,rechecked:recheck?.attempted??0,costUsd:LIMITS.costUsd});
    return {status:failures.length?'completed_with_warnings':'completed',report,discovery,recheck,sources};
  }catch(e){
    const known=new Set(['INVALID_RESEARCH_LEDGER','RESEARCH_INBOX_MISSING','ENOENT','EACCES','EISDIR','EEXIST','ENOSPC','EIO','EMFILE','ENFILE','EPERM','EROFS']);
    const candidate=e?.code||e?.message;
    log({at:now.toISOString(),status:'failed',code:e instanceof SyntaxError?'RESEARCH_JSON_INVALID':known.has(candidate)?candidate:'RESEARCH_CYCLE_FAILED'});throw e;
  }
  finally{release();}
}
async function main(){
  const a=process.argv.slice(2),get=n=>{const i=a.indexOf(n);return i>=0?a[i+1]:undefined;};
  const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
  const r=await runCycle({ledgerPath:path.resolve(get('--ledger')||path.join(root,'content/research/ledger.json')),inboxPath:get('--inbox')?path.resolve(get('--inbox')):undefined,
    outDir:path.resolve(get('--out')||path.join(root,'reports/research')),doRecheck:!a.includes('--no-recheck')});
  console.log(r.report);
  if(r.status==='completed_with_warnings')process.exitCode=3; // non-zero so a scheduler (e.g. a GitHub run) reports the warning as a failure notification
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('RESEARCH_CYCLE_FAILED');process.exit(1);});
