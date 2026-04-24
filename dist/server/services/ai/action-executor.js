// BLOQUEADO — LOTE 1 FINALIZADO
// ISOLAMENTO LEO + HARDEN CONCLUÍDO
// NÃO ALTERAR SEM AUTORIZAÇÃO
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../../runtime/service-invocation.js";
import { reconstructLeoToolExecutionIdentity, stripForbiddenKeysFromInput as stripForbiddenKeysFromToolInput, } from "../../leo/runtime/tenant-ownership.js";
import { logger } from "../../utils/logger.js";
// LEO ISOLADO — import removido
// import { checkToolPermission } from "../../leo/security/tool-permissions.js";
// Stub para checkToolPermission — LEO ISOLADO
function checkToolPermission(_action, _userRole) {
    return { allowed: true }; // Permitir tudo durante transição
}
import { logAction } from "./leo-action-logger.js";
import { getCached, setCached } from "./leo-query-cache.js";
const CACHEABLE_TOOLS = new Set(["listar_pedidos", "resumo_financeiro", "listar_estoque"]);
const TOOL_TIMEOUT_MS = 15000;
const TOOL_RETRIES = 2;
/**
 * Extrai mensagem de erro de forma determinística sem JSON.stringify
 */
function getErrorMessage(err) {
    if (err instanceof Error)
        return err.message;
    if (typeof err === "string")
        return err;
    if (typeof err === "number" || typeof err === "boolean") {
        return String(err);
    }
    if (err && typeof err === "object") {
        if ("message" in err && typeof err.message === "string") {
            return err.message;
        }
        return "[object error]";
    }
    return "[unknown error]";
}
/**
 * Retorna valor ou lança erro se null/undefined
 */
function valueOrThrow(val, msg) {
    if (val === null || val === undefined) {
        throw new Error(msg);
    }
    return val;
}
export class ActionExecutor {
    /**
     * Executa uma ação via registry dinâmico de tools.
     * Garante tenantId e userId em todas as execuções.
     */
    static async execute(tenantId, action, params, context) {
        logger.info({
            message: "LEO entrada recebida",
            action,
            tenantId,
            userId: context?.userId,
            vendedorId: context?.vendedorId,
        });
        if (context?.userId == null || !Number.isFinite(Number(context.userId)) || Number(context.userId) <= 0) {
            return { success: false, message: "Execução LEO recusada: userId ausente ou inválido." };
        }
        const vendedorIdClaim = context?.vendedorId ?? params.actor?.vendedorId;
        let identity;
        try {
            identity = await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => reconstructLeoToolExecutionIdentity({
                tenantId,
                userId: context.userId,
                userRole: context.userRole,
                vendedorId: vendedorIdClaim,
            }));
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { success: false, message: msg };
        }
        if (identity.tenantId !== tenantId) {
            return {
                success: false,
                message: "SECURITY: tenantId da requisição não coincide com o tenant do usuário autenticado.",
            };
        }
        const perm = checkToolPermission(action, identity.userRole);
        if (!perm.allowed) {
            const msg = "message" in perm && perm.message ? perm.message : "Permissão insuficiente";
            return { success: false, message: msg };
        }
        if (context?.guard && !context.guard.canRunTool()) {
            return {
                success: false,
                message: "Limite de execução atingido (máximo de tools ou tempo por requisição).",
            };
        }
        // LEO ISOLADO — toolRegistry removido
        throw new Error("LEO ISOLADO — toolRegistry não disponível");
        /*
        const tool = toolRegistry.getTool(action);
        if (!tool) {
          return {
            success: false,
            message: `Ação "${action}" não reconhecida. Use uma tool registrada (ex.: buscar_cliente, listar_pedidos, resumo_financeiro, listar_estoque).`,
          };
        }
        */
        const ctx = {
            tenantId: identity.tenantId,
            userId: identity.userId,
            userRole: identity.userRole ?? "",
            vendedorId: identity.vendedorId,
            __fromTool: true,
        };
        const cacheKey = CACHEABLE_TOOLS.has(action)
            ? `leo:${tenantId}:${identity.userRole}:${identity.vendedorId ?? 0}:${action}:${JSON.stringify(params)}`
            : "";
        if (cacheKey) {
            const cachedResult = getCached(cacheKey);
            if (cachedResult !== null) {
                const cached = valueOrThrow(cachedResult, "CACHE INVÁLIDO");
                return cached;
            }
        }
        const start = Date.now();
        try {
            const safeParams = stripForbiddenKeysFromToolInput({ ...params });
            // LEO ISOLADO — validação de schema de tool removida
            /*
            const parsed = tool.inputSchema.safeParse(safeParams);
            if (!parsed.success) {
              const msg = parsed.error.issues.map((i) => i.message).join("; ");
              return { success: false, message: `Parâmetros inválidos: ${msg}` };
            }
            */
            logger.info({ message: "LEO ação executada", action, tenantId });
            // LEO ISOLADO — execução de tool removida
            throw new Error("LEO ISOLADO — execução de tool não disponível");
            /*
            const result = await runWithServiceInvocationAsync(ctx as ServiceInvocationStore, () =>
              executeWithFailSafe(
                () => tool.handler(parsed.data as Record<string, unknown>, ctx),
                { timeoutMs: TOOL_TIMEOUT_MS, retries: TOOL_RETRIES, toolName: action }
              )
            );
            */
            const result = { success: false, message: "LEO ISOLADO" };
            context?.guard?.recordToolExecuted();
            const normalized = result && typeof result === "object" && "success" in result
                ? result
                : { success: true, message: "Ok", data: result };
            const response = {
                success: normalized.success,
                message: normalized.message ?? "",
                data: normalized.data,
                meta: normalized.meta,
            };
            const executionTime = Date.now() - start;
            if (cacheKey && response.success)
                setCached(cacheKey ?? "", response);
            logAction({
                tool: action,
                input: params,
                result: response.data,
                success: response.success,
                executionTime,
                ctx: { tenantId, userId: context?.userId },
            }).catch(() => { });
            return response;
        }
        catch (err) {
            context?.guard?.recordToolExecuted();
            const executionTime = Date.now() - start;
            const errorMsg = getErrorMessage(err);
            logger.error({
                message: "LEO erro em execução de ação",
                action,
                params: params,
                tenantId,
                userId: context?.userId,
                error: errorMsg,
            });
            logAction({
                tool: action,
                input: params,
                result: errorMsg,
                success: false,
                executionTime,
                ctx: { tenantId, userId: context?.userId },
            }).catch(() => { });
            return {
                success: false,
                message: `Erro na execução: ${errorMsg}`,
            };
        }
    }
}
