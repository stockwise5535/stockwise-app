// Fail-closed Gmail OAuth callback: consumes state once, checks browser cookie,
// verifies Gmail account identity, and persists only encrypted refresh token.
import {createHash,timingSafeEqual} from 'node:crypto';
import {validateGmailOAuthCallback} from '../../../server/sales-google-oauth-transaction.mjs';
import {exchangeGmailAuthorizationCode} from '../../../server/sales-google-oauth-exchange.mjs';
import {encryptSalesSecret,decryptSalesSecret} from '../../../server/sales-secret-envelope.mjs';
import {salesDbRequest,salesDbRpc,salesSupabaseConfig} from '../../../server/sales-supabase-rest.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
const redirect='https://stockwise-app-1qz9.vercel.app/api/auth/google/callback';
const client='562356358390-quot4mgcatkble05itb85vruhm42fseu.apps.googleusercontent.com';
const mailbox='nexops2026test@gmail.com';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Set-Cookie','stockwise_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google; Max-Age=0');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 const env=process.env;
 if(env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED!=='true'||!salesSupabaseConfig(env)||!env.STOCKWISE_SALES_ENCRYPTION_KEY||!env.STOCKWISE_SALES_GMAIL_CLIENT_SECRET)
  return res.status(503).json({error:'oauth_setup_disabled'});
 const query=req.query||{};
 const state=typeof query.state==='string'?query.state:'';
 const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('stockwise_oauth_state='))?.slice('stockwise_oauth_state='.length)||'';
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(state)||cookie.length!==state.length||
    !timingSafeEqual(Buffer.from(cookie),Buffer.from(state)))return res.status(400).json({error:'invalid_oauth_session'});
 // State is irreversibly consumed before token exchange, even if Google returns an error.
 const consumed=await salesDbRpc('sales_consume_oauth_state',{p_state_hash:digest(state)});
 if(!consumed.ok)return res.status(503).json({error:'oauth_store_unavailable'});
 if(!consumed.data?.encrypted_verifier)return res.status(400).json({error:'invalid_or_used_state'});
 let verifier;
 try{verifier=decryptSalesSecret(consumed.data.encrypted_verifier,env.STOCKWISE_SALES_ENCRYPTION_KEY,'oauth-state:'+digest(state));}
 catch{return res.status(503).json({error:'oauth_state_decryption_failed'});}
 const validated=validateGmailOAuthCallback(query,{state,verifier,expiresAt:Date.now()+1,used:false});
 if(!validated.ok)return res.status(400).json({error:'invalid_oauth_callback'});
 const exchanged=await exchangeGmailAuthorizationCode({code:validated.code,verifier,clientId:client,clientSecret:env.STOCKWISE_SALES_GMAIL_CLIENT_SECRET,redirectUri:redirect,transactionConsumed:true});
 if(!exchanged.ok)return res.status(502).json({error:exchanged.error});
 let verifiedEmail;
 try {
  const profile=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+exchanged.tokens.accessToken},signal:AbortSignal.timeout(10000)});
  if(!profile.ok)return res.status(502).json({error:'mailbox_verification_failed'});
  const data=await profile.json();verifiedEmail=data.email_verified===true?data.email:null;
 }catch{return res.status(502).json({error:'mailbox_verification_unavailable'});}
 if(typeof verifiedEmail!=='string'||verifiedEmail.toLowerCase()!==mailbox)return res.status(403).json({error:'wrong_gmail_account'});
 let encrypted;
 try{encrypted=encryptSalesSecret(exchanged.tokens.refreshToken,env.STOCKWISE_SALES_ENCRYPTION_KEY,'gmail:'+mailbox);}
 catch{return res.status(503).json({error:'token_encryption_unavailable'});}
 const saved=await salesDbRequest({table:'sales_oauth_credentials',method:'POST',query:'?on_conflict=provider',prefer:'resolution=merge-duplicates,return=minimal',body:{provider:'gmail',account_email:mailbox,encrypted_refresh_token:encrypted,granted_scope:exchanged.tokens.scope,updated_at:new Date().toISOString()}});
 if(!saved.ok)return res.status(503).json({error:'token_storage_failed'});
 return res.status(200).json({status:'gmail_connected',account:mailbox,sendingEnabled:false});
}
