import {createClient} from '@supabase/supabase-js';
import {readBufferGrowth} from './buffer-growth.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier=v=>typeof v==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
class Failure extends Error { constructor(status,code) { super(code); this.status=status; this.code=code; } }
const fail=(status,code)=>{throw new Failure(status,code);};
function configuration(env) {
  const url=env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key=env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  let parsed;
  try { parsed=new URL(url); } catch { fail(503,'CONFIGURATION_REQUIRED'); }
  const channels={linkedin:env.BUFFER_LINKEDIN_CHANNEL_ID,threads:env.BUFFER_THREADS_CHANNEL_ID,twitter:env.BUFFER_X_CHANNEL_ID};
  if (parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.port || parsed.pathname!=='/' || parsed.search || parsed.hash ||
      !key || !uuid.test(env.NEXOPS_SOCIAL_ORGANIZATION_ID || '') || !identifier(env.BUFFER_ORGANIZATION_ID) ||
      !Object.values(channels).every(identifier) || new Set(Object.values(channels)).size!==3 || !env.BUFFER_API_KEY?.trim()) fail(503,'CONFIGURATION_REQUIRED');
  return {url:parsed.origin,key,organizationId:env.NEXOPS_SOCIAL_ORGANIZATION_ID,bufferOrganizationId:env.BUFFER_ORGANIZATION_ID,channels};
}
function parameters(req,now) {
  const url=new URL(req.url,'https://local.invalid');
  if ([...url.searchParams.keys()].some(k=>!['workspaceId','start','end'].includes(k)) ||
      [...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1)) fail(400,'INVALID_REQUEST');
  const workspaceId=url.searchParams.get('workspaceId'), start=url.searchParams.get('start'), end=url.searchParams.get('end');
  // UTC day boundaries keep the cache key space bounded; end is exclusive.
  if (!uuid.test(workspaceId || '') || !/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) fail(400,'INVALID_REQUEST');
  const from=Date.parse(start+'T00:00:00Z'),to=Date.parse(end+'T00:00:00Z');
  if (!Number.isFinite(from) || !Number.isFinite(to) || new Date(from).toISOString().slice(0,10)!==start ||
      new Date(to).toISOString().slice(0,10)!==end || from>=to || to-from>31*86400000 || to>now || from<now-366*86400000) fail(400,'INVALID_PERIOD');
  return {workspaceId,start:new Date(from).toISOString(),end:new Date(to).toISOString()};
}
function presentation(snapshot) {
  return {schemaVersion:1,source:'buffer',status:snapshot.status,period:snapshot.period,fetchedAt:snapshot.fetchedAt,missingServices:snapshot.missingServices,
    channels:snapshot.channels.map(c=>({service:c.service,name:c.name,disconnected:c.disconnected,metrics:c.metrics,metricsUpdatedAt:c.metricsUpdatedAt,
      postInventory:{scope:c.postsScope,complete:c.postsComplete,scanned:c.posts.length,states:c.posts.reduce((a,p)=>({...a,[p.status]:(a[p.status] || 0)+1}),{})},metricsError:c.metricsError,postsError:c.postsError,errors:c.errors}))};
}

