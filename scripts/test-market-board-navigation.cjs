// Real-data browser regression: cold US drawing without a daily snapshot,
// and TW drawing -> selected-stock radar through the mobile gesture shell.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const base=process.env.OX_BOARD_BASE||'http://127.0.0.1:4188';
const server=process.env.OX_BOARD_BASE?null:spawn(process.execPath,['--use-env-proxy','scripts/dev-server.mjs','--us-live','--port','4188'],{stdio:['ignore','pipe','inherit']});
(async()=>{let browser;
 try{
  if(server)await new Promise(resolve=>server.stdout.once('data',resolve));
  browser=await chromium.launch({executablePath:process.env.OX_BROWSER_PATH,headless:true,args:['--no-sandbox'],proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}:undefined});
  for(const width of [390,1366]){
   const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width,height:932},isMobile:width<800,hasTouch:true});
   const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message);});
   page.on('response',async r=>{if(/\/us\/(quotes|directory)$/.test(new URL(r.url()).pathname))console.log('data',r.status(),new URL(r.url()).pathname,(await r.text()).slice(0,100));});
   // Simulated timeout of one service only; quotes/candles remain genuine.
   await page.route('**/api/v1/us/snapshot*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:{message:'Regression: daily scan unavailable'}})}));
   await page.goto(base,{waitUntil:'domcontentloaded'});
   const market=async name=>{await page.click('#ox-control-open');await page.click(`[data-market-choice="${name}"]`);await page.click('#ox-control-close');};
   const strength=()=>page.locator((width<800?'.app-dock':'.ox-desktop-nav')+' [data-view-target="strength"]').click();
   await market('us');await strength();
   console.log(JSON.stringify({width,phase:'us-enter'}));
   await page.screenshot({path:`/tmp/ox-board-enter-${width}.png`,fullPage:true});
   const us=page.locator('.us2-pattern-host');
   try{await us.locator('.px-card').first().waitFor({timeout:180000});}
   catch(error){console.log(await page.locator('.us2-root').innerText());await page.screenshot({path:'/tmp/ox-board-failure.png',fullPage:true});throw error;}
   console.log(JSON.stringify({width,phase:'us-cards'}));
   await us.locator('.px-card').first().click();
   const usTitle=await us.locator('.px-detail-title').innerText();
   await us.locator('[data-action="open-radar"]').click();
   await page.waitForFunction(()=>document.body.dataset.view==='radar');
   const usSymbol=await page.locator('.us2-symbol-picker').innerText();assert.ok(usTitle.includes(usSymbol));
   await page.locator('.us2-chart-message').waitFor({state:'hidden',timeout:60000});
   assert.equal(await page.locator('.us2-shell > .us2-eod-summary').count(),0);
   await page.screenshot({path:`/tmp/ox-us-repaired-${width}.png`,fullPage:true});
   await market('tw');await strength();
   console.log(JSON.stringify({width,phase:'tw-enter'}));
   const tw=page.locator('#ox-tw-patterns');
   await tw.locator('.px-card').first().waitFor({timeout:120000});
   await tw.locator('.px-card').first().click();
   const twTitle=await tw.locator('.px-detail-title').innerText();
   await tw.locator('[data-action="open-radar"]').click();
   await page.waitForFunction(()=>document.body.dataset.view==='radar'&&!!document.querySelector('#twr-chart-radar'));
   const text=await page.locator('#twr-chart-radar').innerText();
   assert.ok(text.includes(twTitle.match(/\d{4}/)[0]),'TW radar retains selected stock');
   assert.deepEqual(errors,[]);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1);
   console.log(JSON.stringify({width,usSymbol,twTitle,passed:true}));
   await page.screenshot({path:`/tmp/ox-tw-repaired-${width}.png`,fullPage:true});await page.close();
  }
 }finally{await browser?.close();server?.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
