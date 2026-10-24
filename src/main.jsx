import React from 'react'
import ReactDOM from 'react-dom/client'
import { lazy, Suspense } from 'react'

const OperationsWorkspace = lazy(() => import('./operations/OperationsWorkspace.jsx'))
const LegacyApplication = lazy(() => import('./LegacyApplication.jsx'))
const isDemo = window.location.pathname.replace(/\/$/, '') === '/demo/operations'
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><Suspense fallback={<div style={{ color:"white", padding:32 }}>Loading…</div>}>{isDemo ? <OperationsWorkspace initialPage={new URLSearchParams(window.location.search).get('view') || 'today'} /> : <LegacyApplication />}</Suspense></React.StrictMode>
)
