/**
 * Contexto de invocação para scripts, migrações e testes de integração.
 * Mapeia para `ServiceInvocationStore` (bootstrap) — não acede ao DB aqui.
 */
import {
  buildBootstrapInvocation,
  runWithServiceInvocationAsync,
} from "../_core/service-entry-guard.js";

export type ScriptServiceContext = {
  readonly actor: { readonly id: string; readonly role: string };
  readonly tenantId: number;
  readonly requestId: string;
};

export function createServiceContext(): ScriptServiceContext {
  return {
    actor: { id: "system", role: "admin" },
    tenantId: 999,
    requestId: "system-script",
  };
}

/**
 * Executa `fn` com contexto de serviço válido para `getDb()` (guard ativo).
 */
export async function runWithServiceContext<T>(
  ctx: ScriptServiceContext,
  fn: () => Promise<T>
): Promise<T> {
  const tid =
    typeof ctx.tenantId === "number" && Number.isFinite(ctx.tenantId) && ctx.tenantId > 0
      ? ctx.tenantId
      : 1;
  return runWithServiceInvocationAsync(buildBootstrapInvocation(tid), fn);
}

/** Atalho: contexto padrão de script (`createServiceContext`). */
export async function runAsScriptService<T>(fn: () => Promise<T>): Promise<T> {
  return runWithServiceContext(createServiceContext(), fn);
}
