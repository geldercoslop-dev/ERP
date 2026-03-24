export type FrontendLogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";

export type FrontendLogContext = {
  component?: string;
  action?: string;
  endpoint?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  requestId?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
};

export type FrontendLogEntry = {
  timestamp: string;
  level: FrontendLogLevel;
  message: string;
  context?: FrontendLogContext;
  stack?: string;
};

class FrontendLogger {
  private readonly isDev = import.meta.env.DEV;
  private readonly maxEntries = 500;
  private readonly entries: FrontendLogEntry[] = [];

  private append(entry: FrontendLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    if (!this.isDev) return;
    const label = `[FRONT ${entry.level}] ${entry.message}`;
    if (entry.level === "ERROR") console.error(label, entry.context, entry.stack);
    else if (entry.level === "WARN") console.warn(label, entry.context);
    else if (entry.level === "INFO") console.info(label, entry.context);
    else console.debug(label, entry.context);
  }

  private makeEntry(
    level: FrontendLogLevel,
    message: string,
    context?: FrontendLogContext,
    error?: Error
  ): FrontendLogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      stack: error?.stack,
    };
  }

  error(message: string, context?: FrontendLogContext, error?: Error): void {
    this.append(this.makeEntry("ERROR", message, context, error));
  }

  warn(message: string, context?: FrontendLogContext): void {
    this.append(this.makeEntry("WARN", message, context));
  }

  info(message: string, context?: FrontendLogContext): void {
    this.append(this.makeEntry("INFO", message, context));
  }

  debug(message: string, context?: FrontendLogContext): void {
    if (!this.isDev) return;
    this.append(this.makeEntry("DEBUG", message, context));
  }

  apiError(
    endpointOrParams:
      | string
      | {
          endpoint: string;
          method: string;
          status: number;
          message: string;
          requestId?: string;
          durationMs?: number;
        },
    method?: string,
    status?: number,
    message?: string
  ): void {
    const params =
      typeof endpointOrParams === "string"
        ? {
            endpoint: endpointOrParams,
            method: method ?? "GET",
            status: status ?? 0,
            message: message ?? "Erro de API",
          }
        : endpointOrParams;
    this.error(params.message, {
      action: "api_error",
      endpoint: params.endpoint,
      method: params.method,
      status: params.status,
      requestId: params.requestId,
      durationMs: params.durationMs,
    });
  }

  apiSuccess(
    endpointOrParams:
      | string
      | {
          endpoint: string;
          method: string;
          status: number;
          requestId?: string;
          durationMs: number;
        },
    method?: string,
    status?: number,
    durationMs?: number
  ): void {
    const params =
      typeof endpointOrParams === "string"
        ? {
            endpoint: endpointOrParams,
            method: method ?? "GET",
            status: status ?? 200,
            durationMs: durationMs ?? 0,
          }
        : endpointOrParams;
    this.info("API request concluido", {
      action: "api_success",
      endpoint: params.endpoint,
      method: params.method,
      status: params.status,
      requestId: params.requestId,
      durationMs: params.durationMs,
    });
  }

  apiWarn(endpoint: string, method: string, status: number, message: string): void {
    this.warn(message, {
      action: "api_warn",
      endpoint,
      method,
      status,
    });
  }

  getEntries(): FrontendLogEntry[] {
    return [...this.entries];
  }

  getLogs(): FrontendLogEntry[] {
    return this.getEntries();
  }
}

export const logger = new FrontendLogger();
