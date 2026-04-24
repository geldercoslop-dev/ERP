/**
 * Contexto de invocação para scripts, migrações e testes de integração.
 * Mapeia para `ServiceInvocationStore` (bootstrap) — não acede ao DB aqui.
 */
import { buildBootstrapInvocation, runWithServiceInvocationAsync, } from "../../server/runtime/service-invocation.js";
export function createServiceContext() {
    return {
        actor: { id: "system", role: "admin" },
        tenantId: 999,
        requestId: "system-script",
    };
}
/**
 * Executa `fn` com contexto de serviço válido para `getDb()` (guard ativo).
 */
export async function runWithServiceContext(ctx, fn) {
    const tid = typeof ctx.tenantId === "number" && Number.isFinite(ctx.tenantId) && ctx.tenantId > 0
        ? ctx.tenantId
        : 1;
    return runWithServiceInvocationAsync(buildBootstrapInvocation(tid), fn);
}
/** Atalho: contexto padrão de script (`createServiceContext`). */
export async function runAsScriptService(fn) {
    return runWithServiceContext(createServiceContext(), fn);
}
