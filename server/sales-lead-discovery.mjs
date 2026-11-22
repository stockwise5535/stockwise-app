// Public CC0 business facts only. Discovery is not official-site verification,
// contact permission, acquisition due diligence, or a sending queue.
import{reviewedResearchSource}from'./sales-daily-research.mjs';
export const DISCOVERY_ENDPOINT='https://query.wikidata.org/sparql';
const countries=['SG','NZ','KR','TH','VN','MY','JP','AU'];
export function discoveryQuery(kind,{excludedEntities=[],after=''}={}){
 if(!['regional','supply_chain','ai_partner'].includes(kind)||excludedEntities.length>2000||excludedEntities.some(q=>!/^Q[1-9][0-9]*$/.test(q))||after&&!/^Q[1-9][0-9]*$/.test(after))throw Error('INVALID_DISCOVERY_QUERY');
 const scope=kind==='regional'?'VALUES ?country {wd:Q334 wd:Q664 wd:Q884 wd:Q869 wd:Q881 wd:Q833}':kind==='ai_partner'?'?item wdt:P452 wd:Q11660 .':'VALUES ?industry {wd:Q3761396 wd:Q177777} ?item wdt:P452 ?industry .';
 const relevance=kind==='regional'?'manufactur|wholesale|e-commerce|ecommerce|inventory|supply chain':kind==='ai_partner'?'company|startup|start-up|firm':'company|consult|service|provider|software';
 return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX hint: <http://www.bigdata.com/queryHints#>
SELECT DISTINCT ?item ?label ?description ?website ?countryCode WHERE {
 hint:Query hint:optimizer "None".
 ${scope}
 ?item wdt:P17 ?country; wdt:P856 ?website; rdfs:label ?label; schema:description ?description.
 ?country wdt:P297 ?countryCode.
 FILTER(LANG(?label)="en" && LANG(?description)="en")
 FILTER(STRSTARTS(STR(?website),"https://"))
 FILTER(REGEX(?description,"${relevance}","i"))
 ${excludedEntities.length?'FILTER(?item NOT IN ('+excludedEntities.map(q=>'wd:'+q).join(',')+'))':''}
 ${after?'FILTER(STR(?item) > "http://www.wikidata.org/entity/'+after+'")':''}
} ORDER BY STR(?item) LIMIT 150`;
}
async function boundedResponse(response){
 if(!response.ok)throw Error('DISCOVERY_HTTP_'+response.status);
 if(!/application\/(?:sparql-results\+)?json/i.test(response.headers.get('content-type')||''))throw Error('DISCOVERY_CONTENT_TYPE');
 const reader=response.body.getReader();let bytes=0;const chunks=[];
 try{while(true){const{done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>524288)throw Error('DISCOVERY_SOURCE_TOO_LARGE');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!Array.isArray(body.results?.bindings)||body.results.bindings.length>150)throw Error('DISCOVERY_SCHEMA_INVALID');return body.results.bindings;
}
export async function discoverBusinessLeads({sources,existingRows=[],fetchImpl=fetch,now=new Date()}={}){
 if(!Array.isArray(sources)||sources.length<1||sources.length>3)throw Error('DISCOVERY_SOURCES_REQUIRED');
 const excludedEntities=[...new Set(existingRows.map(r=>String(r.source_url||'').match(/^https:\/\/www\.wikidata\.org\/wiki\/(Q[1-9][0-9]*)$/)?.[1]).filter(Boolean))];
 const domain=url=>{try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch{return'';}};
 const seen=new Set(existingRows.map(r=>domain(r.website||('https://'+r.domain))).filter(Boolean));
 const result={day:now.toISOString().slice(0,10),status:'completed',approvedToEmail:false,candidates:[],sources:[],capacityTarget:50,qualifiedForSales:0};
 for(const source of sources){
  if(source.url!==DISCOVERY_ENDPOINT||source.format!=='wikidata-discovery'||!reviewedResearchSource(source,now))throw Error('UNREVIEWED_DISCOVERY_SOURCE');
  try{
   let after='';let accepted=0;const quota=Math.ceil(50/sources.length);
   // Keyset paging skips already-known domains rather than repeating two seeds.
   // Bounded to 3 pages/source and 50 new research candidates/run. No retry.
   for(let page=0;page<3&&accepted<quota&&result.candidates.length<50;page++){
    const response=await fetchImpl(DISCOVERY_ENDPOINT,{method:'POST',redirect:'error',credentials:'omit',headers:{Accept:'application/sparql-results+json','Content-Type':'application/x-www-form-urlencoded','User-Agent':'StockwiseLeadResearch/1.0 (https://github.com/stockwise5535/stockwise-app)'},body:new URLSearchParams({query:discoveryQuery(source.kind,{excludedEntities,after})}),signal:AbortSignal.timeout(30000)});
    const rows=await boundedResponse(response);
    for(const row of rows){
     const id=row.item?.value?.match(/^http:\/\/www\.wikidata\.org\/entity\/(Q[1-9][0-9]*)$/)?.[1];
     if(!id)throw Error('DISCOVERY_ENTITY_INVALID');after=id;
     const countryCode=row.countryCode?.value,website=row.website?.value,name=row.label?.value;
     if(!/^[A-Z]{2}$/.test(countryCode||'')||!name||name.length>200||/^[=+@-]/.test(name)||!/^https:\/\//.test(website||''))continue;
     if(source.kind==='regional'&&!countries.includes(countryCode))continue;
     const hostname=domain(website);if(!hostname||seen.has(hostname))continue;seen.add(hostname);accepted++;
     result.candidates.push({companyName:name,countryCode,segment:source.kind==='regional'?'sme':source.kind==='ai_partner'?'ai_partner':'supply_chain_services',officialWebsite:website,evidenceUrls:['https://www.wikidata.org/wiki/'+id],businessDescription:row.description?.value||'',researchStatus:'unverified',approvedToEmail:false,officialVerificationRequired:true,contactReviewRequired:true,observedAt:now.toISOString()});
     if(accepted>=quota||result.candidates.length>=50)break;
    }
    if(rows.length<150)break;
   }
   result.sources.push({kind:source.kind,status:'read',accepted});
  }catch(error){const reason=error?.name==='TimeoutError'?'timeout':/^DISCOVERY_[A-Z_0-9]+$/.test(error?.message||'')?error.message:'request_failed';result.status='needs_attention';result.sources.push({kind:source.kind,status:'read_failed',reason});}
 }
 return result;
}
