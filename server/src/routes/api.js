import { Router } from "express";

export function createApiRouter(dashboardService) {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  router.get("/dashboard", async (_req, res, next) => {
    try {
      const payload = await dashboardService.loadDashboard(false);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post("/refresh", async (_req, res, next) => {
    try {
      const payload = await dashboardService.refreshAndNotify();
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post("/publish/notion", async (_req, res, next) => {
    try {
      const payload = await dashboardService.syncPublishing();
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
