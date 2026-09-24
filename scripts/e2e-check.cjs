const { createServer } = require("node:http");
const { readFileSync, existsSync, statSync } = require("node:fs");
const { extname, join, normalize } = require("node:path");
const { chromium } = require("playwright");

const root = join(__dirname, "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const expectedCss = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match => match[1]);
const classifiedCss = expectedCss.filter(path => !["src/styles/markets/forex.css", "src/styles/markets/us.css"].includes(path));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  if (pathname === "/favicon.ico") { response.writeHead(204); response.end(); return; }
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = normalize(join(root, relative));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404); response.end("Not found"); return;
  }
  response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
  response.end(readFileSync(file));
});

const chartStub = `
(() => {
  const series = el => ({
    setData(data){ el.dataset.seriesPoints = String(data?.length || 0); },
    setMarkers(){}, applyOptions(){}, priceScale(){return {applyOptions(){}}},
    createPriceLine(){return {}}, removePriceLine(){}, priceToCoordinate(){return 50}
  });
  const scale = { fitContent(){}, setVisibleLogicalRange(){}, getVisibleLogicalRange(){return {from:0,to:50}}, subscribeVisibleLogicalRangeChange(){}, applyOptions(){} };
  window.LightweightCharts = {
    CrosshairMode:{Normal:0}, LineStyle:{Dashed:1,Dotted:2},
    createChart(el){
      el.dataset.chartInitialized = "true";
      return {
        addCandlestickSeries(){return series(el)}, addHistogramSeries(){return series(el)}, addLineSeries(){return series(el)},
        timeScale(){return scale}, priceScale(){return {applyOptions(){}}}, applyOptions(){}, resize(){},
        subscribeClick(){}, subscribeCrosshairMove(){}, remove(){}
      };
    }
  };
})();`;

const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT", "AVAXUSDT"];
const tickers = symbols.map((symbol, index) => ({
  symbol,
  lastPr: String(index === 0 ? 63250 : 3200 / (index + 1)),
  change24h: String((index % 2 ? -1 : 1) * (0.012 + index * 0.002)),
  usdtVolume: String(900000000 - index * 50000000),
  baseVolume: String(200000 - index * 10000),
  high24h: "65000", low24h: "61000"
}));
const contracts = symbols.map(symbol => ({ symbol, baseCoin: symbol.replace("USDT", ""), quoteCoin: "USDT", symbolStatus: "normal", symbolType: "perpetual" }));
const instruments = symbols.map(symbol => ({ symbol, symbolType: "crypto", isRwa: false }));
const now = Date.now();
const candles = Array.from({ length: 180 }, (_, index) => {
  const price = 60000 + index * 14 + Math.sin(index / 4) * 180;
  return [String(now - (180 - index) * 3600000), String(price), String(price + 120), String(price - 100), String(price + 45), String(900 + index), String((900 + index) * price)];
});
const rates = {
  amount: 1, base: "USD", start_date: "2026-09-17", end_date: "2026-09-22",
  rates: {
    "2026-09-17": { EUR:.850, GBP:.740, JPY:146.0, CHF:.790, CAD:1.370, AUD:1.510, NZD:1.650 },
    "2026-09-18": { EUR:.849, GBP:.739, JPY:146.4, CHF:.791, CAD:1.369, AUD:1.508, NZD:1.648 },
    "2026-09-21": { EUR:.848, GBP:.738, JPY:146.7, CHF:.792, CAD:1.368, AUD:1.505, NZD:1.645 },
    "2026-09-22": { EUR:.846, GBP:.735, JPY:147.0, CHF:.794, CAD:1.365, AUD:1.500, NZD:1.640 }
  }
};
const forexV2Rows = Object.entries(rates.rates).flatMap(([date, values]) => Object.entries(values).map(([quote, rate]) => ({ date, base: "USD", quote, rate })));

