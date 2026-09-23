import test from "node:test";
import assert from "node:assert/strict";
import { usModule } from "../src/markets/us/index.js";
import { usProvider } from "../src/markets/us/api.js";

test("US standard module preserves the existing backend-required placeholder", () => {
  assert.equal(usModule.id, "us");
  assert.equal(usModule.status, "placeholder");
  assert.equal(usProvider.available, false);
  assert.equal(usProvider.secretRequired, true);
  assert.equal(usModule.refresh().data, null);
});
