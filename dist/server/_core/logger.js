import pino from "pino";
const level = process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug");
/**
 * Logger raiz Pino (JSON estruturado em stdout).
 * Usado por `pino-http` e por wrappers compatíveis com o restante do código.
 */
export const rootPino = pino({
    level,
    base: { service: "erp-server" },
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "password",
            "senha",
            "*.password",
            "*.senha",
        ],
        remove: true,
    },
    serializers: {
        err: pino.stdSerializers.err,
    },
});
function wrapPino(p) {
    const emit = (fn) => (obj, msg, ...args) => {
        const log = p[fn].bind(p);
        if (typeof obj === "string") {
            if (msg !== undefined)
                log(obj, msg);
            else
                log(obj);
            return;
        }
        if (msg !== undefined && msg !== "") {
            log(obj, msg);
        }
        else {
            log(obj);
        }
    };
    return {
        info: emit("info"),
        warn: emit("warn"),
        error: emit("error"),
        debug: emit("debug"),
        child: (bindings) => wrapPino(p.child(bindings)),
    };
}
export const logger = wrapPino(rootPino);
export const createChildLogger = (module, additionalContext = {}) => {
    return logger.child({
        module,
        ...additionalContext,
    });
};
export const authLogger = createChildLogger("auth");
export const dbLogger = createChildLogger("database");
export const apiLogger = createChildLogger("api");
export const systemLogger = createChildLogger("system");
export const securityLogger = createChildLogger("security");
export const logInfo = (data, context) => {
    if (typeof data === "string") {
        logger.info({ message: data, ...context });
    }
    else {
        logger.info({ ...data, ...context });
    }
};
export const logWarn = (data, context) => {
    if (typeof data === "string") {
        logger.warn({ message: data, ...context });
    }
    else {
        logger.warn({ ...data, ...context });
    }
};
export const logDebug = (data, context) => {
    if (typeof data === "string") {
        logger.debug({ message: data, ...context });
    }
    else {
        logger.debug({ ...data, ...context });
    }
};
export const logError = (data, error, context) => {
    if (typeof data === "string") {
        if (error instanceof Error) {
            logger.error({ ...context, error: { message: error.message, stack: error.stack, name: error.name } }, data);
        }
        else if (error) {
            logger.error({ ...context, error: String(error) }, data);
        }
        else {
            logger.error(context || {}, data);
        }
    }
    else {
        logger.error({ ...data, ...context });
    }
};
export const logCriticalError = (data) => {
    const { errorType, route, message, stack, context } = data;
    logger.error({
        module: "critical-error",
        errorType,
        route,
        message,
        stack,
        ...context,
        timestamp: new Date().toISOString(),
    }, `[CRITICAL ERROR] ${errorType}: ${message}`);
};
export const logPerformance = (operation, duration, details) => {
    systemLogger.info({
        operation,
        duration: `${duration}ms`,
        ...details,
    }, `Performance: ${operation}`);
};
export const logRequest = (method, url, statusCode, duration, userId) => {
    apiLogger.info({
        method,
        url,
        statusCode,
        duration: duration ? `${duration}ms` : undefined,
        userId,
    }, `HTTP ${method} ${url} - ${statusCode}`);
};
export default logger;
