import {useEffect,useRef,useState} from 'react';

const labels={postCount:'Published posts',impressions:'Impressions',reach:'Reach',views:'Views',clicks:'Clicks',reactions:'Reactions',comments:'Comments',shares:'Shares',reposts:'Reposts',quotes:'Quotes',engagementRate:'Engagement rate'};
export function metricText(metric,failed=false) {
  if(metric?.status==='available' && Number.isFinite(metric.value)) return `${metric.value.toLocaleString('en-US')}${metric.unit==='percentage'?'%':''}`;
  return failed ? '取得失敗 / Fetch failed' : '未取得 / Not fetched';
}
export default function SocialMetrics({client,workspaceId}) {
  const [dates,setDates]=useState(()=>{const end=new Date();end.setUTCHours(0,0,0,0);return {start:new Date(+end-30*86400000).toISOString().slice(0,10),end:end.toISOString().slice(0,10)};});
  const [state,setState]=useState({status:'idle'}),request=useRef(null),revision=useRef(0);
  useEffect(()=>()=>{revision.current++;request.current?.abort();},[workspaceId]);
  function change(key,value) {
    revision.current++;request.current?.abort();setDates(d=>({...d,[key]:value}));setState({status:'idle'});
  }
  async function load() {
    const current=++revision.current;request.current?.abort();
    const controller=new AbortController();request.current=controller;setState({status:'loading'});
    try {
      const {data,error}=await client.auth.getSession();
      if(error || !data?.session?.access_token) throw Error('AUTH_REQUIRED');
      if(current!==revision.current) return;
      const query=new URLSearchParams({workspaceId,...dates});
      const response=await fetch('/api/growth/social-metrics?'+query,{method:'GET',cache:'no-store',credentials:'same-origin',headers:{Authorization:`Bearer ${data.session.access_token}`},signal:controller.signal});
      if(!response.ok) throw Error('FETCH_FAILED');
      const snapshot=await response.json();
      if(current===revision.current) setState({status:'ready',snapshot});
    } catch {
      if(current===revision.current && !controller.signal.aborted) setState({status:'error'});
    }
  }
  const snapshot=state.snapshot;
  return <section aria-label="SNS performance" className="growth-card">
    <h2>SNS performance · SNS実績</h2>
    <p>LinkedIn · Threads · X — Buffer read-only. Period applies to published-post metrics; inventory covers all dates.</p>
    <label>Start date (UTC)<input type="date" value={dates.start} onChange={e=>change('start',e.target.value)}/></label>
    <label>End date (UTC, exclusive)<input type="date" value={dates.end} onChange={e=>change('end',e.target.value)}/></label>
    <p>Maximum 31 days, within the past year. 未取得の指標はゼロではありません。</p>
    <button onClick={()=>void load()} disabled={state.status==='loading'}>Load SNS metrics</button>
    {state.status==='idle' && <p role="status">未取得 / Not loaded</p>}
    {state.status==='loading' && <p role="status">読み込み中 / Loading SNS metrics…</p>}
    {state.status==='error' && <p role="alert">取得失敗 / Fetch failed. Check access, period and server configuration, then retry.</p>}
    {snapshot && <>
      <p>Fetched: {snapshot.fetchedAt} · Period: {snapshot.period.start} – {snapshot.period.end}</p>
      {snapshot.status==='partial' && <p role="alert">Some results are incomplete / 一部未取得</p>}
      {snapshot.missingServices.map(service=><p key={service} role="alert">{service}: channel not available / チャンネル未取得</p>)}
      {snapshot.channels.map(c=>{
        const aggregateFailed=Boolean(c.metricsError);
        const shown=[...new Set([...Object.keys(labels),...Object.keys(c.metrics).filter(k=>c.metrics[k].status==='available')])];
        return <article key={c.service} aria-label={`${c.service} metrics`}>
          <h3>{c.service==='x'?'X':c.service==='linkedin'?'LinkedIn':'Threads'} · {c.name}</h3>
          <p>{c.disconnected?'Disconnected / 切断':'Connected / 接続済み'} · Metrics updated: {c.metricsUpdatedAt || '未取得 / Not fetched'}</p>
          {c.errors.length>0 && <p role="alert">一部取得失敗 / Incomplete: {c.errors.join(', ')}</p>}
          <dl>{shown.map(key=><div key={key}><dt>{labels[key] || key}</dt><dd>{metricText(c.metrics[key],aggregateFailed)}</dd></div>)}</dl>
          <p>All-date inventory: {c.postInventory.scanned} scanned · {c.postInventory.complete?'Complete':'Incomplete — not a total'}</p>
          <ul>{Object.entries(c.postInventory.states).map(([status,count])=><li key={status}>{status}: {count}{!c.postInventory.complete?' (partial)':''}</li>)}</ul>
        </article>;
      })}
    </>}
  </section>;
}