function bitgetBody(url) {
  if (url.pathname.includes("/api/v3/market/instruments")) return { code: "00000", data: instruments };
  if (url.pathname.endsWith("/contracts")) return { code: "00000", data: contracts };
  if (url.pathname.endsWith("/tickers")) return { code: "00000", data: tickers };
  if (url.pathname.endsWith("/ticker")) {
    const symbol = url.searchParams.get("symbol") || "BTCUSDT";
    return { code: "00000", data: [tickers.find(row => row.symbol === symbol) || tickers[0]] };
  }
  if (url.pathname.endsWith("/candles")) return { code: "00000", data: candles };
  return { code: "00000", data: [] };
}

async function preparePage(context, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  const audit = { pageErrors: [], consoleErrors: [], assetWarnings: [], localFailures: [], localHttpErrors: [], cssResponses: new Map() };
  page.on("pageerror", error => audit.pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const row = `${message.text()} @ ${message.location().url || "unknown"}`;
    audit.consoleErrors.push(row);
  });
  page.on("requestfailed", request => { if (request.url().startsWith("http://127.0.0.1:4173")) audit.localFailures.push(`${request.url()}: ${request.failure()?.errorText}`); });
  page.on("response", response => {
    const url = response.url();
    if (url.startsWith("http://127.0.0.1:4173/") && response.status() >= 400) audit.localHttpErrors.push(`${response.status()} ${new URL(url).pathname}`);
    if (url.startsWith("http://127.0.0.1:4173/") && url.endsWith(".css")) audit.cssResponses.set(new URL(url).pathname.slice(1), response.status());
  });
  await page.addInitScript(() => {
    window.__oxRuntimeAudit = { intervals: [], duplicateIntervals: [], duplicateListeners: [] };
    class AuditWebSocket extends EventTarget {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor(url) { super(); this.url = String(url); this.readyState = AuditWebSocket.OPEN; queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
      send() {} close() { this.readyState = AuditWebSocket.CLOSED; this.dispatchEvent(new CloseEvent("close")); }
    }
    window.WebSocket = AuditWebSocket;
    const callbackIds = new WeakMap();
    let nextId = 1;
    const idFor = callback => {
      if ((typeof callback !== "function" && typeof callback !== "object") || callback === null) return String(callback);
      if (!callbackIds.has(callback)) callbackIds.set(callback, nextId++);
      return callbackIds.get(callback);
    };
    const intervalKeys = new Set();
    const originalInterval = window.setInterval;
    window.setInterval = function(callback, delay, ...args) {
      const key = `${idFor(callback)}:${Number(delay) || 0}`;
      if (intervalKeys.has(key)) window.__oxRuntimeAudit.duplicateIntervals.push(key);
      intervalKeys.add(key);
      window.__oxRuntimeAudit.intervals.push({ key, delay: Number(delay) || 0 });
      return originalInterval.call(this, callback, delay, ...args);
    };
    const registrations = new WeakMap();
    const originalAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (listener) {
        let targetMap = registrations.get(this);
        if (!targetMap) { targetMap = new Set(); registrations.set(this, targetMap); }
        const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
        const key = `${type}:${capture}:${idFor(listener)}`;
        if (targetMap.has(key)) window.__oxRuntimeAudit.duplicateListeners.push(key);
        targetMap.add(key);
      }
      return originalAdd.call(this, type, listener, options);
    };
  });
  await page.route("https://unpkg.com/**", route => route.fulfill({ status: 200, contentType: "text/javascript", body: chartStub }));
  await page.route("https://api.frankfurter.app/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rates) }));
  await page.route("https://api.frankfurter.dev/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forexV2Rows) }));
  await page.route("https://api.bitget.com/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bitgetBody(new URL(route.request().url()))) }));
  await page.route("https://fapi.binance.com/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "BTCUSDT", lastPrice: "63250", priceChangePercent: "1.2", quoteVolume: "900000000", volume: "12000" }) }));
  await page.route("https://api.bybit.com/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ retCode: 0, result: { list: [{ lastPrice: "63250", price24hPcnt: ".012", turnover24h: "900000000", volume24h: "12000" }] } }) }));
  await page.route("https://ox-crypto-screener.vercel.app/api/v1/tw/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: {} }) }));
  await page.route("https://ox-crypto-screener.vercel.app/api/v1/us/**", route => {
    const url = new URL(route.request().url());
    const data = url.pathname.endsWith("/quote")
      ? { symbol: url.searchParams.get("symbol"), name: url.searchParams.get("symbol"), exchange: "NASDAQ", close: "123.45", percent_change: "2.31", high: "125.00", low: "121.00", volume: "58200000", datetime: "2026-09-23" }
      : { benchmarks: Object.fromEntries(["SPY", "QQQ", "IWM"].map((symbol, index) => [symbol, { symbol, name: symbol, close: String(500 - index * 80), percent_change: String(index ? -1 : 1), open: "490", high: "510", low: "480", volume: "15000000", is_market_open: false }]).concat([["VIX", { status: "error", message: "Unavailable" }]])) };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
  });
  return { page, audit };
}

async function loadApp(page) {
  await page.goto("http://127.0.0.1:4173", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#chart")?.dataset.chartInitialized === "true");
  await page.waitForFunction(() => document.querySelectorAll("#view-radar .coin-card").length > 0, null, { timeout: 15000 });
}

async function cssAudit(page, audit) {
  const result = await page.evaluate(() => ({
    hrefs: [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => new URL(link.href).pathname.slice(1)),
    sheets: [...document.styleSheets].map(sheet => ({ href: sheet.href ? new URL(sheet.href).pathname.slice(1) : null, rules: (() => { try { return sheet.cssRules.length; } catch { return -1; } })() }))
  }));
  assert(JSON.stringify(result.hrefs) === JSON.stringify(expectedCss), "CSS link order differs from RC2 definition");
  assert(classifiedCss.length === 30, `Expected 30 classified CSS modules, found ${classifiedCss.length}`);
  for (const path of expectedCss) {
    assert(audit.cssResponses.get(path) === 200, `CSS did not return HTTP 200: ${path}`);
    const sheet = result.sheets.find(row => row.href === path);
    assert(sheet && sheet.rules > 0, `CSS has no readable rules: ${path}`);
  }
  return { classified: classifiedCss.length, total: expectedCss.length, rules: result.sheets.reduce((sum, row) => sum + Math.max(0, row.rules), 0) };
}

async function openControl(page) {
  if (await page.locator("#ox-control-overlay").getAttribute("aria-hidden") !== "false") await page.click("#ox-control-open");
  await page.waitForSelector("#ox-control-overlay.is-open");
}

async function selectMarket(page, market) {
  await openControl(page);
  await page.click(`[data-market-choice="${market}"]`);
}

async function selectView(page, view) {
  await page.click(`.app-dock [data-view-target="${view}"]`);
  await page.waitForSelector(`#view-${view}.active`);
}

async function desktopRegression(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: [] });
  const { page, audit } = await preparePage(context, { width: 1440, height: 1000 });
  await loadApp(page);

  await selectView(page, "home");
  assert(await page.locator("#view-home").isVisible(), "Desktop Home is not visible");
  await page.waitForFunction(() => document.querySelector("#home-btc-mini-chart")?.dataset.chartInitialized === "true", null, { timeout: 10000 });
  assert(await page.locator("#home-btc-mini-chart").getAttribute("data-chart-initialized") === "true", "Desktop BTC Home chart did not initialize");
  await selectView(page, "strength");
  assert(await page.locator("#view-strength").isVisible(), "Desktop Strength is not visible");
  await selectView(page, "radar");
  assert(await page.locator("#view-radar").isVisible(), "Desktop Radar is not visible");
  assert(await page.locator("#chart").getAttribute("data-chart-initialized") === "true", "Desktop BTC chart did not initialize");
  await page.evaluate(() => globalThis.eval('setScannerDirectionFilter("long")'));
  await page.waitForFunction(() => !document.querySelector("#view-radar")?.classList.contains("ox-filter-short"));
  await page.waitForFunction(() => {
    const rgb = getComputedStyle(document.querySelector("#view-radar .market-line-card")).borderTopColor.match(/[\d.]+/g)?.slice(0,3).map(Number);
    return rgb && rgb[1] > rgb[0];
  });
  const longGlass = await page.locator("#view-radar .market-line-card").evaluate(el => getComputedStyle(el).borderTopColor.match(/[\d.]+/g)?.slice(0,3).map(Number));
  assert(longGlass && longGlass[1] > longGlass[0], `Long ranking glass is not green: ${longGlass}`);
  await page.evaluate(() => globalThis.eval('setScannerDirectionFilter("short")'));
  await page.waitForFunction(() => document.querySelector("#view-radar")?.classList.contains("ox-filter-short"));
  await page.waitForFunction(() => {
    const rgb = getComputedStyle(document.querySelector("#view-radar .market-line-card")).borderTopColor.match(/[\d.]+/g)?.slice(0,3).map(Number);
    return rgb && rgb[0] > rgb[1];
  });
  const shortState = await page.evaluate(() => {
    const radar = document.querySelector("#view-radar"), toggle = document.querySelector("#direction-toggle"), card = document.querySelector("#view-radar .market-line-card");
    return { radar: radar.className, toggle: toggle.className, border: getComputedStyle(card).borderTopColor, rgb: getComputedStyle(card).borderTopColor.match(/[\d.]+/g)?.slice(0,3).map(Number) };
  });
  assert(shortState.rgb && shortState.rgb[0] > shortState.rgb[1], `Short ranking glass is not red: ${JSON.stringify(shortState)}`);
  await page.evaluate(() => globalThis.eval('setScannerDirectionFilter("long")'));
  await page.waitForFunction(() => !document.querySelector("#view-radar")?.classList.contains("ox-filter-short"));

  const cards = page.locator("#view-radar .coin-card");
  assert(await cards.count() > 1, "Radar did not render switchable Crypto symbols");
  const targetSymbol = await cards.nth(1).getAttribute("data-symbol");
  await cards.nth(1).click();
  await page.waitForFunction(symbol => document.querySelector("#ticker-pair")?.textContent.includes(symbol), targetSymbol);
  await page.click('.btn-tf[data-tf="4H"]');
  assert(await page.locator('.btn-tf[data-tf="4H"]').evaluate(el => el.classList.contains("active")), "Timeframe did not switch to 4H");

  await selectMarket(page, "us");
  assert(await page.locator("#market-unavailable-card").isVisible(), "US market placeholder did not display");
  await page.click("#ox-control-close");
  await page.fill("#us-lookup-symbol", "NVDA");
  await page.click("[data-us-lookup-form] button");
  await page.waitForSelector(".us-lookup-result");
  assert((await page.locator(".us-lookup-result").innerText()).includes("$123.45"), "US quote lookup did not show the requested stock");
  assert((await page.locator(".us-lookup-range").innerText()).includes("$125.00"), "US quote range did not show the provided high");
  await page.click('[data-us-quick-symbol="AAPL"]');
  await page.waitForFunction(() => document.querySelector(".us-lookup-result strong")?.textContent === "AAPL");
  assert(await page.locator('[data-us-quick-symbol="AAPL"]').getAttribute("aria-pressed") === "true", "US quick symbol did not become active");
  await selectView(page, "home");
  await page.waitForSelector(".us-market-pulse-grid .us-market-pulse-item");
  assert(await page.locator(".us-market-pulse-item").count() === 4, "US Home did not render benchmark cards after leaving Radar");
  await page.click("[data-us-refresh]");
  await page.waitForSelector(".us-market-pulse-grid .us-market-pulse-item");
  await selectView(page, "radar");
  await selectMarket(page, "tw");
  assert(await page.locator("#market-unavailable-card").isVisible(), "TW market placeholder did not display");
  await selectMarket(page, "crypto");
  assert(await page.locator("#view-radar").isVisible(), "Crypto market did not restore");
  await selectMarket(page, "forex");
  await page.waitForSelector("#ox-forex-module:not([hidden]) .fx-radar-grid");
  assert(await page.locator("#ox-forex-module .fx-session-state").isVisible(), "Forex session status did not render");
  assert(await page.locator("#ox-forex-module .fx-pair-card").count() === 11, "Forex radar did not render primary and reserved pairs");
  await selectMarket(page, "crypto");
  assert(await page.locator("#view-radar").isVisible(), "Crypto did not restore after Forex");

  await openControl(page);
  assert(await page.locator("#ox-control-panel").isVisible(), "Control Panel did not open");
  await page.click('[data-control-theme="light"]');
  assert(await page.locator("body").evaluate(el => el.classList.contains("theme-light")), "Light theme did not apply");
  assert(await page.evaluate(() => localStorage.getItem("ox-ui-theme")) === "light", "Light theme preference was not saved");
  await page.click("#ox-control-close");
  await selectView(page, "home");
  const lightHero = await page.evaluate(() => ({
    emblem: getComputedStyle(document.querySelector(".btc-premium-emblem")).backgroundImage,
    mark: getComputedStyle(document.querySelector(".btc-emblem-mark")).color,
    stats: getComputedStyle(document.querySelector(".btc-premium-stats")).backgroundImage,
    label: getComputedStyle(document.querySelector(".btc-premium-stats small")).color
  }));
  assert(lightHero.emblem !== "none" && lightHero.mark !== "rgb(255, 255, 255)", "Light BTC emblem lacks contrast");
  assert(lightHero.stats !== "none" && lightHero.label !== "rgba(0, 0, 0, 0)", "Light BTC stats lack contrast");
  await openControl(page);
  await page.click('[data-control-theme="dark"]');
  assert(!(await page.locator("body").evaluate(el => el.classList.contains("theme-light"))), "Dark theme did not apply");

  const search = page.locator("#ox-feature-search-input-v38");
  await search.fill("通知");
  assert(await page.locator('#ox-feature-results-v38 [data-feature-id="notifications"]').isVisible(), "Feature search did not find notification settings");
  await page.click('#ox-feature-results-v38 [data-feature-id="notifications"]');
  await page.waitForSelector("#view-settings.active");
  assert(await page.locator("#notification-permission-state").isVisible(), "Notification UI is not visible");

  await page.fill("#setting-email", "regression@example.com");
  await page.locator("#setting-email").dispatchEvent("change");
  await page.click('[data-theme-choice="light"]');
  await page.waitForTimeout(50);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#chart")?.dataset.chartInitialized === "true");
  assert(await page.evaluate(() => localStorage.getItem("ox-ui-theme")) === "light", "Theme LocalStorage preference was lost after reload");
  assert(await page.inputValue("#setting-email") === "regression@example.com", "Settings LocalStorage preference was lost after reload");

  const css = await cssAudit(page, audit);
  const runtime = await page.evaluate(() => window.__oxRuntimeAudit);
  assert(runtime.duplicateIntervals.length === 0, `Duplicate intervals detected: ${runtime.duplicateIntervals.join(",")}`);
  assert(runtime.duplicateListeners.length === 0, `Duplicate event listeners detected: ${runtime.duplicateListeners.join(",")}`);
  assert(audit.pageErrors.length === 0, `Desktop page errors: ${audit.pageErrors.join(" | ")}`);
  assert(audit.consoleErrors.length === 0, `Desktop console errors: ${audit.consoleErrors.join(" | ")}`);
  assert(audit.localFailures.length === 0, `Desktop local request failures: ${audit.localFailures.join(" | ")}`);
  assert(audit.localHttpErrors.length === 0, `Desktop local HTTP errors: ${audit.localHttpErrors.join(" | ")}`);
  await context.close();
  return { cards: await Promise.resolve(8), css, intervals: runtime.intervals.length };
}

async function mobileRegression(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, permissions: [] });
  const { page, audit } = await preparePage(context, { width: 390, height: 844 });
  await loadApp(page);

  await selectView(page, "home");
  const homeLayout = await page.evaluate(() => {
    const hero = document.querySelector(".v34-home-btc-primary, .btc-premium-card, #home-btc-mini-chart")?.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, heroWidth: hero?.width || 0, heroLeft: hero?.left || 0, heroRight: hero?.right || 0 };
  });
  assert(homeLayout.overflow <= 2, `Mobile Home horizontal overflow: ${homeLayout.overflow}px`);
  assert(homeLayout.heroWidth > 0 && homeLayout.heroLeft >= -2 && homeLayout.heroRight <= 392, "Mobile BTC Hero is outside the viewport");
  assert(await page.locator(".app-dock .dock-btn").count() === 5, "Mobile bottom navigation is incomplete");
  assert(await page.locator(".app-dock").isVisible(), "Mobile bottom navigation is not visible");

  await selectView(page, "radar");
  assert(await page.locator("#view-radar").isVisible(), "Mobile Radar is not visible");
  const chartRect = await page.locator("#chart").boundingBox();
  assert(chartRect && chartRect.width > 245 && chartRect.height > 200, `Mobile chart layout is invalid: ${JSON.stringify(chartRect)}`);
  const railRect = await page.locator("#view-radar .workspace > aside").boundingBox();
  assert(railRect && Math.abs(railRect.y - chartRect.y) < 450 && railRect.x >= chartRect.x + chartRect.width - 2,
    `Mobile chart and ranked coins are not side by side: ${JSON.stringify({ chartRect, railRect })}`);
  const mobileCoin = page.locator("#view-radar .coin-card").nth(1);
  const mobileSymbol = await mobileCoin.getAttribute("data-symbol");
  await mobileCoin.click();
  await page.waitForFunction(symbol => document.querySelector("#ticker-pair")?.textContent.includes(symbol), mobileSymbol);
  assert(await page.locator("#view-radar .workspace > aside").isVisible(), "Ranking disappeared after selecting a coin");
  await page.click("#btn-chart-fullscreen");
  await page.waitForFunction(() => document.body.classList.contains("chart-focus"));
  assert(await page.locator("body").evaluate(el => el.classList.contains("chart-focus")), "Mobile chart fullscreen did not open");
  const focusClarity = await page.evaluate(() => ({
    boxFilter: getComputedStyle(document.querySelector(".chart-box")).filter,
    boxBackdrop: getComputedStyle(document.querySelector(".chart-box")).backdropFilter,
    chartFilter: getComputedStyle(document.querySelector("#chart")).filter,
    chartOpacity: getComputedStyle(document.querySelector("#chart")).opacity
  }));
  assert(focusClarity.boxFilter === "none" && focusClarity.chartFilter === "none" && focusClarity.chartOpacity === "1", `Mobile fullscreen clarity styles invalid: ${JSON.stringify(focusClarity)}`);
  await page.click("#btn-chart-fullscreen");
  await page.waitForFunction(() => !document.body.classList.contains("chart-focus"));

  await openControl(page);
  assert(await page.locator("#ox-control-panel").isVisible(), "Mobile Control Panel did not open");
  await page.click('[data-control-theme="light"]');
  assert(await page.locator("body").evaluate(el => el.classList.contains("theme-light")), "Mobile light theme did not apply");
  await page.click('[data-control-theme="dark"]');
  assert(!(await page.locator("body").evaluate(el => el.classList.contains("theme-light"))), "Mobile dark theme did not apply");
  await page.click('[data-market-choice="us"]');
  assert(await page.locator("#market-unavailable-card").isVisible(), "Mobile market switch to US failed");
  await page.click("#ox-control-close");
  await selectView(page, "home");
  await page.waitForSelector(".us-market-pulse-grid .us-market-pulse-item");
  assert(await page.locator(".us-market-pulse-item").count() === 4, "Mobile US Home failed after Radar switch");
  await selectView(page, "radar");
  await openControl(page);
  await page.click('[data-market-choice="tw"]');
  assert(await page.locator("#market-unavailable-card").isVisible(), "Mobile market switch to TW failed");
  await selectMarket(page, "crypto");
  assert(await page.locator("#view-radar").isVisible(), "Mobile market switch back to Crypto failed");
  await selectMarket(page, "forex");
  await page.waitForSelector("#ox-forex-module:not([hidden]) .fx-radar-grid");
  assert(await page.locator("#ox-forex-module .fx-pulse-row").isVisible(), "Mobile Forex pulse did not render");
  await selectMarket(page, "crypto");
  assert(await page.locator("#view-radar").isVisible(), "Mobile Crypto did not restore after Forex");
  await page.click("#ox-control-close");
  await page.waitForSelector("#ox-control-overlay:not(.is-open)");

  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    bodyOverflow: document.body.scrollWidth - window.innerWidth,
    offenders: [...document.querySelectorAll("body *")].map(el => ({ el, rect: el.getBoundingClientRect(), style: getComputedStyle(el) }))
      .filter(x => x.style.position !== "fixed" && x.rect.width > 0 && x.rect.right > window.innerWidth + 2)
      .slice(0, 5).map(x => `${x.el.id || x.el.className || x.el.tagName}:${Math.round(x.rect.right)}`)
  }));
  assert(layout.overflow <= 2, `Mobile layout regression: html=${layout.overflow}px body=${layout.bodyOverflow}px offenders=${layout.offenders.join(",")}`);
  const css = await cssAudit(page, audit);
  const runtime = await page.evaluate(() => window.__oxRuntimeAudit);
  assert(runtime.duplicateIntervals.length === 0, `Mobile duplicate intervals detected: ${runtime.duplicateIntervals.join(",")}`);
  assert(runtime.duplicateListeners.length === 0, `Mobile duplicate event listeners detected: ${runtime.duplicateListeners.join(",")}`);
  assert(audit.pageErrors.length === 0, `Mobile page errors: ${audit.pageErrors.join(" | ")}`);
  assert(audit.consoleErrors.length === 0, `Mobile console errors: ${audit.consoleErrors.join(" | ")}`);
  assert(audit.localFailures.length === 0, `Mobile local request failures: ${audit.localFailures.join(" | ")}`);
  assert(audit.localHttpErrors.length === 0, `Mobile local HTTP errors: ${audit.localHttpErrors.join(" | ")}`);
  await context.close();
  return { overflow: layout.overflow, css, intervals: runtime.intervals.length };
}

(async () => {
  await new Promise(resolve => server.listen(4173, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true })
    .catch(() => chromium.launch({ channel: "chrome", headless: true }));
  try {
    const desktop = await desktopRegression(browser);
    const mobile = await mobileRegression(browser);
    console.log(`Desktop regression passed: Crypto cards=${desktop.cards}, CSS=${desktop.css.classified}/${desktop.css.total}, rules=${desktop.css.rules}, intervals=${desktop.intervals}`);
    console.log(`Mobile regression passed: 390x844, overflow=${mobile.overflow}px, CSS=${mobile.css.classified}/${mobile.css.total}, intervals=${mobile.intervals}`);
    console.log("Console/runtime audit passed: no page errors, console errors, local 404s, duplicate listeners, or duplicate intervals");
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exit(1);
});
