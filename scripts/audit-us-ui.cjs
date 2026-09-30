// Isolated browser fixtures. These captures verify layout, not live market data.
const { chromium } = require('playwright');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { server, preparePage, selectMarket, selectView, testBase } = require('./e2e-check.cjs');
(async () => {
  const out = process.env.OX_UI_OUTPUT || '/tmp/ox-us-ui-before'; mkdirSync(out,{recursive:true});
  await new Promise(r=>server.listen(Number(process.env.OX_E2E_PORT || 4173),'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.OX_BROWSER_PATH,headless:true,args:['--no-sandbox']});
  const reports=[];
  try {
    for(const width of (process.env.OX_UI_WIDTHS||'390,430,1366').split(',').map(Number)) {
      const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1});
      const {page,audit}=await preparePage(context,{width,height:844});
      await page.route('https://unpkg.com/**',r=>r.fulfill({contentType:'text/javascript',body:readFileSync('/tmp/ox-lightweight-charts.js','utf8')}));
      await page.route('**/api/v1/us/chart-v2**',r=>r.fulfill({status:403,json:{ok:false,error:{code:'DISPLAY_NOT_CONFIRMED',message:'美股對外展示授權尚未確認。'}}}));
      await page.route('**/api/v1/us/quote-v2**',r=>r.fulfill({status:403,json:{ok:false,error:{code:'DISPLAY_NOT_CONFIRMED',message:'美股對外展示授權尚未確認。'}}}));
      await page.goto(testBase,{waitUntil:'domcontentloaded'});
      await page.waitForSelector('#screener-list .coin-card');
      for(const market of ['crypto','us']) {
        await selectMarket(page,market);
        await page.click('#ox-control-close');
        for(const view of ['radar','strength','home','data','media']) {
          await selectView(page,view); await page.waitForTimeout(750);
          if(market==='us'&&view==='radar'&&await page.locator('.us2-main.ox-scanner-collapsed').count()){await page.locator('[data-collapse]').click();await page.waitForTimeout(700);}
          if(market==='crypto'&&view==='strength') await page.waitForFunction(()=>document.querySelector('#ox-crypto-tools-inline')?.shadowRoot?.querySelector('.px-board')||document.querySelector('#ox-crypto-tools-inline > div')?.shadowRoot?.querySelector('.px-board')).catch(()=>{});
          await page.evaluate(()=>scrollTo(0,0));
          await page.screenshot({path:resolve(out,`${market}-${view}-${width}.png`)});
          const metrics=await page.evaluate(({market,view})=>{
            const rect=s=>{const n=document.querySelector(s);if(!n)return null;const r=n.getBoundingClientRect(),c=getComputedStyle(n);return {x:r.x,y:r.y,width:r.width,height:r.height,font:c.fontSize,padding:c.padding,borderRadius:c.borderRadius};};
            const layout=document.querySelector('.us2-radar-layout'),main=document.querySelector('.us2-main'),scanner=document.querySelector('.us2-scanner');
            return {market,view,width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,live:rect('.ox-live-shell'),summary:rect(market==='crypto'?'.market-line-card':'.us2-ticker .market-line-card'),toolbar:rect(market==='crypto'?'#view-radar .chart-controls':'.us2-chart-toolbar'),chart:rect(market==='crypto'?'#chart':'.us2-chart-stage'),dock:rect('.app-dock'),home:rect(market==='crypto'?'#view-home .ox-home-chart':'.us2-home-chart'),usLayout:layout?{class:layout.className,grid:getComputedStyle(layout).gridTemplateColumns,main:main.className,scanner:getComputedStyle(scanner).display,parents:[main.parentElement.className,main.parentElement.parentElement.className]}:null};
          },{market,view});
          metrics.host=await page.locator('#market-unavailable-card').evaluate(n=>({hidden:n.hidden,display:getComputedStyle(n).display,main:n.querySelector('main')?.className,mainDisplay:n.querySelector('main')?getComputedStyle(n.querySelector('main')).display:null,html:n.innerHTML.slice(0,250)}));reports.push(metrics);
          if(view==='radar') {
            const collapse=page.locator(market==='crypto'?'#radar-scanner-toggle':'[data-collapse]');
            if(await collapse.isVisible()){await collapse.click();await page.waitForTimeout(700);await page.screenshot({path:resolve(out,`${market}-collapsed-${width}.png`)});await collapse.click().catch(()=>{});await page.waitForTimeout(700);}
            await page.locator(market==='crypto'?'#chart-indicator-open':'[data-indicator-open]').click();await page.waitForTimeout(400);
            await page.screenshot({path:resolve(out,`${market}-indicators-${width}.png`)});
            await page.locator(market==='crypto'?'[data-chart-tools-close]':'[data-close-indicators]').click();
            const last=page.locator(market==='crypto'?'#chart-timeframe-strip .btn-tf':'.us2-timeframes .btn-tf').last();
            await last.click();await page.waitForTimeout(250);
            if(!(await page.locator(market==='crypto'?'#chart-tools-overlay.is-open':'.us2-timeframe-dialog[open]').count()))await last.click();
            await page.waitForTimeout(400);
            await page.screenshot({path:resolve(out,`${market}-timeframes-${width}.png`)});
            await page.locator(market==='crypto'?'#chart-timeframe-save':'[data-save-timeframes]').click();
          }
        }
      }
      reports.push({width,errors:audit.pageErrors});await context.close();
    }
    writeFileSync(resolve(out,'metrics.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.filter(x=>x.view==='radar'||x.errors),null,2));
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
