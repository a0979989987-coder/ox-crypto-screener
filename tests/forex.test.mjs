import test from "node:test";
import assert from "node:assert/strict";
import { analyzeForexHistory } from "../src/markets/forex/engine.js";
import { getForexSession } from "../src/markets/forex/session.js";
import { normalizeForexHistory } from "../src/markets/forex/api.js";

const history = {
  source: "test",
  base: "USD",
  dates: ["2026-09-18", "2026-09-21", "2026-09-22"],
  rates: {
    "2026-09-18": { EUR: 0.8500, GBP: 0.7400, JPY: 146.0, CHF: 0.7900, CAD: 1.3700, AUD: 1.5100, NZD: 1.6500 },
    "2026-09-21": { EUR: 0.8480, GBP: 0.7380, JPY: 146.5, CHF: 0.7920, CAD: 1.3680, AUD: 1.5050, NZD: 1.6450 },
    "2026-09-22": { EUR: 0.8460, GBP: 0.7350, JPY: 147.0, CHF: 0.7940, CAD: 1.3650, AUD: 1.5000, NZD: 1.6400 }
  },
  updatedAt: "2026-09-22"
};

test("forex engine derives all seven major pairs", () => {
  const result = analyzeForexHistory(history);
  assert.equal(result.pairs.length, 7);
  assert.equal(result.strengths.length, 8);
  assert.ok(result.pairs.every(pair => Number.isFinite(pair.current) && pair.current > 0));
});

test("cross rates use USD reference rates correctly", () => {
  const result = analyzeForexHistory(history);
  const eurusd = result.pairs.find(pair => pair.id === "EURUSD");
  const usdjpy = result.pairs.find(pair => pair.id === "USDJPY");
  assert.equal(eurusd.current.toFixed(5), (1 / 0.846).toFixed(5));
  assert.equal(usdjpy.current, 147);
  assert.ok(eurusd.change > 0);
});

test("forex model keeps trading fields and independent radar", () => {
  const result = analyzeForexHistory(history, { now: new Date("2026-09-22T13:00:00Z") });
  const pair = result.pairs.find(item => item.id === "EURUSD");
  assert.equal(result.session.id, "OVERLAP");
  assert.deepEqual(Object.keys(pair).filter(key => ["symbol", "baseCurrency", "quoteCurrency", "price", "changePct", "high", "low", "volume", "spread", "session", "timestamp", "candles"].includes(key)).length, 12);
  assert.equal(pair.volume, null);
  assert.equal(pair.spread, null);
  assert.ok(pair.averageDailyMovePct > 0);
  assert.ok(pair.candles.length > 1 && result.radar.length === 11);
  assert.ok(result.radar.every(item => ["LONG", "SHORT"].includes(item.direction) && Number.isFinite(item.score)));
});

test("forex sessions distinguish overlap and closed market", () => {
  assert.equal(getForexSession(new Date("2026-09-22T13:00:00Z")).id, "OVERLAP");
  assert.equal(getForexSession(new Date("2026-09-26T10:00:00Z")).id, "CLOSED");
  assert.equal(getForexSession(new Date("2026-01-20T13:00:00Z")).id, "OVERLAP");
  assert.equal(getForexSession(new Date("2026-07-21T12:00:00Z")).id, "OVERLAP");
});

test("provider adapter normalizes official v2 rows without a secret", () => {
  const result = normalizeForexHistory([{ date: "2026-09-21", base: "USD", quote: "EUR", rate: .85 }, { date: "2026-09-22", base: "USD", quote: "EUR", rate: .84 }]);
  assert.equal(result.rates["2026-09-22"].EUR, .84);
  assert.equal(result.capabilities.spread, false);
});
