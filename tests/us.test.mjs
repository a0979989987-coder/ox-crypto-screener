import test from "node:test";
import assert from "node:assert/strict";
import { usModule } from "../src/markets/us/index.js";
import { usProvider } from "../src/markets/us/api.js";
import { deriveUSRiskRegime } from "../src/markets/us/home.js";

test("US module uses its configured backend and keeps secrets server-side", () => {
  assert.equal(usModule.id, "us");
  assert.equal(usModule.status, "partial");
  assert.equal(usProvider.available, true);
  assert.equal(usProvider.secretRequired, true);
  assert.equal(usProvider.frontendSecretAllowed, false);
  assert.equal(usModule.refresh().data, null);
});

test("US ETF risk proxy requires three real quotes and distinguishes mixed direction", () => {
  const quotes = changes => Object.fromEntries(
    ["SPY", "QQQ", "IWM"].map((symbol, index) =>
      [symbol, { available: true, changePct: changes[index] }]
    )
  );
  assert.equal(deriveUSRiskRegime(quotes([1, 2, .5])).tone, "positive");
  assert.equal(deriveUSRiskRegime(quotes([-1, -2, -.5])).tone, "negative");
  assert.equal(deriveUSRiskRegime(quotes([1, -2, .5])).tone, "neutral");
  assert.equal(deriveUSRiskRegime({ SPY: { available: true, changePct: 1 } }).tone, "unknown");
});
