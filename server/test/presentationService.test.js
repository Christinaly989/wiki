import test from "node:test";
import assert from "node:assert/strict";
import { fredSeriesConfigs } from "../src/config/series.js";
import { formatMetricAsOf, isMetricStale, serializeMetricForTable } from "../src/services/presentationService.js";

test("series config keeps critical metric definitions and scales correct", () => {
  const unemploymentRate = fredSeriesConfigs.find((item) => item.key === "unemploymentRate");
  const existingHomeSales = fredSeriesConfigs.find((item) => item.key === "existingHomeSales");
  const coreServices = fredSeriesConfigs.find((item) => item.key === "coreServicesExHousing");
  const headlineCpi = fredSeriesConfigs.find((item) => item.key === "cpi");
  const coreCpi = fredSeriesConfigs.find((item) => item.key === "coreCpi");

  assert.equal(unemploymentRate?.calculation, "last");
  assert.equal(existingHomeSales?.calculation, "lastScaled");
  assert.equal(existingHomeSales?.scale, 0.000001);
  assert.equal(headlineCpi?.seriesId, "CPIAUCNS");
  assert.equal(coreCpi?.seriesId, "CPILFENS");
  assert.equal(coreServices?.seriesId, "CUUR0000SASL2RS");
});

test("formatMetricAsOf shows monthly periods as YYYY-MM", () => {
  const metric = {
    frequency: "monthly",
    latest: {
      date: "2026-05-01",
      value: 4.3,
    },
  };

  assert.equal(formatMetricAsOf(metric), "2026-05");
});

test("serializeMetricForTable marks stale monthly metrics", () => {
  const metric = {
    key: "unemploymentRate",
    label: "Unemployment Rate",
    category: "就业",
    group: "growthLabor",
    sourceLabel: "BLS via FRED",
    definition: "Level",
    unit: "%",
    frequency: "monthly",
    importance: "high",
    marketSignal: "Labor market remains tight",
    latest: {
      date: "2025-12-01",
      value: 4.3,
      rawValue: 4.3,
    },
    previous: {
      date: "2025-11-01",
      value: 4.4,
    },
    change: -0.1,
    history: [
      { date: "2025-11-01", value: 4.4, rawValue: 4.4 },
      { date: "2025-12-01", value: 4.3, rawValue: 4.3 },
    ],
  };

  assert.equal(isMetricStale(metric, new Date("2026-06-07T00:00:00Z")), true);
  assert.equal(serializeMetricForTable(metric).asOfText, "2025-12");
  assert.equal(serializeMetricForTable(metric).isStale, true);
});
