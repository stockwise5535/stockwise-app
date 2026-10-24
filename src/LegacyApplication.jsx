import { AuthProvider } from './AuthContext.jsx'
import App from './App.jsx'

export default function LegacyApplication() {
  return <AuthProvider><App /></AuthProvider>
}
