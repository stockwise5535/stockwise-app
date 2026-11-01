import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{PGlite}=require(process.env.NEXOPS_PGLITE_PATH || '@electric-sql/pglite');
const db=new PGlite(),A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',hash='a'.repeat(64),binding='b'.repeat(64);
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const rpc=(name,args=[])=>scalar(`select public.nexops_social_${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
const owner=()=>db.exec('reset role');
async function user(id){await owner();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function server(){await owner();await db.exec('set role service_role');}
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
for(const name of ['202610240001_growth_foundation.sql','202610240002_growth_lifecycle.sql','202610240003_outbound_safety.sql'])await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../docs/proposals/SOCIAL_AUTOPILOT.sql',import.meta.url),'utf8'));
await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now()),($3,$4,now())',[A,'a@example.test',B,'b@example.test']);
await user(A);const wa=await scalar('select public.nexops_bootstrap()');await user(B);await scalar('select public.nexops_bootstrap()');
await owner();const org=await scalar('select organization_id from public.nexops_workspaces where id=$1',[wa]);
let run,token;
test('autopilot proposal defaults OFF, denies self-grants and worker RPCs to browser users',async()=>{
  await user(A);assert.equal(await rpc('admin',[org]),false);
  await assert.rejects(rpc('set_policy',[org,true,hash,binding]),/Access denied/);
  await assert.rejects(rpc('claim_tick',[org]),/permission denied/);
  await assert.rejects(db.query('insert into public.nexops_social_policy(organization_id,enabled)values($1,true)',[org]),/permission denied/);
  await server();assert.equal((await rpc('claim_run',[org,hash,binding])).claimed,false);
});
test('only assigned Growth Admin in exact organization can enable or read settings',async()=>{
  await owner();await db.query('insert into public.nexops_growth_admins(user_id)values($1),($2)',[A,B]);
  await user(B);await assert.rejects(rpc('set_policy',[org,true,hash,binding]),/Access denied/);
  await user(A);const p=await rpc('set_policy',[org,true,hash,binding]);assert.equal(p.enabled,true);assert.equal(p.revision,1);
  await user(B);assert.equal(await scalar('select count(*)::int from public.nexops_social_policy'),0);
  await user(A);assert.equal(await scalar('select count(*)::int from public.nexops_social_audit'),1);
});
test('shared daily tick and run have atomic unique reservations, including after restarts',async()=>{
  await server();assert.equal(await rpc('claim_tick',[org]),true);assert.equal(await rpc('claim_tick',[org]),false);
  assert.equal((await rpc('claim_run',[org,'f'.repeat(64),binding])).claimed,false);
  const r=await rpc('claim_run',[org,hash,binding]);assert.equal(r.claimed,true);run=r.runId;
  assert.equal((await rpc('claim_run',[org,hash,binding])).claimed,false);
});
test('AI quota reserves before each call and caps calls and monthly currency budget',async()=>{
  await server();for(let i=0;i<6;i++)assert.equal(await rpc('reserve_ai',[run]),true);
  assert.equal(await rpc('reserve_ai',[run]),false);
  assert.equal(await scalar('select reserved_cents from public.nexops_social_budget where organization_id=$1',[org]),120);
  await owner();await db.query('update public.nexops_social_runs set ai_calls=0,reserved_cents=0 where id=$1',[run]);await db.query('update public.nexops_social_budget set reserved_cents=4000 where organization_id=$1',[org]);
  await server();assert.equal(await rpc('reserve_ai',[run]),false);
});
test('one post per channel/day, unique content, exact claim token and unknown outcomes are held',async()=>{
  await server();assert.equal(await rpc('candidate',[run,'x','Public copy',hash,'[]',null]),true);
  assert.equal(await rpc('candidate',[run,'x','Different','c'.repeat(64),'[]',null]),false);
  const claim=await rpc('claim_post',[run,'x',hash]);assert.equal(claim.claimed,true);token=claim.token;
  assert.equal((await rpc('claim_post',[run,'x',hash])).claimed,false);
  await assert.rejects(rpc('complete_post',[run,'x',A,null]),/Claim mismatch/);
  await rpc('complete_post',[run,'x',token,null]);
  assert.equal(await scalar("select state from public.nexops_social_posts where run_id=$1 and network='x'",[run]),'delivery_unknown');
  assert.equal((await rpc('claim_post',[run,'x',hash])).claimed,false);
  assert.equal((await rpc('claim_run',[org,hash,binding])).reason,'UNKNOWN_DELIVERY_HELD');
});
test('stop switch invalidates outstanding claims and prevents further AI reservation',async()=>{
  await server();assert.equal(await rpc('candidate',[run,'threads','Public copy','d'.repeat(64),'[]',null]),true);
  await user(A);await rpc('set_policy',[org,false,null,null]);
  await server();assert.equal((await rpc('claim_post',[run,'threads','d'.repeat(64)])).claimed,false);assert.equal(await rpc('reserve_ai',[run]),false);
  await user(A);assert.equal(await scalar('select count(*)::int from public.nexops_social_audit'),2);
});
test.after(async()=>db.close());
