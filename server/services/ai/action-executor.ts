/**
 * Action Executor para o LEO — usa registry dinâmico de tools.
 * Integra: permissões, log, cache, timeout (3s), execution guard (5 tools / 10s por requisição).
 */

import { toolRegistry } from "../../leo/agent/tool-registry";
import type { ToolContext } from "../../leo/agent/tool-registry";
import type { ServiceInvocationStore } from "../../_core/service-entry-guard";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../../_core/service-entry-guard";
import {
  reconstructLeoToolExecutionIdentity,
  stripForbiddenKeysFromToolInput,
  toSecureToolContext,
} from "../../_core/tenant-ownership";
import { logger } from "../../utils/logger";
import { checkToolPermission } from "../../leo/security/tool-permissions";
import { logAction } from "./leo-action-logger";
import { getCached, setCached } from "./leo-query-cache";
import { executeWithTimeout } from "./tool-timeout";
import type { ExecutionGuard } from "./leo-execution-guard";

const CACHEABLE_TOOLS = new Set(["listar_pedidos", "resumo_financeiro", "listar_estoque"]);
const TOOL_TIMEOUT_MS = 3000;

export type ActionResponse = {
  success: boolean;
  message: string;
  data?: unknown;
  meta?: Record<string, unknown>;
};

export type ActionParams = {
  nome?: string;
  clienteId?: number;
  numero?: number;
  pedidoId?: number;
  dados?: Record<string, unknown>;
  actor?: { userId?: number; vendedorId?: number };
  [key: string]: unknown;
};

export type ActionExecutorContext = {
  tenantId: number;
  userId?: number;
  userRole?: string;
  vendedorId?: number;
  /** Guard opcional: limita tools por requisição e tempo total */
  guard?: ExecutionGuard;
};

export class ActionExecutor {
  /**
   * Executa uma ação via registry dinâmico de tools.
   * Garante tenantId e userId em todas as execuções.
   */
  public static async execute(
    tenantId: number,
    action: string,
    params: ActionParams,
    context?: Partial<ActionExecutorContext>
  ): Promise<ActionResponse> {
    logger.info({ message: "LEO executando ação", action, tenantId });

    if (context?.userId == null || !Number.isFinite(Number(context.userId)) || Number(context.userId) <= 0) {
      return { success: false, message: "Execução LEO recusada: userId ausente ou inválido." };
    }

    const vendedorIdClaim =
      context?.vendedorId ?? (params.actor?.vendedorId as number | undefined);
    let identity;
    try {
      identity = await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () =>
        reconstructLeoToolExecutionIdentity({
          tenantId,
          userId: context.userId,
          userRole: context.userRole,
          vendedorId: vendedorIdClaim,
        })
      );
    } catch (e) {
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
      const msg = "message" in perm ? perm.message : "Permissão insuficiente";
      return { success: false, message: msg };
    }

    if (context?.guard && !context.guard.canRunTool()) {
      return {
        success: false,
        message: "Limite de execução atingido (máximo de tools ou tempo por requisição).",
      };
    }

    const tool = toolRegistry.getTool(action);
    if (!tool) {
      return {
        success: false,
        message: `Ação "${action}" não reconhecida. Use uma tool registrada (ex.: buscar_cliente, listar_pedidos, resumo_financeiro, listar_estoque).`,
      };
    }

    const ctx: ToolContext = {
      ...toSecureToolContext(identity),
      userRole: identity.userRole,
      __fromTool: true,
    };

    const cacheKey = CACHEABLE_TOOLS.has(action)
      ? `leo:${tenantId}:${identity.userRole}:${identity.vendedorId ?? 0}:${action}:${JSON.stringify(params)}`
      : null;
    if (cacheKey) {
      const cached = getCached<ActionResponse>(cacheKey);
      if (cached) return cached;
    }

    const start = Date.now();
    try {
      const safeParams = stripForbiddenKeysFromToolInput({ ...params } as Record<string, unknown>);
      const parsed = tool.inputSchema.safeParse(safeParams);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join("; ");
        return { success: false, message: `Parâmetros inválidos: ${msg}` };
      }

      const result = await runWithServiceInvocationAsync(ctx as ServiceInvocationStore, () =>
        executeWithTimeout(
          tool.handler(parsed.data as Record<string, unknown>, ctx),
          TOOL_TIMEOUT_MS
        )
      );
      context?.guard?.recordToolExecuted();
      const normalized = result && typeof result === "object" && "success" in result
        ? (result as ActionResponse)
        : { success: true, message: "Ok", data: result };
      const response: ActionResponse = {
        success: normalized.success,
        message: normalized.message ?? "",
        data: normalized.data,
        meta: normalized.meta,
      };
      const executionTime = Date.now() - start;
      if (cacheKey && response.success) setCached(cacheKey, response);
      logAction({
        tool: action,
        input: params,
        result: response.data,
        success: response.success,
        executionTime,
        ctx: { tenantId, userId: context?.userId },
      }).catch(() => {});
      return response;
    } catch (error) {
      context?.guard?.recordToolExecuted();
      const executionTime = Date.now() - start;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({
        message: "Erro ao executar ação do LEO",
        action,
        params: params as Record<string, unknown>,
        error: errorMsg,
      });
      logAction({
        tool: action,
        input: params,
        result: errorMsg,
        success: false,
        executionTime,
        ctx: { tenantId, userId: context?.userId },
      }).catch(() => {});
      return {
        success: false,
        message: `Erro na execução: ${errorMsg}`,
      };
    }
  }
}
