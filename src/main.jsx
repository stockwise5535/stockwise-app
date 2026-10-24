import React from 'react'
import ReactDOM from 'react-dom/client'
import { lazy, Suspense } from 'react'

const OperationsWorkspace = lazy(() => import('./operations/OperationsWorkspace.jsx'))
const LegacyApplication = lazy(() => import('./LegacyApplication.jsx'))
const GrowthApplication = lazy(() => import('./growth/GrowthApplication.jsx'))
const Landing = lazy(() => import('./growth/Landing.jsx'))
const isGrowth = ['/growth','/signup','/invite'].includes(window.location.pathname.replace(/\/$/, ''))
const isLanding = ['/en','/ja','/privacy','/terms'].includes(window.location.pathname.replace(/\/$/, ''))
const isDemo = window.location.pathname.replace(/\/$/, '') === '/demo/operations'
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><Suspense fallback={<div style={{ color:"white", padding:32 }}>Loading…</div>}>{isDemo ? <OperationsWorkspace initialPage={new URLSearchParams(window.location.search).get('view') || 'today'} /> : isGrowth ? <GrowthApplication/> : isLanding ? <Landing/> : <LegacyApplication />}</Suspense></React.StrictMode>
)
