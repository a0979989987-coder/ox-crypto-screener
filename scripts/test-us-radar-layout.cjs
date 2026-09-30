// Geometry and interaction checks only. Crypto candles and provider frames are
// isolated fixtures; these captures do not verify real US market data.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { server, preparePage, selectMarket, selectView, testBase } = require('./e2e-check.cjs');

(async () => {
  const captureOnly = process.argv.includes('--capture-only');
  const before = process.argv.includes('--before');
  const output = process.env.OX_LAYOUT_OUTPUT || '/tmp/ox-us-radar-layout';
  mkdirSync(output, { recursive: true });
  const { FREE_US_DISPLAY } = await import('../src/markets/us/widget-config.js');
  await new Promise(r => server.listen(Number(process.env.OX_E2E_PORT || 4173), '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.OX_BROWSER_PATH, headless: true, args: ['--no-sandbox'] });
  const reports = [];
  const geometry = async (page, market) => page.evaluate(market => {
    const get = selector => {
      const node = document.querySelector(selector), rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const root = market === 'crypto' ? '#view-radar' : '.us2-radar-pane';
    const layout = document.querySelector(`${root} .workspace`);
    return {
      width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth,
      display: getComputedStyle(layout).display, columns: getComputedStyle(layout).gridTemplateColumns,
      chart: get(`${root} .chart-box`), list: get(`${root} aside`),
      stage: get(market === 'crypto' ? '#chart' : '.us2-widget-stage'),
      toolbar: get(`${root} .chart-controls`),
    };
  }, market);
  try {
    for (const width of (process.env.OX_LAYOUT_WIDTHS || '360,390,430,768,1366').split(',').map(Number)) {
      const context = await browser.newContext({ viewport: { width, height: 932 }, hasTouch: width < 600, isMobile: width < 600 });
      const { page, audit } = await preparePage(context, { width, height: 932 });
      if (before) {
        for (const file of ['src/styles/markets/us.css', 'src/markets/us/widget-chart.js']) {
          const body = execFileSync('git', ['show', `d2431a9:${file}`], { encoding: 'utf8' });
          await page.route(`**/${file}*`, route => route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript', body }));
        }
      }
      await page.route('https://unpkg.com/**', route => route.fulfill({ contentType: 'text/javascript', body: readFileSync('/tmp/ox-lightweight-charts.js', 'utf8') }));
      await page.route('**/api/v1/us/**', route => {
        const endpoint = new URL(route.request().url()).pathname.split('/').at(-1);
        const data = endpoint === 'capabilities' ? FREE_US_DISPLAY : {
          quotes: [], analyses: [], counts: { quoted: 0, scanned: 0 }, errorCode: 'RAW_DATA_UNAVAILABLE',
        };
        return route.fulfill({ json: { ok: true, data } });
      });
      await page.goto(testBase, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#screener-list .coin-card');
      await selectView(page, 'radar');
      await page.waitForTimeout(700);
      const crypto = await geometry(page, 'crypto');
      await page.screenshot({ path: resolve(output, `crypto-${width}.png`) });
      await selectMarket(page, 'us');
      await page.click('#ox-control-close');
      await page.waitForSelector('.us2-widget-stage iframe');
      await page.waitForTimeout(700);
      const us = await geometry(page, 'us');
      await page.screenshot({ path: resolve(output, `us-${width}.png`) });
      if (!captureOnly) {
        assert.equal(us.display, 'grid', `US ${width}: must reuse the Crypto grid`);
        assert.ok(Math.abs(us.list.x - crypto.list.x) < 2, `US ${width}: list must stay on the right at Crypto's x position`);
        assert.ok(Math.abs(us.list.width - crypto.list.width) < 2, `US ${width}: right track must match Crypto`);
        const alongside = Math.abs(crypto.list.y - crypto.chart.y) < 2;
        assert.ok(Math.abs((us.list.y - us.chart.y) - (crypto.list.y - crypto.chart.y)) < 2, `US ${width}: list placement matches Crypto`);
        assert.ok(Math.abs(us.chart.width - crypto.chart.width) < 2, `US ${width}: chart width must match Crypto`);
        assert.ok(Math.abs(us.stage.height - crypto.stage.height) < 2, `US ${width}: chart stage height must match Crypto`);
        if (alongside) assert.ok(Math.abs(us.chart.height - us.list.height) < 2, `US ${width}: right panel fills chart height`);
        assert.ok(us.overflow <= 1, `US ${width}: no page overflow`);

        const frameBefore = await page.locator('.us2-widget-stage iframe').getAttribute('src');
        await page.locator('[data-collapse]').click();
        await page.waitForTimeout(750);
        const collapsed = await geometry(page, 'us');
        console.log(JSON.stringify({ width, crypto, us, collapsed }));
        await page.screenshot({ path: resolve(output, `us-collapsed-${width}.png`) });
        if (alongside) assert.ok(collapsed.chart.width > us.chart.width + 100, 'collapsing gives the freed right track to the chart');
        assert.ok(collapsed.list.width <= 2, 'collapsed track does not leave empty space');
        assert.equal(await page.locator('.us2-widget-stage iframe').getAttribute('src'), frameBefore, 'collapse must not remount the provider frame');
        await page.locator('[data-collapse]').click();
        await page.waitForTimeout(750);
        assert.ok(Math.abs((await geometry(page, 'us')).list.x - us.list.x) < 2, 'reopening restores the right-hand list');

        await page.locator('.us2-tier').click();
        assert.equal(await page.locator('.us2-tier .radar-tier-current').textContent(), 'T1');
        await page.locator('.us2-tier').dispatchEvent('pointerdown', { button: 0, clientX: 0, clientY: 0 });
        await page.waitForTimeout(2100);
        assert.ok(await page.locator('.us2-tier-menu').isVisible(), 'long press opens before pointer release');
        await page.locator('.us2-tier').dispatchEvent('pointerup', { button: 0 });
        await page.locator('[data-tier="all"]').click();
        await page.locator('[data-side]').click();
        assert.ok((await page.locator('[data-side]').getAttribute('class')).includes('is-short'));
        assert.deepEqual(audit.pageErrors, [], 'no app runtime errors');
      }
      reports.push({ width, crypto, us, fixtureOnly: true, errors: audit.pageErrors });
      await context.close();
    }
    writeFileSync(resolve(output, 'geometry.json'), JSON.stringify(reports, null, 2));
    console.log(JSON.stringify(reports, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
