// Gmail OAuth PKCE transaction helpers. Keep the verifier and state in a
// server-side, expiring, single-use store; never send them to a browser log.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
export function newGmailOAuthTransaction(now=Date.now()) {
 if(!Number.isSafeInteger(now)) throw new TypeError('invalid time');
 const state=randomBytes(32).toString('base64url');
 const verifier=randomBytes(64).toString('base64url');
 const challenge=createHash('sha256').update(verifier).digest('base64url');
 return {state,verifier,challenge,createdAt:now,expiresAt:now+10*60*1000};
}
export function validateGmailOAuthCallback(query,record,now=Date.now()) {
 if(!record||typeof record!=='object'||record.used===true||!Number.isSafeInteger(now)||
   !Number.isSafeInteger(record.expiresAt)||now>record.expiresAt) return {ok:false,error:'missing_expired_or_used_transaction'};
 if(!query||typeof query!=='object'||query.error||typeof query.code!=='string'||!query.code||
   typeof query.state!=='string'||typeof record.state!=='string') return {ok:false,error:'invalid_callback'};
 const expected=Buffer.from(record.state),actual=Buffer.from(query.state);
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual)) return {ok:false,error:'state_mismatch'};
 if(typeof record.verifier!=='string'||record.verifier.length<43) return {ok:false,error:'missing_pkce_verifier'};
 return {ok:true,code:query.code,verifier:record.verifier};
}
