import type { NextFunction, Request, Response } from "express";
import { context, propagation, trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";
import { nanoid } from "nanoid";
import { runWithObservabilityContext } from "./observability-context";
import { createLogger } from "./structured-logger";

const logger = createLogger("observability-middleware");
const otelTracer = trace.getTracer("erp-server");

function getIncomingRequestId(req: Request): string {
  const value = req.get("X-Request-ID");
  return value && value.trim() !== "" ? value : nanoid(10);
}

export function observabilityMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const extractedContext = propagation.extract(context.active(), req.headers);
    const span = otelTracer.startSpan(
      `http.${req.method} ${req.path}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.method": req.method,
          "http.route": req.path,
          "http.target": req.originalUrl,
          "http.user_agent": req.get("User-Agent") ?? "",
        },
      },
      extractedContext
    );

    const spanContext = span.spanContext();
    const requestId = getIncomingRequestId(req);
    req.requestId = requestId;
    req.traceId = spanContext.traceId;
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("X-Trace-Id", spanContext.traceId);

    const otelContext = trace.setSpan(extractedContext, span);
    const start = Date.now();

    runWithObservabilityContext(
      { traceId: spanContext.traceId, spanId: spanContext.spanId, requestId },
      () => {
        context.with(otelContext, () => {
          res.once("finish", () => {
            span.setAttributes({
              "http.status_code": res.statusCode,
              "http.response_time_ms": Date.now() - start,
            });
            if (res.statusCode >= 500) {
              span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${res.statusCode}` });
            } else {
              span.setStatus({ code: SpanStatusCode.OK });
            }
            span.end();
          });

          res.once("error", (error: Error) => {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            span.end();
            logger.error("HTTP response error", error, { requestId, traceId: spanContext.traceId });
          });

          next();
        });
      }
    );
  };
}

