import type { NextFunction, Request, Response } from "express";
import { createLogger } from "../infra/structured-logger.js";
import { getRequestId } from "./request-id.middleware.js";
import { globalErrorRateMonitor } from "../resilience/error-rate-monitor.js";

const logger = createLogger("global-error-handler");

type ErrorWithStatus = Error & {
  status?: number;
  code?: string;
};

export function globalErrorHandler(
  err: ErrorWithStatus,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = Number.isInteger(err.status) ? (err.status as number) : 500;
  const code = typeof err.code === "string" ? err.code : "INTERNAL_ERROR";
  const requestId = getRequestId(req);

  // Registra erro no monitor de taxa de erros
  globalErrorRateMonitor.recordError();

  logger.error("unhandled request error", err, {
    requestId,
    path: req.originalUrl || req.url,
    method: req.method,
    metadata: {
      context: "ERROR",
      status,
      code,
      errorRateStatus: globalErrorRateMonitor.getStatus(),
    },
  });

  if (res.headersSent) return;
  res.status(status).json({
    error: {
      code,
      message: status >= 500 ? "Erro interno" : err.message || "Erro",
      details: { requestId },
    },
  });
}
