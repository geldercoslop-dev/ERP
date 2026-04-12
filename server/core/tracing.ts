import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { context, propagation, trace } from "@opentelemetry/api";
import { logger } from "../_core/logger.js";
import type { RequestWithTenant } from "../types/request-with-tenant.js";

export type TraceContext = {
  traceId: string;
  tenantId: number | null;
};

const traceStore = new AsyncLocalStorage<TraceContext>();

function normalizeTraceId(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
}

function createTraceId(): string {
  return normalizeTraceId(randomUUID());
}

export function runWithTraceContext<T>(traceContext: TraceContext, fn: () => T): T {
  return traceStore.run(traceContext, fn);
}

export function getTraceContext(): TraceContext | null {
  return traceStore.getStore() ?? null;
}

export function getTraceId(): string {
  const current = getTraceContext();
  return current?.traceId ?? createTraceId();
}

export async function withSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const tracer = trace.getTracer("erp-core-tracing");
  return tracer.startActiveSpan(name, async (span) => {
    try {
      return await fn();
    } finally {
      span.end();
    }
  });
}

export function traceMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const incomingTraceIdHeader = req.headers["x-trace-id"];
  const incomingTraceId = typeof incomingTraceIdHeader === "string" ? incomingTraceIdHeader : "";
  const traceId = incomingTraceId ? normalizeTraceId(incomingTraceId) : createTraceId();

  let tenantId: number | null = null;
  // Narrowing seguro para RequestWithTenant
  if ('user' in req && req.user && typeof (req as RequestWithTenant).user?.tenantId === "number" && Number.isInteger((req as RequestWithTenant).user?.tenantId) && (req as RequestWithTenant).user?.tenantId > 0) {
    tenantId = (req as RequestWithTenant).user?.tenantId;
  }

  const carrier: Record<string, string> = { "x-trace-id": traceId };
  const extractedContext = propagation.extract(context.active(), carrier);

  context.with(extractedContext, () => {
    runWithTraceContext({ traceId, tenantId }, () => {
      logger.info({ traceId, tenantId }, "trace_context_started");
      next();
    });
  });
}
