import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {FEATURE_CATALOG} from '../server/account/feature-catalog.js';
process.env.OX_E2E_PORT='4297';
const {server,preparePage,testBase,bitgetBody}=createRequire(import.meta.url)('./e2e-check.cjs');
await new Promise(resolve=>server.listen(4297,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.OX_TEST_BROWSER||'/tmp/ox-chromium',args:['--no-sandbox']});
try{
 for(const width of [390,1440])for(const tool of ['patterns','home']){
  let release;const tail=new Promise(resolve=>release=resolve);
  let signalStall;const stallStarted=new Promise(resolve=>signalStall=resolve);
  const context=await browser.newContext({locale:'zh-TW',viewport:{width,height:900}});
  const {page,audit}=await preparePage(context,{width,height:900});
  let stalled=0;
  await page.route('https://api.bitget.com/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/candles')&&!['BTCUSDT','ETHUSDT','SOLUSDT'].includes(url.searchParams.get('symbol'))){stalled++;signalStall();await tail;}
   await route.fulfill({json:{...bitgetBody(url),requestTime:Date.now()}});
  });
  await page.route('**/api/v1/account/**',route=>{const endpoint=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill({json:endpoint==='feature-access'?{ok:true,features:FEATURE_CATALOG.map(f=>({...f,mode:'public',version:'fixture'}))}:endpoint==='session'?{ok:true,user:null}:{configured:false}});});
  try{
   await page.goto(testBase+'/?ox_feature=crypto.'+tool,{waitUntil:'domcontentloaded'});
   const cards=page.locator(tool==='patterns'?'#ox-crypto-tools-inline .px-card':'#home-t1-long-list [data-home-symbol]');
   await cards.first().waitFor({timeout:15000});
   await stallStarted;
   if(tool==='patterns')assert.equal(await page.locator('#ox-crypto-tools-inline .px').getAttribute('data-index-state'),'loading');
   else assert.equal(await page.evaluate(()=>globalThis.eval('!!state.radarSnapshotReady')),false);
   assert((await cards.count())>0);
   assert.deepEqual(audit.pageErrors,[]);
   console.log(JSON.stringify({width,tool,partialCards:await cards.count(),scanStillLoading:true,stalledRequests:stalled,errors:audit.pageErrors}));
  }finally{release();await context.close();}
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
