#!/usr/bin/env node
// Local fixed-label check; never print credential values or matching source lines.
import {readFile,readdir,stat} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
const findings=[]
try{
 const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)
 const walk=async dir=>{const result=[];for(const name of await readdir(dir)){const path=dir+'/'+name;(await stat(path)).isDirectory()?result.push(...await walk(path)):result.push(path)}return result}
 const built=await walk('dist');for(const directory of ['logs/growth','logs/acquisition']){try{built.push(...await walk(directory))}catch(error){if(error.code!=='ENOENT')throw error}}const files=[...new Set([...tracked,...built])]
 const secrets=Object.entries(process.env).filter(([k,v])=>/(SERVICE_ROLE|CLIENT_SECRET|REFRESH_TOKEN|ACCESS_TOKEN|DB_URL|STRIPE_SECRET|WEBHOOK_SECRET|BUFFER_API_KEY|PASSWORD)/.test(k)&&v.length>=12)
 for(const path of files){const content=await readFile(path);for(const [key,value]of secrets)if(content.includes(Buffer.from(value)))findings.push({file:path,kind:'configured_secret',key})
  if(/^(src|dist)\//.test(path)&&/SUPABASE_SERVICE_ROLE_KEY|GMAIL_CLIENT_SECRET|GMAIL_REFRESH_TOKEN|BUFFER_API_KEY|STRIPE_SECRET_KEY/.test(content.toString()))findings.push({file:path,kind:'server_secret_identifier_in_browser'})
  for(const token of content.toString().match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){try{if(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).role==='service_role')findings.push({file:path,kind:'privileged_jwt'})}catch{}}
  if(/^automation\/.*\.sh$/.test(path)&&/--approve-for-me|danger-full-access|--dangerously-bypass/.test(content.toString()))findings.push({file:path,kind:'approval_bypass'})
 }
 console.log(JSON.stringify({status:findings.length?'blocked':'passed',files:files.length,findings,scope:'current tracked/new source, dist and available local growth reports; historical Git/external logs excluded'}));if(findings.length)process.exitCode=1
}catch{console.error(JSON.stringify({status:'blocked',reason:'SECURITY_SCAN_OR_BUILD_UNAVAILABLE'}));process.exitCode=1}
