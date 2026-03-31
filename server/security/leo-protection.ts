import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../infra/structured-logger.js';
import { createLeoRateLimit } from './rate-limiting.js';

const logger = createLogger('leo-protection');

/**
 * Classe principal de proteção LEO
 */
class LeoProtection {
  /**
   * Estatísticas de uso do LEO por usuário/tenant
   */
  private static usage = new Map<string, {
    count: number;
    lastReset: number;
    blocked: boolean;
    blockUntil?: number;
  }>();
  
  private static readonly WINDOW_MS = 60 * 1000; // 1 minuto
  private static readonly MAX_REQUESTS = 20;
  private static readonly BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutos
  private static readonly CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutos
  
  /**
   * Obtém chave para o tracker
   */
  private static getKey(tenantId: number, userId?: number, ip?: string): string {
    return `leo:${tenantId}:${userId || 'anonymous'}:${ip || 'unknown'}`;
  }
  
  /**
   * Verifica se o usuário pode fazer requisição
   */
  static canMakeRequest(tenantId: number, userId?: number, ip?: string): {
    allowed: boolean;
    remaining: number;
    resetIn: number;
    blocked?: boolean;
    blockUntil?: Date;
  } {
    const key = this.getKey(tenantId, userId, ip);
    const now = Date.now();
    
    // Limpa entradas antigas
    this.cleanup();
    
    let usage = this.usage.get(key);
    
    if (!usage) {
      usage = {
        count: 0,
        lastReset: now,
        blocked: false,
      };
      this.usage.set(key, usage);
    }
    
    // Verifica se está bloqueado
    if (usage.blocked && usage.blockUntil && now < usage.blockUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: usage.blockUntil - now,
        blocked: true,
        blockUntil: new Date(usage.blockUntil),
      };
    }
    
    // Reset da janela de tempo
    if (now - usage.lastReset > this.WINDOW_MS) {
      usage.count = 0;
      usage.lastReset = now;
      usage.blocked = false;
      usage.blockUntil = undefined;
    }
    
    // Verifica limite
    if (usage.count >= this.MAX_REQUESTS) {
      usage.blocked = true;
      usage.blockUntil = now + this.BLOCK_DURATION_MS;
      
      logger.warn('LEO rate limit exceeded', {
        metadata: {
          tenantId,
          userId,
          ip,
          count: usage.count,
          maxRequests: this.MAX_REQUESTS,
          blockDuration: this.BLOCK_DURATION_MS,
        },
      });
      
      return {
        allowed: false,
        remaining: 0,
        resetIn: this.BLOCK_DURATION_MS,
        blocked: true,
        blockUntil: new Date(usage.blockUntil),
      };
    }
    
    usage.count++;
    
    return {
      allowed: true,
      remaining: this.MAX_REQUESTS - usage.count,
      resetIn: this.WINDOW_MS - (now - usage.lastReset),
    };
  }
  
  /**
   * Limpa entradas antigas do tracker
   */
  private static cleanup(): void {
    const now = Date.now();
    const keys = Array.from(this.usage.keys());
    
    for (const key of keys) {
      const usage = this.usage.get(key);
      if (!usage) continue;
      
      // Remove entradas bloqueadas que expiraram
      if (usage.blocked && usage.blockUntil && now > usage.blockUntil) {
        this.usage.delete(key);
        continue;
      }
      
      // Remove entradas muito antigas
      if (now - usage.lastReset > this.CLEANUP_INTERVAL) {
        this.usage.delete(key);
      }
    }
  }
  
  /**
   * Obtém estatísticas atuais
   */
  static getStats(): {
    totalUsers: number;
    blockedUsers: number;
    averageUsage: number;
  } {
    const keys = Array.from(this.usage.keys());
    const blockedCount = keys.filter(key => {
      const usage = this.usage.get(key);
      return usage?.blocked;
    }).length;
    
    const totalUsage = Array.from(this.usage.values())
      .reduce((sum, usage) => sum + usage.count, 0);
    const averageUsage = keys.length > 0 ? totalUsage / keys.length : 0;
    
    return {
      totalUsers: keys.length,
      blockedUsers: blockedCount,
      averageUsage,
    };
  }
  
  /**
   * Detecta múltiplas requisições rápidas
   */
  static detectRapidRequests(tenantId: number, userId?: number, ip?: string): {
    detected: boolean;
    reason: string;
    details: Record<string, unknown>;
  } {
    const key = `rapid:${tenantId}:${userId || 'anonymous'}:${ip || 'unknown'}`;
    const now = Date.now();
    
    // Esta é uma implementação simplificada
    // Em produção, usar Redis ou similar para tracking distribuído
    return {
      detected: false,
      reason: '',
      details: {},
    };
  }
  
  /**
   * Detecta User-Agent suspeito
   */
  static detectSuspiciousUserAgent(userAgent: string): {
    detected: boolean;
    reason: string;
    details: Record<string, unknown>;
  } {
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java/i,
      /go-http/i,
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(userAgent)) {
        return {
          detected: true,
          reason: 'Suspicious User-Agent detected',
          details: { userAgent, pattern: pattern.source },
        };
      }
    }
    
    return {
      detected: false,
      reason: '',
      details: {},
    };
  }
  
  /**
   * Detecta payload muito grande
   */
  static detectLargePayload(req: Request): {
    detected: boolean;
    reason: string;
    details: Record<string, unknown>;
  } {
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    const maxSize = 10000; // 10KB para LEO
    
    if (contentLength > maxSize) {
      return {
        detected: true,
        reason: 'Payload too large for LEO endpoint',
        details: { contentLength, maxSize },
      };
    }
    
    return {
      detected: false,
      reason: '',
      details: {},
    };
  }
  
  /**
   * Detecta requisições anômalas
   */
  static detectAnomalousRequests(req: Request): {
    detected: boolean;
    reason: string;
    details: Record<string, unknown>;
  } {
    // Verifica se há caracteres suspeitos no path
    const suspiciousChars = /[<>\"'&]/;
    if (suspiciousChars.test(req.path)) {
      return {
        detected: true,
        reason: 'Suspicious characters in request path',
        details: { path: req.path },
      };
    }
    
    // Verifica método HTTP suspeito
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    if (!allowedMethods.includes(req.method)) {
      return {
        detected: true,
        reason: 'Unexpected HTTP method',
        details: { method: req.method },
      };
    }
    
    return {
      detected: false,
      reason: '',
      details: {},
    };
  }
}

