import test from "node:test";
import assert from "node:assert/strict";
import { __testables } from "../src/services/fredService.js";

test("normalizeObservations sorts descending API results back into chronological order", () => {
  const result = __testables.normalizeObservations([
    { date: "2026-05-01", value: "5" },
    { date: "2026-03-01", value: "3" },
    { date: "2026-04-01", value: "4" },
  ]);

  assert.deepEqual(
    result.map((item) => item.date),
    ["2026-03-01", "2026-04-01", "2026-05-01"],
  );
});

test("calculateDerivedSeries keeps the latest monthly observation after sorting", () => {
  const result = __testables.calculateDerivedSeries(
    {
      calculation: "last",
    },
    [
      { date: "2026-03-01", value: 3 },
      { date: "2026-04-01", value: 4 },
      { date: "2026-05-01", value: 5 },
    ],
  );

  assert.equal(result.latest?.date, "2026-05-01");
  assert.equal(result.latest?.value, 5);
  assert.equal(result.previous?.date, "2026-04-01");
});

test("buildSeriesUrl requests the most recent observations first", () => {
  const url = __testables.buildSeriesUrl(
    {
      seriesId: "UNRATE",
      frequency: "monthly",
    },
    "demo-key",
  );

  assert.equal(url.searchParams.get("sort_order"), "desc");
  assert.equal(url.searchParams.get("limit"), "240");
});
