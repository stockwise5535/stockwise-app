import { cleanProperties, EVENTS } from './service.js'
export const CONSENT_KEY='nexops_analytics_consent'
export function analyticsConsent() { try { return localStorage.getItem(CONSENT_KEY)==='yes' } catch { return false } }
export function setAnalyticsConsent(value) { try {localStorage.setItem(CONSENT_KEY,value?'yes':'no'); if(!value)localStorage.removeItem('nexops_analytics_id')} catch {} }
export function resetAnalyticsIdentity(){try{localStorage.removeItem('nexops_analytics_id')}catch{}}
export async function capture(event,properties={},options={}) {
  if (!EVENTS.includes(event) || !(options.consent ?? analyticsConsent())) return false
  const key=options.key ?? import.meta.env?.VITE_POSTHOG_KEY
  const host=options.host ?? import.meta.env?.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com'
  if (!key) return false
  let url
  try { url=new URL('/capture/',host); if(url.protocol!=='https:' || url.username || url.password)return false } catch {return false}
  let distinctId=options.distinctId
  if (!distinctId) {
    try { distinctId=localStorage.getItem('nexops_analytics_id') || crypto.randomUUID(); localStorage.setItem('nexops_analytics_id',distinctId) } catch {return false}
  }
  try {
    if(options.distinctId){
      try{const previous=localStorage.getItem('nexops_analytics_id');if(previous && previous!==options.distinctId){const identified=await (options.fetch || fetch)(url.href,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:key,event:'$identify',properties:{distinct_id:options.distinctId,$anon_distinct_id:previous,$process_person_profile:true}})});if(!identified.ok)return false}localStorage.setItem('nexops_analytics_id',options.distinctId)}catch{}
    }
    const response=await (options.fetch || fetch)(url.href,{method:'POST',credentials:'omit',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:key,event,properties:{distinct_id:distinctId,...cleanProperties(properties),$process_person_profile:Boolean(options.distinctId)}})})
    return response.ok
  } catch { return false }
}
