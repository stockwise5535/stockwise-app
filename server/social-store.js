import {createClient} from '@supabase/supabase-js';
export function createSocialStore({env=process.env,signal,client}={}){
  if(!client){
    const url=new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('STORE_CONFIGURATION_REQUIRED');
    client=createClient(url.origin,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal})}});
  }
  const result=async p=>{const {data,error}=await p;if(error)throw Error('SOCIAL_STORE_UNAVAILABLE');return data;};
  const rpc=(name,args)=>result(client.rpc('nexops_social_'+name,args));
  return {
    policy:org=>result(client.from('nexops_social_policy').select('*').eq('organization_id',org).maybeSingle()),
    claimTick:org=>rpc('claim_tick',{o:org}),
    claimRun:(b,facts)=>rpc('claim_run',{o:b.organizationId,facts,binding:b.hash}),
    reserveAI:run=>rpc('reserve_ai',{run}),
    candidate:(run,network,candidate,blocked=null)=>rpc('candidate',{run,network_name:network,copy:candidate?.text || null,hash:candidate?.contentHash || null,ids:candidate?.factIds || [],blocked}),
    claimPost:(run,network,hash)=>rpc('claim_post',{run,network_name:network,hash}),
    complete:(run,network,token,provider=null)=>rpc('complete_post',{run,network_name:network,token,provider}),
    async dispatchAllowed(run,network,token,revision){
      const row=await result(client.from('nexops_social_runs').select('*').eq('id',run).maybeSingle());
      const post=await result(client.from('nexops_social_posts').select('state,claim_token').eq('run_id',run).eq('network',network).maybeSingle());
      return row?.state==='running'&&row.policy_revision===revision&&Date.parse(row.expires_at)>Date.now()&&row.day===new Date().toISOString().slice(0,10)&&post?.state==='sending'&&post.claim_token===token;
    },
    finish:(run,state)=>result(client.from('nexops_social_runs').update({state}).eq('id',run)),
    recent:org=>result(client.from('nexops_social_posts').select('day,network,content_hash,fact_ids,state,provider_id,metrics,metrics_updated_at').eq('organization_id',org).order('day',{ascending:false}).limit(90)),
    snapshot:(org,payload)=>result(client.from('nexops_social_snapshots').upsert({organization_id:org,period_start:payload.period.start,period_end:payload.period.end,payload,updated_at:new Date().toISOString()})),
    async reconcile(org,snapshot,readPost){
      let failed=0,unconfirmed=0;
      const pending=await result(client.from('nexops_social_posts').select('day,network,provider_id').eq('organization_id',org).eq('state','provider_accepted').order('day',{ascending:true}).limit(6));
      for(const row of pending){
        const c=snapshot.channels.find(c=>c.service===(row.network==='x'?'x':row.network));
        let p=c?.posts.find(p=>p.id===row.provider_id);
        if(!p&&readPost)try{
          const detail=await readPost(row.provider_id);
          if(detail.channelId!==c?.id){unconfirmed++;continue;}
          p={status:detail.state,metrics:Object.fromEntries((detail.metrics || []).map(m=>[m.type,{status:'available',value:m.value,unit:m.unit}])),metricsUpdatedAt:detail.metricsUpdatedAt};
        }catch{unconfirmed++;continue;}
        if(p&&['sent','error'].includes(p.status))await result(client.from('nexops_social_posts').update({state:p.status==='sent'?'published':'error',metrics:p.metrics,metrics_updated_at:p.metricsUpdatedAt,updated_at:new Date().toISOString()}).eq('organization_id',org).eq('day',row.day).eq('network',row.network).eq('state','provider_accepted'));
        if(p?.status==='error')failed++;
      }
      return {failed,unconfirmed};
    },
    async alert(org,code,delivered=false){return result(client.from('nexops_social_alerts').insert({organization_id:org,code,delivered}));},
  };
}
