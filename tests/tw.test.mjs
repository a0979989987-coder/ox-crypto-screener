import test from "node:test";
import assert from "node:assert/strict";
import { twModule } from "../src/markets/tw/index.js";
import { twProvider } from "../src/markets/tw/api.js";

test("TW standard module preserves the existing backend-required placeholder", () => {
  assert.equal(twModule.id, "tw");
  assert.equal(twModule.status, "placeholder");
  assert.equal(twProvider.available, false);
  assert.equal(twModule.refresh().data, null);
});
