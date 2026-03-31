import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { createLogger } from "../infra/structured-logger.js";

const logger = createLogger("request-id");

type ReqWithId = Request & { requestId?: string };

export function requestIdMiddleware(
  req: ReqWithId,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.get("x-request-id")?.trim();
  const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();

  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  logger.info("request received", {
    requestId,
    path: req.originalUrl || req.url,
    method: req.method,
    metadata: {
      context: "HTTP",
      ip: req.ip,
    },
  });

  next();
}

export function getRequestId(req: Request): string {
  return (req as ReqWithId).requestId ?? "unknown";
}
