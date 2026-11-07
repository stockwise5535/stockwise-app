import test from 'node:test';
import assert from 'node:assert/strict';
import {composeBusinessEmail} from '../server/sales-email-template.mjs';
const valid={segment:'manufacturing',businessName:'Example Manufacturing',senderName:'Stockwise Team',postalAddress:'123 Example Street, Seattle WA 98101',trialUrl:'https://example.com/trial',unsubscribeUrl:'https://example.com/unsubscribe?id=abc',templateApproved:true,companyClaimsVerified:true};
test('generates approved static email without AI',()=>{const r=composeBusinessEmail(valid);assert.equal(r.ok,true);assert.match(r.body,/Unsubscribe: https:/);assert.match(r.body,/Stockwise Team/);});
for(const [label,patch] of [['no opt-out',{unsubscribeUrl:null}],['no postal address',{postalAddress:null}],['no approval',{templateApproved:false}],['unverified claims',{companyClaimsVerified:false}],['newline injection',{businessName:'X\nBcc: bad@example.com'}],['bad URL',{trialUrl:'http://example.com'}]]) test('rejects '+label,()=>assert.equal(composeBusinessEmail({...valid,...patch}).ok,false));
