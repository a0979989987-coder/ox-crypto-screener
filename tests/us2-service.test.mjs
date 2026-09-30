import test from "node:test";
import assert from "node:assert/strict";
import { cachedRequest, resetCache } from "../server/markets/us/cache.js";
process.env.NODE_ENV = "test";
import { handleUS2, capabilities } from "../server/markets/us/service.js";
test("public adapter refuses redistribution when authorization is unconfirmed", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(
      handleUS2("quote-v2", { symbol: "AAPL" }, () => {
        throw Error("must not request upstream");
      }),
      (e) => e.code === "LICENSE_NOT_CONFIRMED",
    );
  } finally {
    process.env.NODE_ENV = previous;
  }
});
test("simultaneous requests coalesce and a 429 starts backoff", async () => {
  resetCache();
  let calls = 0;
  const load = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return { v: 1 };
  };
  const result = await Promise.all([
    cachedRequest("key", load),
    cachedRequest("key", load),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(result, [{ v: 1 }, { v: 1 }]);
  await assert.rejects(
    cachedRequest("bad", () => {
      const e = Error();
      e.code = 429;
      throw e;
    }),
  );
  await assert.rejects(cachedRequest("next", load), (e) => e.code === 429);
  resetCache();
});
test("adapter rejects unsupported symbols and extended hours instead of inventing data", async () => {
  await assert.rejects(
    handleUS2("chart-v2", { symbol: "ZZZINVALID" }, () => {}),
    (e) => e.code === 404,
  );
  await assert.rejects(
    handleUS2("chart-v2", { symbol: "AAPL", extendedHours: "true" }, () => {}),
    (e) => e.code === 403,
  );
  assert.equal(capabilities().depth, false);
  assert.equal(capabilities().externalDisplayConfirmed, false);
});
test("chart provider requests splits-only adjustment and passes native OHLCV and timestamps", async () => {
  resetCache();
  let params;
  const result = await handleUS2(
    "chart-v2",
    { symbol: "AAPL", interval: "1m", limit: 400 },
    async (path, p) => {
      params = p;
      return {
        values: [
          {
            datetime: "2026-09-29 13:30:00",
            open: "100",
            high: "101",
            low: "99",
            close: "100.5",
            volume: "120",
          },
        ],
      };
    },
  );
  assert.equal(params.adjust, "splits");
  assert.equal(params.timezone, "UTC");
  assert.equal(params.outputsize, 400);
  assert.equal(result.bars[0].volume, 120);
  assert.equal(result.feed, "未確認 feed");
  assert.equal(result.delaySeconds, null);
  assert.equal(result.adjustment, "splits");
});
