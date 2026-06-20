import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { annotateCachedDashboard, readDashboardCache, writeDashboardCache } from "../src/utils/dashboardCache.js";

test("dashboard cache round-trips through disk", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "macro-cache-"));
  const filePath = path.join(tempDir, "render-cache.json");
  const payload = {
    headline: { title: "Test headline" },
    warnings: ["Original warning"],
  };

  writeDashboardCache(filePath, payload);
  const restored = readDashboardCache(filePath);

  assert.deepEqual(restored, payload);
});

test("annotateCachedDashboard prepends warnings", () => {
  const payload = { warnings: ["Cached warning"] };
  const annotated = annotateCachedDashboard(payload, ["Live refresh failed"]);

  assert.deepEqual(annotated.warnings, ["Live refresh failed", "Cached warning"]);
});
