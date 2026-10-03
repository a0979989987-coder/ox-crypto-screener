// Live acceptance: no fixture prices, no fake sockets, no substituted providers.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdirSync}=require('node:fs');
const {chromium}=require('playwright');
const path=require('node:path');
const base=process.env.OX_US_LIVE_BASE||'http://127.0.0.1:4199';
const output=process.env.OX_US_LIVE_QA_DIR||'/tmp/ox-bitget-acceptance';
const server=process.env.OX_US_LIVE_BASE?null:spawn(process.execPath,['--use-env-proxy','scripts/dev-server.mjs','--us-live','--port','4199'],{
 cwd:path.resolve(__dirname,'..'),env:{...process.env,US_DATA_PROVIDER:'bitget-equity'},stdio:['ignore','pipe','inherit']});
const view=async(page,name,width)=>{await page.locator((width<800?'.app-dock':'.ox-desktop-nav')+` [data-view-target="${name}"]`).click();await page.waitForFunction(v=>document.body.dataset.view===v,name);};
(async()=>{let browser;
 try{
  if(server)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server timeout')),10000);server.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
  browser=await chromium.launch({headless:true,executablePath:process.env.OX_BROWSER_PATH,args:['--no-sandbox']});mkdirSync(output,{recursive:true});
  const widths=(process.env.OX_US_LIVE_WIDTHS||'390,1366').split(',').map(Number);
  for(const width of widths){
   const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:932},isMobile:width<800,hasTouch:true});
   await context.addInitScript(()=>{
    localStorage.setItem('ox-us-v2-chart-timeframes',JSON.stringify(['1m','1H','4H','1D']));
    let library;window.__liveSeries=[];
    Object.defineProperty(window,'LightweightCharts',{configurable:true,get:()=>library,set:value=>{
     library={...value,createChart(...args){const chart=value.createChart(...args),add=chart.addCandlestickSeries.bind(chart);
      chart.addCandlestickSeries=(...options)=>{const series=add(...options);window.__liveSeries.push(series);return series;};return chart;}};
    }});
   });
   const page=await context.newPage(),errors=[],socketData={ticker:0,candle:0},responses=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('response',async r=>{if(r.url().includes('/api/v1/us/')&&r.status()>=400)responses.push({url:r.url(),status:r.status()});});
   page.on('websocket',ws=>{if(ws.url().includes('ws.bitget.com'))ws.on('framereceived',({payload})=>{
    try{const p=JSON.parse(String(payload));if(!p.data||!['AAPLUSDT','SPYUSDT'].includes(p.arg?.instId))return;if(p.arg?.channel==='ticker')socketData.ticker++;else if(p.arg?.channel?.startsWith('candle'))socketData.candle++;}catch{}
   });});
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.click('#ox-control-open');await page.click('[data-market-choice="us"]');await page.click('#ox-control-close');
   await page.waitForFunction(()=>document.querySelector('[data-eod-date]')?.textContent.includes('281')||/有報價 [1-9]/.test(document.querySelector('.us2-root')?.textContent||''),null,{timeout:90000});
   await page.waitForFunction(()=>window.__liveSeries.some(s=>{try{return s.data().length>=60;}catch{return false;}}),null,{timeout:60000});
   assert.equal(await page.locator('.us2-widget-stage iframe').count(),0);
   await page.locator('[data-search-open]').click();await page.locator('.us2-search input').fill('AAPL');await page.locator('[data-open-symbol="AAPL"]').click();
   await page.locator('.us2-timeframes [data-tf="1m"]').click();
   await page.waitForFunction(()=>document.querySelector('.us2-chart-meta')?.textContent.includes('bitget-equity')&&document.querySelector('.us2-timeframes [data-tf="1m"]')?.getAttribute('aria-pressed')==='true'&&window.__liveSeries.some(s=>{try{const a=s.data();return a.length>50&&a.at(-1).time-a.at(-2).time===60;}catch{return false;}}),null,{timeout:60000});
   await page.screenshot({path:`${output}/radar-${width}.png`,fullPage:true});
   const quote=await page.locator('.us2-price-label strong').textContent();
   console.log(JSON.stringify({width,phase:'chart',socketData,quote,errors,responses}));
   await view(page,'strength',width);await page.locator('[data-tool-tab="bubbles"]').click();
   const bubbles=page.locator('.us2-bubbles-host');await bubbles.locator('[data-asset]').first().waitFor({timeout:20000});
   const bubbleCount=await bubbles.locator('[data-asset]').count();assert.ok(bubbleCount>0);
   await bubbles.locator('[data-asset]').first().click();assert.match(await bubbles.locator('.oxb-dialog').innerText(),/Bitget.*非美股現貨/);
   await bubbles.locator('[data-action="radar"]').click();
   await page.waitForFunction(()=>document.body.dataset.view==='radar');
   await view(page,'strength',width);await page.locator('[data-tool-tab="bubbles"]').click();
   await page.screenshot({path:`${output}/bubbles-${width}.png`,fullPage:true});
   await page.locator('[data-tool-tab="patterns"]').click();const patterns=page.locator('.us2-pattern-host');
   await page.waitForFunction(()=>['ready','partial'].includes(document.querySelector('.us2-pattern-host')?.shadowRoot?.querySelector('.px')?.dataset.indexState),null,{timeout:180000});
   const patternCount=await patterns.locator('.px-card').count();assert.ok(patternCount>0,'Real closed candles must produce browseable pattern results');
   await page.screenshot({path:`${output}/patterns-${width}.png`,fullPage:true});
   await patterns.locator('.px-card').first().click();await patterns.locator('[data-action="open-radar"]').click();
   await page.waitForFunction(()=>document.body.dataset.view==='radar');
   assert.ok(socketData.ticker>0,'Real Bitget WebSocket ticker was received');assert.ok(socketData.candle>0,'Real Bitget WebSocket candles were received');
   assert.deepEqual(errors,[]);assert.deepEqual(responses,[]);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1);
   console.log(JSON.stringify({width,passed:true,bubbleCount,patternCount,socketData,errors}));await context.close();
  }
 }finally{await browser?.close();server?.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
