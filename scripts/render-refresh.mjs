import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const envPath = new URL("../.env", import.meta.url);

if (fs.existsSync(fileURLToPath(envPath))) {
  dotenv.config({ path: fileURLToPath(envPath), quiet: true });
}

const refreshUrl = process.env.REFRESH_URL ?? (process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/api/refresh` : "http://127.0.0.1:3001/api/refresh");
const timeoutMs = Number(process.env.REFRESH_TIMEOUT_MS ?? 120000);

if (!refreshUrl) {
  console.error("REFRESH_URL or PUBLIC_BASE_URL must be configured");
  process.exit(1);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120000);

try {
  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.REFRESH_TOKEN ? { "x-refresh-token": process.env.REFRESH_TOKEN } : {}),
    },
    signal: controller.signal,
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`Refresh failed: ${response.status} ${response.statusText}`);
    if (text) {
      console.error(text);
    }
    process.exit(1);
  }

  console.log(text || "Refresh completed");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
