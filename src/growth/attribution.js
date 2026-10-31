// Opt-in, coarse attribution only. Disabled in production unless explicitly enabled and approved.
export const ATTRIBUTION_KEY='nexops_coarse_attribution_v1'
const sources=new Set(['x','threads','linkedin','organic_search'])
export function clearAttribution(storage){try{(storage||globalThis.localStorage)?.removeItem(ATTRIBUTION_KEY)}catch{}}
export function attributionProperties(options={}){
 const enabled=options.enabled ?? (import.meta.env?.VITE_GROWTH_ATTRIBUTION_ENABLED==='true')
 if(!enabled)return {}
 try{
  const storage=options.storage || globalThis.localStorage,now=options.now ?? Date.now()
  const consent=options.consent ?? (storage?.getItem('nexops_analytics_consent')==='yes')
  if(!consent){clearAttribution(storage);return {}}
  let saved=null;try{saved=JSON.parse(storage?.getItem(ATTRIBUTION_KEY)||'null')}catch{clearAttribution(storage)}
  if(!saved||!sources.has(saved.source)||!Number.isFinite(saved.at)||now-saved.at>=7*86400000||saved.at>now){
   clearAttribution(storage);saved=null
   const url=new URL(options.href || globalThis.location?.href),raw=url.searchParams.get('utm_source')
   const source=raw==='twitter'?'x':raw
   if(sources.has(source)){saved={source,at:now};storage?.setItem(ATTRIBUTION_KEY,JSON.stringify(saved))}
  }
  return saved?{referral_source:saved.source}:{}
 }catch{return {}}
}
