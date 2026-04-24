/**
 * Runtime de invocação de serviços - extraído do _core para desacoplar LEO
 * Mantém exatamente a mesma lógica e comportamento
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { ValidationError } from "../_core/errors/typed-errors.js";
const INTERNAL_CONTEXT_TOKEN = Symbol("SERVICE_CONTEXT");
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
export async function runWithServiceInvocationAsync(store, fn) {
    return als.run(store, fn);
}
/** Bootstrap do servidor (system) - permite getDb antes de rotas. */
export function buildBootstrapInvocation(tenantId) {
    const tid = Number.isFinite(tenantId) && tenantId > 0 ? tenantId : 1;
    return Object.freeze({
        tenantId: tid,
        userId: 1,
        role: "system",
        __fromTool: true,
        __token: INTERNAL_CONTEXT_TOKEN,
    });
}
/** tRPC autenticado: mesma marca de entrada autorizada que o executor de tools. */
export function buildTrpcInvocationContext(ctx) {
    const user = ctx.user;
    if (!user) {
        throw new ValidationError("buildTrpcInvocationContext: usuário ausente");
    }
    const tenantRaw = ctx.tenantId ?? user.tenantId ?? null;
    const tenantId = typeof tenantRaw === "number" && tenantRaw > 0 ? tenantRaw : 0;
    if (!tenantId) {
        throw new ValidationError("buildTrpcInvocationContext: tenantId inválido");
    }
    const userId = user.id;
    if (!userId || userId <= 0) {
        throw new ValidationError("buildTrpcInvocationContext: userId inválido");
    }
    const role = "admin"; // Simplificado para este contexto
    return Object.freeze({
        tenantId,
        userId,
        role,
        userRole: user.role,
        vendedorId: ctx.vendedor?.id,
        __fromTool: true,
        __token: INTERNAL_CONTEXT_TOKEN,
    });
}
export function isValidServiceContext(store) {
    return (typeof store === "object" &&
        store !== null &&
        store.__fromTool === true &&
        store.__token === INTERNAL_CONTEXT_TOKEN);
}
