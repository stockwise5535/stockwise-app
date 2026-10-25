// Auth/PostgREST are simulated; SQL and RLS execute on a local PostgreSQL engine.
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {chromium}=require(process.env.NEXOPS_PLAYWRIGHT_PATH || 'playwright-core')
const {PGlite}=require(process.env.NEXOPS_PGLITE_PATH || '@electric-sql/pglite')
const db=new PGlite(),userId='44444444-4444-4444-8444-444444444444'
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`)
for(const filename of ['202610240001_growth_foundation.sql','202610240002_growth_lifecycle.sql','202610240003_outbound_safety.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+filename,import.meta.url),'utf8'))
const browser=await chromium.launch({executablePath:process.env.NEXOPS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']})
const base=process.env.NEXOPS_GROWTH_TEST_URL || 'http://127.0.0.1:5174'
const apiBase='http://127.0.0.1:54329'
const user={id:userId,aud:'authenticated',role:'authenticated',email:'local-user@example.test',email_confirmed_at:null,created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},identities:[]}
const tokens=new Map()
const authToken=()=>{if(!tokens.has(user.id))tokens.set(user.id,[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'local-signature'].join('.'));return tokens.get(user.id)}
const session=()=>({access_token:authToken(),refresh_token:'local-test-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user})
const rpcParams={nexops_is_growth_admin:[],nexops_can_review_outbound:['w'],nexops_bootstrap:[],nexops_track_event:['p_event_name','p_workspace_id','p_properties','p_event_id'],nexops_submit_consultation:['p_workspace_id','p_details','p_request_id'],nexops_create_workspace:['p_name','p_market','p_locale','p_request_id'],nexops_create_invite:['p_workspace_id','p_role'],nexops_accept_invite:['p_token'],nexops_set_preferences:['p_marketing_opt_in','p_locale'],nexops_request_deletion:[],nexops_growth_metrics:[]}
let queue=Promise.resolve(),bootstrapCalls=0,failBootstrap=false,signupRedirect=null,permissionFailure=false,permissionDelay=0,internalDataCalls=0,failFirstRecommendation=false,failedRecommendationId=null,retriedRecommendationId=null
async function backend(route){
 const request=route.request(),url=new URL(request.url()),path=url.pathname
 const fulfill=(status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}})
 if(request.method()==='OPTIONS')return fulfill(200,{})
 if(path==='/auth/v1/signup'){
  signupRedirect=url.searchParams.get('redirect_to');await db.exec('reset role');await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,null) on conflict do nothing',[userId,user.email]);return fulfill(200,{user,session:null})
 }
 if(path==='/auth/v1/token')return fulfill(200,session())
 if(path==='/auth/v1/logout')return fulfill(204,null)
 if(path==='/auth/v1/user')return fulfill(200,user)
 try{
  if(request.headers().authorization!==`Bearer ${authToken()}`)return fulfill(401,{message:'Sign-in required'})
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user.id]);await db.exec('set role authenticated')
  if(path==='/rest/v1/rpc/nexops_bootstrap'){bootstrapCalls++;if(failBootstrap)return fulfill(403,{message:'Fixture setup denied',code:'42501'})}
  if(['/rest/v1/rpc/nexops_is_growth_admin','/rest/v1/rpc/nexops_can_review_outbound'].includes(path)){if(permissionDelay)await new Promise(r=>setTimeout(r,permissionDelay));if(permissionFailure)return fulfill(503,{message:'Fixture permission unavailable'})}
  if(['/rest/v1/nexops_outbound_messages','/rest/v1/nexops_outbound_history','/rest/v1/nexops_email_templates','/rest/v1/rpc/nexops_growth_metrics'].includes(path))internalDataCalls++
  if(path==='/rest/v1/rpc/nexops_track_event'&&request.postDataJSON()?.p_event_name==='recommended_action_viewed'){
   if(failFirstRecommendation){failFirstRecommendation=false;failedRecommendationId=request.postDataJSON().p_event_id;return fulfill(503,{message:'Fixture progress unavailable'})}
   if(failedRecommendationId)retriedRecommendationId=request.postDataJSON().p_event_id
  }
  if(path.startsWith('/rest/v1/rpc/')){
   const name=path.split('/').at(-1),keys=rpcParams[name];if(!keys)throw new Error('Unsupported RPC')
   const body=request.postDataJSON() || {}
   const args=keys.map(k=>body[k])
   const result=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)
   return fulfill(200,result.rows[0].value)
  }
  const table=path.split('/').at(-1)
  if(!['nexops_workspaces','nexops_profiles','nexops_workspace_memberships','nexops_activation','nexops_consultation_leads','nexops_lead_qualification','nexops_organizations','nexops_organization_memberships','nexops_outbound_messages','nexops_outbound_history','nexops_email_templates'].includes(table))throw new Error('Unsupported table')
  const values=[],conditions=[]
  for(const key of ['workspace_id','user_id'])if(url.searchParams.has(key)){values.push(url.searchParams.get(key).replace(/^eq\./,''));conditions.push(`${key}=$${values.length}`)}
  const result=await db.query(`select * from public.${table}${conditions.length?' where '+conditions.join(' and '):''}`,values)
  return fulfill(200,request.headers().accept?.includes('vnd.pgrst.object') ? result.rows[0] : result.rows)
 }catch(e){return fulfill(400,{message:e.message,code:e.code})}
}
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]
 let expectedDemoFailure=false
 page.on('pageerror',e=>{if(!(expectedDemoFailure&&/Cannot read properties/.test(e.message)))errors.push(e.message)})
 await page.route(apiBase+'/**',route=>{const next=queue.then(()=>backend(route));queue=next.catch(()=>{});return next})
 await page.goto(base+'/signup')
 await page.getByText('Free for 30 days. No credit card.').waitFor()
 await page.locator('input[type=email]').fill(user.email);await page.locator('input[type=password]').fill('local-test-password-only')
 await page.getByRole('button',{name:'Create account'}).click()
 await page.getByText('Check your email to confirm, then log in.',{exact:true}).waitFor()
 assert.equal(bootstrapCalls,0);assert.equal(signupRedirect,base+'/growth')
 // Simulate the email confirmation link locally; no real signup/email endpoint is called.
 await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=now() where id=$1',[userId]);user.email_confirmed_at=new Date().toISOString()
 failBootstrap=true
 await page.goto(base+'/growth#access_token='+authToken()+'&refresh_token=local-test-refresh&token_type=bearer&expires_in=3600&type=signup')
 await page.getByRole('heading',{name:'Workspace setup needs attention'}).waitFor()
 assert.equal(await page.getByRole('navigation',{name:'Growth workspace pages'}).count(),0)
 assert.equal(bootstrapCalls,1)
 failBootstrap=false
 await page.getByRole('button',{name:'Retry workspace setup'}).click()
 await page.getByRole('heading',{name:'See what needs attention today'}).waitFor()
 await page.getByText('0 of 4 completed',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'TODAY',exact:true}).count(),0)
 assert.equal(bootstrapCalls,2)
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.screenshot({path:'/tmp/nexops-onboarding-mobile.png',fullPage:true})
 await page.getByRole('button',{name:"Start with today's risks",exact:true}).click()
 await page.getByRole('heading',{name:'TODAY',exact:true}).waitFor();await page.getByText('2 of 4 completed',{exact:true}).waitFor()
 await page.reload();await page.getByRole('heading',{name:'TODAY',exact:true}).waitFor();await page.getByText('2 of 4 completed',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:"Start with today's risks",exact:true}).count(),0)
 failFirstRecommendation=true
 await page.getByRole('button',{name:'Open highest-priority exception',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByText('Recommended next action',{exact:true}).waitFor();await page.keyboard.press('Escape')
 await page.getByText('3 of 4 completed',{exact:true}).waitFor();await page.getByRole('button',{name:'Retry saving progress',exact:true}).click()
 await page.getByLabel('Getting started complete',{exact:true}).waitFor();assert.equal(retriedRecommendationId,failedRecommendationId)
 // A malformed saved DEMO snapshot must recover without resetting server progress.
 expectedDemoFailure=true
 await page.evaluate(()=>localStorage.setItem('nexops_synthetic_operations_v1',JSON.stringify({version:2,data:{source:'synthetic',actions:[],decisions:[]},rows:[],reports:[]})))
 await page.reload();await page.getByRole('heading',{name:'We couldn’t open your demo',exact:true}).waitFor()
 await page.getByRole('button',{name:'Retry demo',exact:true}).click();await page.getByRole('heading',{name:'We couldn’t open your demo',exact:true}).waitFor()
 await page.getByRole('button',{name:'Reset demo and retry',exact:true}).click();await page.getByRole('heading',{name:'TODAY',exact:true}).waitFor();await page.getByLabel('Getting started complete',{exact:true}).waitFor()
 expectedDemoFailure=false
 await page.setViewportSize({width:1440,height:1000})
 await page.getByRole('navigation',{name:'Growth workspace pages'}).getByRole('button',{name:'Get started',exact:true}).click()
 await page.getByRole('heading',{name:'You’re ready to explore',exact:true}).waitFor();await page.getByText('4 of 4 completed',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Book a Consultation',exact:true}).click()
 const details={'Company':'Local APAC Co','Contact name':'Local contact','Contact email':'contact@example.test','Role (optional)':'Supply chain manager','Main operational workload / problem':'Supplier follow-up workload','Approximate SKU count (optional)':'200','Approximate supplier count (optional)':'20'}
 for(const [label,value]of Object.entries(details))await page.getByLabel(label,{exact:true}).fill(value)
 await page.getByRole('button',{name:'Submit consultation request',exact:true}).click()
 await page.getByRole('button',{name:'Request saved',exact:true}).waitFor()
 await page.getByRole('button',{name:'Consultation requests',exact:true}).click();await page.getByRole('heading',{name:'Local APAC Co',exact:true}).waitFor()
 assert.ok((await page.locator('.growth-card').textContent()).includes('Qualified Lead'))
 await page.getByRole('button',{name:'Invite a colleague',exact:true}).click();await page.getByRole('button',{name:'Create viewer invitation link',exact:true}).click();await page.getByLabel('Private invitation link',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Internal Growth Dashboard',exact:true}).count(),0)
 assert.equal(await page.getByRole('button',{name:'Outbound Review',exact:true}).count(),0)
 for(const view of ['dashboard','communications']){
  await page.goto(base+'/growth?view='+view);await page.getByRole('heading',{name:'Page unavailable for this workspace'}).waitFor()
  assert.equal(await page.getByRole('heading',{name:'Internal Growth Dashboard',exact:true}).count(),0);assert.equal(await page.getByRole('heading',{name:'Outbound Communication Review Queue'}).count(),0)
  await page.setViewportSize({width:390,height:844});assert.equal(await page.getByRole('button',{name:'Internal Growth Dashboard',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Outbound Review',exact:true}).count(),0)
 }
 assert.equal(internalDataCalls,0)
 await page.getByRole('button',{name:'Return to Product',exact:true}).click()
 await page.setViewportSize({width:1440,height:1000})
 await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByLabel('Company / workspace name').fill('Customer workspace');await page.getByRole('button',{name:'Create empty customer workspace',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('select[aria-label=Workspace]')?.selectedOptions[0]?.textContent.includes('customer'))
 await page.getByRole('button',{name:'Product',exact:true}).click();await page.getByRole('heading',{name:'Your customer workspace',exact:true}).waitFor();assert.equal(await page.getByLabel('Getting started with Nexops',{exact:true}).count(),0)
 await page.reload();await page.getByRole('heading',{name:'TODAY',exact:true}).waitFor()
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.locator('input[type=email]').waitFor();await page.goto(base+'/growth');await page.locator('input[type=email]').waitFor()
 await page.locator('input[type=email]').fill(user.email);await page.locator('input[type=password]').fill('local-test-password-only');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'TODAY',exact:true}).waitFor()
 const beforeRootBootstrap=bootstrapCalls
 await page.goto(base+'/');await page.getByRole('button',{name:/TODAY \/ /}).waitFor();assert.equal(bootstrapCalls,beforeRootBootstrap+1);await page.goto(base+'/growth');await page.getByRole('heading',{name:'TODAY',exact:true}).waitFor()
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.screenshot({path:'/tmp/nexops-growth-mobile.png',fullPage:true})
 await db.exec('reset role')
 const count=async(t)=>Number((await db.query(`select count(*) as n from public.${t}`)).rows[0].n)
 assert.equal(await count('nexops_organizations'),1);assert.equal(await count('nexops_workspaces'),2);assert.equal(await count('nexops_consultation_leads'),1);assert.equal(await count('nexops_exceptions'),0);assert.equal(await count('nexops_actions'),0)
 assert.equal(Number((await db.query("select count(*) n from public.nexops_events where event_name='activation_completed'")).rows[0].n),1)
 // Local fixture grants only: never modify hosted reviewer/admin assignments.
 await queue;await db.exec('reset role');const starterId=(await db.query('select id from public.nexops_workspaces where created_by=$1 and is_starter',[userId])).rows[0].id
 await db.query('insert into public.nexops_growth_admins(user_id)values($1)',[userId])
 await page.goto(base+'/growth?view=dashboard');await page.getByRole('heading',{name:'Internal Growth Dashboard',exact:true}).waitFor();await page.getByRole('button',{name:'Load authorized metrics',exact:true}).click();await page.getByText('registered users',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Internal Growth Dashboard',exact:true}).count(),1)
 // Admin + workspace owner can read the queue, but has no review assignment.
 await page.goto(base+'/growth?view=communications');await page.getByRole('heading',{name:'Outbound Communication Review Queue'}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Approve and Send',exact:true}).count(),0)
 await queue;await db.exec('reset role');await db.query('delete from public.nexops_growth_admins where user_id=$1',[userId]);await db.query('insert into public.nexops_outbound_reviewers(workspace_id,user_id)values($1,$2)',[starterId,userId])
 await page.goto(base+'/growth?view=communications');await page.getByRole('heading',{name:'Outbound Communication Review Queue'}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Internal Growth Dashboard',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Outbound Review',exact:true}).count(),1)
 await page.setViewportSize({width:390,height:844});assert.equal(await page.getByRole('button',{name:'Outbound Review',exact:true}).count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 const customerId=(await db.query("select id from public.nexops_workspaces where created_by=$1 and workspace_type='customer'",[userId])).rows[0].id
 permissionDelay=100
 await page.getByLabel('Workspace',{exact:true}).selectOption(customerId)
 assert.equal(await page.getByRole('heading',{name:'Outbound Communication Review Queue'}).count(),0)
 await page.getByRole('heading',{name:'Page unavailable for this workspace'}).waitFor();assert.equal(await page.getByRole('button',{name:'Outbound Review',exact:true}).count(),0)
 permissionDelay=0
 // A viewer can keep customer navigation but must not see consultation request records.
 await queue;await db.exec('reset role');await db.query("update public.nexops_workspace_memberships set role='viewer' where workspace_id=$1 and user_id=$2",[customerId,userId])
 await page.goto(base+'/growth?view=leads');await page.getByLabel('Workspace',{exact:true}).selectOption(customerId);await page.getByRole('heading',{name:'Page unavailable for this workspace'}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Consultation requests',exact:true}).count(),0)
 assert.equal(await page.getByRole('heading',{name:'Consultation requests',exact:true}).count(),0)
 await page.goto(base+'/growth?view=dashboard');await page.getByRole('heading',{name:'Page unavailable for this workspace'}).waitFor()
 permissionFailure=true
 await page.goto(base+'/growth?view=communications');await page.getByText('Access could not be verified. You can retry or return to Product.',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Outbound Communication Review Queue'}).count(),0)
 permissionFailure=false
 await page.getByRole('button',{name:'Retry access check'}).click();await page.getByRole('heading',{name:'Outbound Communication Review Queue'}).waitFor()
 // Reproduce profile-only confirmed existing user signing in directly at the legacy root.
 await page.close()
 const secondId='55555555-5555-4555-8555-555555555555'
 await db.exec('reset role');await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[secondId,'root-user@example.test'])
 assert.equal(Number((await db.query('select count(*) n from public.nexops_profiles where user_id=$1',[secondId])).rows[0].n),1)
 assert.equal(Number((await db.query('select count(*) n from public.nexops_workspaces where created_by=$1',[secondId])).rows[0].n),0)
 user.id=secondId;user.email='root-user@example.test'
 const context=await browser.newContext(),root=await context.newPage()
 root.on('pageerror',e=>errors.push(e.message))
 await root.route(apiBase+'/**',route=>{const next=queue.then(()=>backend(route));queue=next.catch(()=>{});return next})
 const rootCalls=bootstrapCalls
 await root.goto(base+'/');await root.locator('input[type=email]').fill(user.email);await root.locator('input[type=password]').fill('local-test-password-only');await root.getByRole('button',{name:'Log in',exact:true}).click()
 await root.getByRole('button',{name:/TODAY \/ /}).waitFor();assert.equal(bootstrapCalls,rootCalls+1)
 await db.exec('reset role')
 for(const [table,column]of [['nexops_organizations','created_by'],['nexops_workspaces','created_by'],['nexops_organization_memberships','user_id'],['nexops_workspace_memberships','user_id'],['nexops_activation','user_id']])assert.equal(Number((await db.query(`select count(*) n from public.${table} where ${column}=$1`,[secondId])).rows[0].n),1,table)
 assert.equal((await db.query('select role from public.nexops_workspace_memberships where user_id=$1',[secondId])).rows[0].role,'owner')
 // A second customer's incomplete demo must not interrupt their empty customer workspace.
 await root.goto(base+'/growth?view=account');await root.getByLabel('Company / workspace name').fill('Fresh customer workspace');await root.getByRole('button',{name:'Create empty customer workspace',exact:true}).click()
 await root.waitForFunction(()=>document.querySelector('select[aria-label=Workspace]')?.selectedOptions[0]?.textContent.includes('customer'))
 await root.getByRole('button',{name:'Product',exact:true}).click();await root.getByRole('heading',{name:'Your customer workspace',exact:true}).waitFor()
 assert.equal(await root.getByLabel('Getting started with Nexops',{exact:true}).count(),0)
 await root.getByRole('button',{name:'Get started',exact:true}).click();await root.getByText('0 of 4 completed',{exact:true}).waitFor();await root.getByRole('button',{name:"Start with today's risks",exact:true}).waitFor()
 await context.close()
 assert.deepEqual(errors,[])
 console.log('Local simulated Auth/PostgREST + real PostgreSQL browser flow passed: pending signup (no bootstrap), confirmation link, visible setup failure, manual retry, complete bootstrap, root fallback, profile-only existing root login repaired through RPC, single organization/starter under StrictMode, guided first value, persisted progress/completion, customer-workspace non-interruption, activation, consultation, qualification, invite, customer-only desktop/mobile navigation, blocked internal deep links, admin dashboard, scoped reviewer queue and permission-failure recovery, separate customer workspace, refresh, logout/login and mobile. No hosted integration claim.')
}finally{await browser.close();await db.close()}
