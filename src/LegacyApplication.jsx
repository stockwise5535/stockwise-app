import { AuthProvider } from './AuthContext.jsx'
import App from './App.jsx'
import StarterContext from './growth/StarterContext.jsx'

export default function LegacyApplication() {
  return <AuthProvider><StarterContext><App /></StarterContext></AuthProvider>
}
