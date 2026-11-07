// GET is read-only to prevent link scanners from silently unsubscribing.
// POST commits a signed opt-out atomically; never reports success before DB.
import {processSalesUnsubscribe} from '../../server/sales-unsubscribe-service.mjs';
import {salesDbRpc} from '../../server/sales-supabase-rest.mjs';
const escapeHtml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'&&req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'method_not_allowed'});}
 if(req.method==='GET'){
  const token=req.query?.token;
  if(typeof token!=='string'||token.length>4096||!/^[A-Za-z0-9_.-]+$/.test(token))return res.status(400).send('Invalid link');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  return res.status(200).send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribe</title><h1>Unsubscribe from Stockwise email</h1><p>Confirm to stop future outreach.</p><form method="post" action="/api/sales/unsubscribe"><input type="hidden" name="token" value="'+escapeHtml(token)+'"><button type="submit">Unsubscribe</button></form></html>');
 }
 const token=req.body?.token;
 const secret=process.env.STOCKWISE_SALES_UNSUBSCRIBE_SECRET;
 if(typeof token!=='string'||token.length>4096||typeof secret!=='string'||secret.length<32)
   return res.status(400).json({error:'invalid_or_expired_link'});
 const result=await processSalesUnsubscribe({token,secret,now:Math.floor(Date.now()/1000),commitSuppression:async ({organizationId,contactId})=>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId))return {committed:false};
  const r=await salesDbRpc('sales_commit_unsubscribe',{p_organization_id:organizationId,p_contact_id:contactId});
  return {committed:r.ok&&r.data===true};
 }});
 return res.status(result.status).json(result.body);
}
