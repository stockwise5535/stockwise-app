import {SOCIAL_EVIDENCE} from './social-evidence.js';
import {createHash} from 'node:crypto';
import {outboundRiskFlags} from '../services/outbound-safety.js';
// Narrow, public, source-backed claims. Changing this catalog invalidates activation.
export const FACTS=Object.freeze([
  {id:'demo',text:'Explore Stockwise with synthetic inventory and purchase-order data.',source:'src/operations/OperationsWorkspace.jsx'},
  {id:'exceptions',text:'Review a supply exception and inspect the recommended next action.',source:'src/operations/OperationsWorkspace.jsx'},
  {id:'decisions',text:'Record a human decision before taking the next operational step.',source:'src/operations/workflow.js'},
  {id:'consultation',text:'You can submit a consultation request in NexOps.',source:'src/growth/GrowthApplication.jsx'},
  {id:'separation',text:'The demo does not connect your customer data merely by registering.',source:'src/growth/GrowthApplication.jsx'},
]);
export const HOOKS=Object.freeze({x:['A practical supply-chain review.','From exception to a next step.','Explore the workflow.'],threads:['A closer look at the Stockwise workflow.','How do you review a supply exception?','Try a practical review flow.'],linkedin:['A practical workflow for supply-chain teams.','Review exceptions before deciding on the next step.','Explore supply-chain decision support.']});
export const hashText=text=>createHash('sha256').update(text.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase()).digest('hex');
export const FACTS_VERSION=createHash('sha256').update(JSON.stringify([FACTS,HOOKS,SOCIAL_EVIDENCE,'constrained-composition-v1','gpt-4.1-mini',20,6,4000])).digest('hex');
export function compose(network,plan){
  if(!Object.hasOwn(HOOKS,network)||!plan||Object.keys(plan).sort().join(',')!=='factIds,hook'||!Number.isInteger(plan.hook)||!HOOKS[network][plan.hook]||!Array.isArray(plan.factIds)||plan.factIds.length<1||plan.factIds.length>3||new Set(plan.factIds).size!==plan.factIds.length)throw Error('CONTENT_SHAPE_REJECTED');
  const facts=plan.factIds.map(id=>FACTS.find(f=>f.id===id));if(facts.some(f=>!f))throw Error('UNVERIFIED_FACT');
  // No free-form model text, numbers, testimonials, links, customer data or instructions.
  const text=[HOOKS[network][plan.hook],...facts.map(f=>f.text)].join(network==='x'?' ':'\n\n');
  if([...text].length>({x:280,threads:500,linkedin:3000}[network]))throw Error('NETWORK_LENGTH_REJECTED');
  if(outboundRiskFlags(text).length||/eyJ[\w-]+\.[\w-]+\.|\b(?:sk-|Bearer\s)|\b\d+%|guarantee|unlimited|best in|confidential/i.test(text))throw Error('CONTENT_RULE_REJECTED');
  return {text,contentHash:hashText(text),factIds:plan.factIds};
}
export function analyzeSocial(snapshot,prior=[]){
  // This is internal observed context, never public proof of customer outcomes.
  const summarize=metrics=>Object.fromEntries(Object.entries(metrics || {}).filter(([k,v])=>['impressions','views','engagementRate','reactions','comments','clicks'].includes(k)&&v.status==='available'&&Number.isFinite(v.value)).map(([k,v])=>[k,{value:v.value,unit:v.unit}]));
  return (snapshot?.channels || []).map(c=>({priorTopics:prior.filter(p=>p.network===c.service&&p.provider_id).slice(0,5).map(p=>({factIds:p.fact_ids,metricsUpdatedAt:c.posts?.find(post=>post.id===p.provider_id)?.metricsUpdatedAt || p.metrics_updated_at || null,metrics:summarize(c.posts?.find(post=>post.id===p.provider_id)?.metrics || p.metrics)})),network:c.service,observedAt:snapshot.fetchedAt,metricsUpdatedAt:c.metricsUpdatedAt,metrics:Object.fromEntries(Object.entries(c.metrics || {}).filter(([k,v])=>['postCount','impressions','views','engagementRate','reactions','comments','clicks'].includes(k)&&v.status==='available'&&Number.isFinite(v.value)).map(([k,v])=>[k,{value:v.value,unit:v.unit}]))}));
}
