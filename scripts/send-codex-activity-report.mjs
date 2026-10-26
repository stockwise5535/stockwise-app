#!/usr/bin/env node
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { gmailTokenProvider } from '../services/gmail-oauth.js'

const REPO=path.join(os.homedir(),'stockwise-v2')
const LOG_DIR=path.join(REPO,'logs')
const STATE_FILE=path.join(LOG_DIR,'codex-3day-email-state.json')
const REPORT_FILE=path.join(LOG_DIR,'codex-3day-email-latest.txt')
const THREE_DAYS_MS=72*60*60*1000
const now=Date.now()

const address=value=>{
  if(typeof value!=='string'||/[\r\n]/.test(value)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw Error('REPORT_RECIPIENT_INVALID')
  return value.trim().toLowerCase()
}
const sha=v=>createHash('sha256').update(v).digest('hex')
const git=args=>execFileSync('git',args,{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()

await mkdir(LOG_DIR,{recursive:true})

let state={}
if(existsSync(STATE_FILE)){
  try{state=JSON.parse(await readFile(STATE_FILE,'utf8'))}catch{throw Error('REPORT_STATE_CORRUPT')}
}
if(state.last_sent_at && now-Date.parse(state.last_sent_at)<THREE_DAYS_MS){
  console.log(JSON.stringify({status:'not_due',emails_sent:0}))
  process.exit(0)
}

const recipient=address(process.env.NEXOPS_CODEX_REPORT_RECIPIENT)
const sender=address(process.env.GMAIL_SENDER_EMAIL)
const approved=address(process.env.NEXOPS_GMAIL_APPROVED_SENDER)
if(sender!==approved)throw Error('REPORT_SENDER_NOT_APPROVED')

const since=new Date(now-THREE_DAYS_MS).toISOString()

const supabaseUrl=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY
const sbHeaders=serviceKey?{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,Prefer:'count=exact'}:null

async function exactCount(table,filters=[]){
  if(!supabaseUrl||!sbHeaders)return null
  const u=new URL(`${supabaseUrl.replace(/\/$/,'')}/rest/v1/${table}`)
  u.searchParams.set('select','*')
  for(const [k,v] of filters)u.searchParams.append(k,v)
  try{
    const r=await fetch(u,{headers:{...sbHeaders,Range:'0-0'},signal:AbortSignal.timeout(15000)})
    if(!r.ok)return null
    const range=r.headers.get('content-range')||''
    const total=range.split('/')[1]
    return /^\d+$/.test(total||'')?Number(total):null
  }catch{return null}
}

async function uniqueUsers(table,timeColumn,eventFilter){
  if(!supabaseUrl||!sbHeaders)return null
  const seen=new Set()
  for(let start=0;start<20000;start+=1000){
    const u=new URL(`${supabaseUrl.replace(/\/$/,'')}/rest/v1/${table}`)
    u.searchParams.set('select','user_id')
    u.searchParams.set(timeColumn,`gte.${since}`)
    if(eventFilter)u.searchParams.set(eventFilter[0],eventFilter[1])
    let r
    try{
      r=await fetch(u,{headers:{...sbHeaders,Range:`${start}-${start+999}`},signal:AbortSignal.timeout(15000)})
    }catch{return null}
    if(!r.ok)return null
    const rows=await r.json().catch(()=>null)
    if(!Array.isArray(rows))return null
    for(const row of rows)if(row?.user_id)seen.add(row.user_id)
    if(rows.length<1000)break
  }
  return seen.size
}

const kpis={
  totalUsers:await exactCount('nexops_profiles'),
  newUsers:await exactCount('nexops_profiles',[['created_at',`gte.${since}`]]),
  demoUsers:await uniqueUsers('nexops_activation','demo_opened_at'),
  firstValueUsers:await uniqueUsers('nexops_activation','first_value_at'),
  returningUsers:await uniqueUsers('nexops_events','occurred_at',['event_name','eq.user_returned']),
  consultationRequests:await exactCount('nexops_consultation_leads',[['created_at',`gte.${since}`]])
}
const metric=v=>Number.isInteger(v)?String(v):'unavailable'

const commits=git(['log',`--since=${since}`,'--date=short','--pretty=format:%h|%ad|%s'])
  .split('\n').filter(Boolean)
const importantCommits=commits.slice(0,8)

const changed=git(['log',`--since=${since}`,'--name-only','--pretty=format:'])
  .split('\n').map(x=>x.trim()).filter(Boolean)
const changedUnique=[...new Set(changed)].slice(0,12)

const logFiles=(await readdir(LOG_DIR).catch(()=>[]))
  .filter(n=>/^v3-.*\.log$/.test(n)||/^codex-.*\.log$/.test(n))
let recentLogs=[]
for(const name of logFiles){
  const full=path.join(LOG_DIR,name)
  const s=await stat(full)
  if(s.mtimeMs<now-THREE_DAYS_MS)continue
  const text=await readFile(full,'utf8')
  const lines=text.split('\n').filter(l=>/(successful|passed|build|blocked|stop:|error|security|test|commit|complete)/i.test(l))
  recentLogs.push(...lines.slice(-8).map(l=>l.replace(/[A-Za-z0-9_\-]{30,}/g,'[redacted]')))
}
recentLogs=recentLogs.slice(-16)

let nextTask=''
try{
  const text=await readFile(path.join(REPO,'docs/NEXT_TASK.md'),'utf8')
  const m=text.match(/### Status[\s\S]*?(?=\n### |$)/)
  nextTask=(m?.[0]||'').trim().slice(0,1200)
}catch{}

const subject='Stockwise / Nexops — 3-Day Codex Activity Summary'
const body=[
  'Stockwise / Nexops — 3-Day Codex Activity Summary',
  '',
  `Period: ${new Date(now-THREE_DAYS_MS).toLocaleString()} — ${new Date(now).toLocaleString()}`,
  '',
  'EXECUTIVE KPI SUMMARY',
  `- New users in last 3 days: ${metric(kpis.newUsers)}`,
  `- Total users: ${metric(kpis.totalUsers)}`,
  `- Users who opened demo: ${metric(kpis.demoUsers)}`,
  `- Users who reached First Value: ${metric(kpis.firstValueUsers)}`,
  `- Returning users: ${metric(kpis.returningUsers)}`,
  `- Consultation requests: ${metric(kpis.consultationRequests)}`,
  '',
  '1) Major Codex accomplishments',
  ...(importantCommits.length?importantCommits.map(x=>'- '+x):['- No git commits recorded in the last 3 days.']),
  `- Total commits in period: ${commits.length}`,
  '',
  '2) Key files changed',
  ...(changedUnique.length?changedUnique.map(x=>'- '+x):['- No changed files recorded from commits.']),
  '',
  '3) Test / build / blocker signals',
  ...(recentLogs.length?recentLogs.map(x=>'- '+x):['- No matching recent test/build/blocker log lines found.']),
  '',
  '4) Current task status',
  nextTask||'No NEXT_TASK status excerpt available.',
  '',
  '5) Next 3-day focus',
  '- Prioritize measurable activation and user growth, not commit volume alone.',
  '- Continue the current READY task if safely actionable.',
  '- Preserve production deploy, billing, schema/RLS, secret and irreversible-change gates.',
  '- Resolve explicit CONFIGURATION REQUIRED items before claiming live readiness.',
  '',
  'KPI definitions: new/total users use nexops_profiles; demo and First Value use unique users in nexops_activation; returning users use unique user_returned events; consultations use nexops_consultation_leads.',
  'If a KPI is unavailable, the report says unavailable rather than treating missing data as zero.'
].join('\n')

const contentHash=sha(recipient+'\n'+subject+'\n'+body)
if(state.last_content_hash===contentHash){
  console.log(JSON.stringify({status:'duplicate_held',emails_sent:0}))
  process.exit(0)
}

const getAccessToken=gmailTokenProvider({
  clientId:process.env.GMAIL_CLIENT_ID,
  clientSecret:process.env.GMAIL_CLIENT_SECRET,
  refreshToken:process.env.GMAIL_REFRESH_TOKEN
})
const token=await getAccessToken()
const profile=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{
  headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)
})
if(!profile.ok)throw Error('REPORT_GMAIL_PROFILE_UNCONFIRMED')
const profileData=await profile.json()
if(profileData.emailAddress?.toLowerCase()!==sender)throw Error('REPORT_GMAIL_SENDER_MISMATCH')

const encodedSubject=Buffer.from(subject).toString('base64')
const messageId=sha(contentHash+'|'+since)
const raw=Buffer.from(
  `From: ${sender}\r\nTo: ${recipient}\r\nSubject: =?UTF-8?B?${encodedSubject}?=\r\nMessage-ID: <${messageId}@${sender.split('@')[1]}>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(body).toString('base64')}\r\n`
).toString('base64url')

await writeFile(REPORT_FILE,body,{mode:0o600})

let providerId=null
try{
  const sent=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({raw})
  })
  if(!sent.ok)throw Error('REPORT_DELIVERY_UNCONFIRMED')
  const result=await sent.json()
  if(!result.id)throw Error('REPORT_DELIVERY_UNCONFIRMED')
  providerId=result.id
}catch{
  const unknown={...state,last_attempt_at:new Date(now).toISOString(),last_outcome:'delivery_unknown',last_content_hash:contentHash}
  await writeFile(STATE_FILE,JSON.stringify(unknown,null,2)+'\n',{mode:0o600})
  console.log(JSON.stringify({status:'delivery_unknown_no_retry',emails_sent:'unconfirmed'}))
  process.exit(2)
}

await writeFile(STATE_FILE,JSON.stringify({
  last_sent_at:new Date(now).toISOString(),
  last_outcome:'sent',
  last_content_hash:contentHash,
  provider_id:providerId
},null,2)+'\n',{mode:0o600})
console.log(JSON.stringify({status:'sent',emails_sent:1}))
