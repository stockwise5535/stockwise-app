import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignDestination,STOCKWISE_DESTINATIONS} from '../server/sales-destinations.mjs';
test('homepage is official English landing destination',()=>assert.equal(STOCKWISE_DESTINATIONS.homepage,'https://stockwise-homepage.vercel.app/en/'));
test('application is official product destination',()=>assert.equal(STOCKWISE_DESTINATIONS.application,'https://stockwise-app-1qz9.vercel.app/'));
test('UTM tracking is restricted to allowed fields',()=>assert.equal(campaignDestination('homepage',{utm_source:'email',utm_campaign:'sales_autopilot'}).url,'https://stockwise-homepage.vercel.app/en/?utm_source=email&utm_campaign=sales_autopilot'));
test('unrecognized destination is rejected',()=>assert.equal(campaignDestination('signup').ok,false));
test('injected UTM values are rejected',()=>assert.equal(campaignDestination('homepage',{utm_source:'x&redirect=evil'}).ok,false));
