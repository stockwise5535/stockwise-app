import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnsubscribeToken,verifyUnsubscribeToken} from '../server/sales-unsubscribe-token.mjs';
const secret='a'.repeat(40),now=1762500000;
test('verifies signed opt-out token',()=>{const t=createUnsubscribeToken({organizationId:'org',contactId:'c1',issuedAt:now},secret);assert.equal(t.ok,true);assert.deepEqual(verifyUnsubscribeToken(t.token,secret,{now}),{ok:true,organizationId:'org',contactId:'c1'});});
test('rejects tampering',()=>{const t=createUnsubscribeToken({organizationId:'org',contactId:'c1',issuedAt:now},secret).token;assert.equal(verifyUnsubscribeToken(t+'x',secret,{now}).ok,false);});
test('rejects expiry',()=>{const t=createUnsubscribeToken({organizationId:'org',contactId:'c1',issuedAt:now},secret).token;assert.equal(verifyUnsubscribeToken(t,secret,{now:now+31536001}).ok,false);});
test('rejects missing secret',()=>assert.equal(createUnsubscribeToken({organizationId:'org',contactId:'c1',issuedAt:now},'short').ok,false));
