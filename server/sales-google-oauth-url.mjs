// Google Gmail OAuth URL builder. This is a pure helper; it does not expose
// secrets, perform network requests, or enable the disabled callback.
const AUTH='https://accounts.google.com/o/oauth2/v2/auth';
const REDIRECT='https://stockwise-app-1qz9.vercel.app/api/auth/google/callback';
const CLIENT='562356358390-quot4mgcatkble05itb85vruhm42fseu.apps.googleusercontent.com';
export const GMAIL_OAUTH_SCOPE='https://www.googleapis.com/auth/gmail.send';
export function buildGmailAuthorizationUrl({state,codeChallenge,redirectUri=REDIRECT,clientId=CLIENT}={}) {
 if(typeof state!=='string'||! /^[A-Za-z0-9_-]{32,256}$/.test(state)) return {ok:false,error:'invalid_state'};
 if(typeof codeChallenge!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) return {ok:false,error:'invalid_pkce_challenge'};
 if(redirectUri!==REDIRECT||clientId!==CLIENT) return {ok:false,error:'unapproved_oauth_configuration'};
 const u=new URL(AUTH);
 for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:GMAIL_OAUTH_SCOPE+' openid email',access_type:'offline',prompt:'consent',state,code_challenge:codeChallenge,code_challenge_method:'S256'})) u.searchParams.set(k,v);
 return {ok:true,url:u.toString()};
}
