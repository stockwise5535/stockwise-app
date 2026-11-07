// Signed, tamper-resistant opt-out tokens; no network access. Tokens are valid only
// when checked against a server-side HMAC key and a durable suppression store.\n// Payload is base64url-encoded, NOT encrypted: use random contact IDs only.
import {createHmac,timingSafeEqual} from 'node:crypto';
function sign(data,secret) { return createHmac('sha256',secret).update(data).digest('base64url'); }
export function createUnsubscribeToken({organizationId,contactId,issuedAt},secret) {
 if(typeof secret!=='string'||secret.length<32) return {ok:false,reasons:['missing_signing_key']};
 if(!organizationId||!contactId||!Number.isSafeInteger(issuedAt)) return {ok:false,reasons:['invalid_payload']};
 const payload=Buffer.from(JSON.stringify({o:organizationId,c:contactId,t:issuedAt})).toString('base64url');
 return {ok:true,token:payload+'.'+sign(payload,secret)};
}
export function verifyUnsubscribeToken(token,secret,{now,maxAgeSeconds=31536000}={}) {
 if(typeof token!=='string'||typeof secret!=='string'||secret.length<32||!Number.isSafeInteger(now)) return {ok:false};
 const [payload,mac,...extra]=token.split('.');
 if(!payload||!mac||extra.length||payload.length>2048) return {ok:false};
 const expected=Buffer.from(sign(payload,secret)),given=Buffer.from(mac);
 if(expected.length!==given.length||!timingSafeEqual(expected,given)) return {ok:false};
 try {
  const obj=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(typeof obj.o!=='string'||!obj.o||typeof obj.c!=='string'||!obj.c||!Number.isSafeInteger(obj.t)||obj.t>now+300||now-obj.t>maxAgeSeconds) return {ok:false};
  return {ok:true,organizationId:obj.o,contactId:obj.c};
 } catch { return {ok:false}; }
}
