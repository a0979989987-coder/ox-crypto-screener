import test from "node:test";
import assert from "node:assert/strict";
import { cachedRequest, resetCache } from "../server/markets/us/cache.js";
import { resetBudget } from "../server/markets/us/budget.js";
process.env.NODE_ENV = "test";
process.env.US_DATA_PROVIDER = "twelve-data";
import { handleUS2, capabilities, snapshot } from "../server/markets/us/service.js";
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
test("unlicensed closing snapshot is explicit and contains no prices", async () => {
  const result=await snapshot();assert.equal(result.mode,'eod');assert.equal(result.counts.scanned,0);
  assert.deepEqual(result.quotes,[]);assert.match(result.error,/公開使用權尚待確認/);
});
