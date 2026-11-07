import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGmailDraft} from '../server/sales-gmail-draft.mjs';
const valid={from:'sales@example.com',to:'buyer@example.org',subject:'Inventory planning',body:'Hello\n\nLearn more: https://stockwise-homepage.vercel.app/en/',unsubscribeUrl:'https://example.com/u/opaque',unsubscribeMailto:'unsubscribe@example.com'};
test('builds a Gmail-compatible base64url MIME draft without sending',()=>{const r=buildGmailDraft(valid);assert.equal(r.ok,true);const mime=Buffer.from(r.raw,'base64url').toString();assert.match(mime,/List-Unsubscribe:/);assert.match(mime,/stockwise-homepage/);assert.doesNotMatch(mime,/List-Unsubscribe-Post:/);});
for(const [name,patch] of [['header injection',{subject:'Hi\r\nBcc: attacker@example.org'}],['invalid recipient',{to:'invalid'}],['missing opt-out',{unsubscribeUrl:''}],['no mailbox',{unsubscribeMailto:''}]])test('blocks '+name,()=>assert.equal(buildGmailDraft({...valid,...patch}).ok,false));
