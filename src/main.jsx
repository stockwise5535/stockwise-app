import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './AuthContext.jsx'
import App from './App.jsx'
const InternalGrowthDashboard = React.lazy(() => import('./growth/InternalGrowthDashboard.jsx'))
const isGrowth = window.location.pathname.replace(/\/$/, '') === '/growth'
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><AuthProvider>{isGrowth ? <React.Suspense fallback={<p>Loading dashboard…</p>}><InternalGrowthDashboard /></React.Suspense> : <App />}</AuthProvider></React.StrictMode>
)
