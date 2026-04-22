export default function Success() {
  const params = new URLSearchParams(window.location.search)
  const sessionId = params.get('session_id')

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc', padding:24 }}>
      <div style={{ background:'#fff', maxWidth:520, width:'100%', borderRadius:16, padding:32, boxShadow:'0 10px 30px rgba(0,0,0,0.08)', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
        <h1 style={{ fontSize:28, marginBottom:12 }}>お支払いが完了しました</h1>
        <p style={{ color:'#475569', marginBottom:20 }}>
          サブスクリプションの処理を開始しました。
        </p>
        {sessionId && (
          <p style={{ fontSize:12, color:'#94a3b8', marginBottom:20 }}>
            Session ID: {sessionId}
          </p>
        )}
        <a
          href="/"
          style={{
            display:'inline-block',
            background:'#0f172a',
            color:'#fff',
            padding:'12px 18px',
            borderRadius:10,
            textDecoration:'none',
            fontWeight:700
          }}
        >
          ホームへ戻る
        </a>
      </div>
    </div>
  )
}