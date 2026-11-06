import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NEXOPS_PLAYWRIGHT_PATH || 'playwright-core'),{PGlite}=require(process.env.NEXOPS_PGLITE_PATH || '@electric-sql/pglite');
const base=process.env.NEXOPS_GROWTH_TEST_URL || 'http://127.0.0.1:5176',api='http://127.0.0.1:54329';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
for(const name of ['SUPABASE_SQL.sql','docs/proposals/SOCIAL_DASHBOARD_FOUNDATION.sql','docs/proposals/SOCIAL_AUTOPILOT.sql'])await db.exec(await readFile(new URL('../'+name,import.meta.url),'utf8'));
await db.exec('grant select on public.skus to authenticated');
await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now()),($3,$4,now())',[A,'local@example.test',B,'other@example.test']);
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const org=await scalar('insert into public.nexops_organizations(name,created_by)values($1,$2)returning id',['Internal',A]);
await db.query("insert into public.nexops_organization_memberships values($1,$2,'owner')",[org,A]);
const workspaces=[];for(const name of ['Internal One','Internal Two']){const id=await scalar('insert into public.nexops_workspaces(organization_id,name)values($1,$2)returning id',[org,name]);workspaces.push(id);await db.query("insert into public.nexops_workspace_memberships values($1,$2,'owner')",[id,A]);}
await db.query('insert into public.skus(user_id,name,stock_qty,daily_usage,lead_time)values($1,$2,42,2,7)',[A,'Legacy inventory']);
const users={[A]:{id:A,aud:'authenticated',role:'authenticated',email:'local@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}},[B]:{id:B,aud:'authenticated',role:'authenticated',email:'other@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}}};
const token=id=>[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'local-signature'].join('.');
let loginAs=A,permissionsFail=false,queue=Promise.resolve(),writes=0,adminCalls=0;const socialCalls=[];
async function backend(route){
 const req=route.request(),url=new URL(req.url()),path=url.pathname;
 const send=(status,data)=>route.fulfill({status,contentType:'application/json',body:data==null?'':JSON.stringify(data),headers:{'access-control-allow-origin':'*'}});
 if(req.method()==='OPTIONS')return send(200,{});
 if(path==='/auth/v1/token')return send(200,{access_token:token(loginAs),refresh_token:'local-refresh',token_type:'bearer',expires_in:3600,user:users[loginAs]});
 if(path==='/auth/v1/logout')return send(204,null);
 const bearer=req.headers().authorization?.slice(7);let id;
 try{id=JSON.parse(Buffer.from(bearer.split('.')[1],'base64url')).sub;}catch{return send(401,{});}
 if(!users[id])return send(401,{});
 if(path==='/auth/v1/user')return send(200,users[id]);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');
 if(path==='/rest/v1/rpc/nexops_is_growth_admin'){
  adminCalls++;if(permissionsFail)return send(503,{message:'fixture unavailable'});
  return send(200,await scalar('select public.nexops_is_growth_admin()'));
 }
 if(req.method()!=='GET'){writes++;return send(403,{message:'Local test forbids application writes'});}
 const table=path.split('/').at(-1);
 if(!['skus','nexops_workspaces','nexops_organization_memberships'].includes(table))return send(404,{});
 const params=[],where=[];for(const key of ['user_id'])if(url.searchParams.has(key)){params.push(url.searchParams.get(key).replace(/^eq\./,''));where.push(`${key}=$${params.length}`);}
 const r=await db.query(`select * from public.${table}${where.length?' where '+where.join(' and '):''}`,params);return send(200,r.rows);
}
const browser=await chromium.launch({executablePath:process.env.NEXOPS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('stockwise_lang','en'));
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await page.route(api+'/**',route=>{const next=queue.then(()=>backend(route));queue=next.catch(()=>{});return next;});
 await page.routeWebSocket('ws://127.0.0.1:54329/**',ws=>ws.close());
 await page.route('**/api/growth/social-metrics?**',route=>{
  const q=new URL(route.request().url()).searchParams;socialCalls.push(q.get('workspaceId'));
  return route.fulfill({status:200,json:{status:'complete',period:{start:q.get('start'),end:q.get('end')},fetchedAt:'2026-11-01T12:00:00Z',missingServices:[],channels:['linkedin','threads','x'].map(service=>({service,name:service,disconnected:false,metrics:{postCount:{status:'available',value:0,unit:'count'}},errors:[],postInventory:{scanned:1,complete:true,states:{sent:1}}}))}});
 });
 await page.route('**/api/growth/social-automation?**',r=>r.fulfill({status:200,json:{policy:{enabled:false},production:false,activationReady:false,factsVersion:'local',facts:[],posts:[],alerts:[]}}));
 async function login(){await page.locator('input[type=email]').fill(users[loginAs].email);await page.locator('input[type=password]').fill('local-test-password');await page.locator('button[type=submit]').click();}
 await page.goto(base+'/');await page.locator('input[type=email]').waitFor();await login();
 await page.getByAltText('Stockwise',{exact:true}).waitFor();await page.getByText('Legacy inventory',{exact:true}).first().waitFor();assert.equal(adminCalls,0);
 await page.locator('nav button').nth(1).click();await page.locator('input[type=file]').first().setInputFiles({name:'items.csv',mimeType:'text/csv',buffer:Buffer.from('item,supplier,stock_qty,daily_usage,lead_time_days\nNew item A,A,42,2,7\nNew item B,B,20,1,7\n')});
 await page.getByText('Early Access Request',{exact:true}).waitFor();assert.equal(writes,0);
 await page.goto(base+'/growth');await page.getByRole('alert').filter({hasText:'Growth administrator access is required'}).waitFor();assert.equal(await page.getByRole('region',{name:'SNS performance'}).count(),0);
 await queue;await db.exec('reset role');await db.query('insert into public.nexops_growth_admins(user_id)values($1)',[A]);
 await page.reload();await page.getByRole('region',{name:'SNS performance'}).waitFor();
 await page.getByRole('button',{name:'Load SNS metrics'}).click();await page.getByRole('article',{name:'x metrics'}).waitFor();assert.equal(socialCalls.at(-1),workspaces[0]);
 await page.getByLabel('Workspace',{exact:true}).selectOption(workspaces[1]);await page.getByText('未取得 / Not loaded',{exact:true}).waitFor();assert.equal(await page.getByRole('article').count(),0);
 await page.getByRole('button',{name:'Load SNS metrics'}).click();await page.getByRole('article',{name:'x metrics'}).waitFor();assert.equal(socialCalls.at(-1),workspaces[1]);
 await page.getByRole('button',{name:'Refresh automation state'}).click();await page.getByText('OFF — 自動公開停止',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Enable automatic publishing'}).isDisabled(),true);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 permissionsFail=true;await page.reload();await page.getByRole('alert').filter({hasText:'could not be verified'}).waitFor();assert.equal(await page.getByRole('region',{name:'SNS performance'}).count(),0);
 permissionsFail=false;await page.getByRole('button',{name:'Retry access check'}).click();await page.getByRole('region',{name:'SNS performance'}).waitFor();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.locator('input[type=email]').waitFor();await page.goto(base+'/');await page.locator('input[type=email]').waitFor();
 loginAs=B;await page.goto(base+'/growth');await login();await page.getByRole('alert').filter({hasText:'Growth administrator access is required'}).waitFor();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.locator('input[type=email]').waitFor();loginAs=A;await page.goto(base+'/');await login();await page.getByAltText('Stockwise',{exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // Exercise the unchanged PricingModal against a synthetic checkout page only.
 await page.setViewportSize({width:1440,height:1000});let checkoutBody;
 await page.route('**/api/create-checkout-session',r=>{checkoutBody=r.request().postDataJSON();return r.fulfill({status:200,json:{url:'https://checkout.stripe.com/c/pay/fixture'}});});
 await page.route('https://checkout.stripe.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<h1>Mock checkout</h1>'}));
 await page.goto(base+'/tests/fixtures/legacy-pricing.html');await page.getByRole('button',{name:'Choose this plan',exact:true}).first().click();await page.getByRole('heading',{name:'Mock checkout'}).waitFor();assert.equal(checkoutBody.priceId,'price_fixture_basic');assert.equal(checkoutBody.userId,A);
 assert.equal(writes,0);assert.deepEqual(errors,[]);console.log('Main integration browser PASS: existing login/logout, inventory/heatmap, Early Access gate, Stripe UI, isolated administrator dashboard, scope reset, failure denial, OFF controls and mobile. Only local SQL/mocked APIs; no hosted writes.');
}finally{await browser.close();await db.close();}
