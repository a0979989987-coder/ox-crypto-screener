import test from "node:test";
import assert from "node:assert/strict";
import { usModule } from "../src/markets/us/index.js";
import { usProvider } from "../src/markets/us/api.js";

test("US module keeps the server-backed provider contract", () => {
  assert.equal(usModule.id, "us");
  assert.equal(usModule.status, "placeholder");
  assert.equal(usProvider.requiresServerProxy, true);
  assert.equal(usProvider.frontendSecretAllowed, false);
  assert.equal(typeof usProvider.available, 'boolean');
  assert.equal(usProvider.secretRequired, true);
  assert.equal(typeof usModule.refresh, 'function');
});
