import {createBufferAdapter,bufferApprovalHash} from '../services/buffer-adapter.js';
import {readBufferGrowth} from './buffer-growth.js';
import {FACTS_VERSION} from './social-content.js';
import {approvedPostCatalog,chooseStock} from './social-stock.js';
import {productionGate,activationReady} from './social-runtime.js';
import {notifySocial} from './social-notifier.js';

// Never run through the old outbound/fixture orchestration or email workers.
export async function runSocialCycle({env=process.env,store,signal=AbortSignal.timeout(240000),read=readBufferGrowth,fetchImpl=fetch,now=()=>new Date()}={}){
  const binding=activationReady(env),org=binding.organizationId;
  if(!await store.claimTick(org))return {status:'not_started',reason:'DAILY_EXECUTION_ALREADY_RESERVED'};
  async function alert(code){
    const delivered=await notifySocial(env,code,fetchImpl);
    await store.alert(org,code,delivered);
  }
  let snapshot;
  const end=new Date(now());end.setUTCHours(0,0,0,0);
  try{
    snapshot=await read({organizationId:binding.bufferOrganizationId,channelIds:{linkedin:binding.channels.linkedin,threads:binding.channels.threads,twitter:binding.channels.x},start:new Date(+end-30*86400000).toISOString(),end:end.toISOString(),maxPages:4,pageSize:50,maxPosts:200,signal},{apiKey:env.BUFFER_API_KEY});
    await store.snapshot(org,snapshot);
    const statusReader=createBufferAdapter({env,fetch:(url,init)=>fetchImpl(url,{...init,signal:AbortSignal.any([signal,init.signal])})});
    const reconciliation=await store.reconcile(org,snapshot,id=>statusReader.post(id,{includeText:false}));
    if(reconciliation?.failed){await alert('PROVIDER_PUBLICATION_FAILED');return {status:'blocked',reason:'PROVIDER_PUBLICATION_FAILED'};}
    if(reconciliation?.unconfirmed){await alert('POST_STATUS_READ_FAILED');return {status:'blocked',reason:'POST_STATUS_READ_FAILED'};}
    if(snapshot.channels.length!==3||snapshot.channels.some(c=>c.disconnected!==false)){await alert('CHANNEL_DISCONNECTED');return {status:'blocked',reason:'CHANNEL_DISCONNECTED'};}
    if(snapshot.status==='partial'||snapshot.channels.some(c=>c.metricsError))await alert('METRICS_PARTIAL');
  }catch{await alert('METRICS_READ_FAILED');return {status:'blocked',reason:'METRICS_READ_FAILED'};}
  const claim=await store.claimRun(binding,FACTS_VERSION);
  if(!claim.claimed){if(claim.reason==='UNKNOWN_DELIVERY_HELD')await alert('UNKNOWN_DELIVERY_HELD');return {status:'not_started',reason:claim.reason};}
  const run=claim.runId,outcomes=[];
  try{
    const prior=await store.recent(org);
    const catalog=approvedPostCatalog();
    const used=new Set((await store.usedStock(org,catalog.map(p=>p.contentHash))).map(p=>p.content_hash));
    const selections=['linkedin','threads','x'].map(network=>({network,...chooseStock(network,catalog,used,prior,now())}));
    const unavailable=selections.filter(p=>!p.candidate);
    if(unavailable.length){
      for(const p of unavailable)await store.candidate(run,p.network,null,p.reason);
      const reason=unavailable.some(p=>p.reason==='STOCK_EXHAUSTED')?'STOCK_EXHAUSTED':'STOCK_COOLDOWN';
      await store.finish(run,'failed');await alert(reason);
      return {status:'blocked',reason,networks:unavailable.map(p=>p.network)};
    }
    for(const {network,candidate} of selections){
      productionGate(env);if(signal.aborted||claim.day!==now().toISOString().slice(0,10))throw Error('CYCLE_STOPPED');
      // The SQL unique key is the final cross-instance duplicate barrier.
      if(!await store.candidate(run,network,candidate)){
        await store.finish(run,'failed');await alert('DUPLICATE_CONTENT');
        return {status:'blocked',reason:'DUPLICATE_CONTENT',outcomes};
      }
      // Atomic durable dispatch claim BEFORE any provider transport. A crash leaves
      // sending held, never an automatically retryable post.
      const requestedAt=new Date(+now()+120000).toISOString();
      if(requestedAt.slice(0,10)!==claim.day)throw Error('CYCLE_CROSS_UTC_DAY');
      const dispatch=await store.claimPost(run,network,candidate.contentHash);
      if(!dispatch.claimed){outcomes.push({network,state:'blocked'});continue;}
      let receipt;
      try{
        const adapter=createBufferAdapter({env,fetch:(url,init)=>fetchImpl(url,{...init,signal:AbortSignal.any([signal,init.signal])}),authorizePublication:async request=>{
          productionGate(env);
          const policy=await store.policy(org);
          if(!policy?.enabled||policy.facts_hash!==FACTS_VERSION||policy.binding_hash!==binding.hash||request.channelId!==binding.channels[network]||request.text!==candidate.text||request.requestedAt!==requestedAt||!await store.dispatchAllowed(run,network,dispatch.token,policy.revision))throw Error('AUTOMATION_DISABLED');
          return {authorized:true,contentHash:bufferApprovalHash(request)};
        }});
        receipt=await adapter.createPost({network,text:candidate.text,requestedAt,images:[],url:null});
        if(receipt.channelId!==binding.channels[network])throw Error();
      }catch{
        await store.complete(run,network,dispatch.token,null);await alert('DELIVERY_UNKNOWN_NO_RETRY');outcomes.push({network,state:'delivery_unknown'});
        await store.finish(run,'failed');return {status:'blocked',reason:'UNKNOWN_DELIVERY_HELD',outcomes};
      }
      await store.complete(run,network,dispatch.token,receipt.providerId);
      outcomes.push({network,state:'provider_accepted'});
    }
    await store.finish(run,'completed');return {status:'completed',outcomes};
  }catch{
    await store.finish(run,'failed');await alert('CYCLE_FAILED');return {status:'failed'};
  }
}
