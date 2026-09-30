// Route-isolated boot checks. No test quotes are saved or served by the website.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync, existsSync, statSync, mkdirSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium, webkit } = require('playwright');
const root = resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + '/') || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404); response.end('{}'); return;
  }
  response.setHeader('Content-Type', mime[extname(file)] || 'text/plain');
  response.end(readFileSync(file));
});
const chartStub = `
(() => {
  const series = el => ({
    setData(data){ el.dataset.seriesPoints = String(data?.length || 0); },
    update(){}, coordinateToPrice(){return 100}, setMarkers(){}, applyOptions(){}, priceScale(){return {applyOptions(){}, width(){return 60}, options(){return {scaleMargins:{top:.15,bottom:.2}}}}},
    createPriceLine(){return {}}, removePriceLine(){}, priceToCoordinate(){return 50}
  });
  const scale = { height(){return 30}, fitContent(){}, setVisibleLogicalRange(){}, getVisibleLogicalRange(){return {from:0,to:50}}, subscribeVisibleLogicalRangeChange(){}, unsubscribeVisibleLogicalRangeChange(){}, timeToCoordinate(){return 50}, coordinateToTime(){return 1}, scrollToRealTime(){}, applyOptions(){} };
  window.LightweightCharts = {
    CrosshairMode:{Normal:0}, LineStyle:{Dashed:1,Dotted:2},
    createChart(el){
      el.dataset.chartInitialized = "true";
      return {
        addCandlestickSeries(){return series(el)}, addHistogramSeries(){return series(el)}, addLineSeries(){return series(el)},
        timeScale(){return scale}, priceScale(){return {applyOptions(){}, width(){return 60}, options(){return {scaleMargins:{top:.15,bottom:.2}}}}}, applyOptions(){}, resize(){},
        subscribeClick(){}, subscribeCrosshairMove(){}, remove(){}
      };
    }
  };
})();`;
const output = process.env.OX_BOOT_OUTPUT || '/tmp/ox-boot-verification';
mkdirSync(output, { recursive: true });

