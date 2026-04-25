import { useState } from 'react'
import { useAuth } from '../AuthContext.jsx'
import { t } from '../i18n.js'

export default function LoginPage({ lang='en', setLang }) {
  const { signIn, signUp } = useAuth()
  const [mode,   setMode]   = useState('login')
  const [email,  setEmail]  = useState('')
  const [pw,     setPw]     = useState('')
  const [loading,setLoading]= useState(false)
  const [error,  setError]  = useState(null)
  const [msg,    setMsg]    = useState(null)
  const L = key => t(key, lang)

  async function submit(e) {
    e.preventDefault(); setError(null); setMsg(null); setLoading(true)
    try {
      const { error } = mode === 'login' ? await signIn(email, pw) : await signUp(email, pw)
      if (error) throw error
      if (mode === 'signup') { setMsg(L('login_confirm')); setMode('login') }
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const F = 'Arial,Helvetica,sans-serif'
  const navy = '#0d1b2a', blue = '#1a4fa0', muted = '#6b7d93', border = '#dde3ea'
  const I = { width:'100%', padding:'10px 12px', borderRadius:3, border:`1px solid ${border}`, fontSize:13, marginBottom:16, outline:'none', fontFamily:F, color:navy }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f4f6f9', padding:24, fontFamily:F }}>
      <div style={{ background:'#fff', borderRadius:4, border:`1px solid ${border}`, padding:'40px 36px', width:'100%', maxWidth:400, boxShadow:'0 2px 12px rgba(0,0,0,0.08)', position:'relative' }}>

        {/* Lang toggle */}
        {setLang && (
          <button onClick={() => setLang(l => l==='ja'?'en':'ja')}
            style={{ position:'absolute', top:16, right:16, padding:'4px 10px', borderRadius:3, border:`1px solid ${border}`, background:'#f4f6f9', color:blue, fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:F }}>
            {L('lang_switch')} | {L('lang_label')}
          </button>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
          <div style={{ width:28, height:28, background:'#2563eb', borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff' }}>S</div>
          <span style={{ fontWeight:700, fontSize:18, color:navy, letterSpacing:'0.03em' }}>StockWise</span>
        </div>
        <div style={{ fontSize:12, color:muted, marginBottom:28, paddingLeft:38 }}>{L('login_tagline')}</div>

        {error && <div style={{ background:'#fdf3f2', border:'1px solid #f5c6c3', borderLeft:'3px solid #c0392b', borderRadius:3, padding:'9px 12px', fontSize:12, color:'#c0392b', marginBottom:14 }}>{error}</div>}
        {msg   && <div style={{ background:'#f0faf4', border:'1px solid #b8e8cc', borderLeft:'3px solid #1a6e3c', borderRadius:3, padding:'9px 12px', fontSize:12, color:'#1a6e3c', marginBottom:14 }}>{msg}</div>}

        <form onSubmit={submit}>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#394f66', marginBottom:4, letterSpacing:'0.04em' }}>{L('login_email')}</label>
          <input style={I} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={L('login_ph_email')} required autoFocus />
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#394f66', marginBottom:4, letterSpacing:'0.04em' }}>{L('login_password')}</label>
          <input style={I} type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder={L('login_ph_pass')} required minLength={8} />
          <button type="submit" disabled={loading} style={{ width:'100%', padding:11, borderRadius:3, border:'none', background:navy, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:loading?0.6:1, fontFamily:F, letterSpacing:'0.02em' }}>
            {loading ? L('login_processing') : mode === 'login' ? L('login_submit_in') : L('login_submit_up')}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:18, fontSize:12, color:muted }}>
          {mode === 'login'
            ? <>{L('login_no_account')} <span style={{ color:blue, cursor:'pointer', fontWeight:700 }} onClick={() => { setMode('signup'); setError(null) }}>{L('login_free_reg')}</span></>
            : <>{L('login_have_acct')} <span style={{ color:blue, cursor:'pointer', fontWeight:700 }} onClick={() => { setMode('login'); setError(null) }}>{L('login_signin')}</span></>}
        </div>
      </div>
    </div>
  )
}
