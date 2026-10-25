// Local single-host preparation framework, deliberately disconnected from live sending.
import {createHash, randomUUID} from 'node:crypto'
import {mkdir, open, readFile, rename, rm} from 'node:fs/promises'
import {join} from 'node:path'

const hash = value => createHash('sha256').update(value).digest('hex')
export const EMAIL_AUTOMATION_ALLOWLIST = Object.freeze(['welcome', 'activation_reminder', 'csv_reminder', 'consultation_confirmation', 'consultation_reminder', 'user_requested_followup', 'weekly_summary', 'workspace_invitation'])
// Exact static public copy: category labels and keyword matching cannot approve arbitrary text.
export const SOCIAL_TEMPLATES = Object.freeze({
  product_education: Object.freeze({
    x: 'Stockwise helps you review synthetic inventory and purchase-order exceptions in a demo workspace. Explore the recommendation and choose your next step.',
    threads: 'How does Stockwise work? Start in a demo workspace with synthetic inventory and purchase-order data. Review an exception, inspect the recommendation, and record a human decision. The demo is a way to explore the workflow.',
  }),
})
export function prepareSocialItems(campaign) {
  if (typeof campaign !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(campaign)) throw Error('CAMPAIGN_REQUIRED')
  return ['x', 'threads'].map(network => ({kind: 'social', category: 'product_education', network, text: SOCIAL_TEMPLATES.product_education[network], logicalId: `${campaign}:${network}`}))
}
export function classifyAutomationItem(item) {
  if (item?.kind === 'email') return EMAIL_AUTOMATION_ALLOWLIST.includes(item.category) ? 'EXISTING_EMAIL_GATES_REQUIRED' : 'BLOCKED'
  if (item?.kind !== 'social' || !['x', 'threads'].includes(item.network) || !/^[a-z0-9:_-]{1,128}$/.test(item.logicalId ?? '')) return 'BLOCKED'
  const exact = SOCIAL_TEMPLATES[item.category]?.[item.network]
  if (!exact || item.text !== exact || Object.keys(item).some(k => !['kind', 'category', 'network', 'text', 'logicalId', 'requestedAt'].includes(k))) return 'BLOCKED'
  return 'PUBLIC_COPY_REVIEW_REQUIRED'
}

// Errors/logs use fixed status labels only. No payloads, addresses, env or provider errors.
export async function withAutomationLock(directory, work) {
  await mkdir(directory, {recursive: true, mode: 0o700})
  const lock = join(directory, 'outbound-v3.lock')
  try { await mkdir(lock, {mode: 0o700}) } catch (error) {
    if (error.code === 'EEXIST') return {status: 'overlap_blocked'}
    throw Error('AUTOMATION_LOCK_FAILED')
  }
  try { return await work() } finally { await rm(lock, {recursive: true}) }
}
async function writeAtomic(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`
  const file = await open(temp, 'wx', 0o600)
  try { await file.writeFile(value); await file.sync() } finally { await file.close() }
  await rename(temp, path)
}
export async function runOutboundAutomation({directory, taskState, campaign = 'preview', items = prepareSocialItems(campaign), fixtureProvider} = {}) {
  return withAutomationLock(directory, async () => {
    const ledgerPath = join(directory, 'outbound-v3-ledger.json')
    let ledger = {}
    try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw Error('AUTOMATION_LEDGER_UNREADABLE') }
    if (!ledger || Array.isArray(ledger) || typeof ledger !== 'object') throw Error('AUTOMATION_LEDGER_UNREADABLE')
    const outcomes = []
    // This injection is only for tests, never provided by the runtime script.
    if (fixtureProvider && fixtureProvider.fixtureOnly !== true) throw Error('LIVE_EXECUTION_FORBIDDEN')
    if (taskState !== 'READY') outcomes.push('task_not_ready')
    else if (!Array.isArray(items) || items.length > 10) outcomes.push('bounded_batch_required')
    else for (const item of items) {
      const gate = classifyAutomationItem(item)
      if (gate === 'BLOCKED') { outcomes.push('blocked_content'); continue }
      if (gate === 'EXISTING_EMAIL_GATES_REQUIRED') { outcomes.push('email_disabled_existing_gates_retained'); continue }
      if (!fixtureProvider) { outcomes.push('social_prepared_review_and_configuration_required'); continue }
      // Logical identity AND copy hash are reserved before the provider call.
      const logicalKey = hash(JSON.stringify([item.network, item.logicalId]))
      const contentKey = hash(JSON.stringify([item.network, item.text]))
      if (ledger[logicalKey] || ledger[contentKey]) { outcomes.push('duplicate_or_held'); continue }
      const record = {state: 'sending', network: item.network, contentHash: contentKey, requestedAt: item.requestedAt ?? null, attemptedAt: new Date().toISOString()}
      ledger[logicalKey] = record; ledger[contentKey] = record
      await writeAtomic(ledgerPath, JSON.stringify(ledger))
      try {
        const result = await fixtureProvider.createPost(item)
        if (!result?.providerId || !/^[a-zA-Z0-9_-]{1,128}$/.test(result.providerId)) throw Error()
        Object.assign(record, {state: 'provider_accepted', providerId: result.providerId, scheduledAt: result.scheduledAt ?? null})
        outcomes.push('fixture_provider_accepted')
      } catch { record.state = 'delivery_unknown'; outcomes.push('delivery_unknown_no_retry') }
      await writeAtomic(ledgerPath, JSON.stringify(ledger))
    }
    const summary = `Stockwise outbound V3 preparation\n${new Date().toISOString()}\nMode: offline preparation / fixture only\n${outcomes.join('\n')}\nLive emails: 0\nLive social posts: 0\n`
    await writeAtomic(join(directory, 'morning-summary.txt'), summary)
    return {status: 'prepared', outcomes}
  })
}
