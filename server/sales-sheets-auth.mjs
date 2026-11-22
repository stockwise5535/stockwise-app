import{createSign}from'node:crypto';
const TOKEN_URL='https://oauth2.googleapis.com/token';
export async function sheetsAccessToken({authJson,dedicated=false,expectedPrincipal,expectedProject,readOnly=false,fetchImpl=fetch,now=new Date()}){
 const parsed=JSON.parse(authJson),auth=parsed.tokens?.default||parsed;
 let body;
 if(auth.type==='service_account'){
  if(dedicated&&((expectedPrincipal&&auth.client_email!==expectedPrincipal)||(expectedProject&&auth.project_id!==expectedProject)))throw Error('DEDICATED_SHEETS_IDENTITY_MISMATCH');
  if(!/^[a-z][a-z0-9-]+@[a-z][a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(auth.client_email||'')||!auth.private_key||!auth.project_id||auth.subject||auth.delegated_subject)throw Error('DEDICATED_SHEETS_AUTH_REQUIRED');
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat=Math.floor(now.getTime()/1000);
  const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:auth.client_email,scope:'https://www.googleapis.com/auth/spreadsheets'+(readOnly?'.readonly':''),aud:TOKEN_URL,iat,exp:iat+3600});
  const assertion=unsigned+'.'+createSign('RSA-SHA256').update(unsigned).sign(auth.private_key,'base64url');
  body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});
 }else{
  if(dedicated)throw Error('DEDICATED_SHEETS_AUTH_REQUIRED');
  if(['client_id','client_secret','refresh_token'].some(k=>typeof auth[k]!=='string'||!auth[k].trim()))throw Error('GOOGLE_SHEETS_AUTH_REQUIRED');
  body=new URLSearchParams({client_id:auth.client_id,client_secret:auth.client_secret,refresh_token:auth.refresh_token,grant_type:'refresh_token'});
 }
 const r=await fetchImpl(TOKEN_URL,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 if(!r.ok)throw Error('GOOGLE_SHEETS_AUTH_REQUIRED');
 const token=(await r.json()).access_token;if(!token)throw Error('GOOGLE_SHEETS_AUTH_REQUIRED');return token;
}
