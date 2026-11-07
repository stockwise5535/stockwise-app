// Operator-only OAuth start. Disabled unless all server-side secrets exist.
// Admin bearer credential is used only on this start endpoint, never in URLs.
import {createHash,timingSafeEqual} from 'node:crypto';
import {newGmailOAuthTransaction} from '../../../server/sales-google-oauth-transaction.mjs';
import {buildGmailAuthorizationUrl} from '../../../server/sales-google-oauth-url.mjs';
import {encryptSalesSecret} from '../../../server/sales-secret-envelope.mjs';
import {salesDbRequest,salesSupabaseConfig} from '../../../server/sales-supabase-rest.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'method_not_allowed'});}
 const env=process.env;
 if(env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED!=='true'||!salesSupabaseConfig(env)||
   typeof env.STOCKWISE_SALES_OAUTH_ADMIN_KEY!=='string'||env.STOCKWISE_SALES_OAUTH_ADMIN_KEY.length<32||
   !env.STOCKWISE_SALES_ENCRYPTION_KEY||!env.STOCKWISE_SALES_GMAIL_CLIENT_SECRET)
   return res.status(503).json({error:'oauth_setup_disabled'});
 const supplied=req.headers.authorization?.replace(/^Bearer /,'')||'';
 const a=Buffer.from(digest(supplied),'hex'),b=Buffer.from(digest(env.STOCKWISE_SALES_OAUTH_ADMIN_KEY),'hex');
 if(!timingSafeEqual(a,b)) return res.status(403).json({error:'not_authorized'});
 const tx=newGmailOAuthTransaction();
 const aad='oauth-state:'+digest(tx.state);
 let encrypted;
 try{encrypted=encryptSalesSecret(tx.verifier,env.STOCKWISE_SALES_ENCRYPTION_KEY,aad);}catch{return res.status(503).json({error:'encryption_unavailable'});}
 const stored=await salesDbRequest({table:'sales_oauth_transactions',method:'POST',body:{state_hash:digest(tx.state),encrypted_verifier:encrypted,expires_at:new Date(tx.expiresAt).toISOString()},prefer:'return=minimal'});
 if(!stored.ok)return res.status(503).json({error:'transaction_store_unavailable'});
 const url=buildGmailAuthorizationUrl({state:tx.state,codeChallenge:tx.challenge});
 if(!url.ok)return res.status(503).json({error:'oauth_url_unavailable'});
 res.setHeader('Set-Cookie','stockwise_oauth_state='+tx.state+'; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google; Max-Age=600');
 return res.status(200).json({authorizationUrl:url.url,expiresInSeconds:600});
}
