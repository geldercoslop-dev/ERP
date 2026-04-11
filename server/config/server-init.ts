import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../_core/errors/typed-errors.js';
import { validateEnv, getEnv } from './env.js';
import { ENV_SECRET_MIN_LENGTH } from '../_core/env-validator.js';
import { createLogger } from '../infra/structured-logger.js';
import { exitProcessInProductionUnlessDevelopment } from '../_core/dev-process-exit.js';

const logger = createLogger('server-init');

/**
 * Inicializa o servidor com validação obrigatória
 */
export function initializeServer(): void {
  try {
    // Validar environment no start - lança erro se inválido
    const env = validateEnv();
    
    logger.info('Server initialization started', {
      metadata: {
        nodeEnv: env.NODE_ENV,
        port: env.PORT,
        databaseHost: env.DATABASE_HOST,
        databaseName: env.DATABASE_NAME,
      },
    });
    
    // Validar dependências críticas
    validateCriticalDependencies();
    
    logger.info('Server initialized successfully');
    
  } catch (error) {
    logger.error('Server initialization failed', error as Error);
    
    console.error('');
    console.error('❌ FALHA CRÍTICA NA INICIALIZAÇÃO');
    console.error('');
    console.error('O servidor não pode iniciar sem configuração válida.');
    console.error('');
    console.error('📋 SOLUÇÃO:');
    console.error('1. Verifique suas variáveis de ambiente');
    console.error('2. Configure todas as variáveis obrigatórias');
    console.error('3. Reinicie o servidor');
    console.error('');
    console.error('📖 Veja ENV_REQUIRED.md para lista completa');

    exitProcessInProductionUnlessDevelopment(1);
    throw error;
  }
}

/**
 * Valida dependências críticas do sistema
 */
function validateCriticalDependencies(): void {
  const env = getEnv();
  
  // Validar conexão com banco (simulada)
  if (!env.DATABASE_HOST || !env.DATABASE_USER || !env.DATABASE_PASSWORD) {
    throw new ValidationError('Configuração de banco de dados incompleta');
  }
  
  if (!env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET.length < ENV_SECRET_MIN_LENGTH) {
    throw new ValidationError('JWT_ACCESS_SECRET inválido ou muito curto');
  }

  if (!env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET.length < ENV_SECRET_MIN_LENGTH) {
    throw new ValidationError('JWT_REFRESH_SECRET inválido ou muito curto');
  }
  
  logger.info('Critical dependencies validated');
}

/**
 * Validações de segurança específicas para produção
 */
function validateProductionSecurity(): void {
  const env = getEnv();
  
  // Segredos fortes em produção
  if (env.JWT_ACCESS_SECRET.length < ENV_SECRET_MIN_LENGTH) {
    throw new ValidationError(`JWT_ACCESS_SECRET deve ter pelo menos ${ENV_SECRET_MIN_LENGTH} caracteres`);
  }

  if (env.JWT_REFRESH_SECRET.length < ENV_SECRET_MIN_LENGTH) {
    throw new ValidationError(`JWT_REFRESH_SECRET deve ter pelo menos ${ENV_SECRET_MIN_LENGTH} caracteres`);
  }
  
  logger.info('Production security validated');
}

/**
 * Middleware para garantir environment válido em requisições
 */
export function requireValidEnv(req: Request, res: Response, next: NextFunction): void {
  try {
    // Tenta acessar environment - se falhar, lançará erro
    getEnv();
    next();
  } catch (error) {
    logger.error('Invalid environment in request', error as Error);
    res.status(500).json({
      error: 'Server configuration error',
      message: 'Environment not properly configured',
    });
  }
}

/**
 * Verificação de saúde do environment
 */
export function checkEnvironmentHealth(): { healthy: boolean; issues: string[] } {
  const issues: string[] = [];
  
  try {
    const env = getEnv();
    
    // Verificar variáveis críticas
    if (!env.DATABASE_URL?.trim()) issues.push('DATABASE_URL missing');
    if (!env.JWT_ACCESS_SECRET) issues.push('JWT_ACCESS_SECRET missing');
    if (!env.JWT_REFRESH_SECRET) issues.push('JWT_REFRESH_SECRET missing');

    if (env.JWT_ACCESS_SECRET.length < ENV_SECRET_MIN_LENGTH) issues.push('JWT_ACCESS_SECRET too short');
    if (env.JWT_REFRESH_SECRET.length < ENV_SECRET_MIN_LENGTH) issues.push('JWT_REFRESH_SECRET too short');
    
    return {
      healthy: issues.length === 0,
      issues,
    };
    
  } catch (error) {
    return {
      healthy: false,
      issues: ['Environment validation failed'],
    };
  }
}
