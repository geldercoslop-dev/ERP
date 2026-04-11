/**
 * Rota GET /insights do Dashboard Inteligente do ERP.
 * Retorno: produtos que vão faltar, clientes inativos, vendedores abaixo da média,
 * pedidos em atraso, contas a receber vencidas.
 */

import { Router, Request, Response } from "express";
import { getDashboardInsights } from "../services/dashboard-insights.service.js";
import { getDashboardCache, setDashboardCache } from "../tools/dashboard-cache.js";
import { logAuditAction } from "../services/audit-log.service.js";
import { nanoid } from "nanoid";
import { requireAuthContext } from "../middlewares/require-auth-context.js";
import { requireTenantFromRequest } from '../_core/tenant-utils.js';

const router = Router();

/**
 * GET /insights
 * Resposta em cache por 60 segundos por tenant.
 */
router.get("/insights", requireAuthContext, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantFromRequest(req);
    const cached = getDashboardCache(tenantId);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true,
        timestamp: new Date().toISOString(),
      });
    }
    const data = await getDashboardInsights(tenantId);
    setDashboardCache(tenantId, data as Record<string, unknown>);
    await logAuditAction("dashboard_view", "dashboard", { view: "insights" }, { tenantId, traceId: nanoid(10) });
    res.json({
      success: true,
      data,
      cached: false,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("[Dashboard] Erro em /insights:", error instanceof Error ? error.message : String(error));
    res.status(500).json({
      success: false,
      error: "Erro ao gerar insights do dashboard",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
