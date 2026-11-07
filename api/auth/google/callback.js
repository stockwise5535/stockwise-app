// Google OAuth callback is deliberately fail-closed until server-side token
// encryption, persistence, state verification, and operator authorization exist.
// Do not log authorization codes, tokens, or query strings.
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET') {res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 return res.status(503).json({
  status:'not_connected',
  error:'oauth_callback_not_enabled',
  message:'Gmail OAuth callback requires verified state, authorized operator, and encrypted token storage before activation.'
 });
}
