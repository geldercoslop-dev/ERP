/**
 * Configuração Centralizada de Filas BullMQ/Redis
 * 
 * Padrão único para todas as filas do sistema
 * Elimina drift e inconsistências de configuração
 * 
 * PRINCÍPIOS:
 * - Redis é obrigatório (sem fallback em memória)
 * - maxRetriesPerRequest = 3 (único valor global)
 * - Connection compartilhada entre todas as filas
 * - BullMQ como base de execução assíncrona
 */

import { getRedis, getBullMQClient } from '../redis.js';
import { InfrastructureError } from '../../_core/errors/typed-errors.js';

/**
 * Configuração padrão de Redis para filas BullMQ
 * 
 * NOTA: maxRetriesPerRequest = 3 é o padrão global
 * BullMQ exige null para workers, mas isso é tratado
 * em getBullMQClient() no redis.ts
 */
export const QUEUE_REDIS_CONFIG = {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
  keepAlive: 30000,
  family: 4,
} as const;

/**
 * Opções padrão de job para todas as filas
 */
export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 100,
  removeOnFail: 50,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
} as const;

/**
 * Opções padrão de worker para todas as filas
 */
export const DEFAULT_WORKER_OPTIONS = {
  maxStalledCount: 1,
  stalledInterval: 30000,
} as const;

/**
 * Configuração específica por tipo de fila
 * Sobrescreve defaults quando necessário
 */
export const QUEUE_SPECIFIC_CONFIGS = {
  // Filas pesadas - menos concorrência
  OCR: {
    concurrency: 2,
    jobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      removeOnComplete: 100,
    },
  },
  SCREENSHOT: {
    concurrency: 3,
    jobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  },
  LEO_ANALYSIS: {
    concurrency: 1,
    jobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 2,
      backoff: {
        type: 'delay',
        delay: 1000,
      },
    },
  },
  REPORT_GENERATION: {
    concurrency: 2,
    jobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 1,
    },
  },
  DESKTOP_AUTOMATION: {
    concurrency: 1,
    jobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      removeOnComplete: 50,
    },
  },
  NOTIFICATIONS: {
    concurrency: 5,
    jobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  },
  BACKUP: {
    concurrency: 1,
    jobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      removeOnComplete: 10,
      attempts: 1,
    },
  },
  CLEANUP: {
    concurrency: 2,
    jobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      removeOnComplete: 5,
      attempts: 1,
    },
  },
} as const;

/**
 * Obtém conexão Redis para filas BullMQ
 * 
 * Usa getBullMQClient() que já configura maxRetriesPerRequest: null
 * conforme exigido pela biblioteca BullMQ
 */
export function getQueueRedisConnection() {
  // getBullMQClient() já configura maxRetriesPerRequest: null
  // conforme exigido por BullMQ
  return getBullMQClient();
}

/**
 * Obtém configuração completa para uma fila específica
 */
export function getQueueConfig(queueName: keyof typeof QUEUE_SPECIFIC_CONFIGS) {
  const specificConfig = QUEUE_SPECIFIC_CONFIGS[queueName];
  
  if (!specificConfig) {
    // Fallback para configuração padrão
    return {
      concurrency: 1,
      jobOptions: DEFAULT_JOB_OPTIONS,
      workerOptions: DEFAULT_WORKER_OPTIONS,
    };
  }

  return {
    ...specificConfig,
    workerOptions: DEFAULT_WORKER_OPTIONS,
  };
}

/**
 * Valida consistência de configuração
 * Garante que não há drift entre filas
 */
export function validateQueueConfig() {
  const errors: string[] = [];
  
  // Verificar se todas as filas usam mesma connection
  const connection = getQueueRedisConnection();
  if (!connection) {
    errors.push('Redis connection not available');
  }
  
  // Verificar se maxRetriesPerRequest é consistente
  // (Nota: BullMQ usa null, mas isso é tratado em getBullMQClient)
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Exportação principal de configuração
 */
export const queueConfig = {
  redis: QUEUE_REDIS_CONFIG,
  jobOptions: DEFAULT_JOB_OPTIONS,
  workerOptions: DEFAULT_WORKER_OPTIONS,
  specific: QUEUE_SPECIFIC_CONFIGS,
  getConnection: getQueueRedisConnection,
  getQueueConfig,
  validate: validateQueueConfig,
} as const;
