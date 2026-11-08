import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../integrations/apps-script/StockwiseSalesBridge.gs',import.meta.url),'utf8');

test('Apps Script source parses without executing Gmail',()=>{
  assert.doesNotThrow(()=>new vm.Script(source));
});
test('safe rollout gates remain present',()=>{
  for(const gate of [
    "settings.LIVE_SENDING === 'true'",
    "if (!live)",
    "no_verified_opt_in",
    "queue_not_approved",
    "lead_not_approved",
    "suppressed",
    "sender_disclosures_missing",
    "SENDING_REVIEW",
    "getRemainingDailyQuota()",
    "tryLock(30000)"
  ]) assert.ok(source.includes(gate),'missing safety gate: '+gate);
});
test('script contains no paid AI, provider OAuth or autonomous triggers',()=>{
  assert.doesNotMatch(source,/UrlFetchApp|ScriptApp\.newTrigger|OpenAI|Anthropic|oauth\/google/i);
});
