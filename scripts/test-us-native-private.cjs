// Verify real daily OHLCV with the OX renderer on loopback only. Network API
// interception below does not enable public data display or intraday support.
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { server, preparePage, selectMarket, selectView, testBase } = require('./e2e-check.cjs');

(async () => {
  assert.equal(new URL(testBase).hostname, '127.0.0.1');
  const { snapshot, histories } = JSON.parse(readFileSync(process.env.US_PRIVATE_INPUT || '/tmp/ox-us-private-eod/evaluation.json'));
  assert.equal(snapshot.privateValidation, true);
  const output = process.env.US_PRIVATE_OUTPUT || '/tmp/ox-us-native-private';
  mkdirSync(output, { recursive: true });
  const engine = process.env.OX_BROWSER_ENGINE || 'chromium';
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({
    headless: true, ...(process.env.OX_BROWSER_PATH ? { executablePath: process.env.OX_BROWSER_PATH } : {}),
    ...(engine === 'chromium' ? { args: ['--no-sandbox'] } : {}),
  });
  await new Promise(resolve => server.listen(Number(process.env.OX_E2E_PORT || 4173), '127.0.0.1', resolve));
  const report = [];
  try {
    for (const width of (process.env.US_PRIVATE_WIDTHS || '390,430').split(',').map(Number)) {
      const context = await browser.newContext({ viewport: { width, height: 932 }, hasTouch: true, isMobile: true });
      const { page, audit } = await preparePage(context, { width, height: 932 });
      let phase = 'crypto';
      page.on('pageerror', error => console.error(JSON.stringify({ engine, width, phase, error: error.message })));
      await page.route('https://unpkg.com/**', route => route.fulfill({ contentType: 'text/javascript', body: readFileSync('/tmp/ox-lightweight-charts.js', 'utf8') + `
        { const real = window.LightweightCharts;
          window.LightweightCharts = { ...real, createChart(container, options) {
            const chart = real.createChart(container, options);
            if (container.classList.contains('us2-chart-canvas')) {
              window.__privateNativeChart = chart;
              const add = chart.addCandlestickSeries.bind(chart);
              chart.addCandlestickSeries = options => window.__privateNativeSeries = add(options);
            }
            return chart;
          } };
        }
      ` }));
      let outage = false;
      await page.route('**/api/v1/us/**', route => {
        const url = new URL(route.request().url()), endpoint = url.pathname.split('/').at(-1), symbol = url.searchParams.get('symbol') || 'SPY';
        if (outage && ['chart-v2', 'quote-v2'].includes(endpoint))
          return route.fulfill({ status: 429, json: { ok: false, error: { message: 'private retention test' } } });
        let data;
        if (endpoint === 'capabilities') data = { source: snapshot.source, chartMode: 'native',
          privateValidation: true, feed: '真實日 K · 僅私人驗證', delaySeconds: 86400, pollMs: 300000,
          volumeScope: 'FinMind USStockPrice 日線', extendedHours: false };
        else if (endpoint === 'snapshot') data = snapshot;
        else if (endpoint === 'quote-v2') data = { quote: snapshot.quotes.find(quote => quote.symbol === symbol) };
        else if (endpoint === 'chart-v2') {
          if (url.searchParams.get('interval') !== '1D')
            return route.fulfill({ status: 400, json: { ok: false, error: { message: '此私人資料僅有日 K，不以日 K 冒充盤中 K 線' } } });
          const to = url.searchParams.get('to'), limit = Number(url.searchParams.get('limit')) || 400;
          const available = (histories[symbol] || []).filter(bar => !to || bar.date <= to.slice(0, 10));
          data = { symbol, interval: '1D', bars: available.slice(-limit), source: snapshot.source,
            feed: '真實日 K · 僅私人驗證', adjustment: snapshot.adjustment,
            delaySeconds: 86400, receivedAt: snapshot.quotes.find(quote => quote.symbol === symbol)?.receivedAt,
            session: 'regular', volumeScope: 'FinMind USStockPrice 日線', historyExhausted: available.length < limit };
        } else return route.fulfill({ status: 404, json: {} });
        return route.fulfill({ json: { ok: true, data } });
      });
      await page.goto(testBase, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#screener-list .coin-card');
      await selectView(page, 'radar');
      const geometry = market => page.evaluate(market => {
        const root = market === 'crypto' ? '#view-radar' : '.us2-radar-pane';
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
        return { overflow: document.documentElement.scrollWidth - innerWidth,
          chart: rect(`${root} .chart-box`), list: rect(`${root} aside`),
          stage: rect(market === 'crypto' ? '#chart' : '.us2-chart-stage') };
      }, market);
      await page.waitForTimeout(500);
      const crypto = await geometry('crypto');
      phase = 'native radar';
      await selectMarket(page, 'us'); await page.click('#ox-control-close');
      await page.waitForFunction(() => document.querySelector('.us2-ohlc')?.textContent.startsWith('SPY '));
      await page.waitForTimeout(500);
      const native = await geometry('us');
      assert.equal(await page.locator('.us2-widget-stage').count(), 0, 'No provider iframe is used as the OX chart');
      assert.ok(Math.abs(native.list.x - crypto.list.x) < 2, 'Same right list position as Crypto');
      assert.ok(Math.abs(native.list.width - crypto.list.width) < 2, 'Same list width as Crypto');
      assert.ok(Math.abs(native.stage.height - crypto.stage.height) < 2, 'Same chart stage height as Crypto');
      assert.ok(native.overflow <= 1, 'No horizontal overflow');
      const gestures = await page.evaluate(async () => {
        const chart = window.__privateNativeChart, series = window.__privateNativeSeries;
        const canvas = document.querySelector('.us2-chart-canvas'), table = canvas.querySelector('table');
        const rect = canvas.getBoundingClientRect();
        const emit = (type, points, cell = table.rows[0].cells[1]) => {
          const touches = points.map(([x, y], identifier) => ({ identifier, target: cell, clientX: rect.left + x, clientY: rect.top + y }));
          // WebKit exposes Touch but does not allow its constructor. Dispatch
          // the same coordinates to the actual shared touch listeners.
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperties(event, { touches: { value: touches },
            targetTouches: { value: touches }, changedTouches: { value: touches } });
          cell.dispatchEvent(event);
        };
        const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const range = () => { const r = chart.timeScale().getVisibleLogicalRange(); return r.to - r.from; };
        const value = () => series.coordinateToPrice(180);
        const initial = range(), priceBefore = value();
        emit('touchstart', [[55, 160]]); emit('touchmove', [[55, 210]]); emit('touchend', []); await paint();
        const priceAfter = value();
        emit('touchstart', [[35, 150], [100, 180]]); emit('touchmove', [[20, 145], [130, 190]]); emit('touchend', []); await paint();
        return { initial, zoomed: range(), priceBefore, priceAfter, scrollDisabled: !chart.options().handleScroll.horzTouchDrag };
      });
      assert.ok(gestures.scrollDisabled, 'Shared OX gestures own mobile chart interaction');
      assert.ok(Math.abs(gestures.priceAfter - gestures.priceBefore) > .1, 'Vertical plot drag pans the real price viewport');
      assert.ok(gestures.zoomed < gestures.initial * .8, 'Pinch changes candle density');
      await page.screenshot({ path: resolve(output, `native-radar-${engine}-${width}.png`) });
      await page.locator('[data-collapse]').click();
      await page.waitForTimeout(650);
      const collapsed = await geometry('us');
      assert.ok(collapsed.chart.width > native.chart.width + 100);
      await page.locator('[data-collapse]').click();
      await page.locator('.us2-symbol-picker').click();
      await page.locator('.us2-search input').fill('TSM');
      await page.locator('.us2-search').evaluate(form => form.requestSubmit());
      await page.waitForFunction(() => document.querySelector('.us2-ohlc')?.textContent.startsWith('TSM '));
      const last = histories.TSM.at(-1);
      assert.ok((await page.locator('.us2-ohlc').textContent()).includes(last.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
      await page.locator('.us2-ticker [data-watch]').click();
      assert.equal(await page.locator('.us2-ticker [data-watch]').getAttribute('aria-pressed'), 'true');
      // Crypto exposes expansion after the right list is collapsed.
      await page.locator('[data-collapse]').click();
      await page.waitForTimeout(650);
      await page.locator('[data-expand]').click();
      await page.locator('.us2-chart-root [data-action="menu"]').click();
      await page.locator('.us2-chart-root [data-draw="trend"]').click();
      const stage = await page.locator('.us2-chart-stage').boundingBox();
      await page.mouse.move(stage.x + 45, stage.y + 80); await page.mouse.down();
      await page.mouse.move(stage.x + 130, stage.y + 130); await page.mouse.up();
      assert.ok(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ox-us-v2-finmind-private-eod-chart-drawings-v1') || '{}')).length) > 0);
      await page.locator('.us2-chart-root [data-action="none"]').click();
      await page.locator('[data-exit-focus]').click();
      outage = true;
      await page.locator('[data-indicator-open]').click();
      await page.locator('[data-retry]').click();
      await page.waitForFunction(() => document.querySelector('.us2-chart-message')?.textContent.includes('更新暫停'));
      assert.ok((await page.locator('.us2-ohlc').textContent()).startsWith('TSM '));
      await page.locator('[data-close-indicators]').click();
      outage = false;
      phase = 'patterns';
      await selectView(page, 'strength');
      await page.waitForFunction(() => document.querySelector('.us2-pattern-host')?.shadowRoot?.querySelector('.us2-pattern-status')?.textContent.includes('20 檔分析'));
      await page.screenshot({ path: resolve(output, `native-patterns-${engine}-${width}.png`) });
      const toolCounts = {};
      for (const tool of ['bubbles', 'heatmap', 'relative', 'ranking']) {
        phase = tool;
        await page.locator(`[data-tool-tab="${tool}"]`).click();
        if (tool === 'bubbles') {
          await page.locator('.us2-bubble-plot').waitFor();
          assert.ok((await page.locator('.us2-bubble-plot').evaluate(canvas => canvas.width)) > 100);
        }
        const selector = tool === 'heatmap' ? '.cfx-heat-list [data-symbol]' : '.us2-tool-list .us2-stock-row';
        toolCounts[tool] = await page.locator(selector).count();
        assert.ok(toolCounts[tool] > 0, `${tool} uses real analyzed daily rows`);
        assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
      }
      phase = 'home';
      await selectView(page, 'home');
      await page.waitForFunction(() => document.querySelector('.us2-ohlc')?.textContent.startsWith('SPY '));
      const homeCandidates = await page.locator('.ox-home-t1 .ox-home-t1-row').count();
      assert.ok(homeCandidates > 0, 'The native home uses real long/short OX tier candidates');
      assert.ok((await page.locator('.ox-home-t1-head').first().textContent()).includes('上漲 · T1/T2/T3'));
      assert.ok((await page.locator('.us2-display-source').textContent()).includes('FinMind'));
      await page.screenshot({ path: resolve(output, `native-home-${engine}-${width}.png`) });
      const homePriceFont = await page.locator('.us2-price-label strong').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
      assert.ok(homePriceFont <= 10, 'Home chart price badge stays compact');
      const candidateSymbol = await page.locator('.ox-home-t1-row').first().getAttribute('data-symbol');
      await page.locator('.ox-home-t1-row').first().click();
      await page.waitForFunction(symbol => document.querySelector('.us2-ohlc')?.textContent.startsWith(symbol + ' '), candidateSymbol);
      phase = 'news';
      await selectView(page, 'data');
      await page.locator('.us2-news-list').waitFor();
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
      phase = 'media';
      await selectView(page, 'media');
      await page.locator('.us2-media-content').waitFor();
      assert.equal(await page.locator('[data-market-choice="forex"]').count(), 0);
      assert.deepEqual(audit.pageErrors, []);
      report.push({ width, engine, crypto, native, collapsed, gestures, homeCandidates, toolCounts, source: snapshot.source,
        privateValidation: true, intervalsValidated: ['1D'], symbols: snapshot.analyses.length, errors: audit.pageErrors });
      await context.close();
    }
    writeFileSync(resolve(output, `report-${engine}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
