// Layout regression for the actual shell and all three markets. Market fixtures
// are isolated in this browser context; this script never writes production data.
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium, webkit } = require('playwright');
const { server, preparePage, selectMarket, testBase } = require('./e2e-check.cjs');
const root = resolve(__dirname, '..');
const read = file => JSON.parse(readFileSync(resolve(root, 'data', file), 'utf8'));
const home = read('tw-home.json'), research = read('tw-research.json'), radar = read('tw-radar.json').data;
const output = process.env.OX_UI_QA_OUT || '/tmp/ox-market-ui-audit';
const engine = process.env.OX_UI_QA_ENGINE || 'chromium';
const report = { engine, layouts: [], errors: [], passed: false };
mkdirSync(output, { recursive: true });

async function settle(page) {
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.evaluate(() => document.fonts.ready);
  // Check the rendered layout over consecutive animation frames, rather than
  // snapshotting the first skeleton or waiting for endlessly polling networks.
  await page.evaluate(() => new Promise(resolve => {
    let previous = '', same = 0, attempts = 0;
    const frame = () => {
      const visible = [...document.querySelectorAll('.app-view.active,#market-unavailable-card')]
        .filter(node => node.getBoundingClientRect().height > 0);
      const current = visible.map(node => `${node.clientWidth}:${node.clientHeight}:${node.textContent.length}`).join('|');
      same = current === previous ? same + 1 : 0; previous = current;
      if (same >= 8 || ++attempts > 180) resolve(); else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));
}

async function layout(page, market, view, width) {
  await settle(page);
  const result = await page.evaluate(() => {
    const visible = node => node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
    const bounds = node => { const r = node.getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height }; };
    const nav = document.querySelector(innerWidth <= 720 ? '.app-dock' : '.ox-desktop-nav');
    const header = document.querySelector('.ox-shell-header');
    const marketPane = document.querySelector('#market-unavailable-card');
    const pane = visible(marketPane) ? marketPane : document.querySelector('.app-view.active');
    const content = pane?.querySelector('main,.twx,.twr-root,.tw-chart-radar,.ox-editorial-home') || pane;
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      nav: visible(nav) ? bounds(nav) : null, header: visible(header) ? bounds(header) : null,
      content: visible(content) ? bounds(content) : null,
      buttons: nav ? [...nav.querySelectorAll('[data-view-target]')].map(b => ({ target:b.dataset.viewTarget,...bounds(b) })) : [],
      viewport: { width:innerWidth,height:innerHeight },
      dialogs: [...document.querySelectorAll('dialog[open]')].map(bounds),
      rootHidden: !visible(pane),
    };
  });
  const label = `${market}/${view}/${width}`;
  assert.ok(result.overflow <= 1, `${label}: page overflow ${result.overflow}px`);
  assert.ok(result.content && !result.rootHidden, `${label}: content did not render`);
  assert.ok(result.nav, `${label}: primary navigation is missing`);
  assert.ok(result.nav.x >= -1 && result.nav.right <= width + 1, `${label}: navigation outside viewport`);
  if (width <= 720) {
    assert.ok(result.nav.bottom <= result.viewport.height + 1, `${label}: dock below viewport`);
    assert.equal(result.buttons.length, 5, `${label}: five dock entries`);
    for (const b of result.buttons) assert.ok(b.width >= 42 && b.height >= 42, `${label}: unusably small dock target ${b.target}`);
  }
  for (const dialog of result.dialogs) assert.ok(dialog.x >= 0 && dialog.right <= width + 1, `${label}: dialog clipped`);
  report.layouts.push({ market, view, width, ...result });
  await page.screenshot({ path:resolve(output, `${market}-${view}-${width}.png`) });
  console.log(JSON.stringify({ market, view, width, overflow:result.overflow, contentHeight:result.content.height }));
}

