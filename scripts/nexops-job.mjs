import {createHash} from 'node:crypto';
export const REPO='stockwise5535/stockwise-app';
export const OWNER='stockwise5535';
export const JOB_LABEL='nexops:run-requested';
export const ROUTES=Object.freeze({SALES:'research-report','MKT-CONTENT':'draft-content','MKT-GROWTH':'metrics-audit',IT:'code-audit',PRODUCT:'product-prd',CEO:'executive-report'});
export const hash=text=>createHash('sha256').update(text).digest('hex');
export const fail=code=>{throw new Error(code);};
const role=p=>['admin','maintain','write'].includes(p);
const sameKeys=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
export function parseJob(issue,number){
 if(!Number.isSafeInteger(number)||number<1||issue?.number!==number||issue.pull_request||issue.state!=='open')fail('INVALID_JOB_ISSUE');
 if(!issue.labels?.some(l=>(typeof l==='string'?l:l.name)===JOB_LABEL))fail('JOB_LABEL_MISSING');
 if(typeof issue.body!=='string'||issue.body.length>10000)fail('INVALID_JOB_BODY');
 // Phase A nexops-task/dry_run receipts cannot silently become execution jobs.
 const blocks=[...issue.body.matchAll(/(?:^|\n)```nexops-job\r?\n([\s\S]*?)\r?\n```(?=\n|$)/g)];
 if(blocks.length!==1)fail('EXECUTION_CONTRACT_REQUIRED');
 let task;try{task=JSON.parse(blocks[0][1]);}catch{fail('INVALID_JOB_JSON');}
 if(!sameKeys(task,['schema_version','department','action','objective','mode'])||task.schema_version!==2||task.mode!=='artifact-pr'||ROUTES[task.department]!==task.action)fail('INVALID_JOB_SCHEMA');
 if(typeof task.objective!=='string'||task.objective.length<5||task.objective.length>200||/[\x00-\x1f\x7f]/.test(task.objective))fail('INVALID_JOB_OBJECTIVE');
 const revision=hash(issue.body),key=hash(`${REPO}/${number}/${revision}/artifact-pr`);
 return{...task,number,revision,key,branch:`codex/nexops-job-${number}-${revision.slice(0,12)}`,path:`docs/nexops-results/issue-${number}-${revision.slice(0,12)}.md`};
}
export function checkIdentity({operator,operatorPermission,author,authorPermission}){
 if(operator!==OWNER||!role(operatorPermission)||typeof author!=='string'||!/^[A-Za-z0-9-]{1,39}$/.test(author)||!role(authorPermission))fail('JOB_IDENTITY_NOT_AUTHORIZED');
}
export function selectApproval(comments,job,now=new Date()){
 const matches=comments.filter(c=>{
  if(!c||c.user?.login!==OWNER||!Number.isSafeInteger(c.id)||c.created_at!==c.updated_at||typeof c.body!=='string'||c.body.length>1000)return false;
  const m=c.body.trim().match(/^```nexops-approval\r?\n([\s\S]*?)\r?\n```$/);if(!m)return false;
  try{const a=JSON.parse(m[1]),created=Date.parse(c.created_at),expires=Date.parse(a.expires_at);
   return sameKeys(a,['revision','mode','expires_at'])&&a.revision===job.revision&&a.mode==='artifact-pr'&&typeof a.expires_at==='string'&&Number.isFinite(created)&&Number.isFinite(expires)&&created<=now.getTime()&&expires>now.getTime()&&expires-created<=86400000;
  }catch{return false;}
 });
 if(matches.length!==1)fail('EXACT_OWNER_APPROVAL_REQUIRED');
 return{id:matches[0].id,fingerprint:hash(JSON.stringify([matches[0].id,matches[0].body,matches[0].updated_at]))};
}
export function screenModelInput(text,secrets=[]){
 if(typeof text!=='string'||/(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(text)||secrets.some(s=>s.length>=12&&text.includes(s)))fail('PRIVATE_INPUT_REQUIRES_REVIEW');
}
export function validateReport(value,secrets=[]){
 if(!sameKeys(value,['summary','report'])||typeof value.summary!=='string'||typeof value.report!=='string'||value.summary.length<5||value.summary.length>300||value.report.length<20||value.report.length>16000)fail('INVALID_REPORT_SCHEMA');
 const text=value.summary+'\n'+value.report;
 // Generated drafts cannot introduce remote images, links/mentions or secret material.
 if(/[<>@\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|https?:\/\/|!\[|(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./i.test(text)||secrets.some(s=>s.length>=12&&text.includes(s)))fail('REPORT_REQUIRES_PRIVATE_REVIEW');
 return value;
}
export function validateChanges(files,job){
 if(!Array.isArray(files)||files.length!==1||files[0].filename!==job.path||files[0].status!=='added')fail('UNEXPECTED_PR_CHANGES');
}
export function childEnvironment(env){
 const names=['HOME','PATH','USER','LOGNAME','TMPDIR','LANG','LC_ALL','TERM','CODEX_HOME','XDG_CONFIG_HOME','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy'];
 return Object.fromEntries(names.filter(k=>typeof env[k]==='string').map(k=>[k,env[k]]));
}
export function codexArguments(dir,schema,output,prompt){
 return['exec','--sandbox','read-only','--skip-git-repo-check','-C',dir,'-c','forced_login_method="chatgpt"','-c','model_provider="openai"','-c','web_search="disabled"','-c','features.shell_tool=false','-c','features.apps=false','-c','mcp_servers={}','--output-schema',schema,'--output-last-message',output,prompt];
}
