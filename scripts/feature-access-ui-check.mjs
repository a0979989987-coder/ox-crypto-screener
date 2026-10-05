import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {chromium} from 'playwright';
import {FEATURE_CATALOG} from '../server/account/feature-catalog.js';
const browser=await chromium.launch({headless:true,executablePath:process.env.OX_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 for(const theme of ['dark','light'])for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:width<600?844:900}});let locked=false,unavailable=false;const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://ox.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/feature.js')return route.fulfill({contentType:'text/javascript',body:readFileSync(new URL('../src/components/account/feature-access.js',import.meta.url),'utf8')});
  if(path==='/api/v1/account/feature-access')return route.fulfill({status:unavailable?503:200,contentType:'application/json',body:JSON.stringify({ok:!unavailable,features:FEATURE_CATALOG.map(f=>({...f,mode:locked&&['tw.radar','tw.etf'].includes(f.id)?'login':'public',version:'fixture'}))})});
  assert.equal(path,'/','No real provider or email requests');
  return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="UTF-8"><body class="theme-${theme}" data-theme="${theme}" data-market="tw" data-view="radar"><script>window.OXAuth={user:null};window.OXAccount={open(){window.opened=true}};window.OXMarketController={setMarket(m){document.body.dataset.market=m}};</script><script src="/feature.js"></script><main class="wrap"><p>Product fixture</p></main><script>window.switchAppView=v=>{if(!OXFeatures.enterView(v))return;document.body.dataset.view=v;document.dispatchEvent(new CustomEvent('ox:viewchange'))};document.addEventListener('ox:feature-tool-return',e=>{window.returnedTool=e.detail.tool});</script></body>`});
 });
 await page.goto('https://ox.test/');await page.waitForFunction(()=>OXFeatures.ready);
 assert.equal(await page.locator('main').isVisible(),true);
 locked=true;await page.evaluate(()=>OXFeatures.refresh());await page.locator('#ox-feature-message').filter({hasText:'註冊登入'}).waitFor();
 assert.equal(await page.locator('main').isVisible(),false);
 await page.evaluate(()=>window.switchAppView('radar'));assert.equal(await page.evaluate(()=>new URL(location.href).searchParams.get('ox_feature')),'tw.radar');
 await page.locator('#ox-feature-login').click();assert.equal(await page.evaluate(()=>window.opened),true);
 await page.evaluate(()=>{OXAuth.user={id:'synthetic-registered'};document.dispatchEvent(new CustomEvent('ox:accountchange'));});
 assert.equal(await page.locator('main').isVisible(),true);assert.equal(await page.evaluate(()=>new URL(location.href).searchParams.has('ox_feature')),false);
 await page.evaluate(()=>{OXAuth.user=null;document.dispatchEvent(new CustomEvent('ox:accountchange'));});assert.equal(await page.locator('main').isVisible(),false);
 await page.evaluate(()=>window.switchAppView('home'));assert.equal(await page.locator('main').isVisible(),true);
 unavailable=true;await page.evaluate(()=>OXFeatures.refresh());assert.equal(await page.locator('main').isVisible(),false);assert.equal(await page.evaluate(()=>OXFeatures.ready),false);
 unavailable=false;await page.evaluate(()=>OXFeatures.refresh());assert.equal(await page.locator('main').isVisible(),true);
 await page.goto('https://ox.test/?ox_feature=tw.etf');await page.waitForFunction(()=>OXFeatures.ready);assert.equal(await page.locator('main').isVisible(),false);
 await page.evaluate(()=>{OXAuth.user={id:'synthetic-registered'};document.dispatchEvent(new CustomEvent('ox:accountchange'));});
 await page.waitForFunction(()=>window.returnedTool==='etf');assert.equal(await page.evaluate(()=>document.body.dataset.view),'strength');assert.equal(await page.locator('main').isVisible(),true);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 await page.close();
 }
 console.log('Product dark/light desktop/mobile access UI passed: default public, login gate/return, logout, policy failure fail closed, public alternative and cross-page tool restore. Synthetic sessions only.');
}finally{await browser.close();}
