/**
 * Contexto de segurança canônico para tools, actions e pontos de entrada LEO.
 * IDs numéricos alinhados ao banco (tenant/usuário); não usar string para não duplicar conversões.
 *
 * Nota: serviços de domínio continuam usando `ServiceActor` em paralelo; este tipo cobre a camada de execução de tools.
 */

export type SecureRole = "admin" | "vendedor" | "system";

/** Contexto mínimo obrigatório para qualquer execução tipada de tool. */
export type SecureContext = {
  tenantId: number;
  userId: number;
  role: SecureRole;
  /** Obrigatório quando role === "vendedor" em fluxos de dados sensíveis. */
  vendedorId?: number;
};

/** Payload único para execução de tool (entrada + contexto). */
export type ToolExecutionPayload = {
  toolName: string;
  input: Record<string, unknown>;
  context: SecureContext;
};

/**
 * Contexto passado ao handler de toda tool (executor + registry).
 * Inclui `userRole` legado opcional para mapeamento em permissões.
 */
export type SecureToolContext = SecureContext & {
  /** @deprecated Preferir `role`. */
  userRole?: string;
  /**
   * true quando a cadeia veio do ToolExecutor, ActionExecutor, tRPC autenticado ou bootstrap interno.
   * Obrigatório para getDb quando SERVICE_ENTRY_GUARD está ativo (padrão: ativo exceto SERVICE_ENTRY_GUARD=0).
   */
  __fromTool?: boolean;
};

export function isSecureContext(value: unknown): value is SecureContext {
  if (value == null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.tenantId === "number" &&
    o.tenantId > 0 &&
    typeof o.userId === "number" &&
    o.userId > 0 &&
    (o.role === "admin" || o.role === "vendedor" || o.role === "system")
  );
}

export function assertSecureContext(value: unknown): asserts value is SecureContext {
  if (!isSecureContext(value)) {
    throw new Error("SecureContext inválido: tenantId, userId e role são obrigatórios");
  }
}

/**
 * Deriva o papel seguro a partir do que o HTTP/JWT costuma enviar.
 */
export function secureRoleFromRequest(userRole?: string, vendedorId?: number): SecureRole {
  const r = (userRole || "").toLowerCase();
  if (r === "admin") return "admin";
  if (vendedorId != null && Number.isFinite(vendedorId) && vendedorId > 0) return "vendedor";
  if (r === "vendedor" || r === "user") return "vendedor";
  return "system";
}

/** Para PermissionContext legado que usa userRole string. */
export function permissionUserRoleFromSecure(ctx: SecureContext): string {
  if (ctx.role === "admin") return "admin";
  if (ctx.role === "vendedor") return "vendedor";
  return "user";
}