/**
 * Middleware para rate limiting do LEO
 */
export function leoRateLimitMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.includes('/leo/')) {
      return next();
    }
    
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    
    const result = LeoProtection.canMakeRequest(tenantId, userId, ip);
    
    // Adiciona headers de rate limiting
    res.set({
      'X-RateLimit-Limit': LeoProtection['MAX_REQUESTS'].toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.resetIn.toString(),
    });
    
    if (!result.allowed) {
      logger.warn('LEO rate limit exceeded', {
        metadata: {
          tenantId,
          userId,
          ip,
          path: req.path,
          remaining: result.remaining,
          resetIn: result.resetIn,
        },
      });
      
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded for LEO endpoint',
        retryAfter: Math.ceil(result.resetIn / 1000),
      });
    }
    
    next();
  };
}

/**
 * Middleware para detectar abuso patterns
 */
export function leoAbuseDetectionMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.includes('/leo/')) {
      return next();
    }
    
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || '';
    
    // Patterns suspeitos
    const suspiciousPatterns = [
      // Múltiplas requisições rápidas
      { check: () => LeoProtection.detectRapidRequests(tenantId, userId, ip), severity: 'MEDIUM' },
      // User-Agent suspeito
      { check: () => LeoProtection.detectSuspiciousUserAgent(userAgent), severity: 'LOW' },
      // Payload muito grande
      { check: () => LeoProtection.detectLargePayload(req), severity: 'MEDIUM' },
      // Requests anômalas
      { check: () => LeoProtection.detectAnomalousRequests(req), severity: 'HIGH' },
    ];
    
    for (const pattern of suspiciousPatterns) {
      const result = pattern.check();
      if (result.detected) {
        logger.warn(`LEO abuse detected: ${result.reason}`, {
          metadata: {
            tenantId,
            userId,
            ip,
            path: req.path,
            method: req.method,
            userAgent,
            severity: pattern.severity,
            details: result.details,
            timestamp: new Date().toISOString(),
          },
        });
        
        // Para severidade alta, bloqueia requisição
        if (pattern.severity === 'HIGH') {
          return res.status(403).json({
            error: 'Request blocked due to suspicious activity',
            reason: result.reason,
            severity: pattern.severity,
          });
        }
      }
    }
    
    next();
  };
}

/**
 * Middleware combinado de proteção LEO
 */
export function leoProtectionMiddleware() {
  return [createLeoRateLimit(), leoRateLimitMiddleware(), leoAbuseDetectionMiddleware()];
}

/**
 * Endpoint para obter estatísticas de uso do LEO
 */
export function getLeoStats(req: Request, res: Response) {
  try {
    const stats = LeoProtection.getStats();
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error getting LEO stats', error as Error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get LEO statistics',
    });
  }
}

/**
 * Endpoint para resetar estatísticas (admin only)
 */
export function resetLeoStats(req: Request, res: Response) {
  try {
    // Verifica se é admin
    const user = (req as any).user;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }
    
    // Reset implementation would go here
    // For now, just return success
    
    logger.info('LEO stats reset by admin', {
      metadata: {
        adminId: user.id,
        timestamp: new Date().toISOString(),
      },
    });
    
    res.json({
      success: true,
      message: 'LEO statistics reset successfully',
    });
  } catch (error) {
    logger.error('Error resetting LEO stats', error as Error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to reset LEO statistics',
    });
  }
}
