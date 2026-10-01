import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmedChart } from "../scripts/lib/finance-query-validation.mjs";

test("batch metadata confirms the actual frame without trusting the request", () => {
  const batch = { symbol: "SPY", interval: null, range: null,
    meta: { symbol: "SPY", dataGranularity: "1h", range: "2y" }, candles: [] };
  assert.equal(confirmedChart(batch, "SPY", "1h").interval, "1h");
  assert.equal(confirmedChart(batch, "SPY", "1h").range, "2y");
  assert.throws(() => confirmedChart(batch, "SPY", "30m"), /Unexpected source/);
  assert.throws(() => confirmedChart({ ...batch, meta: {} }, "SPY", "1h"), /Unexpected source/);
});
test("wrong symbols and conflicting source interval fields cannot become native candles", () => {
  const source = { symbol: "SPY", interval: "1d", meta: { dataGranularity: "1d" }, candles: [] };
  assert.throws(() => confirmedChart(source, "QQQ", "1d"), /Unexpected source/);
  assert.throws(() => confirmedChart(source, "SPY", "30m"), /Unexpected source/);
  assert.throws(() => confirmedChart({ ...source, interval: "30m" }, "SPY", "30m"), /Unexpected source/);
  assert.throws(() => confirmedChart({ ...source, candles: {} }, "SPY", "1d"), /Unexpected source/);
});
