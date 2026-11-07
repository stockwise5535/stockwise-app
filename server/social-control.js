import {authorizeSocial,SocialAccessError} from './social-access.js';
import {FACTS_VERSION,FACTS} from './social-content.js';
import {activationReady,activationConfiguration,runtimeBinding} from './social-runtime.js';
import {AI_MODEL} from './social-ai.js';
import {createBufferAdapter} from '../services/buffer-adapter.js';
export function createSocialControlHandler({env=process.env,authFactory,fetchImpl=fetch}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
    if(!['GET','POST'].includes(req.method))return res.status(405).json({code:'METHOD_NOT_ALLOWED'});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const url=new URL(req.url,'https://local.invalid');let body;
      if(req.method==='POST'){
        if(env.VERCEL_ENV!=='production')throw new SocialAccessError(403,'PRODUCTION_ONLY');
        if(url.search)throw new SocialAccessError(400,'INVALID_REQUEST');
        if(typeof req.body==='string'&&Buffer.byteLength(req.body)>4096)throw new SocialAccessError(400,'INVALID_REQUEST');
        try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{throw new SocialAccessError(400,'INVALID_REQUEST');}
        const expected=body?.action==='enable'?['workspaceId','action','factsVersion','acceptAutomaticPublishing','acceptBudget']:['workspaceId','action'];
        if(!body||!['enable','disable','check'].includes(body.action)||Object.keys(body).sort().join()!==expected.sort().join())throw new SocialAccessError(400,'INVALID_REQUEST');
      }else if([...url.searchParams.keys()].join()!=='workspaceId')throw new SocialAccessError(400,'INVALID_REQUEST');
      const {auth,organizationId}=await authorizeSocial({authorization:req.headers?.authorization,workspaceId:body?.workspaceId || url.searchParams.get('workspaceId'),env,signal:controller.signal,authFactory});
      if(req.method==='POST'){
        let binding;
        if(body.action==='check'){
          // Never relax gates/policy just to test connectivity. No AI completion,
          // budget/run reservation, Buffer mutation or policy write on this path.
          if(env.NEXOPS_SOCIAL_WRITES_ALLOWED!=='false'||env.NEXOPS_SOCIAL_EMERGENCY_STOP!=='true')throw new SocialAccessError(409,'PUBLICATION_MUST_BE_OFF');
          const policy=await auth.from('nexops_social_policy').select('enabled').eq('organization_id',organizationId).maybeSingle();
          if(policy.error)throw Error();
          if(policy.data?.enabled)throw new SocialAccessError(409,'PUBLICATION_MUST_BE_OFF');
          binding=activationConfiguration(env);
        }
        if(body.action==='enable'){
          if(body.factsVersion!==FACTS_VERSION||body.acceptAutomaticPublishing!==true||body.acceptBudget!==true)throw new SocialAccessError(400,'EXPLICIT_ACTIVATION_REQUIRED');
          binding=activationReady(env);
        }
        if(body.action==='enable'||body.action==='check'){
          const reader=createBufferAdapter({env,fetch:(url,init)=>fetchImpl(url,{...init,signal:controller.signal})});
          const organizations=await reader.organizations(),channels=await reader.channels();
          if(!organizations.some(o=>o.id===binding.bufferOrganizationId)||!Object.entries(binding.channels).every(([network,id])=>channels.filter(c=>c.id===id&&c.service===(network==='x'?'twitter':network)&&c.isQueuePaused===false).length===1))throw new SocialAccessError(503,'CHANNEL_VERIFICATION_FAILED');
          const probe=await fetchImpl(env.NEXOPS_SOCIAL_ALERT_URL,{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${env.NEXOPS_SOCIAL_ALERT_SECRET}`,'Content-Type':'application/json'},body:JSON.stringify({system:'nexops-social',code:'ACTIVATION_NOTIFICATION_TEST'})});
          if(!probe.ok)throw new SocialAccessError(503,'ALERT_VERIFICATION_FAILED');
          if(body.action==='check'){
            const model=await fetchImpl('https://api.openai.com/v1/models/'+AI_MODEL,{method:'GET',redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${env.NEXOPS_SOCIAL_AI_KEY}`}});
            if(!model.ok||(await model.json()).id!==AI_MODEL)throw new SocialAccessError(503,'MODEL_ACCESS_CHECK_FAILED');
            if(controller.signal.aborted)throw Error();
            return res.status(200).json({ready:true,publicationEnabled:false,model:AI_MODEL,aiGenerationTested:false,notificationAccepted:true});
          }
        }
        if(controller.signal.aborted)throw Error();
        const {data,error}=await auth.rpc('nexops_social_set_policy',{o:organizationId,turn_on:body.action==='enable',facts:body.action==='enable'?FACTS_VERSION:null,binding:binding?.hash || null});
        if(error)throw Error();return res.status(200).json({policy:data});
      }
      const queries=[['policy','organization_id,enabled,revision,facts_hash,binding_hash,updated_at'],['posts','day,network,state,reason,updated_at'],['alerts','code,delivered,created_at'],['runs','day,state,ai_calls,reserved_cents']];
      const results=await Promise.all(queries.map(([table,select])=>auth.from('nexops_social_'+table).select(select).eq('organization_id',organizationId).order(table==='policy'?'updated_at':table==='alerts'?'created_at':'day',{ascending:false}).limit(table==='policy'?1:15)));
      if(results.some(r=>r.error))throw Error();
      let ready=false;try{activationReady(env);ready=true;}catch{}
      const policy=results[0].data[0] || {enabled:false};let policyCurrent=false;
      try{policyCurrent=policy.enabled&&policy.facts_hash===FACTS_VERSION&&policy.binding_hash===runtimeBinding(env).hash;}catch{}
      return res.status(200).json({policy,policyCurrent,posts:results[1].data,alerts:results[2].data,runs:results[3].data,factsVersion:FACTS_VERSION,facts:FACTS,activationReady:ready,production:env.VERCEL_ENV==='production',limits:{postsPerNetworkPerUTCDate:1,postsPerDay:3,runsPerUTCDate:1,aiCallsPerDay:6,reservedCentsPerCall:20,dailyCents:120,monthlyCents:4000},stopDoesNotCancelAlreadyAcceptedPosts:true});
    }catch(e){return res.status(e instanceof SocialAccessError?e.status:503).json({code:e instanceof SocialAccessError?e.code:'AUTOPILOT_UNAVAILABLE'});}
    finally{clearTimeout(timer);}
  };
}
