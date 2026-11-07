import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGmailAuthorizationUrl,GMAIL_OAUTH_SCOPE} from '../server/sales-google-oauth-url.mjs';
const valid={state:'s'.repeat(48),codeChallenge:'c'.repeat(43)};
test('builds Gmail send-only OAuth with state and PKCE',()=>{
 const result=buildGmailAuthorizationUrl(valid);
 assert.equal(result.ok,true);
 const u=new URL(result.url);
 assert.equal(u.origin,'https://accounts.google.com');
 assert.equal(u.searchParams.get('scope'),GMAIL_OAUTH_SCOPE+' openid email');
 assert.equal(u.searchParams.get('state'),valid.state);
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.equal(u.searchParams.get('access_type'),'offline');
 assert.equal(u.searchParams.get('redirect_uri'),'https://stockwise-app-1qz9.vercel.app/api/auth/google/callback');
});
test('rejects missing state',()=>assert.equal(buildGmailAuthorizationUrl({codeChallenge:valid.codeChallenge}).ok,false));
test('rejects weak challenge',()=>assert.equal(buildGmailAuthorizationUrl({...valid,codeChallenge:'short'}).ok,false));
test('rejects unapproved redirect',()=>assert.equal(buildGmailAuthorizationUrl({...valid,redirectUri:'https://evil.example/callback'}).ok,false));
