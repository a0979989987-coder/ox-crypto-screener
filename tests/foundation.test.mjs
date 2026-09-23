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
  assert.equal(service.setJson("prefs", { market: "forex" }), true);
  assert.deepEqual(service.getJson("prefs"), { market: "forex" });
});

test("market router activates one registered module", async () => {
  const calls = [];
  const router = createMarketRouter();
  router.register({ id: "crypto", activate: () => calls.push("crypto:on"), deactivate: () => calls.push("crypto:off") });
  router.register({ id: "forex", activate: () => calls.push("forex:on") });
  assert.equal(await router.activate("crypto"), true);
  assert.equal(await router.activate("forex"), true);
  assert.deepEqual(calls, ["crypto:on", "crypto:off", "forex:on"]);
});
