import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialStore} from '../../server/social-store.js';
import {runSocialCycle} from '../../server/social-cycle.js';
import {syncSocialMetrics} from '../../server/social-metrics-sync.js';
import {runtimeBinding} from '../../server/social-runtime.js';
import {approvedPostCatalog} from '../../server/social-stock.js';
import {FACTS_VERSION} from '../../server/social-content.js';
const require=createRequire(import.meta.url),{PGlite}=require(process.env.NEXOPS_PGLITE_PATH || '@electric-sql/pglite');
const A='11111111-1111-4111-8111-111111111111',O='22222222-2222-4222-8222-222222222222',W='33333333-3333-4333-8333-333333333333';
// Minimal local Supabase query transport backed by real PostgreSQL. No HTTP client.
function localClient(db){
 return {async rpc(name,args){assert.match(name,/^nexops_social_[a-z_]+$/);const entries=Object.entries(args);try{return {data:(await db.query(`select public.${name}(${entries.map(([k],i)=>`"${k}" => $${i+1}`).join(',')}) as value`,entries.map(([,v])=>v))).rows[0].value};}catch(error){return {error};}},
 from(table){assert.match(table,/^nexops_social_[a-z_]+$/);const filters=[],values=[];let mode='select',body,limit=200,order;
 const identifier=k=>{assert.match(k,/^[a-z_]+$/);return '"'+k+'"';};
 const execute=async()=>{try{let sql;
 if(mode==='upsert'||mode==='insert'){const keys=Object.keys(body);for(const k of keys)identifier(k);values.push(...Object.values(body));sql=`insert into public.${table}(${keys.map(identifier)})values(${keys.map((_,i)=>'$'+(i+1))})`;
 if(mode==='upsert')sql+=' on conflict (organization_id,period_start,period_end) do update set payload=excluded.payload,updated_at=excluded.updated_at';}
 else{const where=filters.length?' where '+filters.map(([k,v,op])=>{values.push(v);return identifier(k)+(op==='in'?'=ANY($'+values.length+'::text[])':'=$'+values.length);}).join(' and '):'';
 if(mode==='update'){const keys=Object.keys(body);const set=keys.map(k=>{values.push(body[k]);return identifier(k)+'=$'+values.length;}).join(',');sql=`update public.${table} set ${set}${where}`;}
 else sql=`select * from public.${table}${where}${order?' order by '+identifier(order[0])+(order[1]?' asc':' desc'):''} limit ${limit}`;}
 const rows=(await db.query(sql,values)).rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?(['day','month'].includes(k)?v.toISOString().slice(0,10):v.toISOString()):v])));return {data:rows,count:rows.length};}catch(error){return {error};}};
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v,'in']);return q;},order(k,{ascending}){order=[k,ascending];return q;},limit(n){limit=n;return q;},update(v){mode='update';body=v;return q;},insert(v){mode='insert';body=v;return q;},upsert(v){mode='upsert';body=v;return q;},async maybeSingle(){const r=await execute();return {...r,data:r.data?.[0]||null};},then(resolve,reject){return execute().then(resolve,reject);}};return q;}};
}
test('real cycle + production SQL + least-privilege store: OFF sync, three checked dispatches, durable no-replay and stop',async(t)=>{
 // Keep the successful-flow test away from the UTC boundary; the real boundary
 // rejection is exercised separately in social-autopilot.test.js.
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-02T09:00:00Z')});
 const db=new PGlite();let dispatches=0;const registered=new Map();
 const env={VERCEL_ENV:'production',NEXOPS_SOCIAL_ORGANIZATION_ID:O,BUFFER_ORGANIZATION_ID:'fixture-org',BUFFER_LINKEDIN_CHANNEL_ID:'li',BUFFER_THREADS_CHANNEL_ID:'th',BUFFER_X_CHANNEL_ID:'tw',BUFFER_API_KEY:'fixture-buffer',SUPABASE_SERVICE_ROLE_KEY:'fixture-worker',NEXOPS_SOCIAL_WRITES_ALLOWED:'true',NEXOPS_SOCIAL_EMERGENCY_STOP:'false',NEXOPS_SOCIAL_ALERT_URL:'https://alerts.example.test/social',NEXOPS_SOCIAL_ALERT_HOST:'alerts.example.test',NEXOPS_SOCIAL_ALERT_SECRET:'fixture-alert'};
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`);
 await db.exec(await readFile(new URL('../../docs/proposals/SOCIAL_DASHBOARD_FOUNDATION.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1,now())',[A]);await db.query("insert into public.nexops_organizations(id,name,created_by)values($1,'Fixture',$2)",[O,A]);await db.query("insert into public.nexops_organization_memberships values($1,$2,'owner')",[O,A]);await db.query("insert into public.nexops_workspaces(id,organization_id,name)values($1,$2,'Fixture')",[W,O]);await db.query("insert into public.nexops_workspace_memberships values($1,$2,'owner')",[W,A]);await db.query('insert into public.nexops_growth_admins values($1)',[A]);
 const sql=(await readFile(new URL('../../docs/proposals/SOCIAL_AUTOPILOT_PRODUCTION.sql',import.meta.url),'utf8')).replace(/target_(admin|org|workspace) uuid := '[0-9a-f-]+'/g,(_,k)=>`target_${k} uuid := '${{admin:A,org:O,workspace:W}[k]}'`);await db.exec(sql);
 const store=createSocialStore({client:localClient(db)});
 const read=async({start,end})=>({organization:{id:'fixture-org'},status:'complete',fetchedAt:new Date().toISOString(),period:{start,end},channels:[['linkedin','li'],['threads','th'],['x','tw']].map(([service,id])=>({service,id,disconnected:false,metrics:{},posts:[],errors:[]}))});

 const fetchImpl=async(url,init)=>{if(url===env.NEXOPS_SOCIAL_ALERT_URL)return {ok:true};assert.equal(url,'https://api.buffer.com');const {query}=JSON.parse(init.body);let data;
 if(query.startsWith('mutation')){dispatches++;const id='registered-'+dispatches;registered.set(id,query.match(/channelId: \"([^\"]+)\"/)[1]);data={createPost:{post:{id}}};}
 else if(query.includes('post(input:')){const id=query.match(/id: \"([^\"]+)\"/)[1];data={post:{id,channelId:registered.get(id),status:'sent',metrics:[],metricsUpdatedAt:new Date().toISOString()}};}
 else data={channels:[{id:'li',service:'linkedin',isQueuePaused:false},{id:'th',service:'threads',isQueuePaused:false},{id:'tw',service:'twitter',isQueuePaused:false}]};return {ok:true,json:async()=>({data})};};
 await db.exec('set role service_role');
 assert.equal((await syncSocialMetrics({env:{...env,NEXOPS_SOCIAL_WRITES_ALLOWED:'false',NEXOPS_SOCIAL_EMERGENCY_STOP:'true',NEXOPS_SOCIAL_AI_KEY:''},store,read})).status,'updated');
 assert.equal((await db.query('select count(*)::int n from public.nexops_social_ticks')).rows[0].n,0);assert.equal(dispatches,0);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await db.exec('set role authenticated');
 await db.query('select public.nexops_social_set_policy($1,true,$2,$3)',[O,FACTS_VERSION,runtimeBinding(env).hash]);await db.exec('reset role;set role service_role');
 const result=await runSocialCycle({env,store,read,fetchImpl});assert.equal(result.status,'completed');assert.deepEqual(result.outcomes.map(x=>x.state),['provider_accepted','provider_accepted','provider_accepted']);assert.equal(dispatches,3);
 assert.equal((await db.query('select ai_calls,reserved_cents from public.nexops_social_runs')).rows[0].ai_calls,0);
 assert.equal((await db.query('select count(*)::int n from public.nexops_social_posts')).rows[0].n,3);
 assert.equal((await runSocialCycle({env,store,read,fetchImpl})).reason,'DAILY_EXECUTION_ALREADY_RESERVED');assert.equal(dispatches,3);
 // Execute the finite stock over 15 distinct UTC dates using the real database.
 for(let day=2;day<=15;day++){
  t.mock.timers.tick(86400000);const r=await runSocialCycle({env,store,read,fetchImpl});assert.equal(r.status,'completed','stock day '+day);
 }
 assert.equal(dispatches,45);
 assert.equal((await db.query('select count(distinct content_hash)::int n from public.nexops_social_posts')).rows[0].n,45);
 assert.equal((await db.query('select count(*)::int n from public.nexops_social_budget')).rows[0].n,0);
 assert.equal((await db.query('select sum(ai_calls)::int calls,sum(reserved_cents)::int cents from public.nexops_social_runs')).rows[0].calls,0);
 t.mock.timers.tick(86400000);const empty=await runSocialCycle({env,store,read,fetchImpl});assert.equal(empty.reason,'STOCK_EXHAUSTED');assert.equal(dispatches,45);
 assert.equal((await db.query("select count(*)::int n from public.nexops_social_alerts where code='STOCK_EXHAUSTED'")).rows[0].n,1);
 await db.exec('reset role;set role authenticated');await db.query('select public.nexops_social_set_policy($1,false,null,null)',[O]);assert.equal((await db.query('select enabled from public.nexops_social_policy')).rows[0].enabled,false);
 }finally{await db.close();}
});
