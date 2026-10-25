// Explicit, no-email development verification. Uses ordinary Auth JWTs only.
// Creates labeled test workspaces/leads/invitations; never deletes, migrates or sends.
import {createClient} from '@supabase/supabase-js'
import {randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
const required=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','NEXOPS_DEV_PROJECT_REF',...['A','B'].flatMap(k=>[`NEXOPS_TEST_USER_${k}_EMAIL`,`NEXOPS_TEST_USER_${k}_PASSWORD`])]
const run='hosted-verification-'+randomUUID()
const rows=[],users={},clients=[]
const inventory=await readFile(new URL('../supabase/hosted_catalog_inventory.sql',import.meta.url),'utf8')
const expectedTables=[...new Set([...inventory.matchAll(/\('(nexops_[a-z_]+)'\)/g)].map(m=>m[1]))]
const add=(name,status,endpoint,extra={})=>{const row={name,status,endpoint,...extra};rows.push(row);console.log(JSON.stringify(row))}
const client=()=>{const c=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)})}});clients.push(c);return c}
const must=r=>{if(r.error)throw Object.assign(Error('Backend check failed'),{code:r.error.code,http:r.status||r.error.status});return r.data}
const check=(condition)=>{if(!condition)throw Error('Assertion failed')}
async function step(name,endpoint,fn,policy){try{await fn();add(name,'PASS',endpoint,policy?{expected_policy:policy}:{})}catch(e){if(e.inapplicable){add(name,'BLOCKED',endpoint,{reason:e.inapplicable});return}add(name,'FAIL',endpoint,{error_code:e.code||null,http_status:e.http||null,details_withheld:true,...(policy?{expected_policy:policy}:{})})}}
function blocked(name,endpoint){add(name,'BLOCKED',endpoint,{reason:'Prerequisite unavailable'})}
const rpc=(u,n,p={})=>u.c.rpc(n,p)
const select=(u,t,columns='*')=>u.c.from(t).select(columns)
async function denied(promise){const r=await promise;if(r.error){check(r.error.code==='42501');return}check(Array.isArray(r.data)&&r.data.length===0)}
const details=(label)=>({company:`Nexops DEVELOPMENT VERIFICATION ${run} ${label}`,contact_name:'Synthetic verification fixture',email:'verification@example.test',role:'Supply chain operations',industry:'Development test',market:'SG',company_size:'11-50',sku_count:200,supplier_count:20,tools:'Synthetic test fixture; no customer data',main_problem:'Development-only hosted persistence verification. No email or operational follow-up.',hiring:false,pilot_scope:'TEST ONLY'})
let targetValid=false
try{
 const missing=required.filter(n=>!process.env[n]?.trim());if(missing.length){add('configuration','BLOCKED','runtime',{missing});throw Error('Missing configuration')}
 if(process.argv[2]!=='--run')throw Error('Explicit --run required')
 const url=new URL(process.env.VITE_SUPABASE_URL)
 check(url.protocol==='https:'&&url.hostname===process.env.NEXOPS_DEV_PROJECT_REF+'.supabase.co'&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash)
 const key=process.env.VITE_SUPABASE_ANON_KEY;let role;try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role}catch{}
 check(!key.startsWith('sb_secret_')&&role!=='service_role');targetValid=true
 add('development_target_and_public_key_guard','PASS','configuration')
 for(const label of ['A','B']){
  const u=users[label]={c:client(),label}
  await step(`${label} login`,'/auth/v1/token?grant_type=password',async()=>{const r=await u.c.auth.signInWithPassword({email:process.env[`NEXOPS_TEST_USER_${label}_EMAIL`],password:process.env[`NEXOPS_TEST_USER_${label}_PASSWORD`]});const d=must(r);check(d.user.email_confirmed_at);u.id=d.user.id;const claims=JSON.parse(Buffer.from(d.session.access_token.split('.')[1],'base64url'));check(claims.role==='authenticated'&&claims.sub===u.id)})
  if(!u.id)continue
  await step(`${label} refresh`,'/auth/v1/token?grant_type=refresh_token',async()=>{const d=must(await u.c.auth.refreshSession());check(d.session&&d.user.id===u.id)})
  await step(`${label} restore session and verify server identity`,'/auth/v1/user',async()=>{const session=must(await u.c.auth.getSession()).session;const restored=client();must(await restored.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token}));check(must(await restored.auth.getUser()).user.id===u.id);u.c=restored})
  await step(`${label} organization/demo bootstrap and idempotency`,'/rest/v1/rpc/nexops_bootstrap',async()=>{u.demo=must(await rpc(u,'nexops_bootstrap'));check(typeof u.demo==='string');check(must(await rpc(u,'nexops_bootstrap'))===u.demo);const w=must(await select(u,'nexops_workspaces').eq('id',u.demo).single());check(w.workspace_type==='demo'&&w.is_starter&&w.created_by===u.id);u.org=w.organization_id;u.demoRow=w;u.orgRow=must(await select(u,'nexops_organizations').eq('id',u.org).single());check(u.orgRow.created_by===u.id)})
  if(!u.demo||!u.org)continue
  await step(`${label} organization membership persistence`,'/rest/v1/nexops_organization_memberships',async()=>{const m=must(await select(u,'nexops_organization_memberships').eq('organization_id',u.org).eq('user_id',u.id).single());check(m.role==='owner')},'org_members')
  await step(`${label} starter workspace membership persistence`,'/rest/v1/nexops_workspace_memberships',async()=>{check(must(await select(u,'nexops_workspace_memberships').eq('workspace_id',u.demo).eq('user_id',u.id).single()).role==='owner')},'workspace_members')
  for(const kind of ['private','shared'])await step(`${label} ${kind} customer workspace creation/persistence/idempotency`,'/rest/v1/rpc/nexops_create_workspace',async()=>{const p={p_name:`Nexops DEVELOPMENT VERIFICATION ${run} ${label}-${kind}`,p_market:'SG',p_locale:'en',p_request_id:randomUUID()};u[kind]=must(await rpc(u,'nexops_create_workspace',p));check(must(await rpc(u,'nexops_create_workspace',p))===u[kind]);const w=must(await select(u,'nexops_workspaces').eq('id',u[kind]).single());check(w.name===p.p_name&&w.workspace_type==='customer'&&w.organization_id===u.org&&w.created_by===u.id);u[kind+'Row']=w;check(must(await select(u,'nexops_workspace_memberships').eq('workspace_id',u[kind]).eq('user_id',u.id).single()).role==='owner')})
  u.eventIds=[]
  await step(`${label} demo activation event RPCs and activation persistence`,'/rest/v1/rpc/nexops_track_event + nexops_activation',async()=>{for(const name of ['demo_workspace_opened','today_viewed','exception_opened','recommended_action_viewed']){const p={p_event_name:name,p_workspace_id:u.demo,p_properties:{screen:'hosted_verification',referral_source:run},p_event_id:randomUUID()};u.eventIds.push(p.p_event_id);must(await rpc(u,'nexops_track_event',p));must(await rpc(u,'nexops_track_event',p))}const a=must(await select(u,'nexops_activation').eq('workspace_id',u.demo).eq('user_id',u.id).single());check(a.activated_at&&a.today_viewed_at&&a.exception_opened_at&&a.first_value_at&&a.demo_opened_at);u.activation=a;const again=must(await select(u,'nexops_activation').eq('workspace_id',u.demo).eq('user_id',u.id).single());check(again.activated_at===a.activated_at)},'activation_self')
  await step(`${label} raw event SELECT denied (server-owned event log)`,'/rest/v1/nexops_events',async()=>{const r=await select(u,'nexops_events','event_id').eq('user_id',u.id).limit(0);check(r.error?.code==='42501')})
  add(`${label} independent raw event persistence/count verification`,'BLOCKED','public.nexops_events',{reason:'Authenticated SELECT intentionally revoked; requires read-only admin catalog/query access. RPC success and activation persistence are verified separately.'})
  for(const kind of ['private','shared']){
   if(!u[kind]){blocked(`${label} ${kind} lead`,'nexops_submit_consultation');continue}
   await step(`${label} ${kind} consultation persistence and idempotency`,'/rest/v1/rpc/nexops_submit_consultation + nexops_consultation_leads',async()=>{const d=details(`${label}-${kind}`);const p={p_workspace_id:u[kind],p_details:d,p_request_id:randomUUID()};u[kind+'Lead']=must(await rpc(u,'nexops_submit_consultation',p));check(must(await rpc(u,'nexops_submit_consultation',p))===u[kind+'Lead']);const l=must(await select(u,'nexops_consultation_leads').eq('id',u[kind+'Lead']).single());check(l.company===d.company&&l.email===d.email&&l.workspace_id===u[kind]&&l.submitted_by===u.id)},'lead_member')
   if(u[kind+'Lead'])await step(`${label} ${kind} lead qualification`,'/rest/v1/nexops_lead_qualification',async()=>{const q=must(await select(u,'nexops_lead_qualification').eq('lead_id',u[kind+'Lead']).eq('workspace_id',u[kind]).single());check(q.status==='Qualified Lead'&&q.score===90)},'qualification_member')
  }
  await step(`${label} demo operational import writes denied`,'/rest/v1/nexops_data_imports',async()=>{const r=await u.c.from('nexops_data_imports').insert({workspace_id:u.demo,source_kind:'customer',filename:'DEVELOPMENT-VERIFICATION-NOT-CUSTOMER.csv',validation_status:'pending'});check(r.error?.code==='42501')})
  await step(`${label} demo operational action writes denied`,'/rest/v1/nexops_actions',async()=>{const r=await u.c.from('nexops_actions').insert({workspace_id:u.demo,status:'Open'});check(r.error?.code==='42501')})
 }
 const A=users.A,B=users.B
 if(A?.id&&B?.id)await step('distinct test identities','/auth/v1/user',async()=>check(A.id!==B.id))
 if(A?.org&&B?.org)await step('distinct starter organizations','nexops_organizations',async()=>check(A.org!==B.org))
 for(const [actor,target]of [[A,B],[B,A]]){
  if(!actor?.id||!target?.private||!target?.org){blocked('bidirectional private isolation','foundation prerequisites');continue}
  const name=`${actor.label} cannot access ${target.label}`
  const existingOrgMembership=await select(actor,'nexops_organization_memberships').eq('organization_id',target.org).eq('user_id',actor.id)
  const legitimatelyShared=!existingOrgMembership.error&&existingOrgMembership.data.length>0
  for(const [table,col,id,policy]of [['nexops_profiles','user_id',target.id,'profile_self'],['nexops_organizations','id',target.org,'org_member'],['nexops_organization_memberships','organization_id',target.org,'org_members'],['nexops_workspaces','id',target.private,'workspace_member'],['nexops_workspace_memberships','workspace_id',target.private,'workspace_members'],['nexops_activation','workspace_id',target.demo,'activation_self'],['nexops_consultation_leads','workspace_id',target.private,'lead_member'],['nexops_lead_qualification','workspace_id',target.private,'qualification_member']])await step(`${name} ${table} read`,`/rest/v1/${table}`,async()=>{if(legitimatelyShared&&['nexops_organizations','nexops_organization_memberships'].includes(table))throw Object.assign(Error('Existing sharing'),{inapplicable:'Existing explicit organization membership permits this read. Use previously unshared test accounts for this check.'});const r=await select(actor,table).eq(col,id);check(!r.error&&r.data.length===0)},policy)
  for(const [table,id,original]of [['nexops_organizations',target.org,target.orgRow],['nexops_workspaces',target.private,target.privateRow]])await step(`${name} ${table} modification`,`/rest/v1/${table}`,async()=>{await denied(actor.c.from(table).update({name:'FORBIDDEN '+run}).eq('id',id).select('id'));const after=must(await select(target,table,'id,name').eq('id',id).single());check(after.name===original.name)})
  for(const [fn,args]of [['nexops_track_event',{p_event_name:'today_viewed',p_workspace_id:target.private,p_properties:{},p_event_id:randomUUID()}],['nexops_submit_consultation',{p_workspace_id:target.private,p_details:details('FORBIDDEN'),p_request_id:randomUUID()}],['nexops_create_invite',{p_workspace_id:target.private,p_role:'viewer'}]])await step(`${name} ${fn} write`,`/rest/v1/rpc/${fn}`,async()=>{const r=await rpc(actor,fn,args);check(r.error?.code==='42501')})
  await step(`${name} membership self-escalation`,'/rest/v1/nexops_workspace_memberships',async()=>{const r=await actor.c.from('nexops_workspace_memberships').insert({workspace_id:target.private,user_id:actor.id,role:'owner'});check(r.error?.code==='42501')})
 }
 const anon={c:client()}
 for(const table of expectedTables)await step(`anonymous protected ${table} denied`,`/rest/v1/${table}`,async()=>{const r=await select(anon,table).limit(0);check(r.error?.code==='42501'&&[401,403].includes(r.status))})
 await step('anonymous bootstrap denied','/rest/v1/rpc/nexops_bootstrap',async()=>check((await rpc(anon,'nexops_bootstrap')).error?.code==='42501'))
 // Share only dedicated verification workspaces after private isolation checks.
 for(const [owner,viewer]of [[A,B],[B,A]]){
  if(!owner?.shared||!viewer?.id){blocked('invitation flow','nexops_create_invite');continue}
  let token
  await step(`${owner.label} invitation creation/persistence`,'/rest/v1/rpc/nexops_create_invite + nexops_invitations',async()=>{token=must(await rpc(owner,'nexops_create_invite',{p_workspace_id:owner.shared,p_role:'viewer'}));const i=must(await select(owner,'nexops_invitations').eq('token',token).single());check(i.role==='viewer'&&i.workspace_id===owner.shared&&!i.accepted_by&&Date.parse(i.expires_at)>Date.now())},'invite_manager')
  await step(`${owner.label} owner-role invitation rejected`,'/rest/v1/rpc/nexops_create_invite',async()=>{const r=await rpc(owner,'nexops_create_invite',{p_workspace_id:owner.shared,p_role:'owner'});check(r.error?.code==='23514')})
  if(!token)continue
  await step(`${viewer.label} anonymous invitation acceptance denied`,'/rest/v1/rpc/nexops_accept_invite',async()=>check((await rpc(anon,'nexops_accept_invite',{p_token:token})).error?.code==='42501'))
  await step(`${viewer.label} invitation acceptance/idempotency`,'/rest/v1/rpc/nexops_accept_invite',async()=>{check(must(await rpc(viewer,'nexops_accept_invite',{p_token:token}))===owner.shared);check(must(await rpc(viewer,'nexops_accept_invite',{p_token:token}))===owner.shared)})
  await step(`${viewer.label} accepted membership persistence`,'/rest/v1/nexops_workspace_memberships + nexops_organization_memberships',async()=>{check(must(await select(viewer,'nexops_workspace_memberships').eq('workspace_id',owner.shared).eq('user_id',viewer.id).single()).role==='viewer');check(must(await select(viewer,'nexops_organization_memberships').eq('organization_id',owner.org).eq('user_id',viewer.id).single()).role==='member');check(must(await select(viewer,'nexops_workspaces').eq('id',owner.shared)).length===1)})
  await step(`${viewer.label} explicit invitation organization membership allows organization metadata`,'/rest/v1/nexops_organizations',async()=>check(must(await select(viewer,'nexops_organizations','id').eq('id',owner.org)).length===1),'org_member')
  await step(`${owner.label} used invitation cannot be accepted by another identity`,'/rest/v1/rpc/nexops_accept_invite',async()=>check((await rpc(owner,'nexops_accept_invite',{p_token:token})).error?.code==='P0001'))
  await step(`${viewer.label} viewer cannot see invitation token`,'/rest/v1/nexops_invitations',async()=>{check(must(await select(viewer,'nexops_invitations').eq('workspace_id',owner.shared)).length===0)},'invite_manager')
  await step(`${viewer.label} viewer cannot read shared lead PII`,'/rest/v1/nexops_consultation_leads',async()=>{check(owner.sharedLead);check(must(await select(viewer,'nexops_consultation_leads').eq('workspace_id',owner.shared)).length===0)},'lead_member')
  await step(`${viewer.label} viewer cannot submit shared lead`,'/rest/v1/rpc/nexops_submit_consultation',async()=>check((await rpc(viewer,'nexops_submit_consultation',{p_workspace_id:owner.shared,p_details:details('FORBIDDEN-viewer'),p_request_id:randomUUID()})).error?.code==='42501'))
  await step(`${viewer.label} viewer cannot invite`,'/rest/v1/rpc/nexops_create_invite',async()=>check((await rpc(viewer,'nexops_create_invite',{p_workspace_id:owner.shared,p_role:'operator'})).error?.code==='42501'))
  await step(`${viewer.label} viewer cannot self-promote`,'/rest/v1/nexops_workspace_memberships',async()=>{await denied(viewer.c.from('nexops_workspace_memberships').update({role:'owner'}).eq('workspace_id',owner.shared).eq('user_id',viewer.id).select('*'));check(must(await select(owner,'nexops_workspace_memberships').eq('workspace_id',owner.shared).eq('user_id',viewer.id).single()).role==='viewer')})
  await step(`${viewer.label} shared org membership does not expose private workspace`,'/rest/v1/nexops_workspaces',async()=>check(must(await select(viewer,'nexops_workspaces').eq('id',owner.private)).length===0),'workspace_member')
  await step(`${viewer.label} invalid invitation rejected`,'/rest/v1/rpc/nexops_accept_invite',async()=>check((await rpc(viewer,'nexops_accept_invite',{p_token:randomUUID()})).error?.code==='P0001'))
 }
 // Verify event IDs survive an independent session without granting raw event-log access.
 for(const u of Object.values(users))if(u.private)await step(`${u.label} event durability across independent sessions via persistent idempotency`,'/rest/v1/rpc/nexops_track_event + nexops_activation',async()=>{
  const get=async c=>must(await c.from('nexops_activation').select('*').eq('workspace_id',u.private).eq('user_id',u.id).single())
  const before=await get(u.c);check(!before.today_viewed_at&&!before.first_value_at)
  const p={p_event_name:'today_viewed',p_workspace_id:u.private,p_properties:{screen:'hosted_verification',referral_source:run},p_event_id:randomUUID()}
  must(await rpc(u,'nexops_track_event',p));const first=await get(u.c);check(first.today_viewed_at&&!first.first_value_at)
  const fresh=client();must(await fresh.auth.signInWithPassword({email:process.env[`NEXOPS_TEST_USER_${u.label}_EMAIL`],password:process.env[`NEXOPS_TEST_USER_${u.label}_PASSWORD`]}))
  must(await fresh.rpc('nexops_track_event',{...p,p_event_name:'recommended_action_viewed'}));const duplicate=await get(fresh);check(duplicate.today_viewed_at===first.today_viewed_at&&!duplicate.first_value_at)
  must(await fresh.rpc('nexops_track_event',{...p,p_event_name:'recommended_action_viewed',p_event_id:randomUUID()}));const unique=await get(u.c);check(unique.first_value_at&&unique.today_viewed_at===first.today_viewed_at)
  must(await fresh.auth.signOut({scope:'local'}))
 })
 // Read persisted fixtures again after a fresh login, independent of the initial session.
 for(const u of Object.values(users))if(u.id)await step(`${u.label} persisted records after fresh login`,'/auth/v1/token + foundation GET',async()=>{const c=client();must(await c.auth.signInWithPassword({email:process.env[`NEXOPS_TEST_USER_${u.label}_EMAIL`],password:process.env[`NEXOPS_TEST_USER_${u.label}_PASSWORD`]}));const fresh={c};check(u.private&&u.privateLead&&u.activation);check(must(await select(fresh,'nexops_workspaces').eq('id',u.private).single()).name===u.privateRow.name);check(must(await select(fresh,'nexops_consultation_leads').eq('id',u.privateLead).single()).workspace_id===u.private);check(must(await select(fresh,'nexops_activation').eq('workspace_id',u.demo).eq('user_id',u.id).single()).activated_at===u.activation.activated_at);check(must(await select(fresh,'nexops_organization_memberships').eq('organization_id',u.org).eq('user_id',u.id).single()).role==='owner');check(must(await select(fresh,'nexops_workspace_memberships').eq('workspace_id',u.private).eq('user_id',u.id).single()).role==='owner');must(await c.auth.signOut({scope:'local'}))})
}catch(e){add('harness prerequisites','FAIL','configuration',{error_type:e.name,details_withheld:true})}
finally{
 for(const u of Object.values(users))if(u.id)await step(`${u.label} logout and session clearing`,'/auth/v1/logout?scope=local',async()=>{must(await u.c.auth.signOut({scope:'local'}));check(!must(await u.c.auth.getSession()).session)})
 for(const c of clients){try{if((await c.auth.getSession()).data.session)await c.auth.signOut({scope:'local'})}catch{}}
 const summary={run,development_target_matches:targetValid,results:rows,counts:Object.fromEntries(['PASS','FAIL','BLOCKED'].map(s=>[s,rows.filter(r=>r.status===s).length])),migrations_applied:[],emails_sent:0,fixture_cleanup:'No deletion. Labeled test workspaces/leads/invites retained.',limits:['No admin token or service role used for behavioral tests.','Raw event counts and global operational-table contents require separate read-only admin access.','Session restoration was in memory, not a browser restart/storage test.']}
 await writeFile('/tmp/nexops-hosted-growth-results.json',JSON.stringify(summary,null,2),{mode:0o600});console.log(JSON.stringify({summary:summary.counts,run}));if(summary.counts.FAIL)process.exitCode=1
}
