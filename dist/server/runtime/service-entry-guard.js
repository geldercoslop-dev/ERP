/**
 * Gate global de invocação de serviços: exige contexto de origem autorizada (tool / HTTP autenticado / bootstrap).
 * Usa AsyncLocalStorage para não alterar todas as assinaturas de uma vez.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { assertSecureContext, isSecureContext } from "../_core/secure-context.js";
import { InfrastructureError } from "../_core/errors/typed-errors.js";
export class ServiceContextMissingError extends Error {
    code = "SERVICE_CONTEXT_MISSING";
    timestamp;
    suggestion;
    constructor() {
        super("SECURITY: contexto de serviço ausente - use runWithServiceInvocation / executor de tools / tRPC autenticado");
        this.name = "ServiceContextMissingError";
        this.timestamp = new Date().toISOString();
        this.suggestion =
            "Envolver chamada com runWithServiceInvocationAsync(buildBootstrapInvocation(tenantId), async () => { ... })";
    }
}
const als = new AsyncLocalStorage();
export function getServiceInvocationStore() {
    return als.getStore();
}
export function runWithServiceInvocation(store, fn) {
    return als.run(store, fn);
}
function validateInvocationStore(store) {
    assertSecureContext(store);
    if (store.__fromTool !== true) {
        throw new InfrastructureError("SECURITY: service só pode ser chamado via tool ou entrada autorizada (__fromTool)");
    }
}
/**
 * Chamado por getDb (e opcionalmente por validadores). Respeita SERVICE_ENTRY_GUARD=0 (testes/scripts).
 */
export function assertServiceEntryIfEnabled() {
    if (process.env.SERVICE_ENTRY_GUARD === "0") {
        return;
    }
    const store = als.getStore();
    if (!store) {
        throw new ServiceContextMissingError();
    }
    validateInvocationStore(store);
}
/** Validação explícita (testes com contexto manual). */
export function assertSecureServiceInvocation(context) {
    if (!isSecureContext(context) || context.__fromTool !== true) {
        throw new InfrastructureError("SECURITY: service só pode ser chamado via tool ou entrada autorizada (__fromTool)");
    }
    validateInvocationStore(context);
}
