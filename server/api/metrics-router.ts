/**
 * Endpoint de métricas internas
 * GET /api/metrics/current → métricas em tempo real
 */

import { Router } from "express";
import { metricsService } from "../monitoring/metrics.js";

export function createMetricsRouter() {
  const router = Router();

  router.get("/current", (req, res) => {
    const metrics = metricsService.getMetrics();
    res.json({
      timestamp: Date.now(),
      metrics,
      alerts: metricsService.checkAlerts(),
    });
  });

  router.post("/reset", (req, res) => {
    // Apenas em dev/test
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({ error: "Forbidden" });
    }
    metricsService.reset();
    res.json({ ok: true });
  });

  return router;
}

export default createMetricsRouter();
