// Pure aggregate analysis. A demo workspace is NOT a test account: classification is explicit.
const keys=['website_visitors','new_signups','demo_starts','first_value','returning_users','qualified_leads','consultation_requests']
export function analyzeFunnel({environment,rows,population,sourceApproved=false,visitorObservation}={}){
 if(!['fixture','development','production'].includes(environment))throw Error('ENVIRONMENT_REQUIRED')
 const unavailable=reason=>Object.fromEntries(keys.map(k=>[k,{value:null,reason}]))
 if(!Array.isArray(rows)||!Array.isArray(population)||!sourceApproved)return {environment,metrics:unavailable('verified_source_and_population_required'),traffic_source:null}
 const allowed=new Set(population.filter(p=>p.environment===environment&&p.classification===(environment==='production'?'real_customer':'test')&&p.verified===true).map(p=>p.userId))
 if(!allowed.size)return {environment,metrics:unavailable('population_unverified'),traffic_source:null}
 const filtered=rows.filter(r=>r.environment===environment&&allowed.has(r.userId))
 const mapping={website_visitors:'homepage_view',new_signups:'signup_completed',demo_starts:'demo_workspace_opened',first_value:'recommended_action_viewed',returning_users:'user_returned',qualified_leads:'qualified_lead',consultation_requests:'consultation_submitted'}
 const metrics=Object.fromEntries(Object.entries(mapping).map(([key,event])=>[key,{value:new Set(filtered.filter(r=>r.event===event).map(r=>r.userId)).size,reason:null}]))
 if(environment!=='fixture')metrics.website_visitors=visitorObservation?.verified===true&&visitorObservation.environment===environment&&Number.isSafeInteger(visitorObservation.value)&&visitorObservation.value>=0?{value:visitorObservation.value,reason:null}:{value:null,reason:'anonymous_visitor_source_required'}
 const byPost={};for(const id of new Set(filtered.map(r=>r.postId).filter(Boolean))){const events=filtered.filter(r=>r.postId===id);byPost[id]=Object.fromEntries(Object.entries(mapping).map(([key,event])=>[key,new Set(events.filter(r=>r.event===event).map(r=>r.userId)).size]))}
 const traffic={};for(const source of ['x','threads','linkedin','organic_search']){const attributed=filtered.filter(r=>r.source===source);if(attributed.length)traffic[source]=Object.fromEntries(Object.entries(mapping).map(([key,event])=>[key,new Set(attributed.filter(r=>r.event===event).map(r=>r.userId)).size]))}
 return {environment,metrics,by_post:Object.keys(byPost).length?byPost:null,traffic_source:Object.keys(traffic).length?traffic:null,definition:'unique users in explicitly verified population; consented source coverage is a subset, no inferred direct traffic'}
}
