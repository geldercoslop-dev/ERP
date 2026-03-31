/**
 * Middleware para detectar e logar consultas lentas ao banco de dados
 * 
 * Intercepta consultas ao banco de dados e registra aquelas que demoram mais de 500ms
 */

import { createLogger } from '../infra/structured-logger.js';
import { recordDatabase } from '../infra/metrics.js';
import { performance } from 'perf_hooks';

const logger = createLogger('slow-query');

// Limite de tempo para considerar uma consulta como lenta (em ms)
const SLOW_QUERY_THRESHOLD = 500;

/**
 * Wrapper para monitorar tempo de execução de consultas
 */
export function monitorQuery<T>(
  query: string, 
  fn: () => Promise<T>, 
  tenantId?: number
): Promise<T> {
  const startTime = performance.now();
  
  return fn().then(result => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Registrar métrica para todas as consultas
    recordDatabase({
      query: truncateQuery(query),
      duration,
      timestamp: new Date(),
      success: true,
      tenantId
    });
    
    // Logar apenas consultas lentas
    if (duration > SLOW_QUERY_THRESHOLD) {
      logger.warn(`Slow query detected: ${duration.toFixed(2)}ms`, {
        duration,
        query: truncateQuery(query),
        tenantId,
        metadata: {
          threshold: SLOW_QUERY_THRESHOLD,
          timestamp: new Date().toISOString()
        }
      });
    }
    
    return result;
  }).catch((error: unknown) => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    const errSql = err as Error & {
      code?: string;
      errno?: number;
      sqlState?: string;
      sqlMessage?: string;
    };
    
    // Registrar métrica para consulta com erro
    recordDatabase({
      query: truncateQuery(query),
      duration,
      timestamp: new Date(),
      success: false,
      error: err.message,
      tenantId
    });
    
    // Logar erro na consulta
    logger.error(`Query error: ${err.message}`, {
      error: err.message,
      query: truncateQuery(query),
      duration,
      tenantId,
      metadata: {
        stack: err.stack,
        code: errSql.code,
        errno: errSql.errno,
        sqlState: errSql.sqlState,
        sqlMessage: errSql.sqlMessage
      }
    });
    
    throw error;
  });
}

/**
 * Trunca a consulta para evitar logs muito grandes
 */
function truncateQuery(query: string): string {
  const maxLength = 500;
  if (query.length <= maxLength) return query;
  return query.substring(0, maxLength) + '...';
}

type DbConnectionLike = {
  execute: (query: unknown, ...args: unknown[]) => Promise<unknown>;
  query?: (query: unknown, ...args: unknown[]) => Promise<unknown>;
  tenantId?: number;
};

function tenantIdFromFirstArg(rest: unknown[]): number | undefined {
  const first = rest[0];
  if (first !== null && typeof first === "object" && !Array.isArray(first) && "tenantId" in first) {
    const t = (first as { tenantId?: unknown }).tenantId;
    if (typeof t === "number" && Number.isFinite(t)) {
      return t;
    }
  }
  return undefined;
}

export function wrapDatabaseConnection<T extends DbConnectionLike>(connection: T): T {
  const boundExecute = connection.execute.bind(connection);
  const boundQuery = connection.query?.bind(connection);

  connection.execute = function (this: T, query: unknown, ...rest: unknown[]): Promise<unknown> {
    const q = typeof query === "string" ? query : String(query);
    const tenant = tenantIdFromFirstArg(rest) ?? this.tenantId;
    return monitorQuery(q, () => boundExecute(query, ...rest), tenant);
  };

  if (boundQuery) {
    connection.query = function (this: T, query: unknown, ...rest: unknown[]): Promise<unknown> {
      const q = typeof query === "string" ? query : String(query);
      const tenant = tenantIdFromFirstArg(rest) ?? this.tenantId;
      return monitorQuery(q, () => boundQuery(query, ...rest), tenant);
    };
  }

  return connection;
}

export default { monitorQuery, wrapDatabaseConnection };