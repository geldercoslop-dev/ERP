/**
 * Gate global de invocação de serviços: exige contexto de origem autorizada (tool / HTTP autenticado / bootstrap).
 * Usa AsyncLocalStorage para não alterar todas as assinaturas de uma vez.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { TrpcContext } from "./context";
import type { SecureRole, SecureToolContext } from "./secure-context";
import { assertSecureContext, isSecureContext, secureRoleFromRequest } from "./secure-context";

/** Contexto armazenado na cadeia async (serviços + getDb). */
export type ServiceInvocationStore = SecureToolContext & { __fromTool: true };

const als = new AsyncLocalStorage<ServiceInvocationStore>();

export function getServiceInvocationStore(): ServiceInvocationStore | undefined {
  return als.getStore();
}

export function runWithServiceInvocation<T>(store: ServiceInvocationStore, fn: () => T): T {
  return als.run(store, fn);
}

export async function runWithServiceInvocationAsync<T>(
  store: ServiceInvocationStore,
  fn: () => Promise<T>
): Promise<T> {
  return als.run(store, fn);
}

/** Bootstrap do servidor (system) — permite getDb antes de rotas. */
export function buildBootstrapInvocation(tenantId: number): ServiceInvocationStore {
  const tid = Number.isFinite(tenantId) && tenantId > 0 ? tenantId : 1;
  return {
    tenantId: tid,
    userId: 1,
    role: "system",
    __fromTool: true,
  };
}

/** tRPC autenticado: mesma marca de entrada autorizada que o executor de tools. */
export function buildTrpcInvocationContext(ctx: TrpcContext): ServiceInvocationStore {
  const user = ctx.user;
  if (!user) {
    throw new Error("buildTrpcInvocationContext: usuário ausente");
  }
  const tenantRaw = ctx.tenantId ?? user.tenantId ?? null;
  const tenantId = typeof tenantRaw === "number" && tenantRaw > 0 ? tenantRaw : 0;
  if (!tenantId) {
    throw new Error("buildTrpcInvocationContext: tenantId inválido");
  }
  const userId = user.id;
  if (!userId || userId <= 0) {
    throw new Error("buildTrpcInvocationContext: userId inválido");
  }
  const role: SecureRole = secureRoleFromRequest(
    user.role === "admin" ? "admin" : user.role ?? undefined,
    ctx.vendedor?.id
  );
  return {
    tenantId,
    userId,
    role,
    userRole: user.role,
    vendedorId: ctx.vendedor?.id,
    __fromTool: true,
  };
}

function validateInvocationStore(store: ServiceInvocationStore): void {
  assertSecureContext(store);
  if (store.__fromTool !== true) {
    throw new Error("SECURITY: service só pode ser chamado via tool ou entrada autorizada (__fromTool)");
  }
}

/**
 * Chamado por getDb (e opcionalmente por validadores). Respeita SERVICE_ENTRY_GUARD=0 (testes/scripts).
 */
export function assertServiceEntryIfEnabled(): void {
  if (process.env.SERVICE_ENTRY_GUARD === "0") {
    return;
  }
  const store = als.getStore();
  if (!store) {
    const error = new Error(
      "SECURITY: contexto de serviço ausente — use runWithServiceInvocation / executor de tools / tRPC autenticado"
    );
    // Adicionar metadados para facilitar debugging
    (error as any).code = "SERVICE_CONTEXT_MISSING";
    (error as any).timestamp = new Date().toISOString();
    (error as any).suggestion = "Envolver chamada com runWithServiceInvocationAsync(buildBootstrapInvocation(tenantId), async () => { ... })";
    throw error;
  }
  validateInvocationStore(store);
}

/** Validação explícita (testes com contexto manual). */
export function assertSecureServiceInvocation(context: unknown): asserts context is ServiceInvocationStore {
  if (!isSecureContext(context) || (context as SecureToolContext).__fromTool !== true) {
    throw new Error("SECURITY: service só pode ser chamado via tool ou entrada autorizada (__fromTool)");
  }
  validateInvocationStore(context as ServiceInvocationStore);
}
