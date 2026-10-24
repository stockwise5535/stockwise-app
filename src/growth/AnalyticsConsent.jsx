import { useState } from 'react'
import { CONSENT_KEY, setAnalyticsConsent, capture } from './analytics.js'
import './growth.css'
export default function AnalyticsConsent() {
 const [shown,setShown]=useState(()=>{try{return !localStorage.getItem(CONSENT_KEY)}catch{return false}})
 if(!shown)return null
 return <aside className="growth-consent"><p>Allow optional product analytics to help improve Nexops? We do not send contact details or uploaded data to analytics. <a href="/privacy">Privacy notice</a></p><button onClick={()=>{setAnalyticsConsent(false);setShown(false)}}>Decline analytics</button><button onClick={()=>{setAnalyticsConsent(true);setShown(false); if(['/en','/ja'].includes(location.pathname))void capture('homepage_view',{locale:location.pathname==='/ja'?'ja':'en'});if(location.pathname==='/demo/operations')void capture('demo_workspace_opened',{workspace_type:'demo',data_mode:'synthetic'})}}>Allow analytics</button></aside>
}
