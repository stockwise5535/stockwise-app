// Legacy pricing component fixture: all Auth/API/provider traffic is intercepted locally.
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {chromium}=require(process.env.NEXOPS_PLAYWRIGHT_PATH || 'playwright-core')
const base=process.env.NEXOPS_TEST_URL || 'http://127.0.0.1:5176'
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Use local fixtures only')
const browser=await chromium.launch({executablePath:process.env.NEXOPS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[],calls=[],external=[]
 let mode='disabled',redirected=false
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin==='https://checkout.stripe.com'){assert.equal(mode,'success');redirected=true;return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<h1>Intercepted checkout fixture — no provider request</h1>'})}
  if(url.origin!==new URL(base).origin){external.push(url.origin);return route.abort()}
  if(url.pathname==='/api/create-checkout-session'){
   calls.push({body:req.postDataJSON(),authorization:req.headers().authorization})
   await new Promise(resolve=>setTimeout(resolve,150))
   const data=mode==='disabled'?{code:'BILLING_DISABLED'}:mode==='unsafe'?{url:'https://untrusted.example.test'}:{url:'https://checkout.stripe.com/c/pay/browser-fixture'}
   return route.fulfill({status:mode==='disabled'?503:200,contentType:'application/json',body:JSON.stringify(data)})
  }
  return route.continue()
 })
 await page.goto(base+'/en');await page.getByRole('heading',{level:1}).waitFor()
 await page.evaluate(async()=>{
  document.getElementById('root').hidden=true
  const target=document.createElement('main');target.id='pricing-fixture';document.body.append(target)
  const React=(await import('/node_modules/.vite/deps/react.js')).default
  const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default
  const {supabase}=await import('/src/supabase.js')
  window.fixtureSession=null
  supabase.auth.getSession=async()=>({data:{session:window.fixtureSession}})
  const Pricing=(await import('/src/components/PricingModal.jsx')).default
  createRoot(target).render(React.createElement(Pricing,{lang:'en',user:{id:'untrusted-prop',email:'other@example.test'},onClose:()=>{}}))
 })
 const choose=page.getByRole('button',{name:'Choose this plan',exact:true})
 await choose.first().click();await page.getByRole('alert').filter({hasText:'Sign in before choosing a plan.'}).waitFor();assert.equal(calls.length,0)
 await page.evaluate(()=>{window.fixtureSession={access_token:'fixture-session-token',user:{id:'11111111-1111-4111-8111-111111111111'}}})
 await choose.first().click();assert.ok(await page.getByRole('button',{name:'Processing...'}).isDisabled());assert.ok(await choose.last().isDisabled())
 await page.getByRole('alert').filter({hasText:'Billing is not enabled. No payment was created.'}).waitFor()
 assert.equal(calls.length,1);assert.deepEqual(Object.keys(calls[0].body).sort(),['planId','requestId']);assert.equal(calls[0].body.planId,'basic');assert.equal(calls[0].authorization,'Bearer fixture-session-token')
 await choose.first().click();await page.getByRole('alert').filter({hasText:'Billing is not enabled.'}).waitFor();assert.deepEqual(calls[0].body,calls[1].body)
 await page.reload();await page.getByRole('heading',{level:1}).waitFor()
 // Reopen after a reload, preserving the request key in sessionStorage.
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default,{supabase}=await import('/src/supabase.js'),Pricing=(await import('/src/components/PricingModal.jsx')).default
  document.getElementById('root').hidden=true;const target=document.createElement('main');document.body.append(target)
  supabase.auth.getSession=async()=>({data:{session:{access_token:'fixture-session-token',user:{id:'11111111-1111-4111-8111-111111111111'}}}})
  createRoot(target).render(React.createElement(Pricing,{lang:'en',onClose:()=>{}}))
 })
 await choose.first().click();await page.getByRole('alert').filter({hasText:'Billing is not enabled.'}).waitFor();assert.deepEqual(calls[0].body,calls[2].body)
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 mode='unsafe';await choose.last().click();await page.getByRole('alert').filter({hasText:'Checkout could not be confirmed.'}).waitFor();assert.equal(redirected,false)
 mode='success';await choose.last().click();await page.getByRole('heading',{name:'Intercepted checkout fixture — no provider request'}).waitFor();assert.ok(redirected)
 assert.deepEqual(errors,[]);assert.deepEqual(external,[])
 console.log('Legacy checkout browser passed: signed-out recovery, session bearer, plan/request-only body, safe disabled state, duplicate-click guard, retry/reload key persistence, mobile, unsafe redirect denial and intercepted Stripe redirect. No real provider request or charge.')
}finally{await browser.close()}
