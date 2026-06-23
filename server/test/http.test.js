import test from "node:test";
import assert from "node:assert/strict";
import { __testables } from "../src/utils/http.js";

test("describeFetchFailure includes url and original network error", () => {
  const message = __testables.describeFetchFailure(
    "https://example.com/data",
    new Error("fetch failed"),
  );

  assert.equal(
    message,
    "Network fetch failed for https://example.com/data: fetch failed",
  );
});
