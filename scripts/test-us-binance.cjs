// Synthetic route/socket fixtures exercise the real OX renderer, never a live-data claim.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {readFileSync,mkdirSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {preparePage,selectMarket,selectView}=require('./e2e-check.cjs');
const port=4197,base=`http://127.0.0.1:${port}`;
const output=process.env.OX_US_LIVE_QA_DIR||path.join(require('node:os').tmpdir(),'ox-us-binance-qa');
const chartLibrary=process.env.OX_CHARTS_PATH;
const server=spawn(process.execPath,['scripts/dev-server.mjs','--host','127.0.0.1','--port',String(port)],{cwd:path.resolve(__dirname,'..'),stdio:['ignore','pipe','inherit']});
(async()=>{
 let browser;
 try {
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('server timeout')),10000);server.stdout.once('data',()=>{clearTimeout(t);resolve();});});
  const {createBinanceService}=await import('../server/markets/us/binance-service.js');
  const directory=['SPY','QQQ','AAPL'].map(symbol=>({symbol,name:{SPY:'SPDR S&P 500',QQQ:'Invesco QQQ',AAPL:'Apple'}[symbol],alias:symbol,type:symbol==='AAPL'?'stock':'ETF',exchange:'NASDAQ'}));
  let failRegion=false;
  const service=createBinanceService({cache:(_key,fn)=>fn(),fetchImpl:async url=>{
   if(failRegion)return {ok:false,status:451};
   const now=Date.now();let data;
   if(url.pathname.endsWith('exchangeInfo'))data={symbols:directory.map(item=>({symbol:item.symbol+'USDT',baseAsset:item.symbol,quoteAsset:'USDT',underlyingType:'EQUITY',contractType:'TRADIFI_PERPETUAL',status:'TRADING'}))};
   else if(url.pathname.endsWith('24hr'))data=directory.map(item=>({symbol:item.symbol+'USDT',lastPrice:'103',openPrice:'100',highPrice:'105',lowPrice:'99',volume:'1000',quoteVolume:'103000',closeTime:now}));
   else {
    const period=url.searchParams.get('interval'),limit=Number(url.searchParams.get('limit'));
    const duration={ '1m':60000,'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000,'1w':604800000,'1M':2592000000 }[period]||86400000;
    const end=url.searchParams.has('endTime')?Number(url.searchParams.get('endTime')):now;
    const start=Math.floor(end/duration)*duration;
    data=Array.from({length:Math.min(100,limit)},(_,i)=>{const t=start-(Math.min(100,limit)-1-i)*duration;return [t,100,105,99,103,1000,t+duration-1,103000];});
   }
   return {ok:true,status:200,json:async()=>data};
  }});
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.OX_BROWSER_PATH||undefined});
  mkdirSync(output,{recursive:true});
  for(const width of [390,430,1366]) {
   const context=await browser.newContext({viewport:{width,height:932},isMobile:width<720,hasTouch:true});
   const {page}=await preparePage(context,{width,height:932});const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   if(chartLibrary)await page.route('https://unpkg.com/**',route=>route.fulfill({contentType:'text/javascript',body:readFileSync(chartLibrary,'utf8')}));
   await page.route('**/api/v1/us/**',async route=>{
    const url=new URL(route.request().url());
    try {const data=await service.handle(url.pathname.split('/').at(-1),Object.fromEntries(url.searchParams),{known:directory,env:{US_BINANCE_EXTERNAL_DISPLAY_CONFIRMED:'true'}});
     await route.fulfill({json:{ok:true,data}});
    }catch(error){await route.fulfill({status:error.status||503,json:{ok:false,error:{message:error.message,code:error.code}}});}
   });
   await page.goto(base);await page.waitForFunction(()=>typeof window.switchAppView==='function');
   await page.evaluate(()=>{
    window.__equitySockets=[];
    class FixtureSocket {
     constructor(url){this.url=String(url);window.__equitySockets.push(this);queueMicrotask(()=>this.onopen?.());}
     close(){this.closed=true;this.onclose?.();}
     send(){}
     emit(data){this.onmessage?.({data:JSON.stringify({data})});}
    }
    window.WebSocket=FixtureSocket;
   });
   await selectMarket(page,'us');
   if(await page.locator('#ox-control-close').isVisible())await page.locator('#ox-control-close').click();
   await page.waitForFunction(()=>document.querySelector('.us2-eod-summary strong')?.textContent==='美股合約');
   await page.waitForFunction(()=>window.__equitySockets.some(s=>s.url.includes('spyusdt@kline_1d')));
   await page.locator('.us2-chart-root [data-tf="1m"]').click();
   await page.waitForFunction(()=>window.__equitySockets.some(s=>!s.closed&&s.url.includes('spyusdt@kline_1m')));
   await page.evaluate(()=>{
    const socket=window.__equitySockets.findLast(s=>!s.closed&&s.url.includes('spyusdt@kline_1m'));
    const now=Date.now(),start=Math.floor(now/60000)*60000;
    socket.emit({e:'24hrTicker',E:now,s:'SPYUSDT',c:'104.5',o:'100',h:'105',l:'99',v:'1001',q:'104604.5'});
    socket.emit({e:'kline',E:now,s:'SPYUSDT',k:{s:'SPYUSDT',i:'1m',t:start,T:start+59999,o:'100',h:'105',l:'99',c:'104.5',v:'1001',q:'104604.5',x:false}});
   });
   await page.waitForFunction(()=>document.querySelector('.us2-quote-value')?.textContent==='104.50');
   await page.waitForFunction(()=>document.querySelector('.us2-price-label strong')?.textContent==='104.50');
   assert.match(await page.locator('.us2-price-label small').textContent(),/串流/);
   await page.evaluate(()=>{
    const socket=window.__equitySockets.findLast(s=>!s.closed&&s.url.includes('!ticker@arr'));
    if(!socket)throw Error('Missing list ticker stream');
    socket.emit([{e:'24hrTicker',E:Date.now(),s:'QQQUSDT',c:'104.25',o:'100',h:'105',l:'99',v:'1001',q:'104354.25'}]);
   });
   await page.waitForFunction(()=>document.querySelector('#ox-live-text')?.textContent.includes('QQQ 104.25'));
   await page.locator('.us2-symbol-picker').click();
   await page.getByRole('textbox',{name:'搜尋美股'}).fill('AAPL');
   await page.locator('.us2-search-results button').first().click();
   await page.waitForFunction(()=>window.__equitySockets.some(s=>!s.closed&&s.url.includes('aaplusdt@kline_')));
   assert.equal(await page.evaluate(()=>window.__equitySockets.filter(s=>!s.closed&&s.url.includes('spyusdt')).length),0);
   await selectView(page,'strength');
   await page.locator('[data-tool-tab="bubbles"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-bubble-market="us"]')?.shadowRoot?.textContent.includes('合約24h漲跌'));
   await page.locator('[data-bubble-market="us"] [data-asset="AAPL"]').click();
   await page.evaluate(()=>window.__equitySockets.findLast(s=>!s.closed&&s.url.includes('!ticker@arr'))
    .emit([{e:'24hrTicker',E:Date.now(),s:'AAPLUSDT',c:'104.25',o:'100',h:'105',l:'99',v:'1001',q:'104354.25'}]));
   await page.waitForFunction(()=>document.querySelector('[data-bubble-market="us"]')?.shadowRoot?.querySelector('.oxb-price')?.textContent.includes('104.25'));
   await page.locator('[data-bubble-market="us"] [data-action="close-asset"]').click();
   await selectView(page,'home');
   await page.waitForFunction(()=>document.querySelector('.ox-home-price small')?.textContent==='USDT');
   await selectView(page,'radar');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${width}: overflow`);
   await page.screenshot({path:path.join(output,`${width}.png`)});
   await selectMarket(page,'crypto');
   assert.equal(await page.evaluate(()=>window.__equitySockets.filter(s=>!s.closed&&s.url.includes('fstream.binance.com')).length),0);
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({width,passed:true,checks:'native chart, ticker, minute stream, symbol change, bubbles, home, overflow, teardown'}));
   await context.close();
  }
  // Separate failure-state case: the adapter propagates the actual 451, and
  // the UI stays usable instead of inventing values or spinning indefinitely.
  failRegion=true;
  const context=await browser.newContext({viewport:{width:390,height:932}});
  const {page}=await preparePage(context,{width:390,height:932});
  if(chartLibrary)await page.route('https://unpkg.com/**',route=>route.fulfill({contentType:'text/javascript',body:readFileSync(chartLibrary,'utf8')}));
  await page.route('**/api/v1/us/**',async route=>{
   const url=new URL(route.request().url());
   try{await route.fulfill({json:{ok:true,data:await service.handle(url.pathname.split('/').at(-1),Object.fromEntries(url.searchParams),{known:directory,env:{US_BINANCE_EXTERNAL_DISPLAY_CONFIRMED:'true'}})}});}
   catch(error){await route.fulfill({status:error.status||503,json:{ok:false,error:{message:error.message,code:error.code}}});}
  });
  await page.goto(base);await selectMarket(page,'us');
   if(await page.locator('#ox-control-close').isVisible())await page.locator('#ox-control-close').click();
  await page.waitForFunction(()=>document.querySelector('.us2-chart-message')?.textContent.includes('地區'));
  assert.equal(await page.locator('.us2-quote-value').textContent(),'—');
  console.log(JSON.stringify({regionRestricted:true,passed:true}));await context.close();
 } finally {await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
