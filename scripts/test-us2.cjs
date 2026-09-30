// Browser fixtures are isolated with route interception. Never shipped as market data.
const { chromium } = require("playwright");
const { readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { pathToFileURL } = require("node:url");
const { resolve } = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const dir = resolve(__dirname, ".."),
    live = process.argv.includes("--live"),
    base = process.env.US_TEST_URL || "http://127.0.0.1:3000",
    out = process.env.US_TEST_OUTPUT || "/tmp/ox-us2-audit";
  mkdirSync(out, { recursive: true });
  const { nyEpoch, shiftDate, tradingDay } = await import(
    pathToFileURL(resolve(dir, "src/markets/us/calendar.js"))
  );
  const { normalizeQuote, normalizeCandles } = await import(
    pathToFileURL(resolve(dir, "src/markets/us/model.js"))
  );
  const { tierResults } = await import(
    pathToFileURL(resolve(dir, "src/markets/us/analysis.js"))
  );
  const snapshot = live
    ? JSON.parse(readFileSync(resolve(dir, "data/us-snapshot.json")))
    : null;
  const providerResponses = new Map(),
    errors = [];
  let nextLiveCall = 0;
  let chartCalls = 0,
    quoteCalls = 0,
    updated = false;
  const b = await chromium.launch({
    headless: true,
    executablePath:
      process.env.OX_BROWSER_PATH ||
      "/tmp/ox-browser/chrome-headless-shell-linux64/chrome-headless-shell",
    args: ["--no-sandbox"],
  });
  const makeBars = () => {
    const bars = [];
    for (
      let date = "2025-03-03";
      bars.length < 400;
      date = shiftDate(date, 1)
    ) {
      if (!tradingDay(date).open) continue;
      const i = bars.length,
        close = 100 + i * 0.14 + Math.sin(i / 7) * 2;
      bars.push({
        time: nyEpoch(date),
        date,
        open: close - 0.3,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1000000 + i * 100,
      });
    }
    return bars;
  };
  const bars = makeBars();
  const fixtureRows = [
    "SPY",
    "QQQ",
    "IWM",
    "NVDA",
    "TSM",
    "AAPL",
    "XOM",
    "JPM",
    "XLK",
  ].map((symbol, i) => ({
    symbol,
    name: symbol + " test fixture",
    type:
      i < 3 || symbol === "XLK" ? "ETF" : symbol === "TSM" ? "ADR" : "stock",
    interval: "1D",
    price: 150 + i,
    changePct: i - 3,
    liquidity: 40000000 + i * 1000000,
    rvol: 1 + i * 0.1,
    rs: i,
    ma20: 149,
    ma50: 140,
    gapPct: 2 + i,
    path: bars.slice(-40).map((c) => c.close),
    patterns: {
      long: [
        {
          id: "W",
          label: "W 底",
          forming: i % 3 !== 2,
          distance: i % 3 === 0 ? 1 : i % 3 === 1 ? 5 : 10,
        },
      ],
      short: [{ id: "M", label: "M 頂", forming: true, distance: 2 }],
    },
  }));
  const fixtureSnapshot = {
    schemaVersion: 2,
    asOf: new Date().toISOString(),
    counts: { quoted: 9, scanned: 9 },
    analyses: fixtureRows,
    analysisIntervals: ["1D"],
    quotes: fixtureRows.map((x) => ({
      symbol: x.symbol,
      price: x.price,
      changePct: x.changePct,
      marketTime: nyEpoch("2026-09-29", 960),
      receivedAt: Date.now(),
      marketOpen: false,
      delaySeconds: null,
    })),
  };
  const audits = [];
  for (const width of [360, 390, 430, 768, 1366]) {
    const context = await b.newContext({
      viewport: { width, height: width < 700 ? 844 : 900 },
      isMobile: width < 700,
      hasTouch: width < 700,
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push({ width, error: e.message, stack: e.stack }));
    await p.route("**/lightweight-charts.standalone.production.js", (r) =>
      r.fulfill({
        path: process.env.OX_CHART_LIBRARY || "/tmp/ox-lightweight-charts.js",
        contentType: "application/javascript",
      }),
    );
    if (!live)
      await p.route("**/data/us-snapshot.json", (r) =>
        r.fulfill({ json: fixtureSnapshot }),
      );
    await p.route(
      "https://ox-crypto-screener.vercel.app/api/v1/us/**",
      async (r) => {
        const u = new URL(r.request().url()),
          end = u.pathname.split("/").at(-1),
          symbol = u.searchParams.get("symbol") || "SPY";
        if (live) {
          if (end === "capabilities")
            return r.fulfill({ status: 404, json: {} });
          if (end === "chart-v2" || end === "quote-v2")
            return r.fulfill({ status: 404, json: {} });
          const key = u.href;
          if (!providerResponses.has(key)) {
            const wait = Math.max(0, nextLiveCall - Date.now());
            nextLiveCall = Math.max(Date.now(), nextLiveCall) + 500;
            const pending = (async () => {
              if (wait) await new Promise(resolve => setTimeout(resolve, wait));
              const raw = await fetch(key);
              return {status:raw.status, body:await raw.text()};
            })();
            providerResponses.set(key, pending);
          }
          const response = await providerResponses.get(key);
          return r.fulfill({ ...response, contentType: "application/json" });
        }
        if (end === "capabilities")
          return r.fulfill({
            json: {
              ok: true,
              data: {
                source: "twelve-data",
                feed: "TEST FIXTURE",
                pollMs: 60000,
                delaySeconds: null,
                extendedHours: false,
              },
            },
          });
        if (end === "quote-v2") {
          quoteCalls++;
          return r.fulfill({
            json: {
              ok: true,
              data: {
                quote: {
                  symbol,
                  price: symbol === "TSM" ? 210 : 150,
                  changePct: 1,
                  marketTime: nyEpoch("2026-09-29", 960),
                  receivedAt: Date.now(),
                  marketOpen: false,
                  delaySeconds: null,
                },
              },
            },
          });
        }
        if (end === "chart-v2") {
          chartCalls++;
          const data = structuredClone(bars);
          if (updated) {
            data.at(-1).close += 0.2;
            data.at(-1).high += 0.2;
          }
          const interval = u.searchParams.get("interval") || "1D",
            to = u.searchParams.get("to");
          return r.fulfill({
            json: {
              ok: true,
              data: {
                symbol,
                interval,
                bars: to ? [] : data,
                source: "twelve-data",
                feed: "TEST FIXTURE",
                adjustment: "splits",
                delaySeconds: null,
                receivedAt: Date.now(),
                session: "regular",
                volumeScope: "TEST FIXTURE",
                historyExhausted: true,
              },
            },
          });
        }
        return r.fulfill({ status: 404, json: {} });
      },
    );
    if (!live && width === 390) await p.clock.install();
    await p.goto(base);
    await p.waitForFunction(() => !!window.OXModules);
    await p.evaluate(() =>
      window.OXMarketController.setMarket("us", { toast: false }),
    );
    await p.waitForFunction(() =>
      document.querySelector(".us2-counts")?.textContent.includes("17,240"),
    );
    await p.waitForFunction(
      () => document.querySelector(".us2-ohlc")?.textContent.includes("收 "),
      { timeout: 25000 },
    );
    const overflow = await p.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(overflow.scroll <= width + 1, JSON.stringify(overflow));
    await p.screenshot({
      path: `${out}/${live ? "live" : "fixture"}-radar-${width}.png`,
      fullPage: true,
    });
    const search = p.getByRole("textbox", { name: "搜尋美股" }); // type=default input uses textbox role
    await search.fill("台積電");
    await p.getByRole("option").filter({ hasText: "TSM" }).first().click();
    await p.waitForFunction(
      () =>
        document.querySelector(".us2-selected-identity b")?.textContent ===
        "TSM",
    );
    await p.waitForFunction(() =>
      document.querySelector(".us2-ohlc")?.textContent.startsWith("TSM "),
    );
    await p.locator(".us2-ticker [data-watch]").click();
    assert.equal(
      await p.locator(".us2-ticker [data-watch]").getAttribute("aria-pressed"),
      "true",
    );
    const stage = p.locator(".us2-chart-stage"),
      box = await stage.boundingBox();
    await p.locator('[data-tool="trend"]').click();
    await p.mouse.move(box.x + 80, box.y + 140);
    await p.mouse.down();
    await p.mouse.move(box.x + 170, box.y + 100, { steps: 10 });
    await p.mouse.up();
    const lines = await p.locator("svg.us2-drawings line").count();
    assert.ok(lines >= 2, "drawing saved");
    await p.locator('[data-tool="cursor"]').click();
    const tier = p.locator(".us2-tier");
    await tier.click();
    assert.equal(await tier.locator("span").innerText(), "T1");
    const tierBox = await tier.boundingBox();
    await p.mouse.move(tierBox.x + 20, tierBox.y + 15);
    await p.mouse.down();
    await p.waitForTimeout(2050);
    assert.equal(await p.locator(".us2-tier-menu").isVisible(), true);
    await p.mouse.up();
    await p.locator('[data-tier="all"]').click();
    await p.locator("[data-side]").click();
    assert.ok((await p.locator("[data-side]").innerText()).includes("空"));
    await p.locator("[data-side]").click();
    await p.locator("[data-collapse]").click();
    assert.equal(await p.locator(".us2-scanner").isVisible(), false);
    await p.locator(".us2-show-list").click();
    assert.equal(await p.locator(".us2-scanner").isVisible(), true);
    if (!live && width === 390) {
      const before = chartCalls;
      updated = true;
      await p.clock.fastForward(301000);
      await p.waitForTimeout(200);
      assert.ok(chartCalls > before, "polling fetches without clicking");
      assert.ok(
        (await p.locator("svg.us2-drawings line").count()) >= 2,
        "polling preserves drawings",
      );
    }
    for (const view of ["home", "strength", "data", "media"]) {
      await p.evaluate((view) => window.switchAppView(view), view);
      await p.waitForFunction(
        (view) =>
          document.querySelector("body").dataset.view === view &&
          document.querySelector(".us2-main"),
        view,
      );
      await p.waitForTimeout(400);
      await p.screenshot({
        path: `${out}/${live ? "live" : "fixture"}-${view}-${width}.png`,
        fullPage: true,
      });
      if (!(await p.locator(".us2-root").isVisible()))
        console.log(
          "hidden debug",
          await p.evaluate(() => {
            const n = document.querySelector(".us2-root");
            return {
              body: document.body.className,
              view: document.body.dataset.view,
              hidden: n.hidden,
              display: getComputedStyle(n).display,
              css: n.outerHTML.slice(0, 200),
              parent: getComputedStyle(n.parentElement).display,
            };
          }),
        );
      assert.equal(await p.locator(".us2-root").isVisible(), true, view);
    }
    await p.evaluate(() => window.switchAppView("strength"));
    await p.locator('[data-tool-tab="bubbles"]').click();
    await p.waitForTimeout(150);
    if ((await p.locator(".us2-tool-visual canvas").count()) !== 1)
      console.log("bubble debug", await p.locator(".us2-root").innerText());
    assert.equal(await p.locator(".us2-tool-visual canvas").count(), 1);
    await p.screenshot({
      path: `${out}/${live ? "live" : "fixture"}-bubbles-${width}.png`,
      fullPage: true,
    });
    await p.locator('[data-tool-tab="heatmap"]').click();
    const first = p.locator(".us2-heatmap [data-symbol]").first();
    await first.click();
    await p.waitForFunction(() => document.body.dataset.view === "radar");
    await p.evaluate(() => window.switchAppView("strength"));
    await p.locator('[data-tool-tab="patterns"]').click();
    await p.waitForTimeout(200);
    const result = p.locator(".us2-pattern-results [data-symbol]").first();
    if (await result.count()) {
      const selected = await result.getAttribute("data-symbol");
      await result.click();
      await p.waitForFunction(() => document.body.dataset.view === "radar");
      assert.equal(await p.locator(".us2-scanner").isVisible(), false);
      assert.equal(
        await p.locator(".us2-selected-identity b").innerText(),
        selected,
      );
    }
    await p.evaluate(() =>
      window.OXMarketController.setMarket("tw", { toast: false }),
    );
    assert.equal(await p.locator(".us2-root").count(), 0);
    await p.evaluate(() =>
      window.OXMarketController.setMarket("crypto", { toast: false }),
    );
    await p.waitForFunction(() => document.body.dataset.market === "crypto");
    assert.equal(await p.locator(".us2-root").count(), 0);
    await p.evaluate(() => window.OXMarketController.setMarket("us", {toast:false}));
    await p.waitForFunction(() => document.querySelector(".us2-main") && !document.querySelector(".us2-root").hidden);
    await p.evaluate(() => window.switchAppView("data"));
    await p.waitForSelector(".us2-news-card");
    await p.evaluate(() => window.scrollTo(0, 500));
    await p.locator(".us2-news-card").nth(4).scrollIntoViewIfNeeded();
    const newsScroll = await p.evaluate(() => scrollY);
    await p.locator(".us2-news-card").nth(4).click();
    await p.getByRole("button", {name:"返回新聞列表"}).click();
    await p.waitForTimeout(50);
    assert.ok(Math.abs(await p.evaluate(() => scrollY) - newsScroll) < 3, "news return restores scroll");
    await p.evaluate(() => window.OXMarketController.setMarket("crypto", {toast:false}));
    await p.evaluate(() => window.OXMarketController.setMarket("us", {toast:false}));
    await p.waitForFunction(() => !!document.querySelector(".us2-news-card") && !document.querySelector(".us2-root").hidden);
    audits.push({
      width,
      overflow,
      searchADR: true,
      watch: true,
      drawings: true,
      tiers: true,
      collapse: true,
      fiveViews: true,
      tools: true,
      marketIsolation: true,
    });
    await context.close();
  }
  await b.close();
  assert.deepEqual(errors, [], "no browser runtime errors");
  const report = {
    mode: live ? "real-provider" : "isolated-fixture",
    browser: "Chromium",
    webkit: "not tested (browser download failed)",
    audits,
    chartCalls,
    quoteCalls,
    errors,
  };
  writeFileSync(
    `${out}/report-${live ? "live" : "fixture"}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