async function setup(browser, width) {
  const size = { width, height: width < 600 ? 844 : 900 };
  const context = await browser.newContext({ viewport:size, isMobile:width < 600, hasTouch:width < 600 });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin === testBase) return route.continue();
    return route.fulfill({ json:[] });
  });
  const { page, audit } = await preparePage(context, size);
  page.setDefaultTimeout(15000);
  await page.route('**/api/v1/tw/**', route => {
    const u = new URL(route.request().url()), section = u.searchParams.get('section');
    let data = {};
    if (u.pathname.endsWith('/home')) data = { section, data:home[section], checkedAt:new Date().toISOString(), status:'ok' };
    else if (u.pathname.endsWith('/research')) data = research;
    else if (u.pathname.endsWith('/radar')) data = radar;
    else if (u.pathname.endsWith('/quotes')) data = { quotes:[] };
    return route.fulfill({ json:{ ok:true, data } });
  });
  await page.route('**/api/v1/us/**', route => {
    const u = new URL(route.request().url());
    const data = u.pathname.endsWith('/snapshot')
      ? { schemaVersion:2,analyses:[],quotes:[],counts:{quoted:0,scanned:0},error:'UI fixture: public raw data unavailable' }
      : u.pathname.endsWith('/capabilities')
        ? { source:'finance-query-eod',chartMode:'widget',mode:'eod',intervals:['1D','1W','1M'],externalDisplayConfirmed:false,rawDataAvailable:false }
        : {};
    return route.fulfill({ json:{ok:true,data} });
  });
  return { context, page, audit };
}

(async () => {
  await new Promise(resolve => server.listen(Number(process.env.OX_E2E_PORT || 4173), '127.0.0.1', resolve));
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({headless:true,...(process.env.OX_BROWSER_PATH ? {executablePath:process.env.OX_BROWSER_PATH} : {})});
  try {
    for (const width of (process.env.OX_UI_QA_WIDTHS || '375,430,1366').split(',').map(Number)) {
      const { context, page, audit } = await setup(browser, width);
      try {
        await page.goto(testBase, {waitUntil:'domcontentloaded'});
        await page.locator('#view-radar .coin-card').first().waitFor();
        for (const market of ['crypto','tw','us']) {
          if (market !== 'crypto') {
            await selectMarket(page, market);
            await page.locator('#ox-control-close').click();
            await page.waitForFunction(() => {
              const overlay = document.querySelector('#ox-control-overlay');
              return overlay?.getAttribute('aria-hidden') === 'true' && getComputedStyle(overlay).pointerEvents === 'none';
            });
          }
          for (const view of ['home','radar','strength','data','media']) {
            const nav = width > 720 ? '.ox-desktop-nav' : '.app-dock';
            if (view === 'data') {
              if (width > 720) await page.locator(`${nav} [data-view-target="data"]`).click();
              else await page.locator(`${nav} [data-view-target="data"]`).tap();
              if (width > 720) await page.getByRole('menuitem',{name:'本市場新聞',exact:true}).click();
              await page.waitForFunction(() => document.body.dataset.view === 'data');
              await page.locator(market === 'us' ? '.us2-news-page' : '.oxn-root').waitFor();
            } else {
              await page.locator(`${nav} [data-view-target="${view}"]`).click();
              await page.waitForFunction(view => document.body.dataset.view === view,view);
            }
            if (market === 'tw' && view === 'home') await page.locator('.twx-core').waitFor();
            if (market === 'tw' && view === 'radar') await page.locator('.tw-stock-card').first().waitFor();
            if (market === 'us') await page.locator(`.us2-${view}-pane`).waitFor();
            if (view === 'strength') {
              // Excludes floating bubbles, covered by their dedicated physics QA.
              await page.getByRole('tab',{name:market === 'us' ? '型態畫板' : '型態搜尋',exact:true}).click();
              await page.locator('.px-board').waitFor();
            }
            await layout(page, market, view, width);
            if (market === 'us' && view === 'data') {
              await page.locator('.us2-news-card').first().waitFor();
              assert.equal(await page.locator('.us2-data-pane .media-card,.us2-data-pane .media-page').count(),0,'no legacy news background wrapper');
              const action = page.locator('.us2-news-card .ox-news-actions button').first();
              assert.ok((await action.boundingBox()).height >= 44,'news actions need readable touch targets');
              await action.click();await page.locator('.us2-article').waitFor();
              await layout(page,market,'article',width);
              await page.getByRole('button',{name:'返回新聞列表',exact:true}).click();
              await page.locator('.us2-news-card').first().waitFor();
            }
          }
        }
        report.errors.push(...audit.pageErrors);
        assert.deepEqual(audit.pageErrors, [], `runtime errors at ${width}px`);
      } finally { await context.close(); }
    }
    report.passed = true;
  } finally {
    writeFileSync(resolve(output,'report.json'), JSON.stringify(report,null,2));
    await browser.close(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; server.close(); });
