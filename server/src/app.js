import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { createApiRouter } from "./routes/api.js";

export function createApp(dashboardService) {
  const app = express();
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const clientDistDir = path.resolve(currentDir, "../../client/dist");
  app.use(cors());
  app.use(express.json());

  app.use("/api", createApiRouter(dashboardService));

  if (fs.existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(clientDistDir, "index.html"));
    });
  }

  app.use((error, _req, res, _next) => {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  });

  return app;
}
