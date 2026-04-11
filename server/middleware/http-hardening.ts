/**
 * HTTP Hardening Middleware
 * 
 * Camada leve de segurança para proteção global
 * Implementa: rate limit, security headers, trust proxy
 */

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../_core/logger.js';

/**
 * Configuração de Rate Limit Global
 */
const GLOBAL_RATE_LIMIT = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requisições por IP
  message: {
    error: 'Too many requests from this IP',
    message: 'Rate limit exceeded. Try again in 15 minutes.',
    retryAfter: 900 // 15 minutos em segundos
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Prioridade: cf-connecting-ip → x-forwarded-for → remoteAddress
    const ip = 
      req.headers['cf-connecting-ip'] ??
      req.headers['x-forwarded-for'] ??
      req.socket?.remoteAddress ??
      req.ip ??
      'unknown';
    
    return `global-rate-limit:${ip}`;
  },
  skip: (req: Request) => {
    if (process.env.K6_MODE === 'true') {
      return true;
    }

    // Pular health checks e endpoints públicos
    const path = req.path || req.url;
    return path === '/health' || 
           path === '/api/health' || 
           path === '/api/health/' ||
           path === '/ping' ||
           path === '/metrics';
  },
  handler: (req: Request, res: Response, next: NextFunction) => {
    // Custom handler para log quando rate limit é excedido
    logger.warn({
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    }, '[RATE_LIMIT] Global rate limit exceeded');
    
    // Enviar resposta padrão de rate limit
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Try again in 15 minutes.',
      retryAfter: 900
    });
  }
});

/**
 * Security Headers Básicos com Helmet
 */
const SECURITY_HEADERS = helmet({
  // Content Security Policy - básico e seguro
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      childSrc: ["'none'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  
  // XSS Protection
  xssFilter: true,
  
  // MIME Sniffing Protection
  noSniff: true,
  
  // Clickjacking Protection
  frameguard: { 
    action: 'deny' 
  },
  
  // Remove headers informativos
  hidePoweredBy: true,
  
  // HSTS (apenas em HTTPS)
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 ano
    includeSubDomains: true,
    preload: true
  } : false,
  
  // Referrer Policy
  referrerPolicy: { 
    policy: 'strict-origin-when-cross-origin' 
  }
});

/**
 * Middleware de Trust Proxy para Cloudflare
 */
function trustProxyMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Configurar trust proxy para obter IP real através de headers
  // Isso é necessário para Cloudflare e outros reverse proxies
  req.app.set('trust proxy', true);
  
  // Log para debug (apenas em desenvolvimento)
  if (process.env.NODE_ENV === 'development') {
    logger.debug({
      ip: req.ip,
      cfConnectingIP: req.headers['cf-connecting-ip'],
      xForwardedFor: req.headers['x-forwarded-for'],
      remoteAddress: req.socket?.remoteAddress,
      trustProxy: true
    }, '[TRUST_PROXY] Proxy trust configured');
  }
  
  next();
}

/**
 * Middleware principal de hardening
 */
export function httpHardeningMiddleware() {
  return [
    // 1. Trust Proxy (DEVE vir primeiro)
    trustProxyMiddleware,
    
    // 2. Rate Limit Global
    GLOBAL_RATE_LIMIT,
    
    // 3. Security Headers
    SECURITY_HEADERS
  ];
}

/**
 * Middleware individual para uso específico
 */
export {
  GLOBAL_RATE_LIMIT,
  SECURITY_HEADERS,
  trustProxyMiddleware
};

/**
 * Função para extrair IP real com prioridade correta
 */
export function extractRealIP(req: Request): string {
  // Prioridade exata conforme solicitado:
  // cf-connecting-ip → x-forwarded-for → remoteAddress
  const fromCf = req.headers['cf-connecting-ip'];
  if (typeof fromCf === 'string' && fromCf.length > 0) return fromCf;

  const fromXff = req.headers['x-forwarded-for'];
  if (typeof fromXff === 'string' && fromXff.length > 0) return fromXff;
  if (Array.isArray(fromXff) && fromXff.length > 0) return fromXff[0] ?? 'unknown';

  return req.socket?.remoteAddress ?? req.ip ?? 'unknown';
}

/**
 * Lista de middlewares aplicados (para validação)
 */
export const APPLIED_MIDDLEWARES = [
  'trust-proxy',
  'rate-limit-global', 
  'security-helmet'
];
