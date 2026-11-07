// Refresh Gmail access tokens using encrypted, server-only refresh credentials.
// Never log, persist, or return refresh tokens to an API client.
import {decryptSalesSecret} from './sales-secret-envelope.mjs';
import {salesDbRequest} from './sales-supabase-rest.mjs';
const CLIENT='562356358390-quot4mgcatkble05itb85vruhm42fseu.apps.googleusercontent.com';
const ACCOUNT='nexops2026test@gmail.com';
export async function refreshSalesGmailAccessToken({env=process.env,fetchImpl=globalThis.fetch,dbRequest=salesDbRequest}={}) {
 if(env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED!=='true'||!env.STOCKWISE_SALES_ENCRYPTION_KEY||
    !env.STOCKWISE_SALES_GMAIL_CLIENT_SECRET) return {ok:false,error:'gmail_auth_disabled'};
 const result=await dbRequest({table:'sales_oauth_credentials',method:'GET',query:'?provider=eq.gmail&select=account_email,encrypted_refresh_token,granted_scope&limit=1'},env,fetchImpl);
 const record=Array.isArray(result.data)?result.data[0]:null;
 if(!result.ok||!record||record.account_email!==ACCOUNT||
    typeof record.granted_scope!=='string'||!record.granted_scope.split(/\s+/).includes('https://www.googleapis.com/auth/gmail.send'))
   return {ok:false,error:'verified_gmail_credentials_unavailable'};
 let refreshToken;
 try {refreshToken=decryptSalesSecret(record.encrypted_refresh_token,env.STOCKWISE_SALES_ENCRYPTION_KEY,'gmail:'+ACCOUNT);}
 catch {return {ok:false,error:'gmail_credentials_decryption_failed'};}
 try {
  const body=new URLSearchParams({client_id:CLIENT,client_secret:env.STOCKWISE_SALES_GMAIL_CLIENT_SECRET,refresh_token:refreshToken,grant_type:'refresh_token'});
  const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return {ok:false,error:'gmail_refresh_rejected'};
  const data=await response.json();
  if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(data.expires_in)||data.expires_in<=0)
   return {ok:false,error:'invalid_gmail_refresh_response'};
  if(data.scope&&(!data.scope.split(/\s+/).includes('https://www.googleapis.com/auth/gmail.send')))
   return {ok:false,error:'gmail_scope_revoked'};
  return {ok:true,accessToken:data.access_token,expiresIn:data.expires_in};
 }catch{return {ok:false,error:'gmail_refresh_unavailable'};}
}
