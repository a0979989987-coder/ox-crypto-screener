// Real TradingView frames and market data. Local API serves actual public EOD
// capabilities; the UI chooses the authorized display widget independently.
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { capabilities, snapshot } from '../server/markets/us/service.js';
const root=resolve(new URL('..',import.meta.url).pathname);
const output=process.env.OX_FREE_QA_OUTPUT||'/tmp/ox-us-free-live';
await mkdir(output,{recursive:true});
let rawDataCalls=0;
const server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(/\/api\/v1\/us\/(quote-v2|chart-v2)$/.test(u.pathname))rawDataCalls++;
  if(u.pathname==='/api/v1/us/capabilities'||u.pathname==='/api/v1/us/snapshot'){
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ok:true,data:u.pathname.endsWith('capabilities')?capabilities():await snapshot()}));return;
  }
  try{
    const file=resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));
    if(!file.startsWith(root+'/')||!(await stat(file)).isFile())throw Error();
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('{}');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const bootSource=await readFile(resolve(root,'scripts/test-market-boot.cjs'),'utf8');
const cryptoChartStub=bootSource.match(/const chartStub = `([\s\S]*?)`;/)[1];
async function selectView(page,view) {
  const desktop=page.locator(`.ox-desktop-nav [data-view-target="${view}"]`);
  if(await desktop.isVisible())await desktop.click();
  else await page.locator(`.app-dock [data-view-target="${view}"]`).click();
}
try{
  const widths=(process.env.OX_QA_WIDTHS||'390,430,1366').split(',').map(Number);
  const matrix=process.env.OX_TEST_WEBKIT==='only'?[['WebKit',webkit,430]]:[...widths.map(w=>['Chromium',chromium,w]),...(process.env.OX_TEST_WEBKIT==='1'?[['WebKit',webkit,430]]:[])];
  for(const [engine,kind,width] of matrix){
    const proxyURL=new URL(process.env.HTTPS_PROXY||'http://127.0.0.1:1');
    const browser=await kind.launch({headless:true,proxy:{server:proxyURL.origin,bypass:'127.0.0.1,localhost',...(proxyURL.username?{username:decodeURIComponent(proxyURL.username),password:decodeURIComponent(proxyURL.password)}:{})},...(kind===chromium&&process.env.OX_BROWSER_PATH?{executablePath:process.env.OX_BROWSER_PATH}:{})});
    try{
      const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width,height:932},hasTouch:width<600,isMobile:width<600});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(/tradingview/.test(r.url())&&r.failure()?.errorText!=='net::ERR_ABORTED')console.log(JSON.stringify({failed:r.url().split('?')[0],reason:r.failure()?.errorText}));});
      await page.addInitScript(()=>{window.OX_US_DATA_API_BASE=location.origin+'/api';});
      // Isolate the initial Crypto screen/dependencies, not the US provider.
      await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.href.includes('lightweight-charts'))return route.fulfill({contentType:'text/javascript',body:cryptoChartStub});
        if(url.origin===base||/(^|\.)tradingview(-widget)?\.com$/.test(url.hostname))return route.continue();
        return route.abort();
      });
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.locator('#ox-control-open').click();
      await page.locator('[data-market-choice="us"]').click();
      await page.locator('#ox-control-close').click();
      await page.locator('.us2-widget-stage iframe').waitFor({timeout:30000}).catch(async e=>{await page.screenshot({path:output+'/connection-failure-new.png'});console.log(await page.locator('.us2-widget-stage').innerText());console.log({appErrors:errors});throw e;});
      const frame=page.frameLocator('.us2-widget-stage iframe');
      await frame.locator('canvas').first().waitFor({timeout:45000});
      await frame.locator('body').filter({hasText:/\b\d{2,5}[,.]\d{2}\b/}).waitFor({timeout:45000});
      const body=await frame.locator('body').innerText();
      assert.match(body,/SPY|SPDR|S&P/);
      assert.doesNotMatch(body,/Invalid symbol|商品無效/);
      const quote=body.match(/\b\d{2,5}[,.]\d{2}\b/);
      assert.ok(quote,'real quote rendered by provider');
      const compactConfig=JSON.parse(decodeURIComponent(new URL(await page.locator('.us2-widget-stage iframe').getAttribute('src')).hash.slice(1)));
      assert.equal(compactConfig.hide_top_toolbar,true);assert.equal(compactConfig.hide_side_toolbar,true);
      assert.equal(await frame.getByRole('button',{name:'趨勢線',exact:true}).count(),0);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      assert.ok(overflow<=1,`overflow ${overflow}`);
      await page.screenshot({path:`${output}/radar-${engine}-${width}.png`});
      assert.equal(await page.locator('.us2-timeframes [data-tf="1m"]').count(),0);
      await page.locator('.us2-widget-chart [data-tf="1W"]').click();
      await page.frameLocator('.us2-widget-stage iframe').locator('canvas').first().waitFor({timeout:45000});
      const src=await page.locator('.us2-widget-stage iframe').getAttribute('src');
      assert.equal(JSON.parse(decodeURIComponent(new URL(src).hash.slice(1))).interval,'W');
      await page.locator('.us2-widget-chart [data-tf="1M"]').click();
      await page.frameLocator('.us2-widget-stage iframe').locator('canvas').first().waitFor({timeout:45000});
      assert.equal(JSON.parse(decodeURIComponent(new URL(await page.locator('.us2-widget-stage iframe').getAttribute('src')).hash.slice(1))).interval,'M');
      assert.equal(await page.locator('.us2-directory-row[data-symbol="NVDA"]').count(),1);
      await selectView(page,'home');
      await page.frameLocator('.us2-widget-stage iframe').locator('canvas').first().waitFor({timeout:45000});
      await page.screenshot({path:`${output}/home-${engine}-${width}.png`});
      await selectView(page,'radar');
      await page.frameLocator('.us2-widget-stage iframe').locator('canvas').first().waitFor({timeout:45000});
      await page.locator('[data-search-open]').click();
      await page.locator('.us2-search input').fill('台積電');
      await page.locator('[data-open-symbol="TSM"]').click();
      await page.frameLocator('.us2-widget-stage iframe').locator('canvas').first().waitFor({timeout:45000});
      const tsmSrc=await page.locator('.us2-widget-stage iframe').getAttribute('src');
      assert.equal(JSON.parse(decodeURIComponent(new URL(tsmSrc).hash.slice(1))).symbol,'NYSE:TSM');
      await page.locator('.us2-ticker [data-watch]').click();
      assert.equal(await page.locator('.us2-ticker [data-watch]').getAttribute('aria-pressed'),'true');
      await page.locator('.us2-widget-chart [data-expand]').click();
      await page.locator('.us2-chart-full').waitFor();
      await page.locator('[data-exit-focus]').click();
      assert.equal(await page.locator('.us2-chart-full').count(),0);
      await page.locator('[data-widget-info]').click();
      await page.locator('[data-widget-tools]').click();
      const analysisConfig=JSON.parse(decodeURIComponent(new URL(await page.locator('.us2-widget-stage iframe').getAttribute('src')).hash.slice(1)));
      assert.equal(analysisConfig.hide_top_toolbar,false);assert.equal(analysisConfig.hide_side_toolbar,false);
      await page.frameLocator('.us2-widget-stage iframe').getByRole('button',{name:'趨勢線',exact:true}).waitFor({timeout:45000});
      const appErrors=errors.filter(x=>!/fetch|network|WebSocket|Script error/.test(x)&&!(/\/api\/v1\/tw\//.test(x)&&/access control/.test(x)));
      assert.deepEqual(appErrors,[]);
      assert.equal(rawDataCalls,0);
      console.log(JSON.stringify({engine,width,overflow,realProviderQuoteVisible:true,compactToolbar:true,analysisTools:true,searchADR:true,dailyWeeklyMonthly:true,pageReturn:true,fullscreen:true,rawDataCalls,appErrors}));
      await page.close();
    }finally{await browser.close();}
  }
}finally{server.close();}
