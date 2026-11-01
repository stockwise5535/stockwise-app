import {createClient} from '@supabase/supabase-js';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class SocialAccessError extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
export const socialAuthFactory=(url,key,authorization,signal)=>createClient(url,key,{global:{headers:{Authorization:authorization},fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal})},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
export async function authorizeSocial({authorization,workspaceId,env,signal,authFactory=socialAuthFactory}) {
  const deny=(status,code)=>{throw new SocialAccessError(status,code);};
  if(typeof authorization!=='string'||authorization.length>8192||!/^Bearer [A-Za-z0-9._~-]+$/i.test(authorization))deny(401,'AUTH_REQUIRED');
  if(!UUID.test(workspaceId || ''))deny(400,'INVALID_REQUEST');
  const url=env.SUPABASE_URL || env.VITE_SUPABASE_URL,key=env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY,org=env.NEXOPS_SOCIAL_ORGANIZATION_ID;
  try {const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!key||!UUID.test(org||''))throw Error();} catch{deny(503,'CONFIGURATION_REQUIRED');}
  const auth=authFactory(url,key,authorization,signal);
  let identity;
  try{identity=await auth.auth.getUser(authorization.slice(7));}catch{deny(503,'AUTH_UNAVAILABLE');}
  if(identity?.error&&(!identity.error.status||identity.error.status>=500))deny(503,'AUTH_UNAVAILABLE');
  const user=identity?.data?.user;
  if(identity?.error||!UUID.test(user?.id||'')||user.role!=='authenticated'||!user.email_confirmed_at)deny(401,'AUTH_REQUIRED');
  let results;
  try{results=await Promise.all([
    auth.rpc('nexops_is_growth_admin'),
    auth.from('nexops_workspaces').select('id,organization_id').eq('id',workspaceId).maybeSingle(),
    auth.from('nexops_organization_memberships').select('organization_id,user_id,role').eq('organization_id',org).eq('user_id',user.id).maybeSingle(),
    auth.from('nexops_workspace_memberships').select('workspace_id,user_id').eq('workspace_id',workspaceId).eq('user_id',user.id).maybeSingle(),
  ]);}catch{deny(503,'AUTHORIZATION_UNAVAILABLE');}
  if(results.some(r=>!r||r.error))deny(503,'AUTHORIZATION_UNAVAILABLE');
  const [admin,workspace,member,wm]=results.map(r=>r.data);
  if(admin!==true||workspace?.id!==workspaceId||workspace.organization_id!==org||member?.organization_id!==org||member.user_id!==user.id||!['owner','admin'].includes(member.role)||wm?.workspace_id!==workspaceId||wm.user_id!==user.id)deny(403,'ACCESS_DENIED');
  if(signal?.aborted)deny(504,'READ_TIMEOUT');
  return {auth,user,organizationId:org};
}
