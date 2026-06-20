import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createDashboardService } from "../server/src/services/dashboardService.js";
import { writeDashboardCache } from "../server/src/utils/dashboardCache.js";

const envPath = new URL("../.env", import.meta.url);

if (fs.existsSync(fileURLToPath(envPath))) {
  dotenv.config({ path: fileURLToPath(envPath), quiet: true });
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cachePath =
  process.env.DASHBOARD_CACHE_PATH ??
  (process.env.DATA_DIR ? path.join(process.env.DATA_DIR, "render-cache.json") : path.join(rootDir, "server/data/render-cache.json"));
const dashboardService = createDashboardService(process.env);

try {
  const payload = await dashboardService.refreshAndNotify();
  console.log(`Cache refreshed: ${payload.regimeState.regime} @ ${payload.generatedAtLocal}`);
  if (payload.publishing?.statusText) {
    console.log(payload.publishing.statusText);
  }
} catch (error) {
  try {
    const fallback = await dashboardService.loadDashboard(false);
    writeDashboardCache(cachePath, fallback);
    console.warn(`Live refresh failed, exported fallback cache instead: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  } catch {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
}
