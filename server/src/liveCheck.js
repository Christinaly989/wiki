import dotenv from "dotenv";
import { createDashboardService } from "./services/dashboardService.js";

dotenv.config({ path: new URL("../../.env", import.meta.url), quiet: true });

function mask(value) {
  if (!value) {
    return "(missing)";
  }
  if (value.length <= 6) {
    return "*".repeat(value.length);
  }
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function statusLine(label, ok, detail) {
  return `${ok ? "[ok]" : "[missing]"} ${label}${detail ? `: ${detail}` : ""}`;
}

async function main() {
  const env = process.env;
  const checks = {
    fred: Boolean(env.FRED_API_KEY),
    notionToken: Boolean(env.NOTION_API_KEY),
    notionDataSource: Boolean(env.NOTION_DATA_SOURCE_ID),
    deepseek: Boolean(env.DEEPSEEK_API_KEY),
  };

  console.log("Macro Dashboard Live Check");
  console.log(statusLine("FRED_API_KEY", checks.fred, mask(env.FRED_API_KEY)));
  console.log(statusLine("NOTION_API_KEY", checks.notionToken, mask(env.NOTION_API_KEY)));
  console.log(statusLine("NOTION_DATA_SOURCE_ID", checks.notionDataSource, mask(env.NOTION_DATA_SOURCE_ID)));
  console.log(statusLine("DEEPSEEK_API_KEY", checks.deepseek, mask(env.DEEPSEEK_API_KEY)));
  console.log("");

  const dashboardService = createDashboardService(env);

  try {
    const payload = await dashboardService.refreshAndNotify();
    console.log("[ok] Dashboard refresh succeeded");
    console.log(`      Regime: ${payload.regimeState.regime}`);
    console.log(`      Top signals: ${payload.topSignals.length}`);
    console.log(`      Upcoming releases (7d): ${payload.releases.sevenDays.length}`);
    console.log(`      Publishing: ${payload.publishing.statusText}`);
    console.log(`      AI overlay: ${payload.aiOverlay.status} (${payload.aiOverlay.model})`);
    if (payload.warnings.length) {
      console.log("      Warnings:");
      for (const warning of payload.warnings) {
        console.log(`      - ${warning}`);
      }
    }
  } catch (error) {
    console.error("[failed] Dashboard refresh failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
