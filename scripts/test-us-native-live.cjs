// Local private acceptance: no US API interception and no public data publication.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { chromium, webkit } = require('playwright');
const { preparePage, selectMarket, selectView } = require('./e2e-check.cjs');
const port = Number(process.env.OX_E2E_PORT || 4186), base = `http://127.0.0.1:${port}`;
const output = process.env.US_PRIVATE_OUTPUT || '/tmp/ox-us-native-live';
const server = spawn(process.execPath, ['scripts/dev-server.mjs', '--us-private', '--port', String(port)], {
  cwd: require('node:path').resolve(__dirname, '..'), env: process.env, stdio: ['ignore', 'pipe', 'inherit'],
});
(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Private server startup timed out')), 10000);
      server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
      server.once('exit', code => { clearTimeout(timeout); reject(Error(`Private server exited: ${code}`)); });
    });
    const capResponse = await fetch(`${base}/api/v1/us/capabilities`), cap = (await capResponse.json()).data;
    assert.match(capResponse.headers.get('cache-control'), /no-store/);
    assert.equal(cap.privateValidation, true); assert.equal(cap.externalDisplayConfirmed, false);
    assert.equal((await fetch(`${base}/api/v1/us/capabilities`, { headers: { Origin: 'https://example.com' } })).status, 403);
    const engine = process.env.OX_BROWSER_ENGINE || 'chromium';
    browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
      executablePath: process.env.OX_BROWSER_PATH, ...(engine === 'chromium' ? { args: ['--no-sandbox'] } : {}) });
    mkdirSync(output, { recursive: true }); const report = [];
    for (const width of [390, 430]) {
      const context = await browser.newContext({ viewport: { width, height: 932 }, hasTouch: true, isMobile: true });
      await context.addInitScript(() => localStorage.setItem('ox-us-v2-chart-timeframes', JSON.stringify(['1m','5m','15m','30m','1H','4H','1D'])));
      const { page } = await preparePage(context, { width, height: 932 });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      let realChartResponses = 0;
      page.on('response', response => {
        if (response.url().startsWith(`${base}/api/v1/us/chart-v2`)) realChartResponses++;
      });
      await page.route('https://unpkg.com/**', route => route.fulfill({ contentType: 'text/javascript',
        body: readFileSync('/tmp/ox-lightweight-charts.js', 'utf8') + `
        {const real=window.LightweightCharts;window.LightweightCharts={...real,createChart(container,options){
          const chart=real.createChart(container,options);if(container.classList.contains('us2-chart-canvas')){
            const add=chart.addCandlestickSeries.bind(chart);chart.addCandlestickSeries=options=>window.__nativeLiveSeries=add(options);
          }return chart;}};}` }));
      // preparePage mocks other markets, but local /api/v1/us/* remains real HTTP.
      await page.goto(base); await selectView(page, 'radar');
      await selectMarket(page, 'us'); await page.click('#ox-control-close');
      const frames = [];
      for (const frame of cap.intervals) {
        console.log(JSON.stringify({ engine, width, interval: frame, phase: 'live backend' }));
        const url = `${base}/api/v1/us/chart-v2?symbol=SPY&interval=${frame}&limit=400`;
        let response = await fetch(url);
        if (response.status === 429) {
          const seconds = Math.max(60, Number(response.headers.get('retry-after')) || 60);
          assert.ok(seconds <= 60, 'Do not override a longer provider backoff');
          console.log(JSON.stringify({ engine, width, interval: frame, phase: 'respect Retry-After', seconds }));
          await response.arrayBuffer();
          await new Promise(resolve => setTimeout(resolve, seconds * 1000));
          response = await fetch(url);
        }
        const result = await response.json();
        assert.equal(response.status, 200, JSON.stringify(result));
        await page.locator(`.us2-timeframes [data-tf="${frame}"]`).click();
        const expected = result.data.bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));
        assert.ok(expected.length >= 60);
        await page.waitForFunction(expected => JSON.stringify(window.__nativeLiveSeries?.data().map(
          ({ time, open, high, low, close }) => ({ time, open, high, low, close }))) === JSON.stringify(expected), expected);
        frames.push({ interval: frame, bars: expected.length, source: result.data.source });
      }
      assert.equal(await page.locator('.us2-timeframes [data-tf="1W"]').count(), 0);
      assert.ok(realChartResponses >= 1, 'UI obtains candles through real local HTTP');
      assert.equal(await page.locator('.us2-timeframe-dialog .chart-timeframe-preferences input[value="1W"]').isDisabled(), true);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
      await page.waitForTimeout(550);
      await page.screenshot({ path: `${output}/native-live-${engine}-${width}.png`, fullPage: true });
      await selectView(page, 'home');
      await page.waitForFunction(() => document.querySelector('.us2-ohlc')?.textContent.startsWith('SPY '));
      assert.equal(await page.locator('[data-us-home-tf="1W"]').isVisible(), false);
      assert.deepEqual(errors, []); report.push({ width, frames, realChartResponses, errors });
      await context.close();
    }
    writeFileSync(`${output}/report-${engine}.json`, JSON.stringify({ realUSBackend: true, publicDisplayConfirmed: false, report }, null, 2));
    console.log(JSON.stringify({ engine, realUSBackend: true, widths: report.map(row => row.width), frames: cap.intervals }));
  } finally { if (browser) await browser.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
