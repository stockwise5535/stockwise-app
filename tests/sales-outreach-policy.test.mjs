import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOutreach } from '../server/sales-outreach-policy.mjs';

const candidate = {
 channel: 'email', organizationId:'org', campaignId:'camp', contactId:'contact',
 sourceUrl:'https://example.org/contact', jurisdiction:'US', contactBasis:'documented_business_outreach',
 contactBasisVerified:true, regionAllowed:true, suppressed:false, duplicate:false,
 deliveryUncertain:false, replyReceived:false, templateApproved:true, identityVerified:true,
 unsubscribeReady:true, sourceTermsPermitUse:true, approvedProviderOperation:true
};
const state = {
 globalStop:false, productionEnabled:true, channelEnabled:{email:true},
 providerAuthorized:{email:true}, dailyLimit:{email:10}, sentToday:{email:0}
};
test('denies all sends by default', () => assert.equal(evaluateOutreach(candidate).allowed, false));
test('allows only fully verified and authorized preflight', () => assert.deepEqual(evaluateOutreach(candidate,state), {allowed:true,reasons:[]}));
for (const [name, patch] of [
 ['opt-out',{suppressed:true}],['duplicate',{duplicate:true}],['uncertain delivery',{deliveryUncertain:true}],
 ['reply',{replyReceived:true}],['unapproved template',{templateApproved:false}],
 ['unverified source',{sourceTermsPermitUse:false}],['missing unsubscribe',{unsubscribeReady:false}],
 ['invalid region',{regionAllowed:false}],['no contact basis',{contactBasisVerified:false}],
 ['unauthorized operation',{approvedProviderOperation:false}]
]) test('blocks '+name, () => assert.equal(evaluateOutreach({...candidate,...patch},state).allowed,false));
test('blocks daily limit', () => assert.equal(evaluateOutreach(candidate,{...state,sentToday:{email:10}}).allowed,false));
test('blocks channel not explicitly authorized', () => assert.equal(evaluateOutreach({...candidate,channel:'linkedin'},state).allowed,false));
test('blocks missing source provenance', () => assert.equal(evaluateOutreach({...candidate,sourceUrl:''},state).allowed,false));
