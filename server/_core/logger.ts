import pino from "pino";

const level =
  process.env.LOG_LEVEL ??
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

type BaseLogMethod = (obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]) => void;

export interface LoggerLike {
  info: BaseLogMethod;
  warn: BaseLogMethod;
  error: BaseLogMethod;
  debug: BaseLogMethod;
  child: (bindings: Record<string, unknown>) => LoggerLike;
}

function wrapPino(p: pino.Logger): LoggerLike {
  const emit =
    (fn: "info" | "warn" | "error" | "debug") =>
    (obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]) => {
      const log = p[fn].bind(p) as (a: unknown, b?: string) => void;
      if (typeof obj === "string") {
        if (msg !== undefined) log(obj, msg);
        else log(obj);
        return;
      }
      if (msg !== undefined && msg !== "") {
        log(obj as object, msg);
      } else {
        log(obj as object);
      }
    };

  return {
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error"),
    debug: emit("debug"),
    child: (bindings: Record<string, unknown>) => wrapPino(p.child(bindings)),
  };
}

export const logger: LoggerLike = wrapPino(rootPino);

export const createChildLogger = (module: string, additionalContext: Record<string, unknown> = {}) => {
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

export interface LogContext {
  [key: string]: unknown;
}

export const logInfo = (data: Record<string, unknown> | string, context?: LogContext) => {
  if (typeof data === "string") {
    logger.info({ message: data, ...context });
  } else {
    logger.info({ ...data, ...context });
  }
};

export const logWarn = (data: Record<string, unknown> | string, context?: LogContext) => {
  if (typeof data === "string") {
    logger.warn({ message: data, ...context });
  } else {
    logger.warn({ ...data, ...context });
  }
};

export const logDebug = (data: Record<string, unknown> | string, context?: LogContext) => {
  if (typeof data === "string") {
    logger.debug({ message: data, ...context });
  } else {
    logger.debug({ ...data, ...context });
  }
};

export const logError = (data: Record<string, unknown> | string, error?: Error | unknown, context?: LogContext) => {
  if (typeof data === "string") {
    if (error instanceof Error) {
      logger.error({ ...context, error: { message: error.message, stack: error.stack, name: error.name } }, data);
    } else if (error) {
      logger.error({ ...context, error: String(error) }, data);
    } else {
      logger.error(context || {}, data);
    }
  } else {
    logger.error({ ...data, ...context });
  }
};

export interface ErrorLogData {
  errorType: string;
  route?: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export const logCriticalError = (data: ErrorLogData) => {
  const { errorType, route, message, stack, context } = data;

  logger.error(
    {
      module: "critical-error",
      errorType,
      route,
      message,
      stack,
      ...context,
      timestamp: new Date().toISOString(),
    },
    `[CRITICAL ERROR] ${errorType}: ${message}`
  );
};

export const logPerformance = (operation: string, duration: number, details?: Record<string, unknown>) => {
  systemLogger.info(
    {
      operation,
      duration: `${duration}ms`,
      ...details,
    },
    `Performance: ${operation}`
  );
};

export const logRequest = (method: string, url: string, statusCode: number, duration?: number, userId?: string) => {
  apiLogger.info(
    {
      method,
      url,
      statusCode,
      duration: duration ? `${duration}ms` : undefined,
      userId,
    },
    `HTTP ${method} ${url} - ${statusCode}`
  );
};

export default logger;