async function verify(browser, engine, base, scenario, width) {
  const context = await browser.newContext({ viewport: { width, height: 932 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let blocked = scenario === 'module-failure';
  await page.addInitScript(({ corrupt }) => {
    window.WebSocket = class { constructor() { this.readyState = 0; } addEventListener() {} send() {} close() {} };
    if (corrupt) {
      localStorage.setItem('ox-us-v2:preferences', 'null');
      localStorage.setItem('ox-us-v2:watchlist', '{}');
      localStorage.setItem('ox-us-v2-chart-timeframes', '{}');
    }
  }, { corrupt: scenario === 'corrupt-storage' });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href.includes('tradingview.com/external-embedding/')) return route.abort();
    if (url.pathname.endsWith('/v1/us/capabilities')) return route.fulfill({json:{ok:true,data:{externalDisplayConfirmed:false,source:'twelve-data',extendedHours:false}}});
    if (url.pathname.endsWith('/v1/us/snapshot')) return route.fulfill({json:{ok:true,data:{schemaVersion:2,quotes:[],analyses:[],counts:{quoted:0,scanned:0},error:'行情展示授權未確認；公開掃描尚未開通。'}}});
    if (blocked && url.pathname === '/src/markets/us/config.js') return route.abort();
    if (url.origin === base) {
      if (url.pathname === '/' && scenario === 'late-module') {
        let html = readFileSync(resolve(root, 'index.html'), 'utf8');
        html = html.replace(/<script[^>]+src="src\/app\/(?:market-boot|app)\.js[^>]*><\/script>/g, '');
        return route.fulfill({ contentType: 'text/html', body: html });
      }
      if (url.pathname === '/data/us-snapshot.json') return route.fulfill({ json: { schemaVersion: 2, analyses: [], quotes: [], counts: { quoted: 0, scanned: 0 }, analysisIntervals: ['1D'] } });
      if (url.pathname === '/data/us-directory.json') return route.fulfill({ json: { schemaVersion: 2, items: [], receivedAt: Date.now() } });
      if (url.pathname.endsWith('/snapshot')) return route.fulfill({json:{ok:true,data:{schemaVersion:2,quotes:[],analyses:[],counts:{quoted:0,scanned:0},error:'行情展示授權未確認；公開掃描尚未開通。'}}});
      if (url.pathname.endsWith('/capabilities')) return route.fulfill({ json: {ok:true,data:{externalDisplayConfirmed:false,source:'twelve-data',extendedHours:false}} });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 403, json: { ok: false, error: { message: 'TEST FIXTURE：美股對外展示授權尚未確認。' } } });
      return route.continue();
    }
    if (url.href.includes('lightweight-charts')) return route.fulfill({ contentType: 'text/javascript', body: chartStub });
    if (url.pathname.includes('/v1/us/')) return route.fulfill({ status: 403, json: { ok: false, error: { message: 'TEST FIXTURE：美股對外展示授權尚未確認。' } } });
    return route.fulfill({ contentType: 'application/json', body: '{"code":"00000","data":[],"rates":{}}' });
  });
  await page.goto(base);
  await page.locator('#ox-control-open').click();
  const start = Date.now();
  await page.locator('[data-market-choice="us"]').click();
  await page.locator('#ox-control-close').click();
  if (scenario === 'late-module') {
    assert.equal(await page.locator('.us2-ticker').count(), 0);
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.src = '/src/app/market-boot.js?v=20260930-us-data4';
      document.body.append(script);
    });
  }
  if (scenario === 'module-failure') {
    await page.getByText('美股介面未能啟動', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '重新載入', exact: true }).count(), 1);
    await page.getByText('啟動診斷', { exact: true }).click();
    assert.equal(await page.locator('.us-boot-status details').getAttribute('open'), '');
    await page.screenshot({ path: `${output}/${engine}-${scenario}-${width}.png` });
    blocked = false;
    await page.getByRole('button', { name: '重新載入', exact: true }).click();
    await page.waitForFunction(() => document.readyState === 'complete' && window.OXModules);
    await page.locator('#ox-control-open').click();
    await page.locator('[data-market-choice="us"]').click();
    await page.locator('#ox-control-close').click();
  }
  await page.locator('.us2-ticker').waitFor({ timeout: 5000 });
  const mountedMs = Date.now() - start;
  await page.waitForFunction(() => document.querySelector('.us2-chart-message')?.textContent.includes('行情尚未開通'));
  const compact = await page.locator('.us2-chart-stage').evaluate(el => el.getBoundingClientRect().height);
  assert.ok(compact <= 140, `blocked chart occupies ${compact}px`);
  const layout = await page.locator('.us2-radar-layout').evaluate(el => {
    const chart=el.querySelector('.us2-chart-root').getBoundingClientRect();
    const list=el.querySelector('.us2-scanner').getBoundingClientRect();
    return {chartRight:chart.right,listLeft:list.left,chartBottom:chart.bottom,listTop:list.top};
  });
  assert.ok(layout.listTop >= layout.chartBottom-1, 'unavailable mobile scanner must follow compact chart');
  assert.equal(await page.locator('.us2-scanner').innerText().then(s=>s.includes('搜尋股票可查看真實報價')), false);
  assert.equal(await page.locator('.us2-timeframes .btn-tf').count(), 7);
  assert.equal(await page.locator('.us2-timeframe-dialog input').count(), 9);
  assert.equal(await page.locator('.us-boot-status').count(), 0);
  assert.equal(await page.locator('.market-unavailable-card:not([hidden])').count(), 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `overflow ${overflow}`);
  await page.screenshot({ path: `${output}/${engine}-${scenario}-${width}-resolved.png` });
  if (scenario !== 'module-failure') assert.deepEqual(errors, []);
  // Check that the mounted UI survives a round-trip through the existing market switch.
  await page.locator('#ox-control-open').click();
  await page.locator('[data-market-choice="crypto"]').click();
  await page.waitForFunction(() => document.body.dataset.market === 'crypto' && !document.body.dataset.usWorkspace);
  await page.locator('[data-market-choice="us"]').click();
  await page.locator('#ox-control-close').click();
  await page.locator('.us2-ticker').waitFor();
  await page.locator('.dock-btn[data-view-target="home"]').click();
  await page.waitForFunction(()=>document.querySelector('.us2-home-pane .us2-chart-message')?.textContent.includes('行情尚未開通'));
  const heroHeight=await page.locator('.us2-home-chart').evaluate(el=>el.getBoundingClientRect().height);
  assert.ok(heroHeight < 370, `unavailable homepage hero occupies ${heroHeight}px`);
  await page.screenshot({path:`${output}/${engine}-${scenario}-${width}-home.png`});
  console.log(JSON.stringify({ engine, scenario, width, mountedMs, overflow, compact, heroHeight, expectedGraphErrors: errors.length }));
  await context.close();
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const engine of ['chromium', ...(process.argv.includes('--webkit') ? ['webkit'] : [])]) {
      const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, ...(engine === 'chromium' && process.env.OX_BROWSER_PATH ? { executablePath: process.env.OX_BROWSER_PATH } : {}) });
      try {
        for (const scenario of ['normal', 'corrupt-storage', 'late-module', 'module-failure']) await verify(browser, engine, base, scenario, scenario === 'normal' ? 390 : 430);
      } finally { await browser.close(); }
    }
  } finally { server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
