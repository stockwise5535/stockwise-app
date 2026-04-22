import { useState } from 'react'
import { useAuth } from '../AuthContext.jsx'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setMsg(null)
    setLoading(true)

    try {
      const { error } = mode === 'login'
        ? await signIn(email, pw)
        : await signUp(email, pw)

      if (error) throw error

      if (mode === 'signup') {
        setMsg('メールを確認してからログインしてください。')
        setMode('login')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const F = 'Arial, Helvetica, sans-serif'
  const I = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 3,
    border: '1px solid #dde3ea',
    fontSize: 13,
    marginBottom: 16,
    outline: 'none',
    fontFamily: F,
    color: '#0d1b2a',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f9', padding: 24, fontFamily: F }}>
      <div style={{ background: '#fff', borderRadius: 4, border: '1px solid #dde3ea', padding: '40px 36px', width: '100%', maxWidth: 400, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 28, height: 28, background: '#2563eb', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>S</div>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#0d1b2a', letterSpacing: '0.03em' }}>StockWise</span>
        </div>
        <div style={{ fontSize: 12, color: '#6b7d93', marginBottom: 28, paddingLeft: 38 }}>在庫意思決定支援システム</div>

        {error && <div style={{ background: '#fdf3f2', border: '1px solid #f5c6c3', borderLeft: '3px solid #c0392b', borderRadius: 3, padding: '9px 12px', fontSize: 12, color: '#c0392b', marginBottom: 14 }}>{error}</div>}
        {msg && <div style={{ background: '#f0faf4', border: '1px solid #b8e8cc', borderLeft: '3px solid #1a6e3c', borderRadius: 3, padding: '9px 12px', fontSize: 12, color: '#1a6e3c', marginBottom: 14 }}>{msg}</div>}

        <form onSubmit={submit}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#394f66', marginBottom: 4, letterSpacing: '0.04em' }}>メールアドレス</label>
          <input style={I} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#394f66', marginBottom: 4, letterSpacing: '0.04em' }}>パスワード</label>
          <input style={I} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="8文字以上" required minLength={8} />
          <button type="submit" disabled={loading} style={{ width: '100%', padding: 11, borderRadius: 3, border: 'none', background: '#0d1b2a', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1, fontFamily: F, letterSpacing: '0.02em' }}>
            {loading ? '処理中…' : mode === 'login' ? 'ログイン' : 'アカウント作成'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: '#6b7d93' }}>
          {mode === 'login'
            ? <>アカウントなし？ <span style={{ color: '#1a4fa0', cursor: 'pointer', fontWeight: 700 }} onClick={() => { setMode('signup'); setError(null); setMsg(null) }}>無料登録</span></>
            : <>登録済み？ <span style={{ color: '#1a4fa0', cursor: 'pointer', fontWeight: 700 }} onClick={() => { setMode('login'); setError(null); setMsg(null) }}>ログイン</span></>}
        </div>
      </div>
    </div>
  )
}
