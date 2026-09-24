import test from "node:test";
import assert from "node:assert/strict";
import { twModule } from "../src/markets/tw/index.js";
import { twProvider } from "../src/markets/tw/api.js";

test("TW module uses the configured official-data backend", () => {
  assert.equal(twModule.id, "tw");
  assert.equal(twModule.status, "connected");
  assert.equal(twProvider.available, true);
  assert.match(twProvider.apiBase, /^https:\/\//);
  assert.equal(twModule.refresh().data, null);
});
