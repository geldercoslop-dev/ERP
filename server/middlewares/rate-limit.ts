/**
 * Rate Limit Middleware
 * 
 * Proteção contra abuso e brute force
 * Implementa rate limiting por IP com burst protection
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../_core/logger.js';
import { BoundedMap } from '../_core/bounded-map.js';
import { isString } from '../_core/validators.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface BlockedIP {
  blockedUntil: number;
  reason: 'rate_limit' | 'burst';
  violations: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  burstThreshold?: number;
  blockDuration?: number;
}

interface RateLimitOptions {
  global?: RateLimitConfig;
  paths?: Record<string, RateLimitConfig>;
}

/**
 * Configurações padrão
 */
const DEFAULT_CONFIG: RateLimitOptions = {
  global: {
    windowMs: 60 * 1000, // 1 minuto
    maxRequests: 60, // 60 req/min
    burstThreshold: 100, // 100 req/min = burst
    blockDuration: 5 * 60 * 1000 // 5 minutos
  },
  paths: {
    '/api/auth/login': {
      windowMs: 60 * 1000,
      maxRequests: 10, // 10 req/min
      blockDuration: 15 * 60 * 1000 // 15 minutos
    },
    '/api/auth/register': {
      windowMs: 60 * 1000,
      maxRequests: 5, // 5 req/min
      blockDuration: 30 * 60 * 1000 // 30 minutos
    },
    '/api/ai': {
      windowMs: 60 * 1000,
      maxRequests: 20, // 20 req/min
      blockDuration: 10 * 60 * 1000 // 10 minutos
    }
  }
};

/**
 * Armazenamento em memória com proteção contra overflow
 */
const rateLimitStore = new BoundedMap<string, RateLimitEntry>(10000);
const blockedIPs = new BoundedMap<string, BlockedIP>(5000);

/**
 * Extrai IP real do request
 */
function getClientIP(req: Request): string {
  // Headers comuns para IP real
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIP = req.headers['x-real-ip'];
  const cfConnectingIP = req.headers['cf-connecting-ip'];
  
  if (isString(forwardedFor)) {
    // Pega o primeiro IP da lista
    return forwardedFor.split(',')[0].trim();
  }
  
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0].split(',')[0].trim();
  }
  
  if (isString(realIP)) {
    return realIP.trim();
  }
  
  if (Array.isArray(realIP) && realIP.length > 0) {
    return realIP[0].trim();
  }
  
  if (isString(cfConnectingIP)) {
    return cfConnectingIP.trim();
  }
  
  if (Array.isArray(cfConnectingIP) && cfConnectingIP.length > 0) {
    return cfConnectingIP[0].trim();
  }
  
  // Fallback para connection.remoteAddress
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Verifica se IP está bloqueado
 */
function isIPBlocked(ip: string): BlockedIP | null {
  const blocked = blockedIPs.get(ip);
  if (!blocked) return null;
  
  if (Date.now() > blocked.blockedUntil) {
    blockedIPs.delete(ip);
    return null;
  }
  
  return blocked;
}

/**
 * Bloqueia IP temporariamente
 */
function blockIP(ip: string, reason: 'rate_limit' | 'burst', duration: number): void {
  const existing = blockedIPs.get(ip);
  
  blockedIPs.set(ip, {
    blockedUntil: Date.now() + duration,
    reason,
    violations: (existing?.violations || 0) + 1
  });
  
  logger.warn(
    {
      ip,
      reason,
      duration: duration / 1000,
      violations: blockedIPs.get(ip)?.violations,
      timestamp: new Date().toISOString()
    },
    'IP blocked due to abuse'
  );
}

/**
 * Obtém ou cria entrada de rate limit
 */
function getRateLimitEntry(ip: string, config: RateLimitConfig): RateLimitEntry {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  
  // Se não existe ou expirou, cria nova
  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs
    };
    rateLimitStore.set(ip, newEntry);
    return newEntry;
  }
  
  // Incrementa contador
  entry.count++;
  rateLimitStore.set(ip, entry);
  return entry;
}

/**
 * Limpa entradas expiradas periodicamente
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  
  // Limpa rate limits expirados
  rateLimitStore.prune((key, entry) => now > entry.resetAt);
  
  // Limpa IPs bloqueados expirados
  blockedIPs.prune((key, blocked) => now > blocked.blockedUntil);
}

/**
 * Configura headers de rate limit
 */
