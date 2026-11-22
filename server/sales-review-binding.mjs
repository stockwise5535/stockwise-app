import{readFileSync,readdirSync}from'node:fs';
import{execFileSync}from'node:child_process';
import{createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const excluded=new Set(['independentReviewCommit','independentReviewer','independentReviewDigest','independentReviewStatus','productionWritesAuthorized','dedicatedCredentialConfirmed','sheetsApiOwnerReportedEnabled','sheetsApiLiveVerified','isolatedViewerOwnerReported','isolatedReadConnectionVerified','credentialStorageReview','reason']);
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
const bindingPath='apps-script/sales-crm/deployment/crm-binding.json';
const critical=p=>/^(server|scripts)\/sales-[^/]+\.mjs$/.test(p)||/^apps-script\/sales-crm\/(?:Main|Engine|Core)\.js$/.test(p)||/^apps-script\/sales-crm\/deployment\/[^/]+\.json$/.test(p)||p==='.github/workflows/sales-daily-research.yml';
export function reviewInputDigest(entries){
 const hash=createHash('sha256');
 for(const[path,raw]of [...entries].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)){
  let content=String(raw);if(path===bindingPath){const b=JSON.parse(content);content=JSON.stringify(stable(Object.fromEntries(Object.entries(b).filter(([k])=>!excluded.has(k)))));}
  hash.update(JSON.stringify([path,createHash('sha256').update(content).digest('hex')])+'\n');
 }
 return hash.digest('hex');
}
export function reviewedExecutionDigest({commit,root=ROOT}={}){
 const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:4000000});
 try{
  let paths,read;
  if(commit){
   if(!/^[0-9a-f]{40}$/.test(commit)||/^0+$/.test(commit))throw Error();
   git(['cat-file','-e',commit+'^{commit}']);
   paths=git(['ls-tree','-r','--name-only',commit]).split('\n').filter(critical);
   read=p=>git(['show',commit+':'+p]);
  }else{
   paths=['server','scripts','apps-script/sales-crm','apps-script/sales-crm/deployment','.github/workflows'].flatMap(dir=>readdirSync(root+'/'+dir).map(name=>dir+'/'+name)).filter(critical);
   read=p=>readFileSync(root+'/'+p,'utf8');
  }
  if(!paths.includes(bindingPath))throw Error();
  return reviewInputDigest(paths.map(p=>[p,read(p)]));
 }catch{throw Error('REVIEWED_COMMIT_OR_SOURCE_UNAVAILABLE');}
}
