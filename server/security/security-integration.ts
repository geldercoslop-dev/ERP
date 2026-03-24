import { Request, Response, NextFunction } from 'express';
import { createTenantRateLimit, createAuthRateLimit } from './rate-limiting';
import { sanitizationMiddleware } from './input-sanitization';
import { securityHeadersMiddleware } from './security-headers';
import { completePayloadProtection } from './payload-protection';
import { criticalAuditMiddleware } from './critical-audit';
import { securityValidationMiddleware } from './security-validation';

/**
 * Middleware completo de segurança para produção
 * Aplica todas as camadas de segurança
 */
export function completeSecurityMiddleware() {
  return [
    // 1. Headers de segurança
    securityHeadersMiddleware(),
    
    // 2. Rate limiting por tenant
    createTenantRateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 1000, // 1000 requests por janela
    }),
    
    // 3. Rate limiting para auth
    createAuthRateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 10, // 10 tentativas de login
    }),
    
    // 4. Proteção de payload
    ...completePayloadProtection({
      jsonLimit: '1mb',
      maxBodySize: 1024 * 1024, // 1MB
      maxParamCount: 100,
    }),
    
    // 5. Sanitização de inputs
    sanitizationMiddleware(),
    
    // 6. Auditoria crítica
    criticalAuditMiddleware(),
    
    // 7. Validação de segurança
    securityValidationMiddleware(),
  ];
}

/**
 * Middleware simplificado para desenvolvimento
 */
export function developmentSecurityMiddleware() {
  return [
    // Headers básicos
    securityHeadersMiddleware(),
    
    // Sanitização básica
    sanitizationMiddleware(),
    
    // Rate limiting mais relaxado
    createTenantRateLimit({
      windowMs: 60 * 1000, // 1 minuto
      max: 5000, // 5000 requests
    }),
  ];
}
