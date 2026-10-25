// Run against a local production preview. No account creation, writes or provider calls.
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const require=createRequire(import.meta.url)
const {chromium}=require(process.env.NEXOPS_PLAYWRIGHT_PATH || 'playwright-core')
const base=process.env.NEXOPS_TEST_URL || 'http://127.0.0.1:4178'
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use local preview only')
const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'))
for(const locale of ['en','ja'])assert.ok(config.rewrites.some(r=>r.source===`/${locale}`&&r.destination===`/${locale}/index.html`))
assert.equal(config.rewrites.at(-1).source,'/(.*)')
assert.equal(config.rewrites.at(-1).destination,'/')
const browser=await chromium.launch({executablePath:process.env.NEXOPS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage(),errors=[],external=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).origin!==new URL(base).origin){external.push('unexpected external request');return route.abort()}
  return route.continue()
 })
 const protectedRoutes=['/','/growth','/growth?view=product','/growth?view=activation','/growth?view=dashboard','/growth?view=communications','/invite','/signup']
 const publicRoutes=['/en','/ja','/privacy','/terms','/demo/operations?view=today','/demo/operations?view=exceptions','/demo/operations?view=actions','/demo/operations?view=decisions','/demo/operations?view=history','/demo/operations?view=suppliers','/demo/operations?view=report']
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900})
  for(const path of [...protectedRoutes,...publicRoutes]){
   const response=await page.goto(base+path)
   assert.equal(response.status(),200,path)
   if(protectedRoutes.includes(path)){
    await page.locator('input[type=email]').waitFor()
    assert.equal(await page.getByRole('heading',{name:'Internal Growth Dashboard',exact:true}).count(),0)
    assert.equal(await page.getByRole('heading',{name:'Outbound Communication Review Queue',exact:true}).count(),0)
   }else await page.getByRole('heading',{level:1}).waitFor()
   assert.doesNotMatch(await page.locator('body').innerText(),/mieruka/i,path)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path)
  }
 }
 assert.deepEqual(errors,[])
 assert.deepEqual(external,[])
 console.log('Production-preview route QA passed: 19 direct routes at desktop/mobile sizes, unauthenticated internal views gated, branding, overflow, static Vercel rewrite assertions; zero external requests/runtime errors. Hosted Vercel not exercised.')
}finally{await browser.close()}
