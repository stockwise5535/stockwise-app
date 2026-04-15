import { useState } from 'react'
import { useAuth } from '../AuthContext.jsx'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode,    setMode]    = useState('login')
  const [email,   setEmail]   = useState('')
  const [pw,      setPw]      = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [msg,     setMsg]     = useState(null)

  async function submit(e) {
    e.preventDefault()
    setError(null); setMsg(null); setLoading(true)
    try {
      const { error } = mode === 'login'
        ? await signIn(email, pw)
        : await signUp(email, pw)
      if (error) throw error
      if (mode === 'signup') { setMsg('メールを確認してログインしてください。'); setMode('login') }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f4f8', fontFamily:"'IBM Plex Mono',monospace", padding:24 }}>
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'40px 36px', width:'100%', maxWidth:400, boxShadow:'0 4px 24px rgba(0,0,0,0.07)' }}>

        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:'#0f172a', marginBottom:4 }}>📦 StockWise</div>
        <div style={{ fontSize:12, color:'#94a3b8', marginBottom:28 }}>What should I reorder today?</div>

        {error && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:6, padding:'9px 12px', fontSize:12, color:'#dc2626', marginBottom:14 }}>{error}</div>}
        {msg   && <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:6, padding:'9px 12px', fontSize:12, color:'#15803d', marginBottom:14 }}>{msg}</div>}

        <form onSubmit={submit}>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#374151', marginBottom:4 }}>EMAIL</label>
          <input style={{ width:'100%', padding:'10px 12px', borderRadius:7, border:'1px solid #e2e8f0', fontSize:14, marginBottom:14, outline:'none', fontFamily:'inherit' }}
            type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />

          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#374151', marginBottom:4 }}>PASSWORD</label>
          <input style={{ width:'100%', padding:'10px 12px', borderRadius:7, border:'1px solid #e2e8f0', fontSize:14, marginBottom:20, outline:'none', fontFamily:'inherit' }}
            type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="8文字以上" required minLength={8} />

          <button type="submit" disabled={loading} style={{ width:'100%', padding:11, borderRadius:7, border:'none', background:'#0f172a', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:loading?0.6:1, fontFamily:'inherit' }}>
            {loading ? '処理中…' : mode === 'login' ? 'ログイン' : 'アカウント作成'}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:18, fontSize:12, color:'#94a3b8' }}>
          {mode === 'login'
            ? <>アカウントなし？ <span style={{ color:'#0f172a', cursor:'pointer', fontWeight:700 }} onClick={() => { setMode('signup'); setError(null) }}>無料登録</span></>
            : <>登録済み？ <span style={{ color:'#0f172a', cursor:'pointer', fontWeight:700 }} onClick={() => { setMode('login'); setError(null) }}>ログイン</span></>}
        </div>
      </div>
    </div>
  )
}
