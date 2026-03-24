import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../infra/structured-logger';

const logger = createLogger('fallback-middleware');

/**
 * Interface para fallback strategies
 */
export interface FallbackStrategy<T> {
  execute(): Promise<T>;
  name: string;
  priority: number;
}

/**
 * Gerenciador de fallbacks
 */
export class FallbackManager<T> {
  private strategies: FallbackStrategy<T>[] = [];
  
  constructor(private operationName: string) {}
  
  /**
   * Adiciona estratégia de fallback
   */
  addStrategy(strategy: FallbackStrategy<T>): void {
    this.strategies.push(strategy);
    // Ordenar por prioridade (menor = maior prioridade)
    this.strategies.sort((a, b) => a.priority - b.priority);
  }
  
  /**
   * Executa com fallbacks
   */
  async execute(): Promise<T> {
    let lastError: any;
    
    for (const strategy of this.strategies) {
      try {
        const result = await strategy.execute();
        
        if (this.strategies.indexOf(strategy) > 0) {
          logger.info('Fallback strategy succeeded', {
            metadata: {
              operation: this.operationName,
              strategy: strategy.name,
              priority: strategy.priority,
            },
          });
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        logger.warn('Fallback strategy failed', {
          metadata: {
            operation: this.operationName,
            strategy: strategy.name,
            priority: strategy.priority,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }
    
    logger.error('All fallback strategies failed', `All fallback strategies failed for ${this.operationName}`, {
      metadata: {
        operation: this.operationName,
        strategiesCount: this.strategies.length,
        lastError: lastError instanceof Error ? lastError.message : 'Unknown error',
      },
    });
    
    throw lastError;
  }
}

/**
 * Fallback para cache
 */
export class CacheFallback<T> implements FallbackStrategy<T> {
  name = 'cache';
  priority = 1;
  
  constructor(
    private cacheKey: string,
    private cacheGet: (key: string) => Promise<T | null>
  ) {}
  
  async execute(): Promise<T> {
    const cached = await this.cacheGet(this.cacheKey);
    if (cached === null) {
      throw new Error('Cache miss');
    }
    return cached;
  }
}

/**
 * Fallback para valor padrão
 */
export class DefaultFallback<T> implements FallbackStrategy<T> {
  name = 'default';
  priority = 10;
  
  constructor(private defaultValue: T) {}
  
  async execute(): Promise<T> {
    return this.defaultValue;
  }
}

/**
 * Fallback para banco de dados (leitura)
 */
export class DatabaseFallback<T> implements FallbackStrategy<T> {
  name = 'database';
  priority = 2;
  
  constructor(
    private query: () => Promise<T>,
    private cacheSet?: (key: string, value: T) => Promise<void>
  ) {}
  
  async execute(): Promise<T> {
    const result = await this.query();
    
    // Atualizar cache se disponível
    if (this.cacheSet) {
      try {
        await this.cacheSet(`db_fallback_${Date.now()}`, result);
      } catch (error) {
        // Ignore cache errors
      }
    }
    
    return result;
  }
}

/**
 * Fallback para API externa
 */
export class ExternalApiFallback<T> implements FallbackStrategy<T> {
  name = 'external_api';
  priority = 3;
  
  constructor(
    private apiCall: () => Promise<T>,
    private cacheSet?: (key: string, value: T) => Promise<void>
  ) {}
  
  async execute(): Promise<T> {
    const result = await this.apiCall();
    
    // Cache resultado
    if (this.cacheSet) {
      try {
        await this.cacheSet(`api_fallback_${Date.now()}`, result);
      } catch (error) {
        // Ignore cache errors
      }
    }
    
    return result;
  }
}

/**
 * Fallback para arquivo estático
 */
export class FileFallback<T> implements FallbackStrategy<T> {
  name = 'file';
  priority = 5;
  
  constructor(
    private filePath: string,
    private parser: (content: string) => T
  ) {}
  
  async execute(): Promise<T> {
    const fs = require('fs').promises;
    const content = await fs.readFile(this.filePath, 'utf-8');
    return this.parser(content);
  }
}

/**
 * Fallback para dados mock
 */
export class MockFallback<T> implements FallbackStrategy<T> {
  name = 'mock';
  priority = 8;
  
  constructor(private mockData: T) {}
  
  async execute(): Promise<T> {
    logger.warn('Using mock fallback data', {
      metadata: {
        dataType: typeof this.mockData,
      },
    });
    
    return this.mockData;
  }
}

/**
 * Factory para fallbacks comuns
 */
export class FallbackFactory {
  /**
   * Cria fallback para dados de usuário
   */
  static createUserFallback(userId: string, cache: any): FallbackManager<any> {
    const manager = new FallbackManager(`user_${userId}`);
    
    // 1. Cache (mais rápido)
    manager.addStrategy(new CacheFallback(
      `user:${userId}`,
      cache.get.bind(cache)
    ));
    
    // 2. Database
    manager.addStrategy(new DatabaseFallback(
      async () => {
        // Simular query de usuário
        return {
          id: userId,
          name: 'User ' + userId,
          email: `user${userId}@example.com`,
          fallback: true,
        };
      },
      cache.set.bind(cache)
    ));
    
    // 3. Mock data
    manager.addStrategy(new MockFallback({
      id: userId,
      name: 'Unknown User',
      email: 'unknown@example.com',
      fallback: true,
      mock: true,
    }));
    
    return manager;
  }
  
  /**
   * Cria fallback para produtos
   */
  static createProductFallback(productId: string, cache: any): FallbackManager<any> {
    const manager = new FallbackManager(`product_${productId}`);
    
    // 1. Cache
    manager.addStrategy(new CacheFallback(
      `product:${productId}`,
      cache.get.bind(cache)
    ));
    
    // 2. Database
    manager.addStrategy(new DatabaseFallback(
      async () => {
        return {
          id: productId,
          name: 'Product ' + productId,
          price: 0,
          available: false,
          fallback: true,
        };
      },
      cache.set.bind(cache)
    ));
    
    // 3. Default
    manager.addStrategy(new DefaultFallback({
      id: productId,
      name: 'Product Unavailable',
      price: 0,
      available: false,
      fallback: true,
    }));
    
    return manager;
  }
  
  /**
   * Cria fallback para configurações
   */
  static createConfigFallback(configKey: string): FallbackManager<any> {
    const manager = new FallbackManager(`config_${configKey}`);
    
    // 1. Cache
    manager.addStrategy(new CacheFallback(
      `config:${configKey}`,
      async () => null // Implementar cache get real
    ));
    
    // 2. File
    manager.addStrategy(new FileFallback(
      `./config/${configKey}.json`,
      JSON.parse
    ));
    
    // 3. Default
    manager.addStrategy(new DefaultFallback({}));
    
    return manager;
  }
}

/**
 * Middleware para fallback automático
 */
export function fallbackMiddleware<T>(
  operationName: string,
  primaryOperation: () => Promise<T>,
  fallbackStrategies: FallbackStrategy<T>[]
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Tentar operação primária primeiro
      const result = await primaryOperation();
      res.json(result);
      
    } catch (error) {
      logger.warn('Primary operation failed, trying fallbacks', {
        metadata: {
          operation: operationName,
          error: error instanceof Error ? error.message : 'Unknown error',
          fallbacksCount: fallbackStrategies.length,
        },
      });
      
      try {
        // Executar fallbacks
        const manager = new FallbackManager<T>(operationName);
        fallbackStrategies.forEach(strategy => manager.addStrategy(strategy));
        
        const result = await manager.execute();
        
        // Indicar que foi usado fallback
        res.setHeader('X-Fallback-Used', 'true');
        res.setHeader('X-Fallback-Strategy', 'fallback');
        
        res.json(result);
        
      } catch (fallbackError) {
        logger.error('All fallbacks failed', `All fallbacks failed for ${operationName}`, {
          metadata: {
            operation: operationName,
            primaryError: error instanceof Error ? error.message : 'Unknown error',
            fallbackError: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
          },
        });
        
        res.status(500).json({
          error: 'Service Unavailable',
          message: 'All fallback strategies failed',
        });
      }
    }
  };
}

/**
 * Cache de fallback managers
 */
const fallbackCache = new Map<string, FallbackManager<any>>();

/**
 * Obtém ou cria fallback manager com cache
 */
export function getFallbackManager<T>(
  key: string,
  factory: () => FallbackManager<T>
): FallbackManager<T> {
  if (!fallbackCache.has(key)) {
    fallbackCache.set(key, factory());
  }
  
  return fallbackCache.get(key) as FallbackManager<T>;
}
