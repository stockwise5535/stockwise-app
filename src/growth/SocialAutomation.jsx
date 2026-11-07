import {useEffect,useRef,useState} from 'react';
export default function SocialAutomation({client,workspaceId}){
  const [state,setState]=useState({status:'idle'}),[confirmed,setConfirmed]=useState(false),[stockApproved,setStockApproved]=useState(false),[readiness,setReadiness]=useState(null),seq=useRef(0),pending=useRef(null);
  useEffect(()=>()=>{seq.current++;pending.current?.abort();},[workspaceId]);
  async function request(action){
    const id=++seq.current;pending.current?.abort();const controller=new AbortController();pending.current=controller;
    const previous=state.data;setReadiness(null);setState({status:'loading'});
    try{
      const {data,error}=await client.auth.getSession();if(error||!data?.session?.access_token)throw Error();
      if(id!==seq.current)return;
      const headers={Authorization:`Bearer ${data.session.access_token}`},url='/api/growth/social-automation';
      if(action){
        headers['Content-Type']='application/json';
        const payload=action==='enable'?{workspaceId,action,factsVersion:previous.factsVersion,acceptAutomaticPublishing:confirmed,acceptStock:stockApproved}:{workspaceId,action};
        const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal});if(!r.ok)throw Error();
        if(action==='check'){const check=await r.json();if(check.ready!==true||check.publicationEnabled!==false)throw Error();if(id===seq.current)setReadiness(check);}
      }
      const r=await fetch(url+'?'+new URLSearchParams({workspaceId}),{headers,cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();
      const result=await r.json();if(id===seq.current){setState({status:'ready',data:result});setConfirmed(false);setStockApproved(false);}
    }catch{if(id===seq.current&&!controller.signal.aborted)setState({status:'error'});}
  }
  const data=state.data;
  return <section className="growth-card" aria-label="SNS automation">
    <h2>SNS approved stock · 自動公開</h2>
    <p>LinkedIn・Threads・X 各1日最大1投稿。承認した固定原稿だけを使い、AI APIは呼びません。初期状態OFF。</p>
    <button disabled={state.status==='loading'} onClick={()=>void request()}>Refresh automation state</button>
    {state.status==='idle'&&<p role="status">状態未取得 / Not loaded</p>}
    {state.status==='loading'&&<p role="status">Checking automation…</p>}
    {state.status==='error'&&<p role="alert">設定・認可・DBを確認できませんでした。有効化結果が不明な場合は、状態を再取得してください。</p>}
    {readiness&&state.status==='ready'&&<p role="status">接続確認済み。AI API呼び出し・投稿は未実行です。</p>}
    {data&&<>
      <p role="status">{data.policy.enabled?(Object.values(data.stock?.remaining||{}).some(n=>n===0)?'原稿在庫切れ — 投稿停止':'ON — 自動公開有効'):'OFF — 自動公開停止'}</p>
      {data.policy.enabled&&data.policyCurrent===false&&<p role="alert">公開情報またはチャンネル設定が変わったため、送信は保留されます。一度停止し、内容を確認して再有効化してください。</p>}
      <p>UTC日ごとに1実行・最大3投稿。AI API利用0回・料金 $0。原稿の再利用はせず、在庫切れ時は投稿を停止して通知します。</p>
      <details><summary>確認済み公開情報 / Public fact catalog</summary><ul>{(data.facts || []).map(f=><li key={f.id}>{f.text}</li>)}</ul></details>
      {!data.activationReady&&<p role="alert">本番設定・未使用の承認原稿・通知先の準備が必要です。自動公開は有効化できません。</p>}
      <details><summary>承認対象の固定投稿文 / Approved stock</summary><ol>{(data.stock?.catalog||[]).map(p=><li key={p.id}><strong>{p.id} · {p.network} · {p.used?'使用済み':'未使用'}</strong><p style={{whiteSpace:'pre-wrap'}}>{p.text}</p></li>)}</ol></details>
      <p>未使用原稿：LinkedIn {data.stock?.remaining?.linkedin??'未取得'} · Threads {data.stock?.remaining?.threads??'未取得'} · X {data.stock?.remaining?.x??'未取得'}</p>
      {!data.policy.enabled&&<>
        <button disabled={!data.production} onClick={()=>void request('check')}>Check readiness without publishing</button>
        <label className="growth-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>固定3チャンネルへの毎回の承認なしの自動公開を許可する</label>
        <label className="growth-check"><input type="checkbox" checked={stockApproved} onChange={e=>setStockApproved(e.target.checked)}/>固定投稿文をすべて確認し、この版の自動公開を承認した</label>
        <button disabled={!data.production||!data.activationReady||data.mode!=='approved_stock'||!data.stock?.catalog?.length||!confirmed||!stockApproved} onClick={()=>void request('enable')}>Enable automatic publishing</button>
      </>}
      {data.policy.enabled&&<button disabled={!data.production} onClick={()=>void request('disable')}>Stop automatic publishing</button>}
      <p>停止は今後の送信を止めます。送信中・Buffer受付済みの投稿や予約を取り消す操作ではありません。実行済みの日に有効化した場合、次のUTC日から動作します。</p>
      <h3>Recent outcomes</h3><ul>{data.posts.map(p=><li key={p.day+p.network}>{p.day} · {p.network} · {p.state}{p.reason?' · '+p.reason:''}</li>)}</ul>
      <h3>Alerts</h3><ul>{data.alerts.map((a,i)=><li key={i}>{a.code} · {a.created_at} · {a.delivered?'通知先受付済み':'通知未確認'}</li>)}</ul>
    </>}
  </section>;
}
