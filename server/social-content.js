import stock from './social-stock.json' with {type:'json'};
import {SOCIAL_EVIDENCE} from './social-evidence.js';
import {createHash} from 'node:crypto';
import {outboundRiskFlags} from '../services/social-risk-rules.js';
// Narrow, public, source-backed claims. Changing this catalog invalidates activation.
export const FACTS=Object.freeze([
  {
    "id": "inventory_csv",
    "text": "Import inventory CSV files into Stockwise to review your item data.",
    "source": "src/App.jsx"
  },
  {
    "id": "coverage",
    "text": "Review inventory coverage and reorder suggestions in the Stockwise dashboard.",
    "source": "src/App.jsx"
  },
  {
    "id": "forecast",
    "text": "Review the 13-week stock forecast before planning your next order.",
    "source": "src/App.jsx"
  },
  {
    "id": "early_access",
    "text": "You can submit an Early Access request when you need to manage more items.",
    "source": "api/save-early-access.js"
  },
  {
    "id": "inbound_csv",
    "text": "Stockwise supports inbound CSV uploads for inventory planning.",
    "source": "src/App.jsx"
  }
]);
export const HOOKS=Object.freeze({x:['Stockwise inventory planning.','A look at Stockwise.','Stockwise workflow notes.'],threads:['Stockwise: inventory workflow.','Working with inventory in Stockwise.','Stockwise feature notes.'],linkedin:['Stockwise for inventory planning.','An inventory workflow in Stockwise.','Stockwise product notes.']});
export const hashText=text=>createHash('sha256').update(text.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase()).digest('hex');
export const APPROVED_STOCK=Object.freeze(stock.map(p=>Object.freeze({...p,factIds:Object.freeze([...p.factIds])})));
export const FACTS_VERSION=createHash('sha256').update(JSON.stringify([FACTS,HOOKS,SOCIAL_EVIDENCE,APPROVED_STOCK,'approved-stock-no-ai-v1'])).digest('hex');
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
