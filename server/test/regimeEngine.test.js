import test from "node:test";
import assert from "node:assert/strict";
import { deriveRegime } from "../src/services/regimeEngine.js";

function buildMetric(value) {
  return { latest: { value } };
}

test("deriveRegime returns Goldilocks for steady growth and cooling inflation", () => {
  const result = deriveRegime({
    nonfarmPayrolls: buildMetric(180),
    unemploymentRate: buildMetric(4.1),
    initialClaims: buildMetric(220),
    retailSales: buildMetric(3.5),
    ismManufacturing: buildMetric(50.5),
    housingStarts: buildMetric(1350),
    cpi: buildMetric(2.4),
    corePce: buildMetric(2.4),
    wageGrowth: buildMetric(3.4),
    coreServicesExHousing: buildMetric(3.2),
    real10y: buildMetric(1.8),
  });

  assert.equal(result.regime, "Goldilocks");
});

test("deriveRegime returns Recession when growth deteriorates and inflation cools", () => {
  const result = deriveRegime({
    nonfarmPayrolls: buildMetric(25),
    unemploymentRate: buildMetric(4.9),
    initialClaims: buildMetric(285),
    retailSales: buildMetric(-1.2),
    ismManufacturing: buildMetric(45.8),
    housingStarts: buildMetric(1020),
    cpi: buildMetric(2.1),
    corePce: buildMetric(2.3),
    wageGrowth: buildMetric(3.1),
    coreServicesExHousing: buildMetric(2.9),
    real10y: buildMetric(1.4),
  });

  assert.equal(result.regime, "Recession");
});

test("deriveRegime returns Stagflation when growth weakens but inflation stays hot", () => {
  const result = deriveRegime({
    nonfarmPayrolls: buildMetric(40),
    unemploymentRate: buildMetric(4.8),
    initialClaims: buildMetric(270),
    retailSales: buildMetric(-0.5),
    ismManufacturing: buildMetric(46.2),
    housingStarts: buildMetric(1090),
    cpi: buildMetric(3.8),
    corePce: buildMetric(3.3),
    wageGrowth: buildMetric(4.6),
    coreServicesExHousing: buildMetric(5),
    real10y: buildMetric(2.2),
  });

  assert.equal(result.regime, "Stagflation");
});
