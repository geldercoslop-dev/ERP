import { createLogger } from "../infra/structured-logger.js";
import * as ordersService from "./orders.service.js";
import * as financeService from "./finance.service.js";
import { assertVendedorActor } from "../_core/service-actor.js";
import { ValidationError } from "../_core/errors/typed-errors.js";
const logger = createLogger("leo-action-service");
const actionLogs = [];
const MAX_LOGS = 500;
function actorForCreatePedido(actor) {
    const r = (actor.role || "").toLowerCase();
    if (r === "admin") {
        return { role: "admin", userId: actor.userId };
    }
    if (r === "vendedor" && actor.vendedorId != null && actor.vendedorId > 0) {
        return { role: "vendedor", vendedorId: actor.vendedorId, userId: actor.userId };
    }
    return { userId: actor.userId, vendedorId: actor.vendedorId };
}
function appendLog(entry) {
    actionLogs.push(entry);
    if (actionLogs.length > MAX_LOGS) {
        actionLogs.splice(0, actionLogs.length - MAX_LOGS);
    }
    logger.info("LEO action lifecycle", {
        metadata: entry,
    });
}
function actorLabel(actor) {
    if (actor.userName && actor.userName.trim() !== "")
        return actor.userName;
    if (actor.userId)
        return `user:${actor.userId}`;
    return "leo-admin";
}
function actorRole(actor) {
    return actor.role && actor.role.trim() !== "" ? actor.role : "unknown";
}
export class LeoActionService {
    async executeAction(request) {
        const now = new Date().toISOString();
        const label = actorLabel(request.actor);
        const role = actorRole(request.actor);
        const isCriticalAction = request.action === "CREATE_ORDER" ||
            request.action === "PROCESS_PAYMENT";
        if (isCriticalAction && role !== "admin") {
            return {
                ok: false,
                requiresConfirmation: false,
                message: "Apenas admin pode executar ações críticas do LEO.",
                action: request.action,
                timestamp: now,
            };
        }
        if (request.confirmed === true && request.payload === undefined) {
            return {
                ok: false,
                requiresConfirmation: false,
                message: "Payload obrigatório para executar a ação confirmada.",
                action: request.action,
                timestamp: now,
            };
        }
        if (!request.confirmed) {
            appendLog({
                action: request.action,
                actor: label,
                actorRole: role,
                tenantId: request.actor.tenantId,
                timestamp: now,
                result: "CONFIRMATION_REQUIRED",
                detail: "Aguardando confirmação do operador",
            });
            return {
                ok: true,
                requiresConfirmation: true,
                message: `Confirmar ação: ${request.action}?`,
                action: request.action,
                timestamp: now,
            };
        }
        try {
            const result = await this.runAction(request);
            appendLog({
                action: request.action,
                actor: label,
                actorRole: role,
                tenantId: request.actor.tenantId,
                timestamp: now,
                result: "SUCCESS",
                detail: "Ação executada com sucesso",
            });
            return {
                ok: true,
                requiresConfirmation: false,
                message: `Ação ${request.action} executada com sucesso.`,
                action: request.action,
                timestamp: now,
                result,
            };
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            appendLog({
                action: request.action,
                actor: label,
                actorRole: role,
                tenantId: request.actor.tenantId,
                timestamp: now,
                result: "ERROR",
                detail,
            });
            return {
                ok: false,
                requiresConfirmation: false,
                message: `Falha ao executar ${request.action}: ${detail}`,
                action: request.action,
                timestamp: now,
            };
        }
    }
    getLogs(limit = 100) {
        const safeLimit = Math.max(1, Math.min(limit, MAX_LOGS));
        return actionLogs.slice(-safeLimit).reverse();
    }
    getHealth() {
        return {
            status: "ok",
            logCount: actionLogs.length,
            lastLog: actionLogs.length > 0 ? actionLogs[actionLogs.length - 1] : undefined,
        };
    }
    async runAction(request) {
        const body = request.payload;
        if (body === undefined) {
            throw new ValidationError("Payload ausente para execução.");
        }
        switch (request.action) {
            case "CREATE_ORDER": {
                const payload = body;
                const actor = actorForCreatePedido(request.actor);
                const currentRole = actorRole(request.actor);
                // Validação de segurança para vendedor
                if (currentRole === "vendedor") {
                    const serviceActor = { role: "vendedor", userId: request.actor.userId, vendedorId: request.actor.vendedorId };
                    assertVendedorActor(serviceActor);
                }
                if ("role" in actor && actor.role === "admin") {
                    throw new ValidationError("CREATE_ORDER: vendedorId não pode vir do payload; use sessão de vendedor");
                }
                const created = await ordersService.createPedidoSafe(request.actor.tenantId, {
                    vendedorId: 0,
                    clienteId: payload.clienteId,
                    clienteNome: payload.clienteNome,
                    subtotal: payload.subtotal,
                    desconto: payload.desconto,
                    frete: payload.frete,
                    total: payload.total,
                    formaPagamento: payload.formaPagamento ?? null,
                    observacoes: payload.observacoes ?? null,
                    itens: payload.itens,
                }, actor);
                return {
                    pedidoId: created.pedidoId,
                    numero: created.numero,
                    status: created.status,
                };
            }
            case "PROCESS_PAYMENT": {
                const payload = body;
                const updated = await financeService.marcarContaRecebida(request.actor.tenantId, payload.contaId, payload.dataRecebimento, payload.formaPagamento);
                return {
                    contaId: payload.contaId,
                    success: updated.success,
                };
            }
            case "REGISTER_SALE": {
                const payload = body;
                const actor = actorForCreatePedido(request.actor);
                const vid = "role" in actor && actor.role === "vendedor" && "vendedorId" in actor
                    ? actor.vendedorId
                    : request.actor.vendedorId;
                return {
                    vendedorId: vid,
                    clienteId: payload.clienteId,
                    clienteNome: payload.clienteNome,
                    total: payload.total,
                    registrado: true,
                };
            }
        }
    }
}
export const leoActionService = new LeoActionService();
