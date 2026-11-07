// Server-only Google OAuth code exchange. No automatic authorization or send.
// The caller MUST first validate and atomically consume a short-lived OAuth
// transaction, verify operator identity, and encrypt/store the refresh token.
const TOKEN_ENDPOINT='https://oauth2.googleapis.com/token';
const EXPECTED_REDIRECT='https://stockwise-app-1qz9.vercel.app/api/auth/google/callback';
const EXPECTED_CLIENT='562356358390-quot4mgcatkble05itb85vruhm42fseu.apps.googleusercontent.com';
export async function exchangeGmailAuthorizationCode({code,verifier,clientId,clientSecret,redirectUri,transactionConsumed},fetchImpl=globalThis.fetch) {
 if(transactionConsumed!==true) return {ok:false,error:'transaction_not_consumed'};
 if(typeof code!=='string'||!code||code.length>4096||
   typeof verifier!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)||
   clientId!==EXPECTED_CLIENT||redirectUri!==EXPECTED_REDIRECT||
   typeof clientSecret!=='string'||!clientSecret||typeof fetchImpl!=='function')
   return {ok:false,error:'invalid_oauth_configuration'};
 try {
  const body=new URLSearchParams({code,code_verifier:verifier,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'});
  const response=await fetchImpl(TOKEN_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:body.toString(),signal:AbortSignal.timeout(10000)});
  if(!response.ok) return {ok:false,error:'token_exchange_rejected'};
  const tokens=await response.json();
  if(!tokens||typeof tokens.access_token!=='string'||!tokens.access_token||
     typeof tokens.refresh_token!=='string'||!tokens.refresh_token||
     typeof tokens.expires_in!=='number'||tokens.expires_in<=0||
     typeof tokens.scope!=='string'||!tokens.scope.split(/\s+/).includes('https://www.googleapis.com/auth/gmail.send'))
    return {ok:false,error:'missing_required_token_or_scope'};
  return {ok:true,tokens:{accessToken:tokens.access_token,refreshToken:tokens.refresh_token,expiresIn:tokens.expires_in,scope:tokens.scope}};
 } catch { return {ok:false,error:'token_exchange_unavailable'}; }
}
