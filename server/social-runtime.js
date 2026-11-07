import {createHash,timingSafeEqual} from 'node:crypto';
import {UUID} from './social-access.js';
export function productionGate(env){
  if(env.VERCEL_ENV!=='production'||env.NEXOPS_SOCIAL_WRITES_ALLOWED!=='true'||env.NEXOPS_SOCIAL_EMERGENCY_STOP!=='false')throw Error('PRODUCTION_WRITE_DISABLED');
}
export function runtimeBinding(env){
  const channels={linkedin:env.BUFFER_LINKEDIN_CHANNEL_ID,threads:env.BUFFER_THREADS_CHANNEL_ID,x:env.BUFFER_X_CHANNEL_ID};
  const valid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
  if(!UUID.test(env.NEXOPS_SOCIAL_ORGANIZATION_ID || '')||!valid(env.BUFFER_ORGANIZATION_ID)||!Object.values(channels).every(valid)||new Set(Object.values(channels)).size!==3)throw Error('SOCIAL_MAPPING_REQUIRED');
  const hash=createHash('sha256').update(JSON.stringify([env.NEXOPS_SOCIAL_ORGANIZATION_ID,env.BUFFER_ORGANIZATION_ID,channels])).digest('hex');
  return {organizationId:env.NEXOPS_SOCIAL_ORGANIZATION_ID,bufferOrganizationId:env.BUFFER_ORGANIZATION_ID,channels,hash};
}
export function activationReady(env){productionGate(env);return activationConfiguration(env);}
export function activationConfiguration(env){
  const binding=runtimeBinding(env);
  if(!env.BUFFER_API_KEY||!env.NEXOPS_SOCIAL_AI_KEY||!env.SUPABASE_SERVICE_ROLE_KEY||env.NEXOPS_SOCIAL_AI_PRICING_ACK!=='gpt-4.1-mini-input10-output50-per-million-v1')throw Error('AUTOPILOT_CONFIGURATION_REQUIRED');
  let u;try{u=new URL(env.NEXOPS_SOCIAL_ALERT_URL);}catch{throw Error('ALERT_CONFIGURATION_REQUIRED');}
  if(u.protocol!=='https:'||u.hostname!==env.NEXOPS_SOCIAL_ALERT_HOST||u.username||u.password||u.port||u.search||u.hash||!env.NEXOPS_SOCIAL_ALERT_SECRET)throw Error('ALERT_CONFIGURATION_REQUIRED');
  return binding;
}
export function secretMatches(header,secret){
  if(typeof secret!=='string'||secret.length<32||typeof header!=='string'||header.length>8192)return false;
  const digest=v=>createHash('sha256').update(v).digest();return timingSafeEqual(digest(header),digest('Bearer '+secret));
}
