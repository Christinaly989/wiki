import test from "node:test";
import assert from "node:assert/strict";
import { __testables } from "../src/services/dashboardService.js";

test("buildSourceFetchFailure labels the failing source", () => {
  const message = __testables.buildSourceFetchFailure("fred", new Error("HTTP 500 for https://example.com"));

  assert.equal(message, "fred: HTTP 500 for https://example.com");
});

test("buildSourceFetchError aggregates multiple source failures", () => {
  const error = __testables.buildSourceFetchError([
    "fred: timeout",
    "treasury: DNS lookup failed",
  ]);

  assert.equal(
    error.message,
    "Live source fetch failed: fred: timeout | treasury: DNS lookup failed",
  );
});

test("buildEmptyNewsSnapshot returns an empty fallback shape", () => {
  const snapshot = __testables.buildEmptyNewsSnapshot();

  assert.deepEqual(snapshot, {
    us: { dataUpdates: [], news: [] },
    global: { dataUpdates: [], news: [] },
    warnings: [],
    sourceStatus: "error",
  });
});

test("hasRenderableSectionCoverage rejects payloads with empty macro sections", () => {
  const onlyRates = [
    { key: "treasury10y", group: "ratesFinancial" },
    { key: "real10y", group: "ratesFinancial" },
  ];
  const fullCoverage = [
    { key: "retailSales", group: "growthLabor" },
    { key: "cpi", group: "inflationFed" },
    { key: "treasury10y", group: "ratesFinancial" },
  ];

  assert.equal(__testables.hasRenderableSectionCoverage(onlyRates), false);
  assert.equal(__testables.hasRenderableSectionCoverage(fullCoverage), true);
});
