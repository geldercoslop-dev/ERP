import { createLogger } from '../infra/structured-logger.js';
import { getObservabilityContext } from "../infra/observability-context.js";

/**
 * Logger Seguro - Remove dados sensíveis automaticamente
 */
export class SecureLogger {
  private static readonly SENSITIVE_FIELDS = [
    'password', 'senha', 'pass', 'passwd',
    'token', 'jwt', 'bearer', 'authorization',
    'secret', 'key', 'apikey', 'api_key',
    'credit_card', 'cvv', 'ssn', 'cpf'
  ];

  private static readonly SENSITIVE_PATTERNS = [
    /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/gi,
    /["']?password["']?\s*[:=]\s*["'][^"']+["']/gi,
    /["']?senha["']?\s*[:=]\s*["'][^"']+["']/gi,
    /["']?token["']?\s*[:=]\s*["'][^"']+["']/gi,
    /\b[A-Za-z0-9]{32,}\b/g, // Possíveis tokens/chaves longas
    // Connection strings (evita literal "@" seguido de "/" no arquivo-fonte por causa do delimitador "/")
    new RegExp("mysql://[^@]+:[^@]+@", "gi"),
  ];

  /**
   * Remove dados sensíveis de objetos
   */
  static sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: this.sanitizeString(obj.message || ''),
        stack: obj.stack ? this.sanitizeString(obj.stack) : undefined,
      };
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Verificar se é campo sensível
      if (this.SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Sanitizar valores recursivamente
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Remove dados sensíveis de strings
   */
  static sanitizeString(str: string): string {
    let sanitized = str;

    // Aplicar padrões de substituição
    for (const pattern of this.SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, (match) => {
        // Preservar tipo de dado mas mascarar valor
        if (match.toLowerCase().includes('password') || match.toLowerCase().includes('senha')) {
          return match.replace(/["']?[^"']+["']?/g, '"[REDACTED]"');
        }
        if (match.toLowerCase().includes('token') || match.toLowerCase().includes('bearer')) {
          return '[REDACTED_TOKEN]';
        }
        if (match.includes('mysql://')) {
          return match.replace(new RegExp("mysql://[^@]+:[^@]+@", "gi"), "mysql://[USER]:[REDACTED]@");
        }
        return '[REDACTED]';
      });
    }

    return sanitized;
  }

  /**
   * Logger seguro para informações
   */
  static info(message: string, meta?: any) {
    const logger = createLogger('secure-logger');
    logger.info(message, {
      metadata: meta ? this.sanitizeObject(meta) : undefined
    });
  }

  /**
   * Logger seguro para warnings
   */
  static warn(message: string, meta?: any) {
    const logger = createLogger('secure-logger');
    logger.warn(message, {
      metadata: meta ? this.sanitizeObject(meta) : undefined
    });
  }

  /**
   * Logger seguro para erros
   */
  static error(message: string, error?: Error, meta?: any) {
    const logger = createLogger('secure-logger');
    logger.error(message, error, {
      metadata: meta ? this.sanitizeObject(meta) : undefined
    });
  }

  /**
   * Logger seguro para debug (apenas em desenvolvimento)
   */
  static debug(message: string, meta?: any) {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const logger = createLogger('secure-logger');
    logger.info(`[DEBUG] ${message}`, {
      metadata: meta ? this.sanitizeObject(meta) : undefined
    });
  }

  /**
   * Logger para auditoria de segurança
   */
  static security(message: string, meta?: any) {
    const logger = createLogger('security-audit');
    logger.warn(`[SECURITY] ${message}`, {
      metadata: meta ? this.sanitizeObject(meta) : undefined,
      severity: 'HIGH'
    });
  }

  /**
   * Logger para eventos críticos
   */
  static critical(message: string, meta?: any) {
    const logger = createLogger('critical-events');
    logger.error(`[CRITICAL] ${message}`, undefined, {
      metadata: meta ? this.sanitizeObject(meta) : undefined,
      severity: 'CRITICAL'
    });
  }
}

/**
 * Middleware para sobrescrever console.log com logger seguro
 */
export function secureConsoleMiddleware() {
  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  const bridgeLogger = createLogger("console-bridge");

  const buildContext = (args: any[]) => {
    const obs = getObservabilityContext();
    const safeArgs = args.map((arg) => {
      if (typeof arg === "string") return SecureLogger.sanitizeString(arg);
      if (typeof arg === "object" && arg !== null) return SecureLogger.sanitizeObject(arg);
      return arg;
    });
    const msg = safeArgs
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");

    return {
      msg,
      ctx: {
        requestId: obs?.requestId,
        traceId: obs?.traceId,
        metadata: {
          args: safeArgs,
        },
      },
    };
  };

  console.log = (...args: any[]) => {
    const { msg, ctx } = buildContext(args);
    bridgeLogger.info(msg, ctx);
    if (process.env.NODE_ENV !== "production") originalLog(...args);
  };

  console.error = (...args: any[]) => {
    const { msg, ctx } = buildContext(args);
    bridgeLogger.error(msg, {
      ...ctx,
      severity: "ERROR",
    });
    if (process.env.NODE_ENV !== "production") originalError(...args);
  };

  console.warn = (...args: any[]) => {
    const { msg, ctx } = buildContext(args);
    bridgeLogger.warn(msg, ctx);
    if (process.env.NODE_ENV !== "production") originalWarn(...args);
  };
}

export default SecureLogger;
