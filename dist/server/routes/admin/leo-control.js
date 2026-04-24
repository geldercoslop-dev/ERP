import { Router } from "express";
import { ZodError } from "zod";
import { requireAdmin } from "../../_core/requireAdmin.js";
import { leoActionService } from "../../services/leoAction.service.js";
import { parseLeoActionPayload } from "../../services/leoActionPayload.parse.js";
function parseLimit(raw) {
    if (typeof raw !== "string")
        return 100;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return 100;
    return Math.min(Math.floor(parsed), 500);
}
function isLeoAction(value) {
    return value === "CREATE_ORDER" || value === "PROCESS_PAYMENT" || value === "REGISTER_SALE";
}
const router = Router();
router.use((req, res, next) => {
    requireAdmin(req, res, next).catch(next);
});
router.get("/health", (_req, res) => {
    res.json({
        ok: true,
        source: "leo-admin",
        ...leoActionService.getHealth(),
    });
});
router.get("/logs", (req, res) => {
    const limit = parseLimit(req.query.limit);
    res.json({
        ok: true,
        data: leoActionService.getLogs(limit),
    });
});
router.post("/actions", async (req, res) => {
    const { action, payload, confirmed, tenantId, userId, userName, role, vendedorId } = req.body;
    if (!isLeoAction(action)) {
        res.status(400).json({ ok: false, message: "Ação inválida para leo-admin." });
        return;
    }
    const parsedTenantId = Number(tenantId);
    if (!Number.isFinite(parsedTenantId) || parsedTenantId <= 0) {
        res.status(400).json({ ok: false, message: "tenantId obrigatório para executar ação." });
        return;
    }
    const confirmedBool = typeof confirmed === "boolean" ? confirmed : false;
    let parsedPayload;
    if (confirmedBool) {
        try {
            parsedPayload = parseLeoActionPayload(action, payload ?? {});
        }
        catch (err) {
            if (err instanceof ZodError) {
                const flat = err.flatten();
                const parts = [...flat.formErrors];
                for (const msgs of Object.values(flat.fieldErrors)) {
                    if (Array.isArray(msgs)) {
                        for (const m of msgs) {
                            if (typeof m === "string")
                                parts.push(m);
                        }
                    }
                }
                res.status(400).json({
                    ok: false,
                    message: parts.length > 0 ? parts.join("; ") : "Payload inválido para a ação.",
                });
                return;
            }
            if (err instanceof Error) {
                res.status(400).json({ ok: false, message: err.message });
                return;
            }
            res.status(400).json({ ok: false, message: "Payload inválido para a ação." });
            return;
        }
    }
    const response = await leoActionService.executeAction({
        action,
        payload: parsedPayload,
        actor: {
            tenantId: parsedTenantId,
            userId: typeof userId === "number" ? userId : undefined,
            userName: typeof userName === "string" ? userName : undefined,
            role: typeof role === "string" ? role : "admin",
            vendedorId: typeof vendedorId === "number" ? vendedorId : undefined,
        },
        confirmed: confirmedBool,
    });
    const statusCode = response.ok ? 200 : 400;
    res.status(statusCode).json(response);
});
export default router;
