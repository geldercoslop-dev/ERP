import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { securityLogger } from '../_core/logger.js';

/**
 * Configuração de headers de segurança
 * Protege contra ataques comuns
 */
export function securityHeadersMiddleware() {
  return helmet({
    // Content Security Policy - MODO HARDENING
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"], // Removido unsafe-inline
        scriptSrc: ["'self'"], // Removido unsafe-inline e unsafe-eval
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        childSrc: ["'none'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: [],
        // Diretivas adicionais para hardening
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        reportUri: "/api/csp-report", // Endpoint para reportar violações
      },
    },
    
    // Cross-Origin Embedder Policy
    crossOriginEmbedderPolicy: { policy: "require-corp" },
    
    // Cross-Origin Opener Policy
    crossOriginOpenerPolicy: { policy: "same-origin" },
    
    // Cross-Origin Resource Policy
    crossOriginResourcePolicy: { policy: "cross-origin" },
    
    // DNS Prefetch Control
    dnsPrefetchControl: { allow: false },
    
    // Frameguard - MODO HARDENING
    frameguard: { action: 'deny' as const },
    
    // Hide Powered-By header
    hidePoweredBy: true,
    
    // HSTS - MODO HARDENING
    hsts: {
      maxAge: 31536000, // 1 ano
      includeSubDomains: true,
      preload: true,
    },
    
    // Origin Agent Cluster
    originAgentCluster: true,
    
    // Referrer Policy - MODO HARDENING
    referrerPolicy: { policy: "strict-origin-when-cross-origin" as const },
    
    // X-Content-Type-Options
    xContentTypeOptions: true,
    
    // X-Download-Options
    xDownloadOptions: true,
    
    // X-Permitted-Cross-Domain-Policies
    xPermittedCrossDomainPolicies: true,
    
    // X-XSS-Protection
    xXssProtection: true,
  });
}

/**
 * Headers adicionais para API
 */
export function apiSecurityHeadersMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Rate limit real: express-rate-limit (middleware global / trpc), sem headers estáticos enganosos.

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // API specific headers
    res.setHeader('X-API-Version', '1.0.0');
    res.setHeader('X-Server-Timestamp', new Date().toISOString());
    
    // CORS: pacote `cors` no entry (server/_core/index.ts) para /api — evita duplicidade aqui.

    // Cache control para endpoints sensíveis
    if (req.path.includes('/auth') || req.path.includes('/login')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      securityLogger.info({
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentType: req.get('Content-Type'),
        contentLength: req.get('Content-Length'),
        timestamp: new Date().toISOString(),
      }, `[Security] ${req.method} ${req.path}`);
    }
    
    next();
  };
}

/**
 * Headers específicos para LEO AI
 */
export function leoSecurityHeadersMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.includes('leo.')) {
      return next();
    }

    // Headers para prevenir abuso
    res.setHeader('X-LEO-Request-ID', Math.random().toString(36).substring(2, 15));
    res.setHeader('X-LEO-Timestamp', new Date().toISOString());
    
    // Content Security Policy mais restritiva para LEO
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    
    const jwtUser = (req as Request & { user?: { userId?: number; tenantId?: number } }).user;
    securityLogger.info({
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      tenantId: jwtUser?.tenantId,
      userId: jwtUser?.userId,
      timestamp: new Date().toISOString(),
    }, `[LEO Security] ${req.method} ${req.path}`);
    
    next();
  };
}

/**
 * Middleware completo de segurança
 */
export function completeSecurityMiddleware() {
  return [
    securityHeadersMiddleware(),
    apiSecurityHeadersMiddleware(),
    leoSecurityHeadersMiddleware(),
  ];
}
