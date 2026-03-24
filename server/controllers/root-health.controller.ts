/**
 * Health na raiz: /health/light (rápido), /health/full (DB + Redis + env).
 */
import { Router } from "express";
import {
  buildSystemHealthFailureResponse,
  getSystemHealthComplete,
  getSystemHealthLight,
} from "../services/system-health.service";
import { systemLogger } from "../_core/logger";

const router = Router();

router.get("/light", (_req, res) => {
  try {
    res.status(200).json(getSystemHealthLight());
  } catch (error: unknown) {
    systemLogger.error({ error: error instanceof Error ? error.message : String(error) }, "health/light failed");
    res.status(503).json({
      status: "error",
      checks: "light",
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/full", async (req, res) => {
  try {
    const healthData = await getSystemHealthComplete();
    const httpStatus = healthData.status === "ok" ? 200 : 503;
    res.status(httpStatus).json({ ...healthData, checks: "full" as const });
  } catch (error: unknown) {
    systemLogger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        traceId: req.traceId,
      },
      "health/full failed"
    );
    res.status(503).json({ ...buildSystemHealthFailureResponse(error), checks: "full" as const });
  }
});

export default router;