function setRateLimitHeaders(res: Response, config: RateLimitConfig, entry: RateLimitEntry): void {
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetTime = Math.ceil((entry.resetAt - Date.now()) / 1000);
  
  // HSTS apenas em HTTPS
  if (res.req.protocol === 'https' || (res.req as { secure?: boolean }).secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  res.setHeader('X-RateLimit-Limit', config.maxRequests);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetTime);
}

/**
 * Log de abuso estruturado
 */
function logAbuse(ip: string, path: string, reason: 'rate_limit' | 'blocked', details: Record<string, unknown> = {}): void {
  logger.error(
    {
      ip,
      path,
      reason,
      timestamp: new Date().toISOString(),
      userAgent: details.userAgent,
      ...details
    },
    'Abuse detected and blocked'
  );
}

/**
 * Middleware de rate limiting
 */
export function createRateLimitMiddleware(options: RateLimitOptions = DEFAULT_CONFIG) {
  const config = { ...DEFAULT_CONFIG, ...options };
  
  // Iniciar cleanup periódico (a cada 5 minutos)
  setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
  
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.K6_MODE === 'true') {
      return next();
    }

    const ip = getClientIP(req);
    const path = req.path;
    
    // Verificar se IP está bloqueado
    const blocked = isIPBlocked(ip);
    if (blocked) {
      logAbuse(ip, path, 'blocked', {
        reason: blocked.reason,
        blockedUntil: new Date(blocked.blockedUntil).toISOString(),
        violations: blocked.violations
      });
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'IP temporarily blocked due to abuse',
        retryAfter: Math.ceil((blocked.blockedUntil - Date.now()) / 1000)
      });
      return;
    }
    
    // Determinar configuração para o path
    let rateConfig = config.global;
    
    // Verificar paths específicos
    if (config.paths) {
      for (const [pattern, pathConfig] of Object.entries(config.paths)) {
        if (path.startsWith(pattern)) {
          rateConfig = pathConfig;
          break;
        }
      }
    }
    
    if (!rateConfig) {
      next();
      return;
    }
    
    // Obter entrada de rate limit
    const entry = getRateLimitEntry(ip, rateConfig);
    
    // Configurar headers
    setRateLimitHeaders(res, rateConfig, entry);
    
    // Verificar se excedeu limite
    if (entry.count > rateConfig.maxRequests) {
      // Verificar se é burst (excedeu muito)
      const isBurst = rateConfig.burstThreshold && entry.count > rateConfig.burstThreshold;
      const blockDuration = isBurst 
        ? (rateConfig.blockDuration || 5 * 60 * 1000) * 2 // Dobrar tempo para burst
        : (rateConfig.blockDuration || 5 * 60 * 1000);
      
      blockIP(ip, isBurst ? 'burst' : 'rate_limit', blockDuration);
      
      logAbuse(ip, path, 'rate_limit', {
        count: entry.count,
        limit: rateConfig.maxRequests,
        windowMs: rateConfig.windowMs,
        isBurst,
        blockDuration: blockDuration / 1000
      });
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil(blockDuration / 1000)
      });
      return;
    }
    
    // Log de rate limit approaching (warning)
    if (entry.count > rateConfig.maxRequests * 0.8) {
      logger.warn(
        {
          ip,
          path,
          count: entry.count,
          limit: rateConfig.maxRequests,
          percentage: Math.round((entry.count / rateConfig.maxRequests) * 100)
        },
        'Rate limit approaching threshold'
      );
    }
    
    next();
  };
}

/**
 * Middleware de rate limit global (export padrão)
 */
export const rateLimitMiddleware = createRateLimitMiddleware();

/**
 * Funções utilitárias
 */
export const rateLimitUtils = {
  /**
   * Verifica status de IP
   */
  getIPStatus: (ip: string): { blocked: boolean; entry?: RateLimitEntry } => {
    const blocked = isIPBlocked(ip);
    const entry = rateLimitStore.get(ip);
    
    return {
      blocked: !!blocked,
      entry
    };
  },
  
  /**
   * Limpa manualmente um IP
   */
  unblockIP: (ip: string): boolean => {
    const blocked = blockedIPs.get(ip);
    if (blocked) {
      blockedIPs.delete(ip);
      rateLimitStore.delete(ip);
      logger.info({ ip }, 'IP manually unblocked');
      return true;
    }
    return false;
  },
  
  /**
   * Obtém estatísticas
   */
  getStats: () => ({
    totalIPs: rateLimitStore.size,
    blockedIPs: blockedIPs.size,
    memoryUsage: {
      rateLimit: rateLimitStore.size * 100, // Estimativa
      blocked: blockedIPs.size * 200 // Estimativa
    }
  })
};
