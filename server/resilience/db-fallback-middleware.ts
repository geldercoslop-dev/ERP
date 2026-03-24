/**
 * Database Fallback Middleware
 * Detecta erros de banco de dados e retorna resposta amigável
 * Garante que LEO nunca quebra o servidor
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../infra/structured-logger';

const logger = createLogger('db-fallback');

// Estender tipo Request com propriedade requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

// Types de erro de banco de dados conhecidos
const DATABASE_ERROR_PATTERNS = [
  /ECONNREFUSED/i, // Conexão recusada
  /ETIMEDOUT/i, // Timeout
  /PROTOCOL_CONNECTION_LOST/i, // Conexão perdida
  /database.*not.*found/i, // BD não encontrada
  /access.*denied/i, // Acesso negado
  /cannot.*open.*database/i, // Não conseguir abrir BD
  /connection.*pool.*unavailable/i, // Pool indisponível
  /sql/i, // Erro SQL genérico
];

interface DatabaseError extends Error {
  code?: string;
  sqlState?: string;
  sqlMessage?: string;
  errno?: number;
}

/**
 * Verifica se um erro é de banco de dados
 */
function isDatabaseError(error: unknown): error is DatabaseError {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMsg = error.message + (error.toString ?? '');

  // Verificar padrões conhecidos
  for (const pattern of DATABASE_ERROR_PATTERNS) {
    if (pattern.test(errorMsg)) {
      return true;
    }
  }

  // Verificar propriedades específicas de erros de BD
  const dbError = error as DatabaseError;
  if (
    dbError.code === 'PROTOCOL_ERROR' ||
    dbError.code === 'ER_' ||
    dbError.sqlState !== undefined ||
    dbError.sqlMessage !== undefined
  ) {
    return true;
  }

  return false;
}

/**
 * Mapeia erros de BD para HTTP status codes apropriados
 */
function mapDatabaseErrorToStatus(error: DatabaseError): number {
  if (
    error.code?.includes('ER_ACCESS_DENIED') ||
    error.code?.includes('ER_DBACCESS_DENIED')
  ) {
    return 401; // Unauthorized
  }

  if (
    error.code?.includes('ER_NO_SUCH_TABLE') ||
    error.code?.includes('ER_BAD_FIELD_ERROR')
  ) {
    return 500; // Internal Server Error (schema issue)
  }

  // Todos os outros erros de BD são 503 Service Unavailable
  return 503;
}

/**
 * Middleware wrapper para operações que podem falhar
 */
export async function withDatabaseFallback<T>(
  operation: () => Promise<T>,
  operationName: string,
  fallbackValue?: T
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    if (isDatabaseError(error)) {
      const dbError = error as DatabaseError;
      logger.error(
        `Database operation failed: ${operationName}`,
        dbError,
        {
          metadata: {
            operation: operationName,
            code: dbError.code,
            message: dbError.message,
            errno: dbError.errno,
          },
        }
      );
      return fallbackValue;
    }

    // Re-throw non-database errors
    throw error;
  }
}

/**
 * Express middleware para fallback de erros de BD em rotas
 */
export function databaseFallbackMiddleware() {
  return (err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (!isDatabaseError(err)) {
      // Passar para próximo error handler
      return next(err);
    }

    const dbError = err as DatabaseError;
    const statusCode = mapDatabaseErrorToStatus(dbError);

    logger.error(
      `Database error in request: ${req.method} ${req.path}`,
      dbError,
      {
        metadata: {
          path: req.path,
          method: req.method,
          code: dbError.code,
          message: dbError.message,
          requestId: req.requestId,
        },
      }
    );

    // Resposta amigável (não expõe detalhes internos)
    res.status(statusCode).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message:
          statusCode === 503
            ? 'Banco de dados temporariamente indisponível. Tente novamente em instantes.'
            : 'Erro ao acessar banco de dados',
        details: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      },
    });
  };
}

/**
 * Wrapper type-safe para operações de BD
 */
export class DatabaseFallbackHandler {
  static wrap<T>(
    operation: () => Promise<T>,
    operationName: string,
    defaultValue?: T
  ): Promise<T | undefined> {
    return withDatabaseFallback(operation, operationName, defaultValue);
  }

  /**
   * Para operações que PRECISAM de um valor
   */
  static async wrapRequired<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      if (isDatabaseError(error)) {
        logger.error(
          `Required database operation failed: ${operationName}`,
          error as Error,
          {
            metadata: {
              operation: operationName,
            },
          }
        );
        return null;
      }
      throw error;
    }
  }

  /**
   * Para operações que podem retornar array vazio
   */
  static async wrapArray<T>(
    operation: () => Promise<T[]>,
    operationName: string
  ): Promise<T[]> {
    try {
      return await operation();
    } catch (error) {
      if (isDatabaseError(error)) {
        logger.error(
          `Database array operation failed: ${operationName}`,
          error as Error,
          {
            metadata: {
              operation: operationName,
            },
          }
        );
        return [];
      }
      throw error;
    }
  }

  /**
   * Para operações que podem retornar booleano (sucesso/falha)
   */
  static async wrapBoolean(
    operation: () => Promise<boolean>,
    operationName: string
  ): Promise<boolean> {
    try {
      return await operation();
    } catch (error) {
      if (isDatabaseError(error)) {
        logger.error(
          `Database boolean operation failed: ${operationName}`,
          error as Error,
          {
            metadata: {
              operation: operationName,
            },
          }
        );
        return false;
      }
      throw error;
    }
  }
}

/**
 * Helper para health check de BD
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const { getConnectionPool } = await import('../config/database');
    const pool = await getConnectionPool();
    if (!pool) {
      return false;
    }
    // Simples ping para verificar conexão
    await (pool as { query: (sql: string) => Promise<unknown> }).query('SELECT 1');
    return true;
  } catch (error) {
    if (isDatabaseError(error)) {
      logger.warn('Database health check failed', error as Error);
      return false;
    }
    throw error;
  }
}
