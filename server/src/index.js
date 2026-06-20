import dotenv from "dotenv";
import { createApp } from "./app.js";
import { createDashboardService } from "./services/dashboardService.js";

dotenv.config({ path: new URL("../../.env", import.meta.url), quiet: true });

const env = process.env;
const port = Number(env.PORT ?? 3001);
const dashboardService = createDashboardService(env);
const app = createApp(dashboardService);

app.listen(port, async () => {
  console.log(`Macro dashboard server listening on http://localhost:${port}`);
  try {
    await dashboardService.refreshAndNotify();
  } catch (error) {
    console.error("Initial refresh failed:", error);
  }
});

const pollIntervalMinutes = Number(env.POLL_INTERVAL_MINUTES ?? 30);
if (Number.isFinite(pollIntervalMinutes) && pollIntervalMinutes > 0) {
  const pollIntervalMs = pollIntervalMinutes * 60 * 1000;
  setInterval(() => {
    dashboardService.refreshAndNotify().catch((error) => {
      console.error("Scheduled refresh failed:", error);
    });
  }, pollIntervalMs);
}
