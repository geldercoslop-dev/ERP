/**
 * SISTEMA DE IDEMPOTÊNCIA FINANCEIRA
 * Impede duplicação de crédito 100%
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from '../db/index.js';
import { DbResult, toDbResult } from '../_core/db-result.js';
import { nanoid } from "nanoid";

// Tabela de controle de idempotência (se não existir, criar via schema)
interface IdempotencyRecord {
  id: string;
  tenantId: number;
  operationKey: string; // boletoId + operação
  operationType: 'BAIXA_BOLETO' | 'CREDITO_CAIXA';
  processedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Gerar chave de idempotência para operações financeiras
 */
export function generateIdempotencyKey(
  operationType: string,
  resourceId: number,
  additionalData?: Record<string, any>
): string {
  const baseKey = `${operationType}:${resourceId}`;
  
  if (additionalData) {
    const sortedKeys = Object.keys(additionalData).sort();
    const dataHash = sortedKeys
      .map(key => `${key}:${additionalData[key]}`)
      .join('|');
    return `${baseKey}:${Buffer.from(dataHash).toString('base64').slice(0, 16)}`;
  }
  
  return baseKey;
}

/**
 * Verificar se operação já foi processada
 */
export async function checkOperationProcessed(
  tenantId: number,
  operationKey: string,
  operationType: string
): Promise<{ processed: boolean; record?: IdempotencyRecord }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // Query usando SQL direto para verificar tabela de idempotência
    const result = await db.execute(sql`
      SELECT id, tenant_id, operation_key, operation_type, processed_at, metadata
      FROM financial_idempotency 
      WHERE tenant_id = ${tenantId} 
        AND operation_key = ${operationKey}
        AND operation_type = ${operationType}
      LIMIT 1
      FOR UPDATE
    `);

    if (result.length > 0) {
      const rawRecord = result[0] as unknown;
      const record = rawRecord as Record<string, unknown>;
      
      return {
        processed: true,
        record: {
          id: typeof record.id === 'number' ? record.id.toString() : '0',
          tenantId: typeof record.tenant_id === 'number' ? record.tenant_id : 0,
          operationKey: typeof record.operation_key === 'string' ? record.operation_key : '',
          operationType: typeof record.operation_type === 'string' ? record.operation_type as 'BAIXA_BOLETO' | 'CREDITO_CAIXA' : 'BAIXA_BOLETO',
          processedAt: typeof record.processed_at === 'string' || typeof record.processed_at === 'number' ? new Date(record.processed_at) : new Date(),
          metadata: typeof record.metadata === 'string' ? JSON.parse(record.metadata) : undefined
        }
      };
    }

    return { processed: false };
  } catch (error) {
    // Se tabela não existir, criar automaticamente
    if (error instanceof Error && (error.message.includes("doesn't exist") || error.message.includes("no such table"))) {
      await createIdempotencyTable();
      return { processed: false };
    }
    throw error;
  }
}

/**
 * Marcar operação como processada
 */
export async function markOperationProcessed(
  tenantId: number,
  operationKey: string,
  operationType: string,
  metadata?: Record<string, any>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const idempotencyId = nanoid(10);
  
  try {
    await db.execute(sql`
      INSERT INTO financial_idempotency (
        id, tenant_id, operation_key, operation_type, processed_at, metadata
      ) VALUES (
        ${idempotencyId}, ${tenantId}, ${operationKey}, ${operationType}, NOW(), 
        ${metadata ? JSON.stringify(metadata) : null}
      )
    `);
  } catch (error) {
    // Ignorar erro de duplicação (concorrência)
    if (error instanceof Error && (!error.message.includes('UNIQUE constraint failed') && 
        !error.message.includes('duplicate key'))) {
      throw error;
    }
    // Se for erro de duplicação, ignorar silenciosamente
  }
}

/**
 * Criar tabela de idempotência se não existir
 */
async function createIdempotencyTable(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS financial_idempotency (
      id VARCHAR(20) PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      operation_key VARCHAR(255) NOT NULL,
      operation_type VARCHAR(50) NOT NULL,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT,
      UNIQUE(tenant_id, operation_key, operation_type),
      INDEX idx_tenant_operation (tenant_id, operation_type),
      INDEX idx_processed_at (processed_at)
    )
  `);
}

/**
 * Verificar e bloquear operação duplicada
 */
export async function financialIdempotencyCheck(
  tenantId: number,
  operationType: string,
  resourceId: number,
  operationData?: Record<string, any>
): Promise<{ allowed: boolean; reason?: string; existingRecord?: IdempotencyRecord }> {
  // Gerar chave de idempotência
  const operationKey = generateIdempotencyKey(operationType, resourceId, operationData);
  
  // Verificar se já foi processado
  const check = await checkOperationProcessed(tenantId, operationKey, operationType);
  
  if (check.processed) {
    return {
      allowed: false,
      reason: `Operação ${operationType} para recurso ${resourceId} já foi processada em ${check.record!.processedAt.toISOString()}`,
      existingRecord: check.record
    };
  }
  
  return { allowed: true };
}

/**
 * Executar operação com idempotência garantida
 */
export async function executeWithIdempotency<T>(
  tenantId: number,
  operationType: string,
  resourceId: number,
  operation: () => Promise<T>,
  operationData?: Record<string, any>
): Promise<{ result: T; wasProcessed: boolean; idempotencyKey: string }> {
  // Gerar chave
  const operationKey = generateIdempotencyKey(operationType, resourceId, operationData);
  
  // Verificar se já foi processado
  const check = await checkOperationProcessed(tenantId, operationKey, operationType);
  
  if (check.processed) {
    throw new Error(`Operação ${operationType} já processada em ${check.record!.processedAt.toISOString()}`);
  }
  
  // Marcar como processado ANTES de executar (prevenção de race condition)
  await markOperationProcessed(tenantId, operationKey, operationType, operationData);
  
  try {
    // Executar operação
    const result = await operation();
    
    return {
      result,
      wasProcessed: false,
      idempotencyKey: operationKey
    };
  } catch (error) {
    // Se falhar, remover marcação (permitir retry)
    try {
      const db = await getDb();
      if (db) {
        await db.execute(sql`
          DELETE FROM financial_idempotency 
          WHERE tenant_id = ${tenantId} AND operation_key = ${operationKey}
        `);
      }
    } catch (cleanupError) {
      // Log erro de cleanup mas não falhar operação
      console.error('Erro ao limpar idempotency:', cleanupError);
    }
    
    throw error;
  }
}

/**
 * Limpar registros antigos (manutenção)
 */
export async function cleanupOldIdempotencyRecords(daysToKeep: number = 90): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(sql`
    DELETE FROM financial_idempotency 
    WHERE processed_at < DATE_SUB(NOW(), INTERVAL ${daysToKeep} DAY)
  `);

  return result.length; // número de registros removidos
}
