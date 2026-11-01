// Server-only interface. No DB writes and no caller-supplied GraphQL documents.
if (typeof window !== 'undefined') throw new Error('Server only');

const endpoint = 'https://api.buffer.com/';
const queries = Object.freeze({
  organizations: 'query { account { organizations { id name } } }',
  channels: 'query($input: ChannelsInput!) { channels(input:$input) { id name displayName service isDisconnected } }',
  posts: 'query($input: PostsInput!, $after: String, $first: Int!) { posts(input:$input, first:$first, after:$after) { edges { node { id channelId status dueAt sentAt metricsUpdatedAt metrics { type value unit } } } pageInfo { endCursor hasNextPage } } }',
  aggregate: 'query($input: AggregatedPostMetricsInput!) { aggregatedPostMetrics(input:$input) { metricsUpdatedAt metrics { type value unit } } }',
});
export const metricTypes = Object.freeze(['averageTimeWatched','clicks','comments','engagementRate','follows','freeSubscriptions','impressions','likes','paidSubscriptions','postCount','quotes','reach','reactions','reposts','saves','shares','totalTimeWatched','viewers','views']);
export class BufferReadError extends Error {
  constructor(code) { super(code); this.name = 'BufferReadError'; this.code = code; }
}
export function normalizeMetrics(metrics) {
  return Object.fromEntries(metricTypes.map(type => {
    const m = metrics?.find(m => m.type === type && Number.isFinite(m.value));
    return [type, m ? { status:'available', value:m.value, unit:m.unit } : { status:'not_fetched', value:null, unit:null }];
  }));
}

/** Internal trusted-server API. Caller must authorize organizationId before serving users.
 * Period applies to aggregated metrics. Posts are a bounded all-status inventory,
 * explicitly marked complete/incomplete; their dates are not the aggregate window.
 */
export async function readBufferGrowth({ organizationId, start, end, maxPages=10, channelIds, pageSize=100, maxPosts=1000, signal }, {
  apiKey=process.env.BUFFER_API_KEY, fetchImpl=globalThis.fetch, now=()=>new Date(),
} = {}) {
  if (typeof window !== 'undefined') throw new BufferReadError('SERVER_ONLY');
  if (!apiKey) throw new BufferReadError('MISSING_CREDENTIAL');
  if (typeof organizationId !== 'string' || !organizationId.trim() ||
      !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) ||
      !/Z$|[+-]\d\d:\d\d$/.test(start) || !/Z$|[+-]\d\d:\d\d$/.test(end) ||
      Date.parse(start)>=Date.parse(end) || !Number.isInteger(maxPages) || maxPages<1 || maxPages>100)
    throw new BufferReadError('INVALID_INPUT');
  if (!Number.isInteger(pageSize) || pageSize<1 || pageSize>100 || !Number.isInteger(maxPosts) || maxPosts<1 || maxPosts>10000) throw new BufferReadError('INVALID_INPUT');
  async function read(operation, variables={}) {
    let response;
    try {
      response = await fetchImpl(endpoint, { method:'POST', redirect:'error',
        headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ query:queries[operation], variables }), signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
    } catch { throw new BufferReadError('NETWORK_ERROR'); }
    if (!response.ok) throw new BufferReadError(response.status===401 ? 'UNAUTHENTICATED' : response.status===403 ? 'ACCESS_DENIED' : response.status===429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR');
    let result;
    try { result=await response.json(); } catch { throw new BufferReadError('INVALID_RESPONSE'); }
    // Never expose upstream errors: they can contain private data or credential echoes.
    if (result.errors?.length) throw new BufferReadError('GRAPHQL_ERROR');
    if (!result.data) throw new BufferReadError('INVALID_RESPONSE');
    return result.data;
  }
  const orgs=(await read('organizations')).account.organizations;
  const organization=orgs.find(o=>o.id===organizationId);
  if (!organization) throw new BufferReadError('ORGANIZATION_NOT_ACCESSIBLE');
  const discovered=(await read('channels',{input:{organizationId}})).channels;
  if (!Array.isArray(discovered)) throw new BufferReadError('INVALID_RESPONSE');
  if (channelIds && (!['linkedin','threads','twitter'].every(s=>typeof channelIds[s]==='string' && discovered.filter(c=>c.id===channelIds[s] && c.service===s).length===1) || new Set(Object.values(channelIds)).size!==3)) throw new BufferReadError('CHANNEL_CONFIGURATION_MISMATCH');
  const channels=discovered.filter(c=>['linkedin','threads','twitter'].includes(c.service) && (!channelIds || channelIds[c.service]===c.id));
  const output={ schemaVersion:1, source:'buffer', organization, fetchedAt:now().toISOString(),
    period:{start:new Date(start).toISOString(),end:new Date(end).toISOString()},
    missingServices:['linkedin','threads','twitter'].filter(s=>!channels.some(c=>c.service===s)).map(s=>s==='twitter'?'x':s), channels:[] };
  for (const c of channels) {
    const channel={ id:c.id, name:c.displayName || c.name, handle:c.name,
      service:c.service==='twitter'?'x':c.service, disconnected:c.isDisconnected,
      posts:[], postsScope:'all_statuses_all_dates', postsComplete:false,
      metrics:normalizeMetrics(null), metricsUpdatedAt:null, metricsError:null, postsError:null, errors:[] };
    try {
      let after=null;
      const seen=new Set();
      for (let page=0; page<maxPages; page++) {
        const result=(await read('posts',{input:{organizationId,filter:{channelIds:[c.id]}},after,first:Math.min(pageSize,maxPosts-channel.posts.length)})).posts;
        if (!Array.isArray(result.edges) || result.edges.length>Math.min(pageSize,maxPosts-channel.posts.length)) throw new BufferReadError('INVALID_RESPONSE');
        for (const {node:p} of result.edges) {
          if (p.channelId!==c.id) throw new BufferReadError('CHANNEL_MISMATCH');
          if (!seen.has(p.id)) { seen.add(p.id); channel.posts.push({id:p.id,status:p.status,dueAt:p.dueAt,sentAt:p.sentAt,metricsUpdatedAt:p.metricsUpdatedAt,metrics:normalizeMetrics(p.metrics)}); }
        }
        if (!result.pageInfo.hasNextPage) { channel.postsComplete=true; break; }
        if (channel.posts.length>=maxPosts) { channel.errors.push('POST_LIMIT'); break; }
        const next=result.pageInfo.endCursor;
        if (!next || next===after) throw new BufferReadError('INVALID_PAGINATION');
        after=next;
      }
      if (!channel.postsComplete) channel.errors.push('PAGE_LIMIT');
    } catch (e) { channel.postsError=e instanceof BufferReadError?e.code:'INVALID_RESPONSE';channel.errors.push(channel.postsError); }
    try {
      const a=(await read('aggregate',{input:{organizationId,channelIds:[c.id],startDateTime:output.period.start,endDateTime:output.period.end}})).aggregatedPostMetrics;
      channel.metrics=normalizeMetrics(a.metrics); channel.metricsUpdatedAt=a.metricsUpdatedAt;
    } catch (e) { channel.metricsError=e instanceof BufferReadError?e.code:'INVALID_RESPONSE';channel.errors.push(channel.metricsError); }
    output.channels.push(channel);
  }
  output.status=output.missingServices.length || output.channels.some(c=>c.errors.length) ? 'partial' : 'complete';
  return output;
}
