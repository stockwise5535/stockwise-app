// LOCAL interactive Desktop OAuth bootstrap. No mail, public callback, file/token storage.
import http from 'node:http'
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto'
import {pathToFileURL} from 'node:url'

export const GMAIL_BOOTSTRAP_SCOPES=Object.freeze([
 'https://www.googleapis.com/auth/gmail.send',
 // Existing worker verifies the sender through Gmail users.getProfile; send alone cannot do that.
 'https://www.googleapis.com/auth/gmail.metadata',
])
class BootstrapError extends Error {}
const fail=message=>new BootstrapError(message)
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
export async function bootstrapGmailOAuth({clientId,clientSecret,onAuthorizationURL,fetch:transport=fetch,timeoutMs=300000,signal}={}){
 if(typeof clientId!=='string'||!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)||typeof clientSecret!=='string'||!clientSecret.trim()||/[\r\n]/.test(clientSecret))throw fail('Set valid GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET locally; values are never logged.')
 if(typeof onAuthorizationURL!=='function')throw fail('An interactive authorization URL handler is required.')
 if(signal?.aborted)throw fail('OAuth bootstrap cancelled.')
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(64).toString('base64url')
 const challenge=createHash('sha256').update(verifier).digest('base64url')
 let redirect,acceptCode,rejectCode,consumed=false,timer,abort
 const server=http.createServer((req,res)=>{
  const reply=(status,text)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'",Connection:'close'});res.end(text)}
  if(!redirect||req.headers.host!==new URL(redirect).host||req.method!=='GET'||(req.url?.length||0)>8192){reply(400,'Invalid callback request.');return}
  let url;try{url=new URL(req.url,redirect)}catch{reply(400,'Invalid callback request.');return}
  if(url.origin!==new URL(redirect).origin||url.pathname!=='/'){reply(404,'Not found.');return}
  if(consumed){reply(409,'Callback already received.');return}
  if(url.searchParams.getAll('state').length!==1||!equal(url.searchParams.get('state')||'',state)){reply(400,'Invalid OAuth state. Return to the original authorization link.');return}
  const codes=url.searchParams.getAll('code'),errors=url.searchParams.getAll('error')
  if(errors.length===1&&codes.length===0){consumed=true;res.once('finish',()=>rejectCode(fail('Google authorization was denied or cancelled. No token was displayed.')));reply(400,'Authorization was not completed. Return to your terminal.');return}
  if(errors.length||codes.length!==1||!codes[0]||codes[0].length>4096){reply(400,'Invalid authorization response.');return}
  consumed=true;res.once('finish',()=>acceptCode(codes[0]));reply(200,'Authorization response received. Return to your local terminal. You may close this tab.')
 })
 server.headersTimeout=10000;server.requestTimeout=10000
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  redirect=`http://127.0.0.1:${server.address().port}/`
  const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth')
  for(const [key,value]of Object.entries({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:GMAIL_BOOTSTRAP_SCOPES.join(' '),access_type:'offline',prompt:'consent select_account',include_granted_scopes:'false',state,code_challenge:challenge,code_challenge_method:'S256'}))auth.searchParams.set(key,value)
  const code=await new Promise((resolve,reject)=>{
   acceptCode=resolve;rejectCode=reject
   timer=setTimeout(()=>reject(fail('OAuth bootstrap timed out. Run it again to generate a new authorization link.')),timeoutMs)
   abort=()=>reject(fail('OAuth bootstrap cancelled.'));signal?.addEventListener('abort',abort,{once:true})
   if(signal?.aborted){abort();return}
   server.on('error',()=>reject(fail('Local callback listener failed.')))
   Promise.resolve().then(()=>onAuthorizationURL(auth.href)).catch(()=>reject(fail('Unable to display the authorization link.')))
  })
  clearTimeout(timer)
  let response
  try{response=await transport('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:redirect}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)})}catch{throw fail('Token exchange failed or was cancelled. Provider details were withheld; run bootstrap again.')}
  if(!response.ok)throw fail('Google rejected the token exchange. Check the Desktop client configuration and retry; provider details were withheld.')
  let tokens;try{tokens=await response.json()}catch{throw fail('Google token response could not be read; response details were withheld.')}
  const granted=new Set(String(tokens?.scope||'').split(' ').filter(Boolean))
  if(granted.size!==GMAIL_BOOTSTRAP_SCOPES.length||GMAIL_BOOTSTRAP_SCOPES.some(s=>!granted.has(s)))throw fail('Returned scopes do not exactly match send + metadata. Review/revoke this client grant and retry; no token was displayed.')
  if(typeof tokens.refresh_token!=='string'||!tokens.refresh_token||/[\s\x00-\x1f\x7f]/.test(tokens.refresh_token))throw fail('No usable refresh token was returned. Review the grant, revoke this client if needed, and run consent again.')
  return tokens.refresh_token
 }catch(error){if(error instanceof BootstrapError)throw error;throw fail('Local OAuth bootstrap failed. Sensitive error details were withheld.')}
 finally{
  clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort)
  await new Promise(resolve=>{server.close(()=>resolve());server.closeAllConnections()})
 }
}

async function main(){
 if(process.argv.includes('--help')){console.error('Run locally: set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET securely, then node scripts/gmail-oauth-bootstrap.mjs. Interactive terminal required; no email is sent.');return}
 if(!process.stdout.isTTY){console.error('Run interactively in your local terminal. Refresh-token output is disabled when stdout is redirected or piped.');process.exitCode=2;return}
 const controller=new AbortController(),cancel=()=>controller.abort()
 process.once('SIGINT',cancel);process.once('SIGTERM',cancel)
 try{
  const refreshToken=await bootstrapGmailOAuth({clientId:process.env.GMAIL_CLIENT_ID,clientSecret:process.env.GMAIL_CLIENT_SECRET,signal:controller.signal,onAuthorizationURL:url=>{
   console.error('Open this URL in your LOCAL Mac browser. Select the dedicated Nexops Gmail account and review the two requested scopes. Do not share the URL. The listener expires in five minutes.\n'+url)
  }})
  console.error('Refresh token (displayed once). Store securely as GMAIL_REFRESH_TOKEN. Do not paste into chat, source files or terminal commands:')
  process.stdout.write(refreshToken+'\n')
  console.error('No email was sent. Unset temporary client variables after securely saving the token; clear sensitive terminal scrollback.')
 }catch(error){console.error(error instanceof BootstrapError?error.message:'OAuth bootstrap failed; sensitive details withheld.');process.exitCode=2}
 finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel)}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await main()
