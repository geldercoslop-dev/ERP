import { Request, Response, NextFunction } from 'express';

// Função local para evitar dependência circular
function sendStandardError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string
) {
  res.status(status).json({ error: code, message });
}

function logSecurity(message: string, req: Request, details?: Record<string, unknown>) {
  console.log(`[SECURITY] ${message}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    path: req.path,
    method: req.method,
    ...details
  });
}

/**
 * Middleware de segurança específico para API endpoints
 * Foco em JWT Bearer tokens, sem dependência de x-app-secret ou CSRF
 */
export function apiSecurityMiddleware(req: Request, res: Response, next: NextFunction) {
  // Liberar rotas públicas
  if (req.path === "/health" || req.path === "/health/") return next();
  if (req.path.includes("/trpc/auth.login")) return next();
  if (req.path.includes("/csrf-token")) return next();

  // User-Agent obrigatório
  const userAgent = req.get("user-agent")?.trim();
  if (!userAgent) {
    logSecurity("user-agent ausente", req);
    return sendStandardError(req, res, 400, "MISSING_USER_AGENT", "user-agent obrigatório");
  }

  // Log headers reais para debugging
  console.log('API HEADERS:', req.headers);
  console.log('API AUTH HEADER:', req.headers.authorization);

  // Validação de Bearer Token (corrigida)
  const authHeader = req.headers.authorization || req.headers.Authorization;
  
  const hasBearerAuth =
    Array.isArray(authHeader) 
      ? authHeader.some(h => h.startsWith('Bearer '))
      : typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
  
  console.log('API hasBearerAuth:', hasBearerAuth);
  
  // Hardening: detectar formato inválido
  if (authHeader && 
      (Array.isArray(authHeader) 
        ? !authHeader.some(h => h.startsWith('Bearer '))
        : !authHeader.startsWith('Bearer '))
  ) {
    console.log('API INVALID AUTH FORMAT:', authHeader);
  }

  // API REQUER Bearer Token obrigatoriamente
  if (!hasBearerAuth) {
    console.log('>>> API BLOCKED - NO BEARER TOKEN', {
      method: req.method,
      path: req.path,
      hasBearerAuth,
    });
    logSecurity("API: Bearer token ausente", req, { 
      hasBearerAuth,
    });
    return sendStandardError(req, res, 401, "UNAUTHORIZED", "Bearer token required");
  }

  // Hardening: validar origem da requisição
  const origin = req.get('Origin') || req.get('Referer');
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://localhost:5173',
    'https://127.0.0.1:5173'
  ];
  
  // Em produção, validar origem rigorosamente
  if (process.env.NODE_ENV === 'production' && origin && !allowedOrigins.includes(origin)) {
    logSecurity("API: origem não autorizada", req, { origin });
    return sendStandardError(req, res, 403, "FORBIDDEN", "Origin not allowed");
  }

  // Hardening: validar tamanho do token
  if (authHeader && authHeader.length > 500) {
    logSecurity("API: token muito grande", req, { tokenLength: authHeader.length });
    return sendStandardError(req, res, 400, "BAD_REQUEST", "Token too large");
  }

  // Malicious payload detection
  const MALICIOUS_PATTERNS = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /document\./i,
    /window\./i,
  ];

  const inspectionTargets = [
    req.originalUrl || req.url,
    typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}),
    JSON.stringify(req.query ?? {}),
  ].join(" ");

  for (const pattern of MALICIOUS_PATTERNS) {
    if (pattern.test(inspectionTargets)) {
      logSecurity("API: payload malicioso bloqueado", req, {
        pattern: String(pattern),
      });
      return sendStandardError(
        req,
        res,
        400,
        "SUSPICIOUS_PAYLOAD",
        "suspicious payload blocked"
      );
    }
  }
  
  next();
}

/**
 * Middleware de segurança específico para Browser endpoints
 * Foco em sessão/cookie e CSRF protection
 */
export function browserSecurityMiddleware(req: Request, res: Response, next: NextFunction) {
  // Implementação futura para rotas do browser/frontend
  // Por enquanto, permite tudo (será implementado conforme necessário)
  next();
}
