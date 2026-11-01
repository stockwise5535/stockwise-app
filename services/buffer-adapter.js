// Server-only. No CLI enables publication. Transport is injected for offline verification.
import {createHash} from 'node:crypto'
export const bufferApprovalHash=({network,channelId,text,requestedAt=null,images=[],url=null})=>createHash('sha256').update(JSON.stringify([network,channelId,text,images,url,requestedAt])).digest('hex')
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
export function createBufferAdapter({env = process.env, fetch: transport = fetch, authorizePublication} = {}) {
  async function request(query) {
    if(query.startsWith('mutation')&&(env.VERCEL_ENV!=='production'||env.NEXOPS_SOCIAL_WRITES_ALLOWED!=='true'||env.NEXOPS_SOCIAL_EMERGENCY_STOP!=='false'))throw Error('BUFFER_PRODUCTION_WRITE_DISABLED')
    if (!env.BUFFER_API_KEY?.trim()) throw Error('BUFFER_CONFIGURATION_REQUIRED')
    try {
      const response = await transport('https://api.buffer.com', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {Authorization: `Bearer ${env.BUFFER_API_KEY}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({query}),
      })
      if (!response.ok) throw Error()
      const result = await response.json()
      if (result.errors?.length || !result.data) throw Error()
      return result.data
    } catch { throw Error('BUFFER_OUTCOME_UNCONFIRMED') }
  }
  return {
    async organizations(){
      const data=await request('query { account { organizations { id name } } }')
      if(!Array.isArray(data.account?.organizations))throw Error('BUFFER_ORGANIZATIONS_UNCONFIRMED')
      return data.account.organizations.filter(o=>identifier(o.id)).map(o=>({id:o.id,name:typeof o.name==='string'?o.name:null}))
    },
    async channels() {
      if (!identifier(env.BUFFER_ORGANIZATION_ID)) throw Error('BUFFER_ORGANIZATION_REQUIRED')
      const data = await request(`query { channels(input: {organizationId: ${JSON.stringify(env.BUFFER_ORGANIZATION_ID)}}) { id service isQueuePaused } }`)
      if (!Array.isArray(data.channels)) throw Error('BUFFER_CHANNELS_UNCONFIRMED')
      return data.channels
    },
    async post(postId,{includeText=true}={}){
      if(!identifier(postId))throw Error('BUFFER_POST_ID_REQUIRED')
      const data=await request(`query { post(input: {id: ${JSON.stringify(postId)}}) { id ${includeText?'text ':''}channelId status metrics { type name value unit } metricsUpdatedAt } }`)
      const post=data.post;if(!identifier(post?.id)||post.id!==postId)throw Error('BUFFER_POST_UNCONFIRMED')
      return {providerId:post.id,channelId:post.channelId,text:typeof post.text==='string'?post.text:null,state:post.status,published:post.status==='sent',metrics:Array.isArray(post.metrics)?post.metrics.filter(m=>typeof m.type==='string'&&Number.isFinite(m.value)&&m.value>=0).map(m=>({type:m.type,value:m.value,unit:m.unit})):null,metricsUpdatedAt:post.metricsUpdatedAt||null,websiteVisits:null,signups:null,demoStarts:null,qualifiedLeads:null}
    },
    async createPost({network, text, requestedAt, images=[],url=null}) {
      if(env.VERCEL_ENV!=='production'||env.NEXOPS_SOCIAL_WRITES_ALLOWED!=='true'||env.NEXOPS_SOCIAL_EMERGENCY_STOP!=='false')throw Error('BUFFER_PRODUCTION_WRITE_DISABLED')
      const service = {x: 'twitter', threads: 'threads', linkedin:'linkedin'}[network]
      const channelId = env[{x:'BUFFER_X_CHANNEL_ID',threads:'BUFFER_THREADS_CHANNEL_ID',linkedin:'BUFFER_LINKEDIN_CHANNEL_ID'}[network]]
      if (!service || !identifier(channelId)) throw Error('BUFFER_CHANNEL_CONFIGURATION_REQUIRED')
      const channels = await this.channels()
      if (channels.filter(c => c.id === channelId && c.service === service && c.isQueuePaused === false).length !== 1) throw Error('BUFFER_CHANNEL_MISMATCH')
      if (typeof text !== 'string' || !text.trim() || [...text].length > ({x:280,threads:500,linkedin:3000}[network])) throw Error('BUFFER_CONTENT_INVALID')
      if (!requestedAt || !Number.isFinite(Date.parse(requestedAt)) || Date.parse(requestedAt) <= Date.now()) throw Error('BUFFER_SCHEDULE_INVALID')
      if(!Array.isArray(images)||images.length)throw Error('BUFFER_VERIFIED_IMAGE_WORKFLOW_REQUIRED')
      if(url){let parsed;try{parsed=new URL(url)}catch{throw Error('BUFFER_URL_MISMATCH')}if(!text.includes(url)||parsed.protocol!=='https:'||parsed.username||parsed.password||[...parsed.searchParams.keys()].some(k=>/token|password|secret|email/i.test(k)))throw Error('BUFFER_URL_MISMATCH')}
      const contentHash=bufferApprovalHash({network,channelId,text,requestedAt:requestedAt||null,images,url})
      if(typeof authorizePublication!=='function')throw Error('BUFFER_PUBLICATION_APPROVAL_REQUIRED')
      let approval;try{approval=await authorizePublication({network,channelId,text,requestedAt:requestedAt||null,images,url,contentHash})}catch{throw Error('BUFFER_APPROVAL_UNCONFIRMED')}
      if(approval?.authorized!==true||approval.contentHash!==contentHash)throw Error('BUFFER_PUBLICATION_APPROVAL_REQUIRED')
      const schedule = `mode: customScheduled, dueAt: ${JSON.stringify(new Date(requestedAt).toISOString())}`
      const data = await request(`mutation { createPost(input: {channelId: ${JSON.stringify(channelId)}, text: ${JSON.stringify(text)}, assets: [], needsApproval: false, saveToDraft: false, aiAssisted: true, schedulingType: automatic, ${schedule}}) { ... on PostActionSuccess { post { id dueAt status } } ... on MutationError { message } } }`)
      const post = data.createPost?.post
      if (!identifier(post?.id)) throw Error('BUFFER_OUTCOME_UNCONFIRMED')
      // Acceptance is not proof of final network publication.
      return {providerId: post.id, channelId, service, scheduledAt: post.dueAt ?? null, state: 'provider_accepted'}
    },
  }
}
