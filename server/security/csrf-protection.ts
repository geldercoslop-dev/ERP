import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { constantTimeCompare } from './timing-safe.js';

// Interface para Request com session
interface RequestWithSession extends Request {
  session?: Record<string, unknown>;
}

/**
 * CSRF Protection Middleware
 * Protege contra ataques CSRF em endpoints state-changing
 */
export class CSRFProtection {
  private static readonly TOKEN_LENGTH = 32;
  private static readonly COOKIE_NAME = 'csrf-token';
  private static readonly HEADER_NAME = 'x-csrf-token';
  private static readonly SESSION_KEY = 'csrf-token';

  /**
   * Gera token CSRF seguro
   */
  static generateToken(): string {
    return crypto.randomBytes(CSRFProtection.TOKEN_LENGTH).toString('hex');
  }

  /**
   * Middleware que adiciona token CSRF à resposta
   */
  static csrfTokenMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Pular para métodos seguros (GET, HEAD, OPTIONS)
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
      }

      const session = (req as RequestWithSession).session;
      const cookieToken = req.cookies?.[CSRFProtection.COOKIE_NAME] as string | undefined;

      // Token esperado: preferir cookie (stateless CSRF), fallback para sessão.
      const token =
        cookieToken ||
        (typeof session?.[CSRFProtection.SESSION_KEY] === 'string'
          ? (session[CSRFProtection.SESSION_KEY] as string)
          : undefined) ||
        CSRFProtection.generateToken();

      // Persistir também em session (se existir) para compat.
      if (session) {
        session[CSRFProtection.SESSION_KEY] = token;
      }

      if (token) {
        res.cookie(CSRFProtection.COOKIE_NAME, token, {
          httpOnly: false, // Precisa ser acessível pelo JavaScript
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 60 * 60 * 1000 // 1 hora
        });
      }

      next();
    };
  }

  /**
   * Middleware que valida token CSRF
   */
  static csrfValidationMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Pular para métodos seguros
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
      }

      // Pular para endpoints de API pública (webhooks, etc)
      if (req.path.startsWith('/webhooks/') || req.path.startsWith('/api/public/')) {
        return next();
      }

      const cookieToken = req.cookies?.[CSRFProtection.COOKIE_NAME];
      const headerToken = req.headers?.[CSRFProtection.HEADER_NAME];

      // Esperado: preferir token em sessão (se existir) ou em cookie (caso sem session middleware).
      const sessionToken = (req as RequestWithSession).session?.[CSRFProtection.SESSION_KEY] as string | undefined;
      const expectedToken = sessionToken || (cookieToken as string | undefined);

      // Verificar se token esperado existe
      if (!expectedToken) {
        console.error('[CSRF] Missing expected token', {
          ip: req.ip,
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent')
        });
        return res.status(403).json({
          error: 'CSRF token missing',
          message: 'CSRF validation failed'
        });
      }

      // Para proteção real (double submit), exigir envio no HEADER.
      const requestToken = headerToken;
      if (!requestToken) {
        console.error('[CSRF] Missing request token', {
          ip: req.ip,
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent')
        });
        return res.status(403).json({
          error: 'CSRF token required',
          message: 'CSRF token must be provided in header'
        });
      }

      // Validação em tempo constante
      const reqTokenString = typeof requestToken === 'string' ? requestToken : String(requestToken);
      if (!constantTimeCompare(expectedToken, reqTokenString)) {
        console.error('[CSRF] Invalid token comparison', {
          ip: req.ip,
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent')
        });
        return res.status(403).json({
          error: 'Invalid CSRF token',
          message: 'CSRF validation failed'
        });
      }

      next();
    };
  }

  /**
   * Middleware completo (geração + validação)
   */
  static csrfProtection() {
    return [
      CSRFProtection.csrfTokenMiddleware(),
      CSRFProtection.csrfValidationMiddleware()
    ];
  }

  /**
   * Endpoint para obter token CSRF (para SPA/React)
   */
  static csrfTokenEndpoint() {
    return (req: Request, res: Response) => {
      const session = (req as RequestWithSession).session;
      const cookieToken = req.cookies?.[CSRFProtection.COOKIE_NAME] as string | undefined;
      const token =
        cookieToken ||
        (typeof session?.[CSRFProtection.SESSION_KEY] === 'string'
          ? (session[CSRFProtection.SESSION_KEY] as string)
          : undefined) ||
        CSRFProtection.generateToken();

      if (session) {
        session[CSRFProtection.SESSION_KEY] = token;
      }

      // Sempre setar cookie para permitir validação no próximo request.
      res.cookie(CSRFProtection.COOKIE_NAME, token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000 // 1 hora
      });

      res.json({
        csrfToken: token,
        headerName: CSRFProtection.HEADER_NAME
      });
    };
  }
}

/**
 * Middleware simplificado para uso em rotas específicas
 */
export function requireCSRF() {
  return CSRFProtection.csrfValidationMiddleware();
}

/**
 * Middleware para endpoints que precisam apenas gerar token
 */
export function generateCSRFToken() {
  return CSRFProtection.csrfTokenMiddleware();
}
