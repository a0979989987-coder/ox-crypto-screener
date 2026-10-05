import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {FEATURE_CATALOG} from '../server/account/feature-catalog.js';
process.env.OX_E2E_PORT=process.env.OX_ACCOUNT_ENTRY_TEST_PORT||'4255';
const {server,preparePage,testBase}=createRequire(import.meta.url)('./e2e-check.cjs');
await new Promise(resolve=>server.listen(Number(process.env.OX_E2E_PORT),'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.OX_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:844}}),{page}=await preparePage(context,{width,height:844});let requests=0;
  await page.route('**/api/v1/account/**',route=>{const endpoint=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill({json:endpoint==='config'?{configured:true}:endpoint==='session'?{ok:true,user:null}:{ok:true,features:FEATURE_CATALOG.map(f=>({...f,mode:'public',version:'fixture'}))}});});
  await page.route('**/patterns/view.js*',route=>{requests++;return requests===1?route.fulfill({status:503,contentType:'text/javascript',body:''}):route.continue();});
  await page.goto(testBase+'/');await page.waitForFunction(()=>OXFeatures.ready);const started=Date.now();await page.evaluate(()=>switchAppView('strength'));
  await page.locator('#ox-crypto-tools-inline .px-board').waitFor({timeout:15000});
  assert.equal(requests,2);assert.equal(await page.locator('#ox-crypto-tools-inline .ox-tool-loading').isVisible(),false);
  console.log(JSON.stringify({width,recoveredWithoutClick:true,moduleRequests:requests,ms:Date.now()-started}));await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
