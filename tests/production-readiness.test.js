import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
test('development branch explicitly disables Vercel Git deployment without changing other branches',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)))
 assert.deepEqual(config.git.deploymentEnabled,{'codex/managed-service-mvp':false})
 assert.ok(config.rewrites.some(rule=>rule.source==='/en'))
})
test('only audited internal workflow exists and does not acquire privileged runtime credentials',()=>{
 const directory=new URL('../.github/workflows/',import.meta.url)
 assert.deepEqual(readdirSync(directory),['growth-internal.yml'])
 const workflow=readFileSync(new URL('growth-internal.yml',directory),'utf8')
 assert.match(workflow,/permissions:\s*\n  contents: read/)
 assert.match(workflow,/persist-credentials: false/)
 assert.doesNotMatch(workflow,/secrets\.|self-hosted|pull_request_target|id-token:|write-all|supabase db|vercel deploy|--message\s|--verify-connection|--read-dev-kpis/)
 assert.match(workflow,/growth-cycle\.mjs --dry-run/)
})
