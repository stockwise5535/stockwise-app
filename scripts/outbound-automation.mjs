// No runtime live-provider injection, subprocesses, task creation or enable flags.
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {runOutboundAutomation} from '../services/outbound-automation.js'
try {
  const task = await readFile(new URL('../docs/NEXT_TASK.md', import.meta.url), 'utf8')
  const state = /^- State: (\w+)$/m.exec(task)?.[1]
  const result = await runOutboundAutomation({directory: fileURLToPath(new URL('../logs/', import.meta.url)), taskState: state})
  console.log(JSON.stringify({status: result.status, mode: 'offline_preparation', emails_sent: 0, social_posts: 0}))
  if (result.status === 'overlap_blocked') process.exitCode = 2
} catch {
  console.log(JSON.stringify({status: 'automation_blocked', details_withheld: true, emails_sent: 0, social_posts: 0}))
  process.exitCode = 2
}
