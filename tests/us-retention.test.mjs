import test from "node:test";
import assert from "node:assert/strict";
import { cachedRequest, resetCache } from "../server/markets/us/cache.js";
import { USAdapter } from "../src/markets/us/provider.js";
import { quoteStatus } from "../src/markets/us/model.js";
import { withinBudget, resetBudget } from "../server/markets/us/budget.js";

const fail = status => Object.assign(Error("upstream failure"), { status });
test("a burst within the free per-minute budget queues instead of failing because two requests are active", async () => {
  resetBudget();
  let active = 0, peak = 0;
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => withinBudget(1, async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return i;
  })));
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5]);
  assert.equal(peak, 2);
  await withinBudget(2, () => {});
  await assert.rejects(withinBudget(1, () => { throw Error("must not run"); }), e => e.code === 429);
  resetBudget();
});
test("a provider 429 retains the last valid response and its original time through backoff", async t => {
  resetCache();
  let now = 1000000, calls = 0;
  t.mock.method(Date, "now", () => now);
  const options = { ttl: 1000, stale: 60000, withMetadata: true };
  const first = await cachedRequest("SPY", () => ({ price: 600 }), options);
  now += 2000;
  const old = await cachedRequest("SPY", () => { calls++; throw fail(429); }, options);
  assert.deepEqual(old.value, first.value);
  assert.equal(old.cache.fetchedAt, first.cache.fetchedAt);
  assert.equal(old.cache.stale, true);
  assert.equal(old.cache.reason, "RATE_LIMITED");
  const retained = await cachedRequest("SPY", () => { calls++; }, options);
  assert.equal(retained.cache.stale, true);
  assert.equal(calls, 1);
  await assert.rejects(cachedRequest("TSM", () => {}), e => e.code === 429);
  resetCache();
});
test("transient failures do not erase cached data, while authorization and missing symbols never use stale data", async t => {
  resetCache();
  let now = 1000000;
  t.mock.method(Date, "now", () => now);
  const options = { ttl: 1000, stale: 60000, withMetadata: true };
  await cachedRequest("key", () => ({ v: 1 }), options);
  now += 2000;
  for (const status of [400, 401, 403, 404])
    await assert.rejects(cachedRequest("key", () => { throw fail(status); }, options), e => e.status === status);
  const retained = await cachedRequest("key", () => { throw fail(502); }, options);
  assert.equal(retained.value.v, 1);
  assert.equal(retained.cache.reason, "UPDATE_FAILED");
  now += 60000;
  await assert.rejects(cachedRequest("key", () => { throw fail(502); }, options), e => e.status === 502);
  resetCache();
});
test("coalesced readers can request different metadata without mixing response shapes", async () => {
  resetCache();
  let finish, calls = 0;
  const load = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const raw = cachedRequest("key", load);
  const metadata = cachedRequest("key", load, { withMetadata: true });
  await Promise.resolve();
  finish({ bars: [1] });
  assert.deepEqual(await raw, { bars: [1] });
  assert.deepEqual((await metadata).value, { bars: [1] });
  assert.equal(calls, 1);
  resetCache();
});
test("browser candle and quote caches survive a temporary outage, but not loss of access", async t => {
  const receivedAt = Date.now();
  let status = 200, reads = 0;
  t.mock.method(globalThis, "fetch", async url => {
    reads++;
    const quote = new URL(url).pathname.endsWith("quote-v2");
    return { ok: status === 200, status, json: async () => status !== 200
      ? { ok: false, error: { message: "temporary failure" } }
      : { ok: true, data: quote
        ? { quote: { symbol: "SPY", price: 600, receivedAt, marketTime: receivedAt / 1000 } }
        : { symbol: "SPY", interval: "1D", receivedAt, bars: [{ time: 1, open: 599, high: 601, low: 598, close: 600 }] } } };
  });
  const settings = { force: true, capabilities: { source: "TEST RETENTION" } };
  const first = await USAdapter.candles("SPY", settings);
  await USAdapter.quote("SPY");
  status = 429;
  const old = await USAdapter.candles("SPY", { ...settings, limit: 8 });
  const quote = await USAdapter.quote("SPY");
  assert.deepEqual(old.bars, first.bars);
  assert.equal(old.receivedAt, first.receivedAt);
  assert.equal(old.stale, true);
  assert.match(quoteStatus(quote), /更新暫停/);
  status = 403;
  await assert.rejects(USAdapter.candles("SPY", settings), e => e.status === 403);
  await assert.rejects(USAdapter.quote("SPY"), e => e.status === 403);
  assert.equal(reads, 6);
});
