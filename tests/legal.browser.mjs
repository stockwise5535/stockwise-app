// Public legal routes only: no signup, message, billing or database writes.
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {legalDocuments,legalPublication} from '../src/growth/legalContent.js'
const require=createRequire(import.meta.url),{chromium}=require(process.env.NEXOPS_PLAYWRIGHT_PATH || 'playwright-core')
const base=process.env.NEXOPS_TEST_URL || 'http://127.0.0.1:5176'
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use local preview/dev only')
const browser=await chromium.launch({executablePath:process.env.NEXOPS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage(),errors=[],external=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==new URL(base).origin){external.push('unexpected external request');return route.abort()}return route.continue()})
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:844})
  for(const kind of ['privacy','terms']){
   const doc=legalDocuments[kind],response=await page.goto(base+'/'+kind)
   assert.equal(response.status(),200)
   await page.getByRole('heading',{name:doc.title,level:1,exact:true}).waitFor()
   assert.equal(await page.title(),doc.title+' | Stockwise')
   assert.equal(await page.locator('meta[name=description]').getAttribute('content'),doc.description)
   const article=page.locator('.growth-legal'),text=await article.innerText()
   assert.doesNotMatch(text,/— draft for review|A privacy contact, retention periods|Final service terms, governing law/)
   assert.doesNotMatch(text,/nexops_\w+|auth\.uid|SUPABASE_|GMAIL_|VITE_|service_role|\bRPC\b|\bRLS\b|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
   assert.match(await page.getByLabel('Publication status').innerText(),/professional legal review before public launch/)
   assert.equal(await article.getByRole('heading',{level:2}).count(),doc.sections.length)
   for(const key of doc.publicationFields)assert.ok(text.includes(legalPublication[key].value),key)
   assert.equal(await article.getByRole('link',{name:'Account and preferences',exact:true}).getAttribute('href'),'/growth?view=account')
   assert.equal(await page.getByRole('checkbox').count(),0,'No new acceptance controls')
   const toc=page.getByRole('navigation',{name:doc.title+' contents'})
   await toc.locator('summary').focus();await page.keyboard.press('Enter')
   assert.ok(await toc.locator('details').getAttribute('open')!==null)
   const last=doc.sections.at(-1)
   await toc.getByRole('link',{name:last.title,exact:true}).click()
   assert.equal(new URL(page.url()).hash,'#'+last.id)
   const box=await page.getByRole('heading',{name:last.title,exact:true}).boundingBox()
   assert.ok(box.y>=0&&box.y<844,'Contents link reaches section')
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow')
   await article.getByRole('link',{name:'Back to top'}).click()
   if(width===390)await page.screenshot({path:'/tmp/stockwise-'+kind+'-mobile.png',fullPage:false})
   await page.reload();await page.getByRole('heading',{name:doc.title,level:1,exact:true}).waitFor()
  }
 }
 for(const [path,label,title] of [['/privacy','Privacy','Privacy Policy'],['/terms','Terms','Terms of Service']]){
  await page.goto(base+'/en');await page.locator('footer').getByRole('link',{name:label,exact:true}).click();await page.getByRole('heading',{name:title,level:1,exact:true}).waitFor()
  await page.goto(base+'/signup');await page.locator('input[type=email]').waitFor()
  await page.locator('p').filter({hasText:'By registering, you agree to the'}).getByRole('link',{name:path==='/privacy'?'Privacy notice':'Terms',exact:true}).click();await page.getByRole('heading',{name:title,level:1,exact:true}).waitFor()
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[])
 console.log('Legal browser passed: direct/reloaded Privacy and Terms, signup/footer links, page metadata, publication fields, keyboard section navigation, 320/390px and desktop readability, no acceptance gate/internal identifiers/runtime errors/external requests.')
}finally{await browser.close()}
