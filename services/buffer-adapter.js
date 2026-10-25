// Server-only. No CLI enables publication. Transport is injected for offline verification.
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
export function createBufferAdapter({env = process.env, fetch: transport = fetch} = {}) {
  async function request(query) {
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
    async channels() {
      if (!identifier(env.BUFFER_ORGANIZATION_ID)) throw Error('BUFFER_ORGANIZATION_REQUIRED')
      const data = await request(`query { channels(input: {organizationId: ${JSON.stringify(env.BUFFER_ORGANIZATION_ID)}}) { id service isQueuePaused } }`)
      if (!Array.isArray(data.channels)) throw Error('BUFFER_CHANNELS_UNCONFIRMED')
      return data.channels
    },
    async createPost({network, text, requestedAt}) {
      const service = {x: 'twitter', threads: 'threads'}[network]
      const channelId = env[network === 'x' ? 'BUFFER_X_CHANNEL_ID' : 'BUFFER_THREADS_CHANNEL_ID']
      if (!service || !identifier(channelId)) throw Error('BUFFER_CHANNEL_CONFIGURATION_REQUIRED')
      const channels = await this.channels()
      if (channels.filter(c => c.id === channelId && c.service === service && c.isQueuePaused === false).length !== 1) throw Error('BUFFER_CHANNEL_MISMATCH')
      if (typeof text !== 'string' || !text.trim() || [...text].length > (network === 'x' ? 280 : 500)) throw Error('BUFFER_CONTENT_INVALID')
      if (requestedAt && (!Number.isFinite(Date.parse(requestedAt)) || Date.parse(requestedAt) <= Date.now())) throw Error('BUFFER_SCHEDULE_INVALID')
      const schedule = requestedAt ? `mode: customScheduled, dueAt: ${JSON.stringify(new Date(requestedAt).toISOString())}` : 'mode: addToQueue'
      const data = await request(`mutation { createPost(input: {channelId: ${JSON.stringify(channelId)}, text: ${JSON.stringify(text)}, schedulingType: automatic, ${schedule}}) { ... on PostActionSuccess { post { id dueAt status } } ... on MutationError { message } } }`)
      const post = data.createPost?.post
      if (!identifier(post?.id)) throw Error('BUFFER_OUTCOME_UNCONFIRMED')
      // Acceptance is not proof of final network publication.
      return {providerId: post.id, channelId, service, scheduledAt: post.dueAt ?? null, state: 'provider_accepted'}
    },
  }
}
