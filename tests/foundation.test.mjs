import test from "node:test";
import assert from "node:assert/strict";
import { clamp, formatPercent, formatRate, safeJsonParse } from "../src/core/utils.js";
import { createEventBus } from "../src/core/events.js";
import { createStorageService } from "../src/services/storage.js";
import { createMarketRouter } from "../src/app/marketRouter.js";

test("core utilities are deterministic", () => {
  assert.equal(clamp(120), 100);
  assert.equal(formatPercent(1.234), "+1.23%");
  assert.equal(formatRate(156.12345, "USDJPY"), "156.123");
  assert.deepEqual(safeJsonParse('{"ok":true}'), { ok: true });
});

test("event bus subscribes and unsubscribes", () => {
  const bus = createEventBus();
  let received = null;
  const off = bus.on("tick", value => { received = value; });
  bus.emit("tick", 7);
  assert.equal(received, 7);
  off();
  bus.emit("tick", 8);
  assert.equal(received, 7);
});

test("storage service supports JSON", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const service = createStorageService(storage);
  assert.equal(service.setJson("prefs", { market: "us" }), true);
  assert.deepEqual(service.getJson("prefs"), { market: "us" });
});

test("market router activates one registered module", async () => {
  const calls = [];
  const router = createMarketRouter();
  router.register({ id: "crypto", activate: () => calls.push("crypto:on"), deactivate: () => calls.push("crypto:off") });
  router.register({ id: "us", activate: () => calls.push("us:on") });
  assert.equal(await router.activate("crypto"), true);
  assert.equal(await router.activate("us"), true);
  assert.deepEqual(calls, ["crypto:on", "crypto:off", "us:on"]);
});

test("late market activation cannot leave the prior market visible", async () => {
  let finishUS;
  const calls = [];
  const router = createMarketRouter();
  router.register({ id: "us", activate: () => new Promise(resolve => { finishUS = resolve; }), deactivate: () => calls.push("us:hidden") });
  router.register({ id: "crypto", activate: () => calls.push("crypto:visible") });
  const first = router.activate("us");
  await router.activate("crypto");
  finishUS();
  await first;
  assert.equal(router.current(), "crypto");
  assert.ok(calls.includes("us:hidden"));
});
