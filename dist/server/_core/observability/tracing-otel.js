import { AsyncLocalStorage } from "node:async_hooks";
import { ValidationError } from '../errors/typed-errors.js';
import { randomUUID } from "node:crypto";
import { context, propagation, trace } from "@opentelemetry/api";
import { logger } from "../logger.js";
const traceStore = new AsyncLocalStorage();
function normalizeTraceId(value) {
    return value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
}
function createTraceId() {
    return normalizeTraceId(randomUUID());
}
export function runWithTraceContext(traceContext, fn) {
    return traceStore.run(traceContext, fn);
}
export function getTraceContext() {
    return traceStore.getStore() ?? null;
}
export function getTraceId() {
    const current = getTraceContext();
    return current?.traceId ?? createTraceId();
}
export async function withSpan(name, fn) {
    const tracer = trace.getTracer("erp-core-tracing");
    return tracer.startActiveSpan(name, async (span) => {
        try {
            return await fn();
        }
        finally {
            span.end();
        }
    });
}
export function traceMiddleware(req, _res, next) {
    const incomingTraceIdHeader = req.headers["x-trace-id"];
    const incomingTraceId = typeof incomingTraceIdHeader === "string" ? incomingTraceIdHeader : "";
    const traceId = incomingTraceId ? normalizeTraceId(incomingTraceId) : createTraceId();
    let tenantId = null;
    // Narrowing seguro para RequestWithTenant
    if (!req.user) {
        throw new ValidationError("Usuário não autenticado");
    }
    if ('user' in req && req.user && typeof req.user?.tenantId === "number" && Number.isInteger(req.user?.tenantId) && req.user?.tenantId > 0) {
        tenantId = req.user?.tenantId;
    }
    const carrier = { "x-trace-id": traceId };
    const extractedContext = propagation.extract(context.active(), carrier);
    context.with(extractedContext, () => {
        runWithTraceContext({ traceId, tenantId }, () => {
            logger.info({ traceId, tenantId }, "trace_context_started");
            next();
        });
    });
}
