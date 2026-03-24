/**
 * Log de ações do LEO — auditoria de execução de tools.
 * Não bloqueia execução; se falhar, ignora silenciosamente.
 * Usa insertLeoActionLog (db/index) — tabela leo_action_logs compatível.
 */

import { insertLeoActionLog } from "../leo-action-log.service";

export type LeoActionLogContext = {
  tenantId: number;
  userId?: number;
};

export type LeoActionLogInput = {
  tool: string;
  input: unknown;
  result: unknown;
  success: boolean;
  executionTime: number;
  ctx: LeoActionLogContext;
};

/**
 * Registra uma execução de tool. Assíncrono e fire-and-forget.
 * Falhas são ignoradas para não bloquear o fluxo.
 */
export async function logAction(params: LeoActionLogInput): Promise<void> {
  const { tool, input, result, success, ctx } = params;
  try {
    const inputStr = typeof input === "object" && input !== null ? JSON.stringify(input) : String(input);
    const resultStr =
      typeof result === "object" && result !== null ? JSON.stringify(result) : String(result ?? "");
    await insertLeoActionLog({
      usuario: `tenant:${ctx.tenantId}`,
      acao: tool,
      entidade: "leo_action",
      dados: inputStr.length > 65535 ? inputStr.slice(0, 65535) : inputStr,
      resultado: success ? "SUCESSO" : resultStr.slice(0, 500),
    });
  } catch {
    // Ignorar silenciosamente — log não pode bloquear execução
  }
}

type LegacyLeoActionLogInput = {
  usuario: string;
  acao: string;
  entidade: string;
  dados?: string | null;
  resultado: string;
};

/**
 * Compatibilidade com chamadas legadas do LEO.
 * Mantém o mesmo nome de função esperada nos módulos antigos.
 */
export async function insertLeoActionLogCompat(params: LegacyLeoActionLogInput): Promise<void> {
  try {
    const tenantMatch = params.usuario.match(/tenant:(\d+)/i);
    const tenantId = tenantMatch ? Number(tenantMatch[1]) : Number(process.env.DEFAULT_TENANT_ID || process.env.TENANT_ID || 0);
    if (!tenantId || tenantId <= 0) return;
    await logAction({
      tool: params.acao || "unknown",
      input: params.dados ?? "",
      result: params.resultado,
      success: String(params.resultado || "").toUpperCase() === "SUCESSO",
      executionTime: 0,
      ctx: { tenantId },
    });
  } catch {
    // Compat logger não deve interromper fluxo
  }
}

export { insertLeoActionLogCompat as insertLeoActionLog };
