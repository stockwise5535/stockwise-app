import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {chromium}=require(process.env.NEXOPS_PLAYWRIGHT_PATH || 'playwright-core')
const base=process.env.NEXOPS_TEST_URL || 'http://127.0.0.1:4173'
const browser=await chromium.launch({executablePath:process.env.NEXOPS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 for(const route of ['/en','/ja','/privacy','/terms','/signup','/growth']){
  await page.goto(base+route)
  if(['/signup','/growth'].includes(route)){
   await page.getByRole('alert').filter({hasText:'Supabase is not configured'}).waitFor()
   assert.ok(await page.locator('button[type=submit]').isDisabled())
  }else await page.getByRole('heading',{level:1}).waitFor()
  await page.setViewportSize({width:390,height:844})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route)
 }
 await page.goto(base+'/en');await page.getByRole('heading',{level:1}).waitFor();await page.screenshot({path:'/tmp/nexops-apac-landing.png',fullPage:true})
 assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex,nofollow')
 const nojs=await browser.newContext({javaScriptEnabled:false}),staticPage=await nojs.newPage()
 await staticPage.goto(base+'/en');assert.ok((await staticPage.locator('h1').textContent()).includes('supply risks'))
 assert.equal(await staticPage.locator('a[href="/signup"]').textContent(),'Start Free')
 await staticPage.goto(base+'/ja');assert.ok(await staticPage.locator('h1').textContent())
 await nojs.close();assert.deepEqual(errors,[])
 console.log('Public growth routes passed: English/Japanese static SEO content without JS, privacy/terms drafts, graceful unconfigured signup/login, mobile and no runtime errors.')
}finally{await browser.close()}
