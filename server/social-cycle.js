import {createBufferAdapter,bufferApprovalHash} from '../services/buffer-adapter.js';
import {readBufferGrowth} from './buffer-growth.js';
import {createSocialAI} from './social-ai.js';
import {FACTS_VERSION,compose,analyzeSocial} from './social-content.js';
import {productionGate,activationReady} from './social-runtime.js';
import {notifySocial} from './social-notifier.js';

// Never run through the old outbound/fixture orchestration or email workers.
export async function runSocialCycle({env=process.env,store,signal=AbortSignal.timeout(240000),read=readBufferGrowth,ai=createSocialAI({env}),fetchImpl=fetch,now=()=>new Date()}={}){
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
    if(reconciliation?.failed)await alert('PROVIDER_PUBLICATION_FAILED');
    if(reconciliation?.unconfirmed)await alert('POST_STATUS_READ_FAILED');
    if(snapshot.channels.length!==3||snapshot.channels.some(c=>c.disconnected!==false)){await alert('CHANNEL_DISCONNECTED');return {status:'blocked',reason:'CHANNEL_DISCONNECTED'};}
    if(snapshot.status==='partial'||snapshot.channels.some(c=>c.metricsError))await alert('METRICS_PARTIAL');
  }catch{await alert('METRICS_READ_FAILED');return {status:'blocked',reason:'METRICS_READ_FAILED'};}
  const claim=await store.claimRun(binding,FACTS_VERSION);
  if(!claim.claimed){if(claim.reason==='UNKNOWN_DELIVERY_HELD')await alert('UNKNOWN_DELIVERY_HELD');return {status:'not_started',reason:claim.reason};}
  const run=claim.runId,outcomes=[];
  try{
    const prior=await store.recent(org);
    for(const network of ['linkedin','threads','x']){
      let candidate;
      try{
        productionGate(env);if(signal.aborted||claim.day!==now().toISOString().slice(0,10))throw Error('CYCLE_STOPPED');
        if(!await store.reserveAI(run))throw Error('AI_BUDGET_OR_STOP');
        const plan=await ai.generate(network,{performance:analyzeSocial(snapshot,prior),previousPlans:prior.filter(p=>p.network===network).slice(0,30).map(p=>({factIds:p.fact_ids,state:p.state,day:p.day}))},signal);
        candidate=compose(network,plan);
        if(prior.some(p=>p.network===network&&(p.content_hash===candidate.contentHash || (p.day>=new Date(+now()-7*86400000).toISOString().slice(0,10) && JSON.stringify([...(p.fact_ids || [])].sort())===JSON.stringify([...candidate.factIds].sort())))))throw Error('DUPLICATE_CONTENT');
        if(!await store.reserveAI(run))throw Error('AI_BUDGET_OR_STOP');
        if(!await ai.review(network,candidate,signal))throw Error('AI_REVIEW_REJECTED');
        if(!await store.candidate(run,network,candidate))throw Error('DUPLICATE_CONTENT');
      }catch(e){
        const known=['CONTENT_SHAPE_REJECTED','UNVERIFIED_FACT','NETWORK_LENGTH_REJECTED','CONTENT_RULE_REJECTED','AI_BUDGET_OR_STOP','AI_REVIEW_REJECTED','DUPLICATE_CONTENT','AI_INPUT_LIMIT','AI_REQUEST_FAILED','AI_OUTCOME_UNKNOWN','AI_RESPONSE_REJECTED','CYCLE_STOPPED'];
        await store.candidate(run,network,candidate,known.includes(e?.message)?e.message:'CHECK_FAILED');await alert('CONTENT_CHECK_FAILED');outcomes.push({network,state:'blocked'});continue;
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
        await store.complete(run,network,dispatch.token,null);await alert('DELIVERY_UNKNOWN_NO_RETRY');outcomes.push({network,state:'delivery_unknown'});continue;
      }
      await store.complete(run,network,dispatch.token,receipt.providerId);
      outcomes.push({network,state:'provider_accepted'});
    }
    await store.finish(run,'completed');return {status:'completed',outcomes};
  }catch{
    await store.finish(run,'failed');await alert('CYCLE_FAILED');return {status:'failed'};
  }
}
