import test from 'node:test';
import assert from 'node:assert/strict';
import {getGmailSenderConfig} from '../server/sales-gmail-config.mjs';
test('sender is OFF by default',()=>assert.equal(getGmailSenderConfig({}).ready,false));
test('unverified sender cannot be enabled',()=>assert.equal(getGmailSenderConfig({STOCKWISE_SALES_GMAIL_FROM:'nexops2026test@gmail.com',STOCKWISE_SALES_SEND_ENABLED:'true'}).ready,false));
test('requires explicit verified and enabled settings',()=>assert.equal(getGmailSenderConfig({STOCKWISE_SALES_GMAIL_FROM:'nexops2026test@gmail.com',STOCKWISE_SALES_GMAIL_VERIFIED:'true',STOCKWISE_SALES_SEND_ENABLED:'true'}).ready,true));
test('rejects non-Gmail sender in this mode',()=>assert.equal(getGmailSenderConfig({STOCKWISE_SALES_GMAIL_FROM:'sales@example.org',STOCKWISE_SALES_GMAIL_VERIFIED:'true',STOCKWISE_SALES_SEND_ENABLED:'true'}).ready,false));
