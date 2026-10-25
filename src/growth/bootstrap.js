// Browser-safe coordinator. Only the existing authenticated RPC creates starter records.
const pending=new WeakMap()
export class StarterSetupError extends Error {
 constructor(message,{transient=false}={}){super(message);this.name='StarterSetupError';this.transient=transient}
}
const transient=error=>error?.transient===true||[408,429,502,503,504].includes(Number(error?.status))||Number(error?.status)>=500||error instanceof TypeError||/failed to fetch|network error|networkerror|load failed/i.test(error?.message||'')
export function loadStarterContext({client,api,userId,timeoutMs=15000,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 let requests=pending.get(client);if(!requests){requests=new Map();pending.set(client,requests)}
 if(requests.has(userId))return requests.get(userId)
 const bounded=promise=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new StarterSetupError('Workspace setup timed out. Retry setup, or sign in again.',{transient:true})),timeoutMs)
  Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})
 })
 const task=(async()=>{
  // Never make Supabase requests inside/synchronously with an Auth event callback.
  await wait(0)
  for(let attempt=0;;attempt++){
   try{
    const session=await bounded(client.auth.getSession())
    if(session.error)throw session.error
    if(!session.data?.session?.access_token||session.data.session.user?.id!==userId)throw new StarterSetupError('Your session is unavailable. Sign in again to prepare your workspace.')
    const auth=await bounded(client.auth.getUser())
    if(auth.error)throw auth.error
    if(auth.data?.user?.id!==userId)throw new StarterSetupError('Your session changed. Sign in again to prepare your workspace.')
    if(!auth.data.user.email_confirmed_at)throw new StarterSetupError('Confirm your email, then sign in again to prepare your workspace.')
    const starterId=await bounded(api.bootstrap())
    const [workspaces,profile,memberships,organizations,organizationMemberships,activationRows]=await bounded(Promise.all([
     api.workspaces(),api.profile(),api.memberships(),api.organizations(),api.organizationMemberships(),api.activation(starterId),
    ]))
    const starter=workspaces.find(w=>w.id===starterId&&w.created_by===userId&&w.is_starter&&w.workspace_type==='demo')
    const organization=starter&&organizations.find(o=>o.id===starter.organization_id&&o.created_by===userId)
    const activation=activationRows.find(a=>a.workspace_id===starterId&&a.user_id===userId)
    if(!starter||!organization||profile?.user_id!==userId||!activation||!memberships.some(m=>m.workspace_id===starterId&&m.user_id===userId&&m.role==='owner')||!organizationMemberships.some(m=>m.organization_id===starter.organization_id&&m.user_id===userId&&m.role==='owner'))throw new StarterSetupError('Your starter workspace is incomplete. Retry setup; if this continues, contact support.')
    return {userId,starterId,workspaces,profile,memberships,organizations,organizationMemberships,activation}
   }catch(error){
    if(attempt<2&&transient(error)){await wait([300,900][attempt]);continue}
    if(error instanceof StarterSetupError)throw error
    const denied=['401','403'].includes(String(error?.status))||['PGRST301','PGRST303'].includes(error?.code)
    throw new StarterSetupError(denied?'Your session or workspace access could not be verified. Sign in again, or retry setup.':'We could not prepare your workspace. Retry setup; if this continues, contact support.')
   }
  }
 })()
 requests.set(userId,task)
 // Share only an in-flight operation, never cache completed context across logout/login.
 void task.then(()=>{if(requests.get(userId)===task)requests.delete(userId)},()=>{if(requests.get(userId)===task)requests.delete(userId)})
 return task
}
