// Actual personal OHLCV through the production file picker and IndexedDB.
// Other markets are isolated; US prices and the native renderer are genuine.
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {readFileSync, mkdirSync, writeFileSync} = require('node:fs');
const {chromium} = require('playwright');
const {preparePage,selectMarket,selectView} = require('./e2e-check.cjs');
const port = 4194, base = `http://127.0.0.1:${port}`;
const input = process.env.US_DEVICE_INPUT;
assert.ok(input, 'Set US_DEVICE_INPUT to a genuine private closing file outside this repository');
const packet = JSON.parse(readFileSync(input, 'utf8'));
const output = '/tmp/ox-us-device-live';
const server = spawn(process.execPath, ['scripts/dev-server.mjs','--port',String(port)], {cwd:require('node:path').resolve(__dirname,'..'),stdio:['ignore','pipe','inherit']});
(async () => {
  let browser;
  try {
    await new Promise((resolve,reject) => { const t=setTimeout(()=>reject(Error('server startup timeout')),10000); server.stdout.once('data',()=>{clearTimeout(t);resolve();}); });
    const {handleUS2} = await import('../server/markets/us/service.js');
    browser = await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.OX_BROWSER_PATH});
    mkdirSync(output,{recursive:true}); const report=[];
    for (const width of (process.env.OX_DEVICE_WIDTHS || '390,430,1366').split(',').map(Number)) {
      const context = await browser.newContext({viewport:{width,height:932},hasTouch:true,isMobile:width<720});
      const {page} = await preparePage(context,{width,height:932}); const errors=[]; let apiCalls=0, uploads=0;
      page.setDefaultTimeout(30000);
      page.on('pageerror', error=>errors.push(error.message));
      page.on('request',request=>{ if(request.url().includes('/api/v1/us/'))apiCalls++; if(request.method()==='POST')uploads++; });
      await page.route('**/api/v1/us/**', async route => {
        const url = new URL(route.request().url());
        try { await route.fulfill({json:{ok:true,data:await handleUS2(url.pathname.split('/').at(-1),Object.fromEntries(url.searchParams))}}); }
        catch(error) { await route.fulfill({status:error.status||503,json:{ok:false,error:{code:error.code,message:error.message}}}); }
      });
      await page.route('https://unpkg.com/**',route=>route.fulfill({contentType:'text/javascript',body:readFileSync('/tmp/ox-lightweight-charts.js','utf8')+`
        {const real=window.LightweightCharts;window.LightweightCharts={...real,createChart(container,options){
          const chart=real.createChart(container,options);if(container.classList.contains('us2-chart-canvas')){
            const add=chart.addCandlestickSeries.bind(chart);chart.addCandlestickSeries=options=>{window.__deviceSeries=add(options);return window.__deviceSeries;};
          }return chart;}};}` }));
      await page.goto(base); await selectView(page,'radar'); await selectMarket(page,'us'); await page.click('#ox-control-close');
      await page.waitForSelector('[data-device-open]');
      await page.locator('[data-device-open]').click(); await page.locator('.us2-device-picker input').setInputFiles(input);
      await page.waitForFunction(()=>document.querySelector('[data-eod-date]')?.textContent.includes('本機 335 檔'),null,{timeout:120000});
      await page.waitForFunction(()=>window.__deviceSeries?.data().length===400);
      assert.match(await page.locator('[data-eod-date]').innerText(),/待更新/);
      assert.equal(await page.locator('iframe[src*="tradingview"]').count(),0);
      assert.equal(await page.locator('.us2-tier').isDisabled(),false);
      assert.ok(await page.locator('.us2-radar-list .us2-stock-row').count()>0);
      assert.equal(await page.locator('.us2-radar-list .coin-symbol-mobile').first().isVisible(),true);
      assert.equal(await page.locator('.us2-radar-list .coin-change').first().isVisible(),true);
      assert.equal(await page.locator('.us2-radar-list .watch-star-mobile').first().isVisible(),true);
      assert.match(await page.locator('.us2-quote-value').innerText(),/762\.63/);
      const options=await page.evaluate(()=>window.__deviceSeries.options());
      assert.equal(options.upColor,'#00b8d4'); assert.equal(options.downColor,'#ff3078');
      const before=apiCalls, uploadBefore=uploads;
      for(const [interval,count] of [['1W',91],['1M',21],['1D',400]]) {
        await page.locator(`.us2-timeframes [data-tf="${interval}"]`).click();
        await page.waitForFunction(count=>window.__deviceSeries?.data().length===count,count);
      }
      const realCloses=packet.histories.SPY.slice(-400).map(bar=>bar.close);
      assert.deepEqual(await page.evaluate(()=>window.__deviceSeries.data().map(bar=>bar.close)),realCloses);
      await page.locator('[data-collapse]').click();
      await page.locator('[data-expand]').click();
      await page.locator('.us2-chart-root .chart-drawing-tools [data-action="menu"]').click();
      await page.locator('.us2-chart-root [data-draw="horizontal"]').click();
      await page.locator('.us2-chart-root .chart-drawing-layer').click({position:{x:120,y:200}});
      await page.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('ox-us-v2-device-eod-chart-drawings-v1')||'{}')).some(rows=>rows.length>0));
      await page.locator('[data-exit-focus]').click();
      await page.locator('[data-collapse]').click();
      await page.screenshot({path:`${output}/radar-${width}.png`,fullPage:true,animations:"disabled"});
      await selectView(page,'home'); await page.waitForFunction(()=>document.querySelector('.us2-ohlc')?.textContent.startsWith('SPY '));
      assert.ok(await page.locator('.us2-home-watch [data-symbol]').count()>0);
      assert.ok(await page.locator('.us2-home-sectors [data-symbol]').count()>0);
      await page.screenshot({path:`${output}/home-${width}.png`,fullPage:true,animations:"disabled"});
      await selectView(page,'strength'); await page.locator('[data-tool-tab="bubbles"]').click();
      const bubbles=page.locator('.us2-bubbles-host');
      await page.waitForFunction(()=>Number(document.querySelector('.us2-bubbles-host')?.shadowRoot?.querySelector('canvas')?.dataset.coins)>0);
      assert.equal(await bubbles.locator('.oxb-asset-grid [data-asset]').count(),50);
      await bubbles.locator('.oxb-zoom select').selectOption('30');
      assert.equal(await bubbles.locator('.oxb-asset-grid [data-asset]').count(),30);
      await bubbles.locator('[data-action="metric-menu"]').click();
      await bubbles.locator('[data-bubble-metric="volume"]').click();
      assert.equal(await bubbles.locator('canvas').getAttribute('data-metric'),'volume');
      await bubbles.locator('[data-action="metric-menu"]').click();
      await bubbles.locator('[data-bubble-metric="change"]').click();
      const bubbleSymbol=await bubbles.locator('[data-asset]').first().getAttribute('data-asset');
      await bubbles.locator('[data-asset]').first().click();
      assert.match(await bubbles.locator('.oxb-dialog').innerText(),/2026-09-30/);
      await bubbles.locator('[data-action="radar"]').click();
      await page.waitForFunction(symbol=>document.querySelector('[data-search-open]')?.textContent.includes(symbol),bubbleSymbol);
      assert.equal(await page.locator('.us2-radar-layout').evaluate(node=>node.classList.contains('is-collapsed')),true);
      await selectView(page,'strength'); await page.locator('[data-tool-tab="bubbles"]').click();
      await page.screenshot({path:`${output}/bubbles-${width}.png`,fullPage:true,animations:"disabled"});
      await page.locator('[data-tool-tab="patterns"]').click();
      const patterns=page.locator('.us2-pattern-host');
      await page.waitForFunction(()=>['ready','partial'].includes(document.querySelector('.us2-pattern-host')?.shadowRoot?.querySelector('.px')?.dataset.indexState)&&document.querySelector('.us2-pattern-host')?.shadowRoot?.querySelector('.px-card'),null,{timeout:120000});
      assert.ok(await patterns.locator('.px-card canvas').first().evaluate(canvas=>canvas.width>0));
      await page.screenshot({path:`${output}/patterns-${width}.png`,fullPage:true,animations:"disabled"});
      await patterns.locator('[data-action="timeframes"]').click();
      assert.deepEqual(await patterns.locator('[data-frame]').evaluateAll(nodes=>nodes.map(node=>node.dataset.frame)),['1D','1W','1M']);
      await patterns.locator('.px-settings [data-action="close"]').click();
      await patterns.locator('[data-action="patterns"]').click();
      assert.ok(await patterns.locator('[data-count]').evaluateAll(nodes=>nodes.some(node=>Number(node.textContent)>0)));
      await patterns.locator('.px-presets [data-action="close"]').click();
      const resultSymbol=(await patterns.locator('.px-card').first().getAttribute('data-result')).split(':')[0];
      await patterns.locator('.px-card').first().click();
      await patterns.locator('[data-detail-frame="1W"]').click();
      await page.waitForFunction(()=>document.querySelector('.us2-pattern-host')?.shadowRoot?.querySelector('.px-detail-title')?.textContent.includes('1W'));
      await patterns.locator('[data-action="open-radar"]').click();
      await page.waitForFunction(symbol=>document.querySelector('[data-search-open]')?.textContent.includes(symbol),resultSymbol);
      assert.equal(await page.locator('.us2-timeframes [data-tf="1W"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('.us2-radar-layout').evaluate(node=>node.classList.contains('is-collapsed')),true);
      await selectView(page,'strength'); await page.locator('[data-tool-tab="patterns"]').click();
      assert.equal(await patterns.locator('.px-board').evaluate(node=>node.classList.contains('is-scanning')),false,'Returning to the classified source reuses its session');
      const board=await patterns.locator('.px-board canvas').boundingBox();
      await page.mouse.move(board.x+board.width*.1,board.y+board.height*.65); await page.mouse.down();
      for(const [x,y] of [[.25,.35],[.4,.65],[.6,.3],[.8,.2]])await page.mouse.move(board.x+board.width*x,board.y+board.height*y,{steps:8});
      await page.mouse.up();
      // A freehand path need not resemble a named preset. Verify that the
      // completed stroke actually searched the cached index in either case.
      await page.waitForFunction(()=>{
        const root=document.querySelector('.us2-pattern-host')?.shadowRoot;
        return root?.querySelector('.px-hint')?.hidden && root?.querySelector('.px-status')?.textContent.includes('符合');
      });
      assert.equal(await patterns.locator('[data-action="undo"]').isDisabled(),false);
      await page.screenshot({path:`${output}/drawing-${width}.png`,fullPage:true,animations:"disabled"});
      await selectView(page,'radar');
      await page.locator('[data-search-open]').click();
      await page.locator('.us2-search input').fill('SPY');
      await page.locator('.us2-search-results [data-open-symbol="SPY"]').click();
      await page.locator('.us2-timeframes [data-tf="1D"]').click();
      await page.waitForFunction(()=>window.__deviceSeries?.data().length===400);
      assert.equal(apiCalls,before,'Device chart, scans and home never call the raw US backend');
      assert.equal(uploads,uploadBefore,'The personal file is never uploaded');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.reload(); await selectMarket(page,'us'); await page.click('#ox-control-close');
      await page.waitForFunction(()=>document.querySelector('[data-eod-date]')?.textContent.includes('本機 335 檔'),null,{timeout:120000});
      await page.waitForFunction(()=>window.__deviceSeries?.data().length===400);
      assert.ok(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('ox-us-v2-device-eod-chart-drawings-v1')||'{}')).some(rows=>rows.length>0)),'Native drawings survive reload');
      assert.equal(apiCalls,before,'Restoring the local file needs no raw US backend');
      await page.locator('[data-device-open]').click();
      await page.locator('.us2-device-picker input').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{}')});
      await page.waitForFunction(()=>document.querySelector('[data-device-status]')?.textContent.includes('請選擇 OX'));
      await page.locator('[data-close-device]').click();
      assert.match(await page.locator('[data-eod-date]').innerText(),/本機 335/);
      assert.deepEqual(errors,[]);
      if(width===390) {
        await page.locator('[data-device-open]').click(); await page.locator('[data-device-remove]').click();
        await page.waitForSelector('.us2-widget-stage iframe');
        assert.equal(await page.locator('.us2-chart-canvas').count(),0);
        assert.ok(!(await page.locator('[data-eod-date]').innerText()).includes('本機'));
      }
      report.push({width,realSymbols:335,dayBars:400,weeklyBars:91,monthlyBars:21,noUSApiAfterImport:true,noUploads:true,persistentDrawings:true,errors});
      await context.close();
      console.log(JSON.stringify(report.at(-1)));
    }
    writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
  } finally {if(browser)await browser.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
