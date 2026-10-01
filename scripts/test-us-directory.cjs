// UI regression with the real reference directory and real public entitlement
// service; no financial values are inserted and no rights flag is enabled.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const {preparePage,selectMarket,selectView}=require('./e2e-check.cjs');
const port=4191,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['scripts/dev-server.mjs','--port',String(port)],{cwd:require('node:path').resolve(__dirname,'..'),stdio:['ignore','pipe','inherit']});
(async()=>{
 let browser;
 try {
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('server timed out')),10000);server.stdout.once('data',()=>{clearTimeout(timeout);resolve();});server.once('exit',code=>reject(Error(`server exit ${code}`)));});
  const {handleUS2}=await import('../server/markets/us/service.js');
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.OX_BROWSER_PATH});
  for(const width of [390,430,1363]) {
   const context=await browser.newContext({viewport:{width,height:932},isMobile:true,hasTouch:true});
   const {page}=await preparePage(context,{width,height:932});const errors=[];page.on('pageerror',error=>errors.push(error.message));
   let marketDataCalls=0;
   await page.route('**/api/v1/us/**',async route=>{
    const url=new URL(route.request().url()),endpoint=url.pathname.split('/').at(-1);
    if(['quote-v2','chart-v2'].includes(endpoint))marketDataCalls++;
    try {const data=await handleUS2(endpoint,Object.fromEntries(url.searchParams));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})});}
    catch(error){await route.fulfill({status:error.status||503,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:error.code,message:error.message}})});}
   });
   await page.goto(base);await selectView(page,'radar');await selectMarket(page,'us');await page.click('#ox-control-close');
   await page.waitForSelector('.us2-directory-row');
   assert.equal(await page.locator('.us2-directory-row').count(),50);
   assert.equal(await page.locator('.us2-directory-row[data-symbol="NVDA"] .us2-directory-symbol').isVisible(),true);
   assert.ok((await page.locator('.us2-scanner').boundingBox()).height>=360);
   assert.match(await page.locator('.us2-ticker-name').innerText(),/標普500.*State Street/);
   assert.match(await page.locator('.us2-directory-row[data-symbol="NVDA"] .us2-row-name').innerText(),/輝達.*NVIDIA/);
   assert.equal(await page.locator('.us2-tier').isDisabled(),true);
   assert.match(await page.locator('.us2-catalogue-note').innerText(),/未掃描/);
   await page.locator('[data-directory-page="next"]').click();
   assert.equal(await page.locator('.us2-directory-row').count(),50);
   assert.match(await page.locator('.us2-directory-pages span').innerText(),/^51–100/);
   await page.locator('[data-directory-page="prev"]').click();
   await page.locator('.us2-directory-row[data-symbol="NVDA"] .us2-star').click();
   await page.locator('[data-watch-filter]').click();
   assert.equal(await page.locator('.us2-directory-row').count(),1);
   await page.locator('.us2-directory-row[data-symbol="NVDA"]').click();
   assert.match(await page.locator('.us2-ticker-name').innerText(),/輝達.*NVIDIA/);
   await page.locator('.us2-directory-row .us2-star').click();
   assert.equal(await page.locator('.us2-directory-row').count(),0);
   await page.locator('[data-watch-filter]').click();
   await page.locator('[data-search-open]').click();await page.locator('.us2-search input').fill('Apple');
   await page.waitForSelector('[data-open-symbol="AAPL"]');await page.locator('[data-open-symbol="AAPL"]').click();
   assert.match(await page.locator('.us2-ticker-name').innerText(),/蘋果.*Apple/);
   assert.equal(marketDataCalls,0,'No unauthorized chart/quote fetches');
   assert.equal(await page.locator('iframe[src*="tradingview"]').count(),0);
   assert.equal(await page.locator('.us2-stock-row .coin-tier-heading').count(),0,'Directory is not T1/T2/T3 results');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
   await selectView(page,'home');
   assert.match(await page.locator('.us2-home-name').innerText(),/標普500/);
   await selectView(page,'radar');await page.waitForSelector('.us2-directory-row');
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({width,referenceDirectory:true,pricesEnabled:false,marketDataCalls,errors}));await context.close();
  }
 } finally {await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
