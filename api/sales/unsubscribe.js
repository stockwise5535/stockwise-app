// Public opt-out endpoint. A valid signed link can only suppress, never send.
// Browser-facing success requires an atomic durable Supabase commit.
import {processSalesUnsubscribe} from '../../server/sales-unsubscribe-service.mjs';
import {salesDbRpc} from '../../server/sales-supabase-rest.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'&&req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'method_not_allowed'});}
 const token=req.method==='GET'?req.query?.token:req.body?.token;
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
