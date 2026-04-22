export default function Cancel() {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc', padding:24 }}>
      <div style={{ background:'#fff', maxWidth:520, width:'100%', borderRadius:16, padding:32, boxShadow:'0 10px 30px rgba(0,0,0,0.08)', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
        <h1 style={{ fontSize:28, marginBottom:12 }}>お支払いはキャンセルされました</h1>
        <p style={{ color:'#475569', marginBottom:20 }}>
          課金は完了していません。もう一度お試しいただけます。
        </p>
        <a
          href="/"
          style={{
            display:'inline-block',
            background:'#1d4ed8',
            color:'#fff',
            padding:'12px 18px',
            borderRadius:10,
            textDecoration:'none',
            fontWeight:700
          }}
        >
          プラン画面へ戻る
        </a>
      </div>
    </div>
  )
}