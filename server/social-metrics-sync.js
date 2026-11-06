import {readBufferGrowth} from './buffer-growth.js';
import {runtimeBinding,secretMatches} from './social-runtime.js';
import {createSocialStore} from './social-store.js';
import {notifySocial} from './social-notifier.js';

// Buffer queries only. No AI client, publication adapter, run/tick claim or policy mutation.
export async function syncSocialMetrics({env=process.env,store,read=readBufferGrowth,signal,now=()=>Date.now()}={}) {
  if(env.VERCEL_ENV!=='production')throw Error('PRODUCTION_REQUIRED');
  const binding=runtimeBinding(env),time=now(),end=new Date(time);end.setUTCHours(0,0,0,0);
  const period={start:new Date(+end-30*86400000).toISOString(),end:end.toISOString()};
  if(!env.BUFFER_API_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('SYNC_CONFIGURATION_REQUIRED');
  const valid=s=>s?.organization?.id===binding.bufferOrganizationId&&s.period?.start===period.start&&s.period?.end===period.end&&
    ['complete','partial'].includes(s.status)&&Array.isArray(s.channels)&&s.channels.length<=3&&
    (s.status==='partial'||s.channels.length===3)&&new Set(s.channels.map(c=>c.service)).size===s.channels.length&&
    s.channels.every(c=>Object.hasOwn(binding.channels,c.service)&&c.id===binding.channels[c.service]);
  const saved=await store.savedSnapshot(binding.organizationId,period);
  // Shared persisted cache, including partial results. Concurrent cold instances may
  // duplicate bounded reads/upserts, never Buffer writes or publication reservations.
  if(valid(saved)&&Date.parse(saved.fetchedAt)>time-26*3600000&&Date.parse(saved.fetchedAt)<=time+60000)
    return {status:saved.status==='partial'?'partial':'cached',fetchedAt:saved.fetchedAt,period};
  signal?.throwIfAborted();
  const snapshot=await read({organizationId:binding.bufferOrganizationId,
    channelIds:{linkedin:binding.channels.linkedin,threads:binding.channels.threads,twitter:binding.channels.x},
    ...period,maxPages:4,pageSize:50,maxPosts:200,signal},{apiKey:env.BUFFER_API_KEY});
  signal?.throwIfAborted();
  // Partial/missing channels remain visible as such; never fill missing metrics with zero.
  if(!valid(snapshot)||!Number.isFinite(Date.parse(snapshot.fetchedAt))||Date.parse(snapshot.fetchedAt)>time+60000)throw Error('SYNC_RESPONSE_REJECTED');
  await store.snapshot(binding.organizationId,snapshot);
  return {status:snapshot.status==='partial'?'partial':'updated',fetchedAt:snapshot.fetchedAt,period};
}
export function createSocialMetricsSyncHandler({env=process.env,storeFactory=createSocialStore,sync=syncSocialMetrics,fetchImpl=fetch,timeoutMs=25000}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({code:'METHOD_NOT_ALLOWED'});}
    if(!secretMatches(req.headers?.authorization,env.CRON_SECRET))return res.status(401).json({code:'AUTH_REQUIRED'});
    if(env.VERCEL_ENV!=='production')return res.status(403).json({code:'PRODUCTION_REQUIRED'});
    if(new URL(req.url,'https://local.invalid').search)return res.status(400).json({code:'INVALID_REQUEST'});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const store=storeFactory({env,signal:controller.signal});
      const result=await sync({env,store,signal:controller.signal});
      if(result.status==='partial')await notifySocial(env,'METRICS_PARTIAL',fetchImpl);
      return res.status(200).json(result);
    }catch{
      await notifySocial(env,'METRICS_SYNC_FAILED',fetchImpl);
      return res.status(controller.signal.aborted?504:503).json({code:controller.signal.aborted?'SYNC_TIMEOUT':'METRICS_SYNC_UNAVAILABLE'});
    }finally{clearTimeout(timer);}
  };
}
