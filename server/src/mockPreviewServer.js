import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import dotenv from "dotenv";
import { createDashboardService } from "./services/dashboardService.js";

dotenv.config({ path: new URL("../../.env", import.meta.url), quiet: true });

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../");
const distDir = path.join(rootDir, "client", "dist");
const samplePath = path.join(rootDir, "server", "data", "sample-dashboard.json");
const port = 4173;
const dashboardService = createDashboardService(process.env);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function ensureReady() {
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    throw new Error("client/dist does not exist. Run npm run build first.");
  }
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "content-type": mimeTypes[ext] ?? "text/plain; charset=utf-8",
  });
  res.end(fs.readFileSync(filePath));
}

async function loadFallbackPayload() {
  if (!fs.existsSync(samplePath)) {
    throw new Error("No sample payload and no cached database payload are available.");
  }
  return JSON.parse(fs.readFileSync(samplePath, "utf8"));
}

async function loadPayload(kind) {
  try {
    if (kind === "refresh") {
      return await dashboardService.refreshAndNotify();
    }
    return await dashboardService.loadDashboard(false);
  } catch {
    return loadFallbackPayload();
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (url === "/api/dashboard") {
      const payload = await loadPayload("dashboard");
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(payload));
      return;
    }

    if (url === "/api/refresh") {
      const payload = await loadPayload("refresh");
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(payload));
      return;
    }

    const cleanPath = url === "/" ? "index.html" : url.replace(/^\/+/, "");
    const candidate = path.join(distDir, cleanPath);
    const finalPath = fs.existsSync(candidate) ? candidate : path.join(distDir, "index.html");
    sendFile(res, finalPath);
  });
}

try {
  ensureReady();
  createServer().listen(port, () => {
    console.log(`Sample preview ready at http://localhost:${port}`);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
