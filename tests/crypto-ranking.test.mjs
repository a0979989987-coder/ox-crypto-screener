import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const scanner = readFileSync(new URL("../src/markets/crypto/scanner.js", import.meta.url), "utf8");

function rank(rows) {
  const state = {
    analyzedCache: new Map(rows.map(row => [row.symbol, row])),
    tickers: [], directionFilter: "long"
  };
  const context = {
    state, benchmarkSymbols: new Set(["BTCUSDT", "ETHUSDT"]), num: Number,
    syncDirectionalBadges() {}, syncWatchBadge() {}, renderMarketStrength() {},
    renderHomeOverview() {}, renderOxLive() {}
  };
  runInNewContext(`${scanner}\nrebuildTierLists();`, context);
  return state.tierMapBySide.long;
}

test("Crypto radar keeps up to 30 real symbols in each T tier without repeats", () => {
  const rows = ["t1", "t2", "t3"].flatMap((tier, tierIndex) =>
    Array.from({ length: 35 }, (_, index) => ({
      symbol: `COIN${tierIndex}${String(index).padStart(2, "0")}USDT`,
      side: "LONG", tier, oxScore: 100 - index,
      t1Fit: tier === "t1" ? 100 - index : 0,
      t2Fit: tier === "t2" ? 100 - index : 0,
      t3Fit: tier === "t3" ? 100 - index : 0
    }))
  );
  const result = rank(rows);
  for (const tier of ["t1", "t2", "t3"]) {
    assert.equal(result[tier].length, 30);
    assert.ok(result[tier].every(row => row.tier === tier));
  }
  const symbols = ["t1", "t2", "t3"].flatMap(tier => result[tier].map(row => row.symbol));
  assert.equal(new Set(symbols).size, 90);
  assert.ok(result.t1[0].t1Fit > result.t1.at(-1).t1Fit);
});

test("Crypto radar shows only available symbols when fewer than 30 exist", () => {
  const result = rank([{ symbol: "SOLUSDT", side: "LONG", tier: "t1", oxScore: 80, t1Fit: 80 }]);
  assert.equal(result.t1.length, 1);
  assert.equal(result.t2.length, 0);
  assert.equal(result.t3.length, 0);
});
