// Existing public funnel audit only. No signup submissions, analytics opt-in or provider calls.
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{chromium}=require(process.env.NEXOPS_PLAYWRIGHT_PATH || 'playwright-core')
const base=process.env.NEXOPS_TEST_URL || 'http://127.0.0.1:5176'
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname))
const browser=await chromium.launch({executablePath:process.env.NEXOPS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage(),errors=[],external=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==new URL(base).origin){external.push('unexpected external request');return route.abort()}return route.continue()})
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:844})
  await page.goto(base+'/en');await page.getByRole('heading',{level:1}).waitFor()
  const ctas=page.locator('.growth-ctas')
  assert.equal(await ctas.getByRole('link',{name:'Start Free',exact:true}).getAttribute('href'),'/signup')
  assert.equal(await ctas.getByRole('link',{name:'Book a Consultation',exact:true}).getAttribute('href'),'/growth?view=consultation')
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  assert.equal(await ctas.getByRole('link',{name:'View Demo',exact:true}).getAttribute('href'),'/demo/operations?lang=en');await ctas.getByRole('link',{name:'View Demo',exact:true}).click();await page.getByRole('heading',{name:'TODAY',exact:true}).waitFor()
  await page.locator('.ops-row-link').first().click();await page.getByRole('dialog').getByText('Recommended next action',{exact:true}).waitFor();await page.keyboard.press('Escape')
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.goto(base+'/signup');await page.locator('input[type=email]').waitFor()
  assert.equal(await page.getByRole('link',{name:'Terms',exact:true}).getAttribute('href'),'/terms')
  await page.goto(base+'/growth?view=consultation');await page.locator('input[type=email]').waitFor()
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[])
 console.log('Acquisition funnel audit passed: existing LP CTA destinations, demo TODAY → exception → recommendation, signup/consultation auth entry and desktop/mobile; no submitted user data/external requests.')
}finally{await browser.close()}
