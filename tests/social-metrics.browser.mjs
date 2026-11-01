import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NEXOPS_PLAYWRIGHT_PATH || 'playwright-core');
const base=process.env.NEXOPS_GROWTH_TEST_URL || 'http://127.0.0.1:5176';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const browser=await chromium.launch({executablePath:process.env.NEXOPS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage(),errors=[],calls=[];
  page.on('pageerror',e=>errors.push(e.message));
  let mode='success',release;
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await page.route('**/api/growth/social-metrics?**',async route=>{
    const request=route.request();calls.push(new URL(request.url()).searchParams);
    assert.equal(request.headers().authorization,'Bearer synthetic-user-session');
    if(mode==='delay') await new Promise(resolve=>release=resolve);
    if(mode==='error') return route.fulfill({status:403,json:{code:'ACCESS_DENIED'}});
    const data={status:'partial',fetchedAt:'2026-11-01T12:00:00Z',period:{start:'2026-10-01',end:'2026-11-01'},missingServices:[],channels:['linkedin','threads','x'].map(service=>({service,name:service,disconnected:false,metricsUpdatedAt:null,metrics:{postCount:{status:'available',value:0,unit:'count'},impressions:{status:'not_fetched',value:null,unit:null}},errors:[],postInventory:{scanned:10,complete:false,states:{sent:10}}}))};
    if(mode==='postError') {data.channels[2].errors=['GRAPHQL_ERROR'];data.channels[2].postsError='GRAPHQL_ERROR';}
    if(mode==='metricError') {data.channels[2].errors=['RATE_LIMITED'];data.channels[2].metricsError='RATE_LIMITED';data.channels[2].metrics.postCount={status:'not_fetched',value:null,unit:null};}
    await route.fulfill({status:200,json:data});
  });
  await page.goto(base+'/tests/fixtures/social-metrics.html');
  const panel=page.getByRole('region',{name:'SNS performance'});
  await panel.getByText('未取得 / Not loaded',{exact:true}).waitFor();assert.equal(calls.length,0);
  mode='delay';await panel.getByRole('button',{name:'Load SNS metrics'}).click();
  await panel.getByText('読み込み中 / Loading SNS metrics…',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('button')?.disabled);
  while(!release) await new Promise(r=>setTimeout(r,10));release();mode='success';
  await panel.getByRole('heading',{name:'LinkedIn · linkedin',exact:true}).waitFor();
  for(const service of ['linkedin','threads','x']) {
    const channel=panel.getByRole('article',{name:service+' metrics'});
    assert.equal(await channel.locator('dt').filter({hasText:'Published posts'}).locator('..').locator('dd').textContent(),'0');
    assert.equal(await channel.locator('dt').filter({hasText:'Impressions'}).locator('..').locator('dd').textContent(),'未取得 / Not fetched');
    await channel.getByText(/Incomplete — not a total/).waitFor();
  }
  assert.deepEqual([...calls[0].keys()].sort(),['end','start','workspaceId']);
  mode='postError';await panel.getByRole('button',{name:'Load SNS metrics'}).click();
  await panel.getByRole('article',{name:'x metrics'}).getByRole('alert').filter({hasText:'GRAPHQL_ERROR'}).waitFor();
  assert.equal(await panel.getByRole('article',{name:'x metrics'}).locator('dt').filter({hasText:'Impressions'}).locator('..').locator('dd').textContent(),'未取得 / Not fetched');
  mode='metricError';await panel.getByRole('button',{name:'Load SNS metrics'}).click();
  await panel.getByRole('article',{name:'x metrics'}).getByRole('alert').filter({hasText:'RATE_LIMITED'}).waitFor();
  assert.equal(await panel.getByRole('article',{name:'x metrics'}).locator('dt').filter({hasText:'Impressions'}).locator('..').locator('dd').textContent(),'取得失敗 / Fetch failed');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  mode='error';await panel.getByRole('button',{name:'Load SNS metrics'}).click();await panel.getByRole('alert').filter({hasText:'取得失敗 / Fetch failed.'}).waitFor();
  assert.equal(await panel.getByRole('article').count(),0);
  mode='delay';release=null;await panel.getByRole('button',{name:'Load SNS metrics'}).click();
  await panel.getByText('読み込み中 / Loading SNS metrics…',{exact:true}).waitFor();
  while(!release) await new Promise(r=>setTimeout(r,10));
  await page.evaluate(()=>window.mountSocial('44444444-4444-4444-8444-444444444444'));
  await panel.getByText('未取得 / Not loaded',{exact:true}).waitFor();release();
  await page.waitForTimeout(100);assert.equal(await panel.getByRole('article').count(),0);
  mode='success';await panel.getByRole('button',{name:'Load SNS metrics'}).click();await panel.getByRole('article',{name:'x metrics'}).waitFor();
  await panel.getByLabel('Start date (UTC)',{exact:true}).fill('2026-10-03');
  await panel.getByText('未取得 / Not loaded',{exact:true}).waitFor();assert.equal(await panel.getByRole('article').count(),0);
  assert.deepEqual(errors,[]);
  console.log('SNS browser PASS: idle/loading/zero/missing/failure, three networks, partial inventory, scoped request, mobile, stale response and period reset. No external calls.');
} finally {await browser.close();}
