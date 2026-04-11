/**
 * Database Transaction Safety Wrapper
 * 
 * Utilitário para gerenciar transações de banco de forma segura
 */

import { drizzle } from "drizzle-orm/mysql2";
import * as mysql from "mysql2/promise";
import { getDb } from '../db/index.js';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { getConnectionPool } from "../config/database.js";

export type TransactionCallback<T> = (tx: mysql.PoolConnection) => Promise<T>;

/**
 * Executa uma função dentro de uma transação de banco de dados
 * Garante rollback automático em caso de erro
 */
export async function runTransaction<T>(
  callback: TransactionCallback<T>,
  isolationLevel: 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE' = 'READ_COMMITTED'
): Promise<T> {
  const dbConnection = await getDb();
  if (!dbConnection) {
    throw new InfrastructureError("Database connection not available");
  }

  // Obter conexão do pool em vez de criar uma nova
  const pool = await getConnectionPool();
  const connection = await pool.getConnection();

  // Configurar timeout para evitar travamento infinito
  await connection.execute('SET SESSION innodb_lock_wait_timeout = 10'); // 10 segundos
  await connection.execute('SET SESSION max_execution_time = 15000'); // 15 segundos (MySQL 5.7+)
  
  await connection.beginTransaction();

  try {
    // Definir nível de isolamento da transação
    await connection.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
    
    console.log(`[Transaction] Iniciada com isolamento: ${isolationLevel}`);
    
    const result = await callback(connection);
    
    await connection.commit();
    console.log('[Transaction] Commit realizado com sucesso');
    
    return result;
  } catch (error: unknown) {
    await connection.rollback();
    console.error('[Transaction] Rollback executado:', error instanceof Error ? error.message : String(error));
    
    // Propagar erro para tratamento superior
    throw error;
  } finally {
    // Liberar a conexão de volta para o pool em vez de fechá-la
    connection.release();
    console.log('[Transaction] Conexão liberada para o pool');
  }
}

/**
 * Executa múltiplas operações em paralelo dentro de uma transação
 */
export async function runParallelTransaction<T>(
  callbacks: Array<TransactionCallback<T>>,
  isolationLevel: 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE' = 'SERIALIZABLE'
): Promise<T[]> {
  return runTransaction(async (tx) => {
    // allSettled garante rastreabilidade individual de cada falha;
    // se qualquer callback falhar o erro é relançado para o runTransaction
    // executar o rollback automático da transação inteira.
    const settled = await Promise.allSettled(callbacks.map(callback => callback(tx)));
    const results: T[] = [];
    const errors: string[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      } else {
        errors.push(outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason));
      }
    }
    if (errors.length > 0) {
      throw new InfrastructureError(`runParallelTransaction: ${errors.length} callback(s) falhou: ${errors.join('; ')}`);
    }
    return results;
  }, isolationLevel);
}

/**
 * Verifica se uma tabela está bloqueada
 */
export async function isTableLocked(tableName: string): Promise<boolean> {
  // Obter conexão do pool em vez de criar uma nova
  const pool = await getConnectionPool();
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.execute(
      `SELECT COUNT(*) as locked FROM INFORMATION_SCHEMA.INNODB_LOCKS WHERE TABLE_NAME = ?`,
      [tableName]
    );
    
    const row0 = (rows as unknown as Record<string, unknown>[])[0];
    const locked = Number(row0?.locked ?? 0);
    return locked > 0;
  } catch (error) {
    console.error(`[Transaction] Erro ao verificar bloqueio da tabela ${tableName}:`, error);
    return false;
  } finally {
    // Liberar a conexão de volta para o pool em vez de fechá-la
    connection.release();
  }
}

/**
 * Obtém informações sobre bloqueios ativos
 */
export async function getActiveLocks(): Promise<Array<{
  lockType: string;
  tableName: string;
  waitTime: number;
  sqlStatement: string;
}>> {
  // Obter conexão do pool em vez de criar uma nova
  const pool = await getConnectionPool();
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.execute(`
      SELECT 
        l.lock_type as lockType,
        l.table_name as tableName,
        l.lock_wait_time as waitTime,
        l.sql_text as sqlStatement
      FROM INFORMATION_SCHEMA.INNODB_LOCKS l
      JOIN INFORMATION_SCHEMA.INNODB_LOCK_WAITS w ON l.lock_id = w.requesting_lock_id
      ORDER BY l.lock_wait_time DESC
    `);

    return rows as unknown as Array<{
      lockType: string;
      tableName: string;
      waitTime: number;
      sqlStatement: string;
    }>;
  } catch (error) {
    console.error('[Transaction] Erro ao obter bloqueios ativos:', error);
    throw new InfrastructureError('Falha ao consultar bloqueios ativos do banco', { cause: error });
  } finally {
    // Liberar a conexão de volta para o pool em vez de fechá-la
    connection.release();
  }
}

/**
 * Wrapper específico para operações de estoque com retry automático
 */
export async function runStockTransaction<T>(
  callback: TransactionCallback<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Usar SERIALIZABLE para evitar race conditions em estoque
      return await runTransaction(callback, 'SERIALIZABLE');
    } catch (error: unknown) {
      lastError = error;
      
      // Verificar se é erro de deadlock ou lock wait timeout
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryableError = 
        errorMessage.includes('Deadlock found') ||
        errorMessage.includes('Lock wait timeout') ||
        errorMessage.includes('Duplicate entry') ||
        errorMessage.includes('Connection lost') ||
        errorMessage.includes('Server has gone away') ||
        errorMessage.includes('ER_LOCK_DEADLOCK') ||
        errorMessage.includes('ER_LOCK_WAIT_TIMEOUT') ||
        errorMessage.includes('ETIMEDOUT');
      
      if (isRetryableError && attempt < maxRetries) {
        // Exponential backoff com jitter
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
          30000 // Máximo de 30 segundos
        );
        
        console.log(`[StockTransaction] Tentativa ${attempt}/${maxRetries} falhou, retry em ${Math.round(delay)}ms. Erro: ${errorMessage}`);
        
        // Aguardar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Se não for retryable ou for última tentativa, propagar erro
      console.error(`[StockTransaction] Falha após ${attempt} tentativas. Erro final: ${errorMessage}`);
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * Wrapper genérico com retry automático para qualquer operação
 */
export async function runTransactionWithRetry<T>(
  callback: TransactionCallback<T>,
  options: {
    isolationLevel?: 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
    maxRetries?: number;
    baseDelay?: number;
    retryableErrors?: string[];
  } = {}
): Promise<T> {
  const {
    isolationLevel = 'READ_COMMITTED',
    maxRetries = 3,
    baseDelay = 1000,
    retryableErrors = ['Deadlock found', 'Lock wait timeout', 'Duplicate entry', 'Connection lost', 'Server has gone away']
  } = options;
  
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await runTransaction(callback, isolationLevel);
    } catch (error: unknown) {
      lastError = error;
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryableError = retryableErrors.some(retryableError => 
        errorMessage.includes(retryableError)
      );
      
      if (isRetryableError && attempt < maxRetries) {
        // Exponential backoff com jitter
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
          30000 // Máximo de 30 segundos
        );
        
        console.log(`[TransactionWithRetry] Tentativa ${attempt}/${maxRetries} falhou, retry em ${Math.round(delay)}ms. Erro: ${errorMessage}`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Se não for retryable ou for última tentativa, propagar erro
      console.error(`[TransactionWithRetry] Falha após ${attempt} tentativas. Erro final: ${errorMessage}`);
      throw error;
    }
  }
  
  throw lastError;
}