// Internal fixed caps. State is bounded and process-local; see deployment limitations.
export function createSocialMetricsHandler({env=process.env,now=()=>Date.now(),read=readBufferGrowth,
  authFactory=(url,key,authorization,signal)=>createClient(url,key,{global:{headers:{Authorization:authorization},fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal})},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}),
  timeoutMs=25000}={}) {
  const rates=new Map(),cache=new Map(),pending=new Map(); let active=0,upstreamWindow=0,upstreamCount=0;
  function rate(user,time) {
    for (const [key,value] of rates) if (value.until<=time) rates.delete(key);
    const bucket=rates.get(user);
    if (!bucket && rates.size>=256) fail(429,'RATE_LIMITED');
    const next=bucket || {until:time+60000,count:0};
    if (++next.count>10) fail(429,'RATE_LIMITED');
    rates.set(user,next);
  }
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store'); res.setHeader('Vary','Authorization'); res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET') {res.setHeader('Allow','GET');return res.status(405).json({code:'METHOD_NOT_ALLOWED'});}
    if(active>=20) return res.status(429).json({code:'RATE_LIMITED'});
    const authorization=req.headers?.authorization;
    if(typeof authorization!=='string' || authorization.length>8192 || !/^Bearer [A-Za-z0-9._~-]+$/i.test(authorization)) return res.status(401).json({code:'AUTH_REQUIRED'});
    active++;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const work=async()=>{
        const config=configuration(env),params=parameters(req,now());
        const auth=authFactory(config.url,config.key,authorization,controller.signal);
        let identity;
        try { identity=await auth.auth.getUser(authorization.slice(7)); } catch { fail(503,'AUTH_UNAVAILABLE'); }
        if(identity?.error && (!identity.error.status || identity.error.status>=500)) fail(503,'AUTH_UNAVAILABLE');
        const user=identity?.data?.user;
        if(identity?.error || !uuid.test(user?.id || '') || user.role!=='authenticated' || !user.email_confirmed_at) fail(401,'AUTH_REQUIRED');
        rate(user.id,now());
        let admin,workspace,membership,workspaceMember;
        try {
          [admin,workspace,membership,workspaceMember]=await Promise.all([
            auth.rpc('nexops_is_growth_admin'),
            auth.from('nexops_workspaces').select('id,organization_id').eq('id',params.workspaceId).maybeSingle(),
            auth.from('nexops_organization_memberships').select('organization_id,user_id,role').eq('organization_id',config.organizationId).eq('user_id',user.id).maybeSingle(),
            auth.from('nexops_workspace_memberships').select('workspace_id,user_id').eq('workspace_id',params.workspaceId).eq('user_id',user.id).maybeSingle(),
          ]);
        } catch { fail(503,'AUTHORIZATION_UNAVAILABLE'); }
        if([admin,workspace,membership,workspaceMember].some(r=>!r || r.error)) fail(503,'AUTHORIZATION_UNAVAILABLE');
        if(admin.data!==true || workspace.data?.id!==params.workspaceId || workspace.data?.organization_id!==config.organizationId ||
          membership.data?.organization_id!==config.organizationId || membership.data?.user_id!==user.id || !['owner','admin'].includes(membership.data?.role) ||
          workspaceMember.data?.workspace_id!==params.workspaceId || workspaceMember.data?.user_id!==user.id) fail(403,'ACCESS_DENIED');
        if(controller.signal.aborted) fail(504,'READ_TIMEOUT');
        // Cache is reached only after fresh identity and authorization checks.
        const time=now();
        for (const [k,v] of cache) if(v.until<=time) cache.delete(k);
        const key=JSON.stringify([config.organizationId,config.bufferOrganizationId,config.channels,params.start,params.end]);
        const hit=cache.get(key);
        if(hit) return {...hit.value,cache:{hit:true,expiresAt:new Date(hit.until).toISOString()}};
        // Optional persisted daily snapshot. Existing installations without the
        // approved autopilot schema continue through the read-only Buffer path.
        try {
          const saved=await auth.from('nexops_social_snapshots').select('payload').eq('organization_id',config.organizationId).eq('period_start',params.start).eq('period_end',params.end).maybeSingle();
          const p=saved.data?.payload;
          if(!saved.error&&p?.organization?.id===config.bufferOrganizationId&&p.period?.start===params.start&&p.period?.end===params.end&&
            Date.parse(p.fetchedAt)>time-26*3600000&&Date.parse(p.fetchedAt)<=time+60000&&Array.isArray(p.channels)&&
            p.channels.every(c=>c.id===config.channels[c.service==='x'?'twitter':c.service]))return {...presentation(p),cache:{hit:false,persisted:true}};
        }catch{}
        if(controller.signal.aborted)fail(504,'READ_TIMEOUT');
        if(!pending.has(key)) {
          if(time-upstreamWindow>=60000) {upstreamWindow=time;upstreamCount=0;}
          if(pending.size>=2 || upstreamCount>=10) fail(429,'RATE_LIMITED');
          upstreamCount++;
          const task=read({organizationId:config.bufferOrganizationId,channelIds:config.channels,start:params.start,end:params.end,maxPages:4,pageSize:50,maxPosts:200,signal:controller.signal},{apiKey:env.BUFFER_API_KEY})
            .then(snapshot=>{
              if(controller.signal.aborted) fail(504,'READ_TIMEOUT');
              const value=presentation(snapshot);
              if(snapshot.status==='complete' && cache.size<64) cache.set(key,{until:now()+60000,value});
              return value;
            }).finally(()=>pending.delete(key));
          pending.set(key,task);
        }
        return {...await pending.get(key),cache:{hit:false}};
      };
      // Race bounds the handler even if a dependency fails to observe AbortSignal.
      const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Failure(504,'READ_TIMEOUT')),{once:true}));
      return res.status(200).json(await Promise.race([work(),aborted]));
    } catch(e) {
      const safe=e instanceof Failure ? e : new Failure(502,'BUFFER_UNAVAILABLE');
      if(safe.status===429) res.setHeader('Retry-After','60');
      return res.status(safe.status).json({code:safe.code});
    } finally {clearTimeout(timer);active--;}
  };
}
