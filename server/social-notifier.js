export async function notifySocial(env,code,fetchImpl=fetch){
  try{
    const u=new URL(env.NEXOPS_SOCIAL_ALERT_URL);
    if(u.protocol!=='https:'||u.hostname!==env.NEXOPS_SOCIAL_ALERT_HOST||u.username||u.password||u.port||u.search||u.hash||!env.NEXOPS_SOCIAL_ALERT_SECRET||!/^[A-Z_]{1,80}$/.test(code))return false;
    const r=await fetchImpl(u.href,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:`Bearer ${env.NEXOPS_SOCIAL_ALERT_SECRET}`,'Content-Type':'application/json'},body:JSON.stringify({system:'nexops-social',code})});
    return r.ok;
  }catch{return false;}
}
