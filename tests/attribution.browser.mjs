// Only run against local dev fixture with VITE_GROWTH_ATTRIBUTION_ENABLED=true; no provider calls.
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{chromium}=require(process.env.NEXOPS_PLAYWRIGHT_PATH || 'playwright-core')
const base=process.env.NEXOPS_TEST_URL || 'http://127.0.0.1:5176'
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname))
const browser=await chromium.launch({executablePath:process.env.NEXOPS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']})
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),external=[],errors=[]
 await page.context().route('**/*',r=>{if(new URL(r.request().url()).origin!==new URL(base).origin){external.push('unexpected external request');return r.abort()}return r.continue()})
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/en?utm_source=linkedin&utm_campaign=private@example.com');await page.getByRole('heading',{level:1}).waitFor()
 assert.equal(await page.evaluate(()=>localStorage.getItem('nexops_coarse_attribution_v1')),null)
 await page.getByRole('button',{name:'Allow analytics',exact:true}).click()
 const stored=await page.evaluate(()=>localStorage.getItem('nexops_coarse_attribution_v1'));assert.equal(JSON.parse(stored).source,'linkedin');assert.ok(!stored.includes('@'))
 await page.locator('.growth-ctas').getByRole('link',{name:'Start Free',exact:true}).click();await page.locator('input[type=email]').waitFor()
 const confirmation=await page.context().newPage();await confirmation.goto(base+'/growth');await confirmation.locator('input[type=email]').waitFor()
 const first=await confirmation.evaluate(async()=>{const {createGrowthService}=await import('/src/growth/service.js');let args;await createGrowthService({rpc:async(_name,a)=>{args=a;return {data:{}}}}).track('login_completed','fixture-workspace');return args})
 assert.equal(first.p_properties.referral_source,'linkedin')
 await confirmation.evaluate(async()=>{(await import('/src/growth/analytics.js')).setAnalyticsConsent(false)})
 assert.equal(await confirmation.evaluate(()=>localStorage.getItem('nexops_coarse_attribution_v1')),null)
 const withdrawn=await confirmation.evaluate(async()=>{const {createGrowthService}=await import('/src/growth/service.js');let args;await createGrowthService({rpc:async(_name,a)=>{args=a;return {data:{}}}}).track('login_completed','fixture-workspace',{referral_source:'linkedin'});return args})
 assert.equal(withdrawn.p_properties.referral_source,undefined)
 assert.deepEqual(external,[]);assert.deepEqual(errors,[])
 console.log('Attribution browser passed: no pre-consent storage, coarse source only, signup/new-tab preservation, existing RPC property mapping, withdrawal and stale-property stripping; no external requests.')
}finally{await browser.close()}
