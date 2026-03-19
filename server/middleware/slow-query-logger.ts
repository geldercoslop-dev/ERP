/**
 * Middleware para detectar e logar consultas lentas ao banco de dados
 * 
 * Intercepta consultas ao banco de dados e registra aquelas que demoram mais de 500ms
 */

import { createLogger } from '../infra/structured-logger';
import { recordDatabase } from '../infra/metrics';
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
  }).catch(error => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Registrar métrica para consulta com erro
    recordDatabase({
      query: truncateQuery(query),
      duration,
      timestamp: new Date(),
      success: false,
      error: error.message,
      tenantId
    });
    
    // Logar erro na consulta
    logger.error(`Query error: ${error.message}`, {
      error: error.message,
      query: truncateQuery(query),
      duration,
      tenantId,
      metadata: {
        stack: error.stack,
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage
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

/**
 * Wrapper para aplicar monitoramento em um objeto de conexão de banco de dados
 */
export function wrapDatabaseConnection(connection: any): any {
  const originalExecute = connection.execute;
  const originalQuery = connection.query;
  
  // Substituir método execute
  connection.execute = function(query: string, params?: any[]): Promise<any> {
    return monitorQuery(
      typeof query === 'string' ? query : String(query), 
      () => originalExecute.apply(this, arguments),
      params?.[0]?.tenantId || this.tenantId
    );
  };
  
  // Substituir método query
  if (originalQuery) {
    connection.query = function(query: string, params?: any[]): Promise<any> {
      return monitorQuery(
        typeof query === 'string' ? query : String(query), 
        () => originalQuery.apply(this, arguments),
        params?.[0]?.tenantId || this.tenantId
      );
    };
  }
  
  return connection;
}

export default { monitorQuery, wrapDatabaseConnection };