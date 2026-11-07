import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NEXOPS_PLAYWRIGHT_PATH || 'playwright-core');
const base=process.env.NEXOPS_GROWTH_TEST_URL || 'http://127.0.0.1:5176';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const browser=await chromium.launch({executablePath:process.env.NEXOPS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage(),errors=[],actions=[];let enabled=false,production=true,fail=false,policyCurrent=true;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.route('**/api/growth/social-automation**',async route=>{
    const req=route.request();assert.equal(req.headers().authorization,'Bearer synthetic-user-session');
    if(fail)return route.fulfill({status:503,json:{code:'AUTOPILOT_UNAVAILABLE'}});
    if(req.method()==='POST'){
      const p=req.postDataJSON();actions.push(p);assert.equal(p.workspaceId,'33333333-3333-4333-8333-333333333333');
      if(p.action==='check'){assert.equal(enabled,false);return route.fulfill({status:200,json:{ready:true,publicationEnabled:false,model:'gpt-4.1-mini',aiGenerationTested:false}});}
      if(p.action==='enable'){assert.equal(p.acceptAutomaticPublishing,true);assert.equal(p.acceptBudget,true);assert.equal(p.factsVersion,'reviewed-catalog');enabled=true;}else{assert.equal(p.action,'disable');enabled=false;}
      return route.fulfill({status:200,json:{policy:{enabled}}});
    }
    return route.fulfill({status:200,json:{policy:{enabled},policyCurrent,activationReady:production,production,factsVersion:'reviewed-catalog',facts:[{id:'demo',text:'Explore a synthetic demo.'}],posts:[{day:'2026-11-01',network:'x',state:'delivery_unknown'}],alerts:[{code:'DELIVERY_UNKNOWN_NO_RETRY',created_at:'2026-11-01',delivered:false}]}});
  });
  await page.goto(base+'/tests/fixtures/social-metrics.html');await page.evaluate(()=>window.mountAutomation('33333333-3333-4333-8333-333333333333'));
  const panel=page.getByRole('region',{name:'SNS automation'});
  await panel.getByText('状態未取得 / Not loaded',{exact:true}).waitFor();assert.equal(actions.length,0);
  await panel.getByRole('button',{name:'Refresh automation state'}).click();await panel.getByText('OFF — 自動公開停止',{exact:true}).waitFor();
  await panel.getByRole('button',{name:'Check readiness without publishing'}).click();await panel.getByText('接続確認済み。AI生成・投稿は未実行です。',{exact:true}).waitFor();assert.equal(enabled,false);assert.deepEqual(actions.map(p=>p.action),['check']);
  const button=panel.getByRole('button',{name:'Enable automatic publishing'});assert.equal(await button.isDisabled(),true);
  await panel.getByLabel('固定3チャンネルへの毎回の承認なしの自動公開を許可する').check();assert.equal(await button.isDisabled(),true);
  await panel.getByLabel('AI料金上限と確認済み公開情報の使用を確認した').check();assert.equal(await button.isEnabled(),true);
  await button.click();await panel.getByText('ON — 自動公開有効',{exact:true}).waitFor();assert.equal(actions.length,2);
  policyCurrent=false;await panel.getByRole('button',{name:'Refresh automation state'}).click();await panel.getByRole('alert').filter({hasText:'公開情報またはチャンネル設定'}).waitFor();
  await panel.getByRole('button',{name:'Stop automatic publishing'}).click();await panel.getByText('OFF — 自動公開停止',{exact:true}).waitFor();assert.equal(actions.length,3);
  await panel.getByText(/DELIVERY_UNKNOWN_NO_RETRY/).waitFor();
  production=false;await panel.getByRole('button',{name:'Refresh automation state'}).click();await panel.getByRole('alert').filter({hasText:'本番設定'}).waitFor();
  await panel.getByLabel('固定3チャンネルへの毎回の承認なしの自動公開を許可する').check();await panel.getByLabel('AI料金上限と確認済み公開情報の使用を確認した').check();assert.equal(await button.isDisabled(),true);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  fail=true;await panel.getByRole('button',{name:'Refresh automation state'}).click();await panel.getByRole('alert').filter({hasText:'設定・認可・DB'}).waitFor();assert.equal(await panel.getByRole('button',{name:'Enable automatic publishing'}).count(),0);
  assert.deepEqual(errors,[]);console.log('Automation browser PASS: initial OFF, explicit dual consent, enable/stop, unresolved delivery alerts, preview denial, fail-closed config/error and mobile. All requests local fixtures.');
}finally{await browser.close();}
