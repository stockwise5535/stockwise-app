import test from 'node:test'
import assert from 'node:assert/strict'
import {firstValueProgress} from '../src/growth/firstValue.js'
test('new customer progress starts at zero and uses only persisted existing milestones',()=>{const p=firstValueProgress(null);assert.equal(p.count,0);assert.equal(p.completed,false);assert.equal(p.next,'demo_opened_at');assert.equal(p.steps.length,4)})
test('refresh/login restores the same recorded progress without altering timestamps',()=>{const record={demo_opened_at:'2026-10-25T01:00:00Z',today_viewed_at:'2026-10-25T01:00:01Z'};const before=structuredClone(record);assert.equal(firstValueProgress(record).count,2);assert.equal(firstValueProgress(JSON.parse(JSON.stringify(record))).next,'exception_opened_at');assert.deepEqual(record,before)})
test('completion uses existing activated_at and never invents missing milestones',()=>{const p=firstValueProgress({activated_at:'yes',today_viewed_at:'yes',exception_opened_at:'yes',first_value_at:'yes'});assert.equal(p.completed,true);assert.equal(p.count,3);assert.equal(p.steps[0].done,false)})
