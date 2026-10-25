// Refresh token stays server-side/in-memory; errors never contain provider bodies or credentials.
export function gmailTokenProvider({clientId,clientSecret,refreshToken,fetch:transport=fetch,now=Date.now}){
 let cached,expires=0
 return async()=>{
  if(cached&&now()<expires)return cached
  if(!clientId||!clientSecret||!refreshToken)throw Error('Gmail OAuth settings unavailable')
  const r=await transport('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)})
  if(!r.ok)throw Error('Gmail OAuth refresh failed; provider details withheld')
  let data;try{data=await r.json()}catch{throw Error('Gmail OAuth response unavailable')}
  const scopes=String(data.scope||'').split(' ')
  if(!scopes.some(s=>['https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.compose','https://www.googleapis.com/auth/gmail.modify','https://mail.google.com/'].includes(s))||!scopes.some(s=>['https://www.googleapis.com/auth/gmail.metadata','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.modify','https://mail.google.com/'].includes(s)))throw Error('Required Gmail grants not verified')
  if(typeof data.access_token!=='string'||!data.access_token)throw Error('Gmail access token unavailable')
  cached=data.access_token;expires=now()+Math.max(0,(Number(data.expires_in)||0)-60)*1000;return cached
 }
}
