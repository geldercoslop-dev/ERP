import { randomUUID } from "crypto";
import { createLogger } from "../infra/structured-logger.js";
const logger = createLogger("request-id");
export function requestIdMiddleware(req, res, next) {
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
export function getRequestId(req) {
    return req.requestId ?? "unknown";
}
