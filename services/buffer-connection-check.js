import {createBufferAdapter} from './buffer-adapter.js'
export async function verifyBufferReadOnly({env=process.env,fetch:transport=fetch}={}){
 const names=['BUFFER_API_KEY','BUFFER_ORGANIZATION_ID','BUFFER_X_CHANNEL_ID','BUFFER_THREADS_CHANNEL_ID','BUFFER_LINKEDIN_CHANNEL_ID']
 const missing=names.filter(name=>!env[name]?.trim())
 const result={status:'configuration_required',missing,organizations:[],channels:[],posts_created:0,schedules_created:0}
 if(missing.includes('BUFFER_API_KEY'))return result
 const adapter=createBufferAdapter({env,fetch:transport})
 try{
  result.organizations=await adapter.organizations()
  if(missing.includes('BUFFER_ORGANIZATION_ID'))return result
  if(!result.organizations.some(o=>o.id===env.BUFFER_ORGANIZATION_ID)){result.status='organization_mismatch';return result}
  const channels=await adapter.channels()
  for(const [network,service,key] of [['x','twitter','BUFFER_X_CHANNEL_ID'],['threads','threads','BUFFER_THREADS_CHANNEL_ID'],['linkedin','linkedin','BUFFER_LINKEDIN_CHANNEL_ID']]){
   const matching=channels.filter(c=>c.id===env[key]&&c.service===service)
   result.channels.push({network,configured:!!env[key],matched:matching.length===1,paused:matching.length===1?matching[0].isQueuePaused:null})
  }
  // IDs are configuration identifiers, not credentials. Never return token/provider errors.
  result.discovered_channels=channels.map(c=>({id:c.id,service:c.service,paused:c.isQueuePaused}))
  result.status=missing.length?'configuration_required':result.channels.every(c=>c.matched)?'read_connection_verified':'channel_mismatch'
 }catch{result.status='read_connection_unconfirmed'}
 return result
}
