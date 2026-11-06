import {productionGate,secretMatches} from './social-runtime.js';
import {createSocialStore} from './social-store.js';
import {runSocialCycle} from './social-cycle.js';
import {notifySocial} from './social-notifier.js';
export function createSocialJobHandler({env=process.env,storeFactory=createSocialStore,cycle=runSocialCycle,fetchImpl=fetch}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET')return res.status(405).json({code:'METHOD_NOT_ALLOWED'});
    if(!secretMatches(req.headers?.authorization,env.CRON_SECRET))return res.status(401).json({code:'AUTH_REQUIRED'});
    try{productionGate(env);}catch{return res.status(403).json({code:'PRODUCTION_WRITE_DISABLED'});}
    if(new URL(req.url,'https://local.invalid').search)return res.status(400).json({code:'INVALID_REQUEST'});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),240000);
    try{
      const store=storeFactory({env,signal:controller.signal});
      const result=await cycle({env,store,signal:controller.signal});
      return res.status(result.status==='failed'?503:200).json(result);
    }catch{await notifySocial(env,'SOCIAL_JOB_FAILED',fetchImpl);return res.status(503).json({code:'SOCIAL_CYCLE_UNAVAILABLE'});}
    finally{clearTimeout(timer);}
  };
}
