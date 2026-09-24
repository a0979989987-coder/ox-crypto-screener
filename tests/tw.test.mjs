import test from "node:test";
import assert from "node:assert/strict";
import { twModule } from "../src/markets/tw/index.js";
import { twProvider } from "../src/markets/tw/api.js";

test("TW module keeps the server-backed provider contract", () => {
  assert.equal(twModule.id, "tw");
  assert.equal(twModule.status, "placeholder");
  assert.equal(twProvider.requiresServerProxy, true);
  assert.equal(twProvider.frontendSecretAllowed, false);
  assert.equal(typeof twProvider.available, 'boolean');
  assert.equal(typeof twModule.refresh, 'function');
});
