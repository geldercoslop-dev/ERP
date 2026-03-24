import { getDb } from '../db/index';
import { metrics } from './metrics';

/**
 * Wrapper para monitorar queries do banco de dados
 */
export function createMonitoredDb() {
  const originalGetDb = getDb;
  
  return async function monitoredGetDb() {
    const db = await originalGetDb();
    if (!db) return db;
    
    // Monitora queries se o db suportar
    if (typeof db === 'object' && db !== null) {
      monitorDatabaseMethods(db);
    }
    
    return db;
  };
}

/**
 * Adiciona monitoramento aos métodos do banco
 */
function monitorDatabaseMethods(db: any): void {
  // Lista de métodos para monitorar
  const methodsToMonitor = ['execute', 'select', 'insert', 'update', 'delete'];
  
  methodsToMonitor.forEach(methodName => {
    if (typeof db[methodName] === 'function') {
      const originalMethod = db[methodName].bind(db);
      
      db[methodName] = async function(...args: any[]) {
        const startTime = Date.now();
        let success = true;
        let error: string | undefined;
        
        try {
          const result = await originalMethod(...args);
          return result;
        } catch (err) {
          success = false;
          error = err instanceof Error ? err.message : String(err);
          throw err;
        } finally {
          const duration = Date.now() - startTime;
          
          // Registra métricas da query
          metrics.recordDatabase({
            query: `${methodName}(${args.length > 0 ? typeof args[0] === 'string' ? args[0].substring(0, 100) : 'query' : ''})`,
            duration,
            timestamp: new Date(startTime),
            success,
            error,
          });
          
          // Log de query lenta
          if (duration > 300) {
            console.warn(`[DB] Query lenta detectada (${duration}ms):`, {
              method: methodName,
              duration,
              success,
              error,
            });
          }
        }
      };
    }
  });
}

/**
 * Função para logar queries lentas manualmente
 */
export function logSlowQuery(query: string, duration: number, error?: string): void {
  if (duration > 300) {
    console.warn(`[DB] Query lenta (${duration}ms):`, {
      query: query.substring(0, 200),
      duration,
      error,
    });
    
    metrics.recordDatabase({
      query,
      duration,
      timestamp: new Date(),
      success: !error,
      error,
    });
  }
}
