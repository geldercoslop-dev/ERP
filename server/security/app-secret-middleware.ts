/**
 * App Secret Middleware
 * 
 * Exports middleware for X-App-Secret validation and internal endpoint protection.
 * Extracted from server/_core/index.ts for testability.
 */

import { Request, Response, NextFunction } from 'express';
import { constantTimeCompare } from './timing-safe.js';
import { COOKIE_NAME } from '../../shared/const.js';

// Configuration interface for middleware
export interface AppSecretMiddlewareConfig {
  appSecret: string;
  internalEndpointSecret: string;
  logger: (event: string, req: Request, metadata?: Record<string, unknown>) => void;
  getRequestId: (req: Request) => string;
}

// Malicious patterns for payload inspection
const MALICIOUS_PATTERNS = [
  /(\b(union|select|insert|delete|drop|alter|exec)\b)/i,
  /(--|\/\*|\*\/|;)/,
  /(<script|javascript:|onerror\s*=|onload\s*=)/i,
  /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/i,
];

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  return (
    req.ip ||
    req.socket.remoteAddress ||
    req.connection.remoteAddress ||
    "unknown"
  );
}

/**
 * Send standardized error response
 */
function sendStandardError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
  getRequestId: (req: Request) => string,
  details?: Record<string, unknown>
): Response {
  return res.status(status).json({
    error: {
      code,
      message,
      details: {
        requestId: getRequestId(req),
        ...(details ?? {}),
      },
    },
  });
}

/**
 * Create X-App-Secret validation middleware
 * 
 * This middleware validates X-App-Secret header for API routes.
 * Public routes are exempt: /api/health, /api/trpc/auth.login, /api/csrf-token
 * Fallback to JWT + CSRF is allowed for browser requests.
 */
export function createAppSecretMiddleware(config: AppSecretMiddlewareConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path || (req.originalUrl || req.url).split('?')[0];
    if (!path.startsWith("/api")) return next();
    
    // Exempt public routes (health, login, csrf)
    if (path === "/api/health" || path === "/api/health/") return next();
    if (path.includes("/api/trpc/auth.login")) return next();
    if (path.includes("/api/csrf-token")) return next();

    // Check user-agent FIRST (before secret check)
    const userAgent = req.get("user-agent")?.trim();
    if (!userAgent) {
      config.logger("user-agent ausente", req);
      sendStandardError(req, res, 400, "MISSING_USER_AGENT", "user-agent obrigatório", config.getRequestId);
      return;
    }

    const secret = req.get("x-app-secret")?.trim();
    const hasSecret = secret && config.appSecret && secret === config.appSecret;
    const authorizationHeader = req.get("authorization")?.trim();
    const hasBearerAuth = Boolean(authorizationHeader && /^Bearer\s+\S+$/i.test(authorizationHeader));

    // If no valid x-app-secret, check if we have valid JWT + CSRF
    // This allows authenticated requests from browser to proceed
    if (!hasSecret) {
      const hasJwtToken = hasBearerAuth;
      const hasCsrfToken = req.cookies?.["csrf-token"] &&
                           req.get("x-csrf-token");

      // For browser requests: CSRF + JWT can substitute for x-app-secret
      // GET requests don't need x-app-secret if they have JWT
      const isSafeMethod = ["GET", "HEAD", "OPTIONS"].includes(req.method);

      /*
       * AUTH-H8D: POST tRPC do SPA cookie-only.
       * O browser oficial NÃO envia x-app-secret (VITE_APP_SECRET inexistente)
       * nem Authorization (política cookie-only, AUTH-H6). Para POST em
       * /api/trpc/*, exigimos evidência de sessão legítima:
       *   1) cookie oficial de sessão presente (session_token/session/refresh_token);
       *   2) CSRF double-submit VÁLIDO (cookie csrf-token === header x-csrf-token,
       *      em tempo constante — mesmo critério de csrf-protection.ts).
       * A autenticidade da sessão continua validada pelo router tRPC; aqui só
       * liberamos a passagem quando há evidência real de browser autenticado.
       * x-session-token NÃO é consultado nem aceito como mecanismo.
       */
      const csrfCookieToken = req.cookies?.["csrf-token"];
      const csrfHeaderToken = req.get("x-csrf-token");
      const csrfPairValid =
        typeof csrfCookieToken === "string" && csrfCookieToken.length > 0 &&
        typeof csrfHeaderToken === "string" && csrfHeaderToken.length > 0 &&
        constantTimeCompare(csrfCookieToken, csrfHeaderToken);
      const hasSessionCookie = Boolean(
        req.cookies?.[COOKIE_NAME] ||
        req.cookies?.["session"] ||
        req.cookies?.["refresh_token"]
      );
      const isTrpcSessionPost =
        path.startsWith("/api/trpc/") && hasSessionCookie && csrfPairValid;

      const isMutationWithProtection =
        (hasCsrfToken && (hasJwtToken || isSafeMethod)) || isTrpcSessionPost;

      if (!isMutationWithProtection && !hasBearerAuth) {
        console.log('>>> BLOCKED BEFORE ROUTES', {
          method: req.method,
          path,
          hasSecret: Boolean(secret),
          hasJwtToken: Boolean(hasJwtToken),
          hasCsrfToken: Boolean(hasCsrfToken),
          hasBearerAuth,
        });
        config.logger("x-app-secret inválido/ausente", req, {
          hasSecret: Boolean(secret),
          hasJwtToken: Boolean(hasJwtToken),
          hasCsrfToken: Boolean(hasCsrfToken),
          hasBearerAuth,
        });
        sendStandardError(req, res, 401, "UNAUTHORIZED", "unauthorized", config.getRequestId);
        return;
      }
    }

    const inspectionTargets = [
      req.originalUrl || req.url,
      typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}),
      JSON.stringify(req.query ?? {}),
    ].join(" ");

    for (const pattern of MALICIOUS_PATTERNS) {
      if (pattern.test(inspectionTargets)) {
        config.logger("payload malicioso bloqueado", req, {
          pattern: String(pattern),
        });
        sendStandardError(
          req,
          res,
          400,
          "SUSPICIOUS_PAYLOAD",
          "suspicious payload blocked",
          config.getRequestId
        );
        return;
      }
    }
    
    next();
  };
}

/**
 * Create internal endpoint protection middleware
 * 
 * This middleware protects /api/__* internal endpoints.
 * Access is allowed only from localhost or with valid internal secret.
 */
export function createInternalEndpointProtectionMiddleware(config: AppSecretMiddlewareConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path || (req.originalUrl || req.url).split('?')[0];
    if (!path.startsWith("/api/__")) return next();
    
    const localhostIps = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
    const ip = getClientIp(req);
    const hasLocalhost = localhostIps.has(ip);
    const internalSecret = req.get("x-shutdown-secret") || req.get("x-app-secret");
    
    if (!hasLocalhost && (!config.internalEndpointSecret || internalSecret !== config.internalEndpointSecret)) {
      config.logger("acesso a endpoint interno bloqueado", req);
      sendStandardError(req, res, 403, "FORBIDDEN_INTERNAL", "forbidden", config.getRequestId);
      return;
    }
    
    next();
  };
}
