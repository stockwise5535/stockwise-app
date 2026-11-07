// Operator-only browser entry point for the existing Gmail OAuth start API.
// No admin secret is embedded in HTML, URLs, cookies, or local storage.
export default function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end();}
 if(process.env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED!=='true')return res.status(503).type('text/plain').send('Gmail connection setup is disabled.');
 res.status(200).setHeader('Content-Type','text/html; charset=utf-8');
 return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stockwise Gmail connection</title><style>body{font:16px system-ui,sans-serif;max-width:480px;margin:8vh auto;padding:20px;line-height:1.5}input,button{font:inherit;padding:12px;box-sizing:border-box;width:100%;margin:8px 0}button{cursor:pointer}#status{white-space:pre-wrap}</style></head><body><h1>Connect Stockwise Gmail</h1><p>Operator setup only. Enter the admin key you saved securely. It is used only for this request and is not stored in the browser.</p><form id="connect"><label for="key">OAuth admin key</label><input id="key" type="password" autocomplete="off" required minlength="32"><button type="submit">Connect Gmail</button></form><p id="status" role="status"></p><script>
const form=document.getElementById('connect'),key=document.getElementById('key'),status=document.getElementById('status');
form.addEventListener('submit',async event=>{
 event.preventDefault();const secret=key.value;key.value='';form.querySelector('button').disabled=true;status.textContent='Starting secure connection…';
 try {
  const response=await fetch('/api/auth/google/start',{method:'POST',credentials:'same-origin',headers:{'Authorization':'Bearer '+secret,'Content-Type':'application/json'},body:'{}',cache:'no-store'});
  if(!response.ok){status.textContent='Could not start connection (HTTP '+response.status+'). Check setup settings and admin key.';return;}
  const data=await response.json();
  const url=new URL(data.authorizationUrl);
  if(url.protocol!=='https:'||url.hostname!=='accounts.google.com')throw Error('Unexpected authorization destination');
  window.location.assign(url.href);
 }catch{status.textContent='Connection could not start. Check network and setup settings.';}
 finally{form.querySelector('button').disabled=false;}
});
</script></body></html>`);
}
