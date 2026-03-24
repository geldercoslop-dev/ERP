/**
 * Instrumentação MySQL com OpenTelemetry
 * Wrapper para pool de conexões com spans de tracing
 */

import { measureDatabaseOperation } from "../_core/opentelemetry";
import { createLogger } from "./structured-logger";

const logger = createLogger("mysql-instrumentation");

interface MySQLInstrumentationConfig {
  pool: any;
  options?: any;
}

export function instrumentMySQL(config: MySQLInstrumentationConfig) {
  const { pool } = config;
  
  // Wrapper para método query
  const originalQuery = pool.query;
  pool.query = function(this: any, ...args: any[]) {
    const query = typeof args[0] === 'string' ? args[0] : args[0]?.sql || 'unknown';
    const params = args.slice(1);
    
    return measureDatabaseOperation('query', query, async () => {
      try {
        const result = await originalQuery.apply(this, args);
        
        // Log com traceId
        logger.info('MySQL query executed', {
          query: query.substring(0, 200),
          metadata: { 
            paramsCount: params.length,
            rowsAffected: Array.isArray(result) ? result.length : (result?.affectedRows || 0)
          },
          success: true,
        });
        
        return result;
      } catch (error) {
        logger.error('MySQL query failed', {
          query: query.substring(0, 200),
          metadata: { paramsCount: params.length },
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        
        throw error;
      }
    });
  };

  // Wrapper para método execute (se existir)
  if (pool.execute) {
    const originalExecute = pool.execute;
    pool.execute = function(this: any, ...args: any[]) {
      const query = typeof args[0] === 'string' ? args[0] : args[0]?.sql || 'unknown';
      const params = args.slice(1);
      
      return measureDatabaseOperation('execute', query, async () => {
        try {
          const result = await originalExecute.apply(this, args);
          
          logger.info('MySQL execute executed', {
            query: query.substring(0, 200),
            metadata: { 
              paramsCount: params.length,
              rowsAffected: Array.isArray(result) ? result.length : (result?.affectedRows || 0)
            },
            success: true,
          });
          
          return result;
        } catch (error) {
          logger.error('MySQL execute failed', {
            query: query.substring(0, 200),
            metadata: { paramsCount: params.length },
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
          
          throw error;
        }
      });
    };
  }

  logger.info('MySQL instrumentation enabled', {
    metadata: { 
      hasQuery: !!pool.query,
      hasExecute: !!pool.execute 
    },
  });

  return pool;
}
