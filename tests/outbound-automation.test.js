import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createBufferAdapter} from '../services/buffer-adapter.js'
import {classifyAutomationItem, prepareSocialItems, runOutboundAutomation, withAutomationLock} from '../services/outbound-automation.js'

const env = {BUFFER_API_KEY: 'fixture-secret-not-for-logs', BUFFER_ORGANIZATION_ID: 'org1', BUFFER_X_CHANNEL_ID: 'x1', BUFFER_THREADS_CHANNEL_ID: 't1'}
const channels = [{id: 'x1', service: 'twitter', isQueuePaused: false}, {id: 't1', service: 'threads', isQueuePaused: false}]
function providerMock({listed = channels, mutation, fail} = {}) {
  const calls = []
  const fetch = async (url, options) => {
    calls.push(JSON.parse(options.body).query)
    assert.equal(url, 'https://api.buffer.com')
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers.Authorization, `Bearer ${env.BUFFER_API_KEY}`)
    if (fail) throw Error(env.BUFFER_API_KEY)
    return {ok: true, json: async () => calls.at(-1).startsWith('query') ? {data: {channels: listed}} : mutation ?? {data: {createPost: {post: {id: 'post1', dueAt: '2099-01-01T00:00:00Z', status: 'scheduled'}}}}}
  }
  return {calls, adapter: createBufferAdapter({env, fetch})}
}
async function temporary(work) {
  const directory = await mkdtemp(join(tmpdir(), 'nexops-v3-'))
  try { return await work(directory) } finally { await rm(directory, {recursive: true, force: true}) }
}
test('Buffer maps X and Threads through discovered matching channels and never guesses IDs', async () => {
  for (const network of ['x', 'threads']) {
    const {calls, adapter} = providerMock()
    const result = await adapter.createPost({network, text: 'Public fixture text', requestedAt: '2099-01-01T00:00:00Z'})
    assert.equal(result.service, network === 'x' ? 'twitter' : 'threads')
    assert.equal(result.channelId, network === 'x' ? 'x1' : 't1')
    assert.equal(result.state, 'provider_accepted')
    assert.equal(calls.length, 2)
    assert.match(calls[1], /customScheduled/)
  }
})
test('Buffer missing credentials, wrong service, absent or paused channel fail before mutation', async () => {
  await assert.rejects(createBufferAdapter({env: {}, fetch: () => assert.fail('network forbidden')}).channels(), /ORGANIZATION_REQUIRED/)
  await assert.rejects(createBufferAdapter({env: {BUFFER_ORGANIZATION_ID: 'org1'}, fetch: () => assert.fail('network forbidden')}).channels(), /CONFIGURATION_REQUIRED/)
  for (const listed of [[], [{id: 'x1', service: 'threads', isQueuePaused: false}], [{id: 'x1', service: 'twitter', isQueuePaused: true}]]) {
    const {calls, adapter} = providerMock({listed})
    await assert.rejects(adapter.createPost({network: 'x', text: 'Fixture'}), /CHANNEL_MISMATCH/)
    assert.equal(calls.length, 1)
  }
})
test('Buffer ambiguous, malformed and GraphQL errors are static and never retried', async () => {
  for (const options of [{fail: true}, {mutation: {errors: [{message: env.BUFFER_API_KEY}]}}, {mutation: {data: {createPost: {message: env.BUFFER_API_KEY}}}}]) {
    const {calls, adapter} = providerMock(options)
    await assert.rejects(adapter.createPost({network: 'x', text: 'Fixture'}), error => !error.message.includes(env.BUFFER_API_KEY) && /UNCONFIRMED/.test(error.message))
    assert.ok(calls.length <= 2)
  }
})
test('exact public copy stays review-required; arbitrary high-risk or confidential copy is blocked', () => {
  const [item, threads] = prepareSocialItems('test')
  assert.notEqual(item.text, threads.text)
  assert.equal(classifyAutomationItem(item), 'PUBLIC_COPY_REVIEW_REQUIRED')
  for (const text of ['Refund approved', 'Change supplier PO quantity', 'Private customer result', 'Guaranteed 90% savings', 'Legal commitment', 'Welcome!']) assert.equal(classifyAutomationItem({...item, text}), 'BLOCKED')
  assert.equal(classifyAutomationItem({...item, customerData: 'private'}), 'BLOCKED')
  assert.equal(classifyAutomationItem({...item, category: 'unknown'}), 'BLOCKED')
  for (const category of ['welcome', 'weekly_summary', 'workspace_invitation']) assert.equal(classifyAutomationItem({kind: 'email', category}), 'EXISTING_EMAIL_GATES_REQUIRED')
  assert.equal(classifyAutomationItem({kind: 'email', category: 'refund'}), 'BLOCKED')
})
test('default runner prepares without provider calls; email enablement remains blocked', async () => temporary(async directory => {
  const result = await runOutboundAutomation({directory, taskState: 'READY', items: [...prepareSocialItems('test'), {kind: 'email', category: 'welcome'}]})
  assert.equal(result.outcomes.filter(x => x === 'social_prepared_review_and_configuration_required').length, 2)
  assert.ok(result.outcomes.includes('email_disabled_existing_gates_retained'))
  const summary = await readFile(join(directory, 'morning-summary.txt'), 'utf8')
  assert.match(summary, /Live emails: 0/)
  assert.match(summary, /Live social posts: 0/)
  assert.equal(summary.includes(env.BUFFER_API_KEY), false)
}))
test('duplicate logical IDs and identical copy across campaigns stay held after acceptance', async () => temporary(async directory => {
  let count = 0
  const fixtureProvider = {fixtureOnly: true, createPost: async () => { count++; return {providerId: 'mock-post'} }}
  await runOutboundAutomation({directory, taskState: 'READY', fixtureProvider})
  const result = await runOutboundAutomation({directory, taskState: 'READY', campaign: 'different', fixtureProvider})
  assert.equal(count, 2)
  assert.deepEqual(result.outcomes, ['duplicate_or_held', 'duplicate_or_held'])
}))
test('unknown outcomes persist before retry and redact raw provider errors from summary and ledger', async () => temporary(async directory => {
  let count = 0
  const fixtureProvider = {fixtureOnly: true, createPost: async () => { count++; throw Error(env.BUFFER_API_KEY) }}
  const first = await runOutboundAutomation({directory, taskState: 'READY', fixtureProvider})
  assert.deepEqual(first.outcomes, ['delivery_unknown_no_retry', 'delivery_unknown_no_retry'])
  await runOutboundAutomation({directory, taskState: 'READY', fixtureProvider})
  assert.equal(count, 2)
  for (const name of ['morning-summary.txt', 'outbound-v3-ledger.json']) assert.equal((await readFile(join(directory, name), 'utf8')).includes(env.BUFFER_API_KEY), false)
}))
test('overlapping runners exit safely and lock is released after failure', async () => temporary(async directory => {
  await assert.rejects(withAutomationLock(directory, async () => {
    assert.deepEqual(await runOutboundAutomation({directory, taskState: 'READY'}), {status: 'overlap_blocked'})
    throw Error('fixture failure')
  }), /fixture failure/)
  assert.equal((await runOutboundAutomation({directory, taskState: 'READY'})).status, 'prepared')
}))
test('not-ready task, oversized batch, live provider injection and corrupt ledger fail closed', async () => temporary(async directory => {
  assert.deepEqual((await runOutboundAutomation({directory, taskState: 'COMPLETE'})).outcomes, ['task_not_ready'])
  assert.deepEqual((await runOutboundAutomation({directory, taskState: 'READY', items: Array(11).fill({})})).outcomes, ['bounded_batch_required'])
  await assert.rejects(runOutboundAutomation({directory, taskState: 'READY', fixtureProvider: {createPost: () => assert.fail()}}), /LIVE_EXECUTION_FORBIDDEN/)
  await writeFile(join(directory, 'outbound-v3-ledger.json'), '{invalid json')
  await assert.rejects(runOutboundAutomation({directory, taskState: 'READY'}), /AUTOMATION_LEDGER_UNREADABLE/)
}))
