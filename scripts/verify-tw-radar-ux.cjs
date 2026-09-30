const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../docs/qa/tw-radar-ux');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const proxyURL=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
 const p=proxyURL?new URL(proxyURL):null;
 const browser=await chromium.launch({executablePath:'/tmp/ox-browser/chrome-headless-shell-linux64/chrome-headless-shell',headless:true,args:['--no-sandbox'],env:{...process.env,FONTCONFIG_FILE:'/tmp/ox-fontconfig.xml'},proxy:p?{server:p.origin,username:decodeURIComponent(p.username),password:decodeURIComponent(p.password),bypass:'127.0.0.1,localhost'}:undefined});
 for(const width of [390,430,1440]){
  const page=await browser.newPage({viewport:{width,height:width>1000?1000:844},isMobile:width<1000,hasTouch:width<1000,ignoreHTTPSErrors:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.OX_QA_URL||'http://127.0.0.1:4186';
  if(base.startsWith('http://127.')){
   await page.addInitScript(()=>{window.OX_TW_DATA_API_BASE=location.origin+'/api';});
   await page.route('**/api/**',async route=>{try{const headers={...route.request().headers()};delete headers.origin;delete headers.host;await route.fulfill({response:await route.fetch({url:'https://ox-crypto-screener.vercel.app'+new URL(route.request().url()).pathname+new URL(route.request().url()).search,headers,timeout:45000})});}catch{await route.abort();}});
  }
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#price').filter({hasText:/\d/}).waitFor({timeout:60000});
  await page.screenshot({path:path.join(out,`crypto-${width}.png`)});
  const geometry=async selector=>page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,grid:s.gridTemplateColumns,font:s.fontSize};});
  const crypto={workspace:await geometry('#view-radar .workspace'),chart:await geometry('#chart'),toolbar:await geometry('#view-radar .chart-controls')};
  await page.evaluate(()=>{const lib=window.LightweightCharts;window.LightweightCharts={...lib,createChart(el,options){const chart=lib.createChart(el,options);if(el.id==='tw-radar-chart')window.__twQaChart=chart;return chart;}};});
  await page.locator('#ox-control-open').click();
  await page.locator('[data-market-choice="tw"]').click();
  await page.locator('#ox-control-close').click();
  await page.locator('[data-twr-mode="chart"]').click({timeout:45000});
  await page.locator('.twcr-card').first().waitFor({timeout:60000});
  if(process.env.OX_QA_BEFORE){await page.locator('#tw-radar-chart canvas').first().waitFor();await page.waitForTimeout(800);await page.screenshot({path:path.join(out,`before-tw-${width}.png`)});await page.close();continue;}
  await page.waitForFunction(()=>document.querySelector('.twcr-status')?.textContent==='',{timeout:60000});
  await page.waitForTimeout(3200);
  await page.screenshot({path:path.join(out,`tw-${width}.png`)});
  const tw={workspace:await geometry('.twcr-workspace'),chart:await geometry('#tw-radar-chart'),toolbar:await geometry('.tw-chart-radar .chart-controls')};
  console.log(JSON.stringify({width,crypto,tw,errors}));
  assert.equal(tw.workspace.grid,crypto.workspace.grid);
  assert.equal(tw.toolbar.height,crypto.toolbar.height);
  assert.equal(tw.chart.height,crypto.chart.height);
  assert.equal((await geometry('.tw-chart-radar .market-line-card')).grid.split(/\s+/).length,3,'quote strip reserves only the three real TW fields');
  assert(tw.workspace.height<800,'list must not grow the workspace');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no page overflow');
  await page.locator('.twcr-results').evaluate(e=>e.scrollTop=120);
  const beforeScroll=await page.locator('.twcr-results').evaluate(e=>e.scrollTop);
  const favorite=page.locator('.twcr-star:visible').nth(2);
  const current=await page.locator('[data-quote-name]').textContent();
  await favorite.click();assert.equal(await page.locator('[data-quote-name]').textContent(),current);
  assert.equal(await page.locator('.twcr-results').evaluate(e=>e.scrollTop),beforeScroll);
  await page.locator('[data-twcr-tab="watch"]').click();assert.equal(await page.locator('.twcr-card').count(),1);
  await page.screenshot({path:path.join(out,`watch-${width}.png`)});
  await page.locator('[data-twcr-tab="surge"]').click();assert.equal(await page.locator('.twcr-card').count(),50);
  await page.locator('[data-twcr-tab="all"]').click();
  const tierButton=await page.locator('[data-twcr-tab="all"]').boundingBox();
  await page.mouse.move(tierButton.x+8,tierButton.y+10);await page.mouse.down();
  await page.waitForTimeout(2100);assert(await page.locator('.twcr-tier-menu').isVisible(),'2s hold opens before release');
  await page.screenshot({path:path.join(out,`tiers-${width}.png`)});await page.mouse.up();await page.keyboard.press('Escape');
  await page.mouse.down();await page.mouse.move(tierButton.x+24,tierButton.y+10);await page.waitForTimeout(2100);
  assert.equal(await page.locator('.twcr-tier-menu').isVisible(),false,'moving cancels hold');await page.mouse.up();
  const first=page.locator('.twcr-card').first();await first.click();
  await page.waitForFunction(()=>document.querySelector('.twcr-status')?.textContent==='');
  for(const frame of ['1D','2D','3D','5D','1W','2W','1M']){await page.locator(`[data-twcr-frame="${frame}"]`).click();await page.waitForFunction(()=>document.querySelector('.twcr-status')?.textContent==='');}
  await page.locator('[data-twcr-frame="1M"]').click();
  await page.screenshot({path:path.join(out,`timeframes-${width}.png`)});
  await page.keyboard.press('Escape');
  await page.locator('[data-action="indicators"]').click();
  await page.locator('.chart-indicator-option').filter({has:page.locator('[data-levels]')}).click();
  await page.screenshot({path:path.join(out,`tools-${width}.png`)});
  await page.keyboard.press('Escape');
  await page.locator('#tw-radar-radar-scanner-toggle').click();await page.waitForTimeout(700);
  assert((await geometry('#tw-radar-chart')).width>tw.chart.width,'chart fills released scanner track');
  assert(await page.locator('.twcr-scanner').evaluate(e=>getComputedStyle(e).visibility==='hidden'||Number(getComputedStyle(e).opacity)<.01),'scanner is visually hidden');
  await page.screenshot({path:path.join(out,`folded-${width}.png`)});
  await page.locator('[data-action="focus"]').click();await page.waitForTimeout(400);
  if(width<1000){
   const bounds=await page.locator('#tw-radar-chart').boundingBox();
   const range=()=>page.evaluate(()=>{const r=window.__twQaChart.timeScale().getVisibleLogicalRange();return r.to-r.from;});
   const before=await range(),cdp=await page.context().newCDPSession(page),y=bounds.y+bounds.height*.45;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+60,y},{x:bounds.x+150,y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bounds.x+35,y},{x:bounds.x+185,y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert((await range())<before,'pinch zoom changes candle density');
   assert.equal(await page.evaluate(()=>scrollX),0,'gesture does not move page horizontally');
  }
  await page.locator('.tw-chart-radar .chart-drawing-tools [data-action="menu"]').click();
  await page.locator('.tw-chart-radar [data-draw="horizontal"]').click();
  const drawingBox=await page.locator('#tw-radar-chart').boundingBox();
  await page.mouse.click(drawingBox.x+70,drawingBox.y+drawingBox.height*.4);
  assert(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('ox-tw-chart-drawings-v1')||'{}')).some(rows=>rows.length)),'drawing saved in TW-only scope');
  await page.screenshot({path:path.join(out,`expanded-${width}.png`)});
  await page.locator('[data-action="exit"]').click();
  await page.locator('#tw-radar-radar-scanner-toggle').click();
  for(const mode of ['risk','disposal','release','watchlist']){await page.locator(`[data-twr-mode="${mode}"]`).click();await page.evaluate(()=>scrollTo(0,0));try{await page.locator('.tw-stock-card').first().waitFor({timeout:60000});}catch(error){console.error({width,mode,body:await page.locator('.twr-shell').innerText()});await page.screenshot({path:path.join(out,`${mode}-${width}.png`)});throw error;}await page.waitForTimeout(300);await page.screenshot({path:path.join(out,`${mode}-${width}.png`)});}
  await page.locator('#ox-control-open').click();await page.locator('[data-market-choice="crypto"]').click();await page.locator('#ox-control-close').click();
  await page.waitForTimeout(800);
  assert.deepEqual(await geometry('#view-radar .workspace'),crypto.workspace,'Crypto geometry unchanged after TW exit');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
