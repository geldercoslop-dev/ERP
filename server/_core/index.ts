/**
 * Entry do servidor.
 * RISCOS DO SISTEMA (evitar): perda de dados por db:push em prod; banco fora do schema;
 * sessão não reconhecida; lista não atualizar após CRUD; deploy sem backup/migrations.
 * Ver /docs/RISCO_ATUAL.md e /docs/RECUPERACAO_SISTEMA.md.
 *
 * Rate limit: configurável por env RATE_LIMIT_WINDOW_MS e RATE_LIMIT_MAX (ex: 60000 e 120).
 * CORS: em produção defina ALLOWED_ORIGINS (separado por vírgula), ex: https://app.seudominio.com
 */
import "./loadEnv.js";

// Forçar stdin para detecção de SIGINT no Windows
process.stdin.resume();

import { initializeOpenTelemetry } from "../infra/tracing.js";
import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { nanoid } from "nanoid";
// import { registerOAuthRoutes } from "./oauth.js"; // DESABILITADO
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";
import { serveStatic, setupVite } from "./vite.js";
import { gerarBackupZip } from "../backup.js";
import * as fs from "fs";
import path from "path";
import { initCacheSystem, createCacheRouter } from "./cache-manager.js";
import { secureConsoleMiddleware } from "../security/secure-logger.js";
import { setupMonitoring, setupDatabaseMonitoring } from "./monitoring-setup.js";
import { globalTimeoutMiddleware } from "../resilience/timeout-middleware.js";
import { setupGracefulShutdown } from "../resilience/graceful-shutdown.js";
import { getHealthWatchdog } from "../monitoring/health-watchdog.js";
import { requestShutdown } from "../services/system/shutdown.service.js";
import { getServerHealth } from "../services/system/health.service.js";
import { getEnv } from "../config/env.js";
import { validateShutdownAuthPayload } from "../services/system/payload-validation.service.js";
import { systemLogger } from "./logger.js";
import { createFailureSimulationRoutes } from "../resilience/failure-simulator.js";
import { exitProcessInProductionUnlessDevelopment } from "./dev-process-exit.js";
import { createLogger } from "../infra/structured-logger.js";
import { requestIdMiddleware, getRequestId } from "../middleware/request-id.middleware.js";
import { globalErrorHandler } from "../middleware/global-error-handler.middleware.js";
import { validateProductionEnvOrExit } from "./env.validation.js";
import { getDb } from "../db/index.js";
import { requestLoggerMiddleware } from "../middleware/request-logger.js";
import { metrics } from "../infra/metrics.js";
import { waitForDatabaseReady } from "./db-bootstrap.js";
import { waitForRedis } from "../infra/redis.js";
import { validateRequiredEnv } from "../services/env.service.js";
import { bootstrapDatabase } from "../services/bootstrap.service.js";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "./service-entry-guard.js";
import { registerHealthFullRoute } from "../routes/health-full.route.js";
import { createRedisRateLimitMiddleware } from "../security/redis-rate-limit.js";
import { securityHeadersMiddleware } from "../security/security-headers.js";
import { apiRouter } from "../api-routes.js";

// Exportar funções de padronização de resposta
export { ensureArray, ensureObject, ensureCreatedResult, ensureUpdateResult, ensureDeleteResult } from "./service-response.js";

// Tipos para o middleware de erro
import { Request, Response, NextFunction } from "express";
interface ErrorWithStatus extends Error {
  status?: number;
}

const securityLogger = createLogger("security-hardening");
const MALICIOUS_PATTERNS = [
  /(\b(union|select|insert|delete|drop|alter|exec)\b)/i,
  /(--|\/\*|\*\/|;)/,
  /(<script|javascript:|onerror\s*=|onload\s*=)/i,
  /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/i,
];

function getClientIp(req: Request): string {
  return (
    req.ip ||
    req.socket.remoteAddress ||
    req.connection.remoteAddress ||
    "unknown"
  );
}

function logSecurity(
  event: string,
  req: Request,
  extra: Record<string, unknown> = {}
): void {
  securityLogger.warn(`[SECURITY] ${event}`, {
    metadata: {
      context: "SECURITY",
      ip: getClientIp(req),
      method: req.method,
      path: req.originalUrl || req.url,
      userAgent: req.get("user-agent") || "",
      ...extra,
    },
  });
}

function sendStandardError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
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

function isResponseLocked(res: Response): boolean {
  const timedOut = (res.locals as Record<string, unknown>).requestTimedOut === true;
  return timedOut || res.headersSent || res.writableEnded;
}

async function sendUnifiedHealthResponse(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");

  try {
    const report = await getServerHealth();
    const ok = report.status === "ok";
    const statusCode = ok ? 200 : 503;

    if (isResponseLocked(res)) {
      systemLogger.warn({ path: req.path, requestId: getRequestId(req) }, "[HEALTH] resposta suprimida por timeout/resposta encerrada");
      return;
    }

    res.status(statusCode).json({
      ...report,
      status: ok ? "ok" : "down",
      requestId: res.locals.requestId,
    });
  } catch (error) {
    systemLogger.error(
      {
        path: req.path,
        requestId: getRequestId(req),
        error: error instanceof Error ? error.message : String(error),
      },
      "[HEALTH] falha ao gerar health"
    );

    if (isResponseLocked(res)) {
      return;
    }

    res.status(503).json({
      status: "down",
      error: {
        code: "HEALTH_UNAVAILABLE",
        message: "Health check indisponível",
        details: {
          requestId: res.locals.requestId,
        },
      },
    });
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Fail-fast ENV (camada Services)
  validateRequiredEnv();
  // Mantém validações adicionais já existentes (ex.: APP_SECRET, etc.)
  validateProductionEnvOrExit();
  systemLogger.info("[ENV] variáveis obrigatórias ok (services + core)");
  const env = getEnv();
  secureConsoleMiddleware();
  systemLogger.info("[BOOT] inicialização do servidor");

  systemLogger.info("[BOOT] OpenTelemetry…");
  initializeOpenTelemetry();
  systemLogger.info("[BOOT] OpenTelemetry ok");

  // Anti-crash: logar e encerrar de forma controlada
  process.on("uncaughtException", (err) => {
    systemLogger.error({ err }, "[FATAL] uncaughtException");
    process.exit(1);
  });
  process.on("unhandledRejection", (reason: unknown) => {
    systemLogger.error({ reason }, "[FATAL] unhandledRejection");
    process.exit(1);
  });

  // Espera DB subir com retry/backoff (evita crash imediato / restart loop)
  try {
    systemLogger.info("[DB] aguardando MySQL ficar pronto…");
    await waitForDatabaseReady();
    systemLogger.info("[DB] MySQL pronto");
  } catch (e) {
    systemLogger.error({ e }, "[DB] falha ao aguardar MySQL");
    process.exit(1);
  }

  // Bootstrap do banco (migrations) + seed mínimo (admin) precisam de contexto de serviço autorizado.
  try {
    await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
      const db = await getDb();
      try {
        await bootstrapDatabase(db);
        console.log('[BOOT] database bootstrap ok');
      } catch (bootstrapErr) {
        console.warn('[BOOT] database bootstrap falhou, continuando...', bootstrapErr);
        console.log('[BOOT] server liberado mesmo com falha de migration');
      }
      
      try {
        await waitForDatabaseReady();
      } catch (guardErr) {
        console.warn('[BOOT] database guard check falhou, continuando...', guardErr);
      }
    });
  } catch (e) {
    console.warn("[BOOTSTRAP][DB] falha no contexto", e);
    console.log('[BOOT] server liberado mesmo com falha crítica');
  }

  // Espera Redis subir (evita crash imediato / restart loop)
  try {
    const timeoutMs = Math.max(5_000, Number(process.env.REDIS_BOOT_TIMEOUT_MS || 30_000));
    systemLogger.info({ timeoutMs }, "[REDIS] aguardando Redis ficar pronto…");
    const ok = await waitForRedis(timeoutMs);
    if (!ok) {
      systemLogger.error("[REDIS] falha: Redis não ficou pronto a tempo");
      process.exit(1);
    }
    systemLogger.info("[REDIS] Redis pronto");
  } catch (e) {
    systemLogger.error({ e }, "[REDIS] falha ao aguardar Redis");
    process.exit(1);
  }

  systemLogger.info("[BOOT] sistema de cache…");
  initCacheSystem();
  systemLogger.info("[BOOT] cache ok");

  const app = express();
  const server = createServer(app);
  systemLogger.info("[BOOT] Express + HTTP criados");

  // LOG GLOBAL PARA DEBUGAR FLUXO
  app.use((req, res, next) => {
    if (req.url.includes('trpc')) {
      console.log('>>> TRPC DEBUG', {
        method: req.method,
        url: req.url,
        path: req.path,
        originalUrl: req.originalUrl,
        headers: req.headers
      });
    }
    next();
  });

  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware());
  
  systemLogger.info("[BOOT] monitoramento…");
  setupMonitoring(app);
  systemLogger.info("[BOOT] monitoramento ok");

  try {
    systemLogger.info("[BOOT] usuário admin…");
    const { ensureAdminUser } = await import("../db/index.js");
    await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
      await ensureAdminUser(1);
    });
    systemLogger.info("[BOOT] admin ok");
  } catch (e) {
    systemLogger.error({ e }, "[ERROR] ensureAdminUser");
    systemLogger.warn("[ERROR] ensureAdminUser falhou, continuando mesmo assim (migration ainda em progresso)");
    console.log('[BOOT] server liberado mesmo com falha de usuario admin');
  }

  systemLogger.info("[BOOT] middlewares de segurança…");
  app.use(securityHeadersMiddleware());

  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) {
          cb(null, true);
          return;
        }
        cb(new Error("CORS origin blocked"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Session-Token",
        "X-App-Secret",
        // SECURITY HARDENING: Removido X-Shutdown-Secret para evitar information disclosure
        "User-Agent",
      ],
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  app.use(cookieParser());

  // Security extra: métodos inesperados bloqueados na API
  const allowedApiMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
  app.use("/api", (req, res, next) => {
    if (!allowedApiMethods.has(req.method.toUpperCase())) {
      logSecurity("método HTTP bloqueado", req, { method: req.method });
      return sendStandardError(req, res, 405, "METHOD_NOT_ALLOWED", "Método não permitido");
    }
    next();
  });

  /** GET /api/health/full — DB + Redis + checagem leve de segredos de auth (antes do x-app-secret). */
  registerHealthFullRoute(app);

  // Observabilidade HTTP/metrics: centralizada em `requestLoggerMiddleware` + `infra/metrics`.

  const appSecret = env.APP_SECRET;
  const internalEndpointSecret =
    process.env.HARD_TEST_SHUTDOWN_SECRET?.trim() || appSecret || "";
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    
    // Liberar rotas públicas (health, login, csrf)
    if (req.path === "/api/health" || req.path === "/api/health/") return next();
    if (req.path.includes("/api/trpc/auth.login")) return next();
    if (req.path.includes("/api/csrf-token")) return next();

    const userAgent = req.get("user-agent")?.trim();
    if (!userAgent) {
      logSecurity("user-agent ausente", req);
      return sendStandardError(req, res, 400, "MISSING_USER_AGENT", "user-agent obrigatório");
    }

    // Check for x-app-secret
    const secret = req.get("x-app-secret")?.trim();
    const hasSecret = secret && appSecret && secret === appSecret;
    const authorizationHeader = req.get("authorization")?.trim();
    const hasBearerAuth = Boolean(authorizationHeader && /^Bearer\s+\S+$/i.test(authorizationHeader));

    // If no valid x-app-secret, check if we have valid session + CSRF
    // This allows authenticated requests from browser to proceed
    if (!hasSecret) {
      const hasSessionToken = req.cookies?.session_token || 
                              req.cookies?.session || 
                              req.cookies?.auth_token ||
                              req.get("x-session-token");
      const hasCsrfToken = req.cookies?.["csrf-token"] && 
                           req.get("x-csrf-token");

      // For browser requests: CSRF + session token can substitute for x-app-secret
      // GET requests don't need x-app-secret if they have session token
      const isSafeMethod = ["GET", "HEAD", "OPTIONS"].includes(req.method);
      const isMutationWithProtection = hasCsrfToken && (hasSessionToken || isSafeMethod);

      if (!isMutationWithProtection && !hasBearerAuth) {
        console.log('>>> BLOCKED BEFORE ROUTES', {
          method: req.method,
          path: req.path,
          hasSecret: Boolean(secret),
          hasSessionToken: Boolean(hasSessionToken),
          hasCsrfToken: Boolean(hasCsrfToken),
          hasBearerAuth,
        });
        logSecurity("x-app-secret inválido/ausente", req, { 
          hasSecret: Boolean(secret),
          hasSessionToken: Boolean(hasSessionToken),
          hasCsrfToken: Boolean(hasCsrfToken),
          hasBearerAuth,
        });
        return sendStandardError(req, res, 401, "UNAUTHORIZED", "unauthorized");
      }
    }

    const inspectionTargets = [
      req.originalUrl || req.url,
      typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}),
      JSON.stringify(req.query ?? {}),
    ].join(" ");

    for (const pattern of MALICIOUS_PATTERNS) {
      if (pattern.test(inspectionTargets)) {
        logSecurity("payload malicioso bloqueado", req, {
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
  });
  
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/__")) return next();
    const localhostIps = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
    const ip = getClientIp(req);
    const hasLocalhost = localhostIps.has(ip);
    const internalSecret = req.get("x-shutdown-secret") || req.get("x-app-secret");
    if (!hasLocalhost && (!internalEndpointSecret || internalSecret !== internalEndpointSecret)) {
      logSecurity("acesso a endpoint interno bloqueado", req);
      return sendStandardError(req, res, 403, "FORBIDDEN_INTERNAL", "forbidden");
    }
    next();
  });

  /** Automação: shutdown completo sem depender de SIGINT no subprocesso (Windows). */
  if (process.env.HARD_TEST_HTTP_SHUTDOWN === "1") {
    const shutdownSecret =
      process.env.HARD_TEST_SHUTDOWN_SECRET?.trim() || "erp-hard-test-local-secret";
    
    const shutdownRateLimit = createRedisRateLimitMiddleware({
      name: "internal-shutdown",
      windowMs: 60 * 1000,
      max: 3,
      code: "INTERNAL_SHUTDOWN_RATE_LIMITED",
      message: "Too many shutdown requests",
      shouldApply: (req) => (req.originalUrl || req.url).startsWith("/api/__hard-test/shutdown"),
    });

    app.get("/api/__hard-test/shutdown", shutdownRateLimit, (req, res) => {
      // 1. Validar origem (apenas localhost ou rede interna)
      const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
      const allowedOrigins = ['::1', '::ffff:127.0.0.1', '127.0.0.1', 'localhost'];
      
      if (!allowedOrigins.includes(clientIP as string) && !clientIP?.startsWith('192.168.') && !clientIP?.startsWith('10.')) {
        securityLogger.warn("[SECURITY] shutdown ip bloqueado", {
          requestId: getRequestId(req),
          path: req.originalUrl || req.url,
          method: req.method,
          metadata: {
          ip: clientIP,
          timestamp: new Date().toISOString(),
          motivo: 'origem_nao_permitida'
          },
        });
        sendStandardError(req, res, 403, "FORBIDDEN", "Forbidden");
        return;
      }
      
      // 2. Validar secret via header (mais seguro que query param)
      const { secretHeader, secretQuery } = validateShutdownAuthPayload({
        secretHeader: req.headers["x-shutdown-secret"],
        secretQuery: req.query.secret,
      });
      const providedSecret = secretHeader || secretQuery;
      
      if (providedSecret !== shutdownSecret) {
        // Log de auditoria - secret incorreto
        securityLogger.warn("[SECURITY] shutdown secret inválido", {
          requestId: getRequestId(req),
          path: req.originalUrl || req.url,
          method: req.method,
          metadata: {
          ip: clientIP,
          timestamp: new Date().toISOString(),
          motivo: 'secret_invalido',
          header: !!secretHeader,
          query: !!secretQuery
          },
        });
        sendStandardError(req, res, 404, "NOT_FOUND", "Not Found");
        return;
      }
      
      // 3. Log de auditoria - shutdown autorizado
      securityLogger.info("[SECURITY] shutdown autorizado", {
        requestId: getRequestId(req),
        path: req.originalUrl || req.url,
        method: req.method,
        metadata: {
        ip: clientIP,
        timestamp: new Date().toISOString(),
        motivo: 'http_endpoint',
        method: secretHeader ? 'header' : 'query'
        },
      });
      
      // Responde imediatamente com 202 Accepted
      res.status(202).json({ ok: true, shuttingDown: true });
      
      // Garante que shutdown SEMPRE executa (mesmo se promise rejeitar)
      setImmediate(async () => {
        try {
          // Usa nova função centralizada que GARANTE process.exit()
          const { initiateGracefulShutdown } = await import("../services/system/shutdown.service.js");
          await initiateGracefulShutdown("HTTP_ENDPOINT", 0);
          // Nunca chega aqui - process.exit() mata o processo
        } catch (err) {
          securityLogger.error("[SECURITY] shutdown endpoint error", err as Error, {
            requestId: getRequestId(req),
            path: req.originalUrl || req.url,
            method: req.method,
            metadata: {
      timestamp: new Date().toISOString(),
            },
          });
          process.exit(1);
        }
      });
    });
    console.warn(
      "[HARD_TEST] GET /api/__hard-test/shutdown habilitado com proteções (defina HARD_TEST_SHUTDOWN_SECRET forte em CI)"
    );
  }

  const authRateLimiter = createRedisRateLimitMiddleware({
    name: "auth",
    windowMs: 60 * 1000,
    max: 20,
    code: "AUTH_RATE_LIMITED",
    message: "Muitas tentativas de autenticação.",
    shouldApply: (req) => /\/api\/trpc\/auth(\.|\/)|\/api\/auth(\/|$)/.test(req.originalUrl || req.url),
  });
  app.use("/api", authRateLimiter);

  const adminRateLimiter = createRedisRateLimitMiddleware({
    name: "admin",
    windowMs: 60 * 1000,
    max: 30,
    code: "ADMIN_RATE_LIMITED",
    message: "Limite de requisições administrativas atingido.",
    shouldApply: (req) => /\/api\/admin(\/|$)|\/api\/trpc\/admin(\.|\/)/.test(req.originalUrl || req.url),
  });
  app.use("/api", adminRateLimiter);

  const internalRateLimiter = createRedisRateLimitMiddleware({
    name: "internal",
    windowMs: 60 * 1000,
    max: 10,
    code: "INTERNAL_RATE_LIMITED",
    message: "Limite em endpoint interno atingido.",
    shouldApply: (req) => (req.originalUrl || req.url).startsWith("/api/__"),
  });
  app.use("/api", internalRateLimiter);

  const financialRateLimiter = createRedisRateLimitMiddleware({
    name: "financial",
    windowMs: 60 * 1000,
    max: 50,
    code: "FINANCIAL_RATE_LIMITED",
    message: "Limite de requisições financeiras atingido.",
    shouldApply: (req) => /\/api\/trpc\/(financeiro|contas|pagamentos|boletos)(\.|\/)/.test(req.originalUrl || req.url),
  });
  app.use("/api", financialRateLimiter);

  const leoRateLimiter = createRedisRateLimitMiddleware({
    name: "leo",
    windowMs: 60 * 1000,
    max: 20,
    code: "LEO_RATE_LIMITED",
    message: "Muitas requisições para LEO.",
    shouldApply: (req) => /\/api\/trpc\/leo(\.|\/)/.test(req.originalUrl || req.url),
  });
  app.use("/api", leoRateLimiter);

  // SECURITY HARDENING: Rate limit global por IP para proteção contra flood
  const globalIpRateLimiter = createRedisRateLimitMiddleware({
    name: "global-ip-flood-protection",
    windowMs: 60 * 1000, // 60 segundos
    max: 60, // 60 requisições por IP por minuto
    code: "GLOBAL_RATE_LIMITED",
    message: "Muitas requisições deste IP. Tente novamente em 1 minuto.",
    shouldApply: (req) => {
      // Aplicar a todas as rotas /api exceto health checks
      const base = (req.originalUrl ?? req.url ?? "").split("?")[0];
      return !(
        base === "/api/health" ||
        base === "/api/health/" ||
        base === "/api/health/full" ||
        base === "/api/health/full/" ||
        base === "/ping" ||
        base === "/metrics"
      );
    },
    keySuffix: (req) => {
      // Usar IP como chave para rate limit global
      const ip = getClientIp(req);
      return `ip:${ip}`;
    },
    onBlocked: (req) => {
      logSecurity("flood protection - rate limit global excedido", req, {
        ip: getClientIp(req),
        window: "60s",
        limit: 60
      });
    },
  });
  app.use("/api", globalIpRateLimiter);

  const apiRateLimiter = createRedisRateLimitMiddleware({
    name: "api-global",
    windowMs: 60 * 1000,
    max: 100,
    code: "RATE_LIMITED",
    message: "Muitas requisições. Tente novamente em instantes.",
    shouldApply: (req) => {
      const base = (req.originalUrl ?? req.url ?? "").split("?")[0];
      return !(
        base === "/api/health" ||
        base === "/api/health/" ||
        base === "/api/health/full" ||
        base === "/api/health/full/"
      );
    },
    onBlocked: (req) => {
      logSecurity("rate limit excedido", req);
    },
  });
  app.use("/api", apiRateLimiter);

  const internalRouteRateLimiter = createRedisRateLimitMiddleware({
    name: "internal-route",
    windowMs: 60 * 1000,
    max: 30,
    code: "INTERNAL_ROUTE_RATE_LIMITED",
    message: "Muitas requisições em endpoint interno.",
    shouldApply: () => true,
  });
  app.use("/internal", internalRouteRateLimiter);

  // Body parser aplicado no hardening global (1mb)

  // Timeout global para todas as requests
  app.use(globalTimeoutMiddleware(10000)); // 10 segundos

  // CSRF Protection para endpoints state-changing
  const { CSRFProtection } = await import("../security/csrf-protection.js");
  
  // Endpoint para obter token CSRF (para SPA/React)
  app.get("/api/csrf-token", CSRFProtection.csrfTokenEndpoint());
  
  // CSRF protection removido das rotas API - agora usa apenas Bearer tokens
  // CSRF será aplicado apenas em rotas do browser (frontend)
  // app.use("/api", CSRFProtection.csrfProtection());

  // OAuth callback under /api/oauth/callback - DESABILITADO
  // registerOAuthRoutes(app);
  // Login/Logout: apenas tRPC (auth.login / auth.logout). Rotas /api/login e /api/logout removidas.

  // Rota de teste rápido para debug
    app.get("/ping", (req, res) => {
      systemLogger.info({ path: req.path, method: req.method }, "[SERVER] GET /ping");
      res.json({ 
        ok: true, 
        message: "Server responde!",
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

  // Health check avançado - implementado via tRPC em /api/trpc/health.*

  app.get("/api/health", async (req, res) => {
    await sendUnifiedHealthResponse(req, res);
  });

  app.get("/health", async (req, res) => {
    await sendUnifiedHealthResponse(req, res);
  });

  // Métricas simples (uptime + requests), sem expor payloads sensíveis
  app.get("/metrics", (_req, res) => {
    res.json({
      uptime: process.uptime(),
      requests: metrics.getRequestStats(5),
    });
  });

  // Debug: eco dos headers de sessão (apenas DEV) — cookie, x-session-token, authorization
  if (process.env.NODE_ENV === "development") {
    app.get("/api/debug/headers", (req, res) => {
      res.json({
        cookie: req.headers.cookie ?? null,
        xSessionToken: req.headers["x-session-token"] ?? null,
        authorization: req.headers.authorization ?? null,
      });
    });
  }

  // Rota para testar Sentry (somente em desenvolvimento)
  if (process.env.NODE_ENV !== "production") {
    app.get("/api/debug-sentry", (req, res) => {
      if (process.env.SENTRY_DSN) {
        throw new Error("Teste Sentry: este erro foi gerado de propósito.");
      }
      res.status(200).json({ ok: true, message: "Sentry não configurado (SENTRY_DSN ausente)." });
    });
  }

  // Rota de backup (download ZIP) — apenas admin (correção SECURITY_FULL_AUDIT)
  const { requireAdmin } = await import("./requireAdmin.js");
  app.get("/api/backup/download", (req, res, next) => {
    requireAdmin(req, res, next).catch(next);
  }, async (req, res) => {
    try {
      await gerarBackupZip(res);
    } catch (error) {
      res.status(500).json({ error: "Erro ao gerar backup" });
    }
  });
  // Dashboard inteligente: GET /api/dashboard/insights
  const dashboardRouter = (await import("../routes/dashboard.js")).default;
  app.use("/api/dashboard", dashboardRouter);
  
  // Monitor de serviços: GET /api/monitor/status
  const { createMonitorRouter } = await import("./monitor-router.js");
  app.use("/api/monitor", createMonitorRouter());
  
  // Cache manager: GET /api/cache/stats, POST /api/cache/clear
  app.use("/api/cache", createCacheRouter());
  
  // Métricas: GET /api/metrics
  const metricsRouter = (await import("../routes/metrics.js")).default;
  app.use("/api/metrics", metricsRouter);
  
  // Rotas de teste de monitoramento (apenas em desenvolvimento)
  if (process.env.NODE_ENV !== "production") {
    const testMonitoringRouter = (await import("../routes/test-monitoring.js")).default;
    app.use("/api/test-monitoring", testMonitoringRouter);
  }

  app.use((req, _res, next) => {
    if ((req.originalUrl || req.url).startsWith("/api")) {
      console.log('>>> BEFORE ROUTES', req.method, req.originalUrl || req.url);
    }
    next();
  });

  // Internal Status: GET /internal/status (debug endpoint protegido)
  const internalRouter = (await import("../controllers/internal-router.js")).default;
  app.use("/internal", internalRouter);

  // Failure simulation endpoints (apenas desenvolvimento)
  if (process.env.NODE_ENV === "development") {
    const failureRoutes = createFailureSimulationRoutes();
    app.use("/api/test/failure", failureRoutes);
    console.log("[BOOT] rotas /api/test/failure (dev)");
  }

  // tRPC API com tratamento de erros melhorado (DEVE vir antes do apiRouter se ambos usarem /api prefix)
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      allowMethodOverride: true, // permite POST em queries (ex.: auth.me em batch)
      onError: ({ error, type, path, input, ctx, req }) => {
        const traceId = nanoid(10);
        const err = error as Error & { code?: string; errno?: number; sqlState?: string };
        console.error(`[ERROR] [TRPC] traceId=${traceId} path=${path ?? "<no-path>"} message=${error.message}`);
        console.error("[ERROR] [TRPC] STACK TRACE:", err.stack);
        console.error("[ERROR] [TRPC] FULL ERROR:", err);
        console.error("[ERROR] [TRPC] MySQL", {
          code: err?.code,
          errno: err?.errno,
          sqlState: err?.sqlState,
        });
        console.error("[ERROR] [TRPC] request", { method: req.method, url: req.url, input });
        if (process.env.SENTRY_DSN) {
          Sentry.captureException(error, { extra: { traceId, type, path, input, code: err?.code, errno: err?.errno, sqlState: err?.sqlState } });
        }
      }
    })
  );

  console.log('ROUTES REGISTERED');
  app.use("/api", apiRouter);

  // Sentry: captura erros do Express (após todas as rotas, antes de outros error handlers)
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  // Middleware de tratamento de erros global
  app.use(globalErrorHandler);

  if (process.env.NODE_ENV === "development") {
    console.log("[SERVER] Vite (dev)…");
    await setupVite(app, server);
    console.log("[SERVER] Vite ok");
  } else {
    console.log("[SERVER] arquivos estáticos…");
    serveStatic(app);
    console.log("[SERVER] estáticos ok");
  }

  console.log("[SERVER] porta…");
  const PORT = env.PORT || 3000;
  console.log("[SERVER] PORT=", PORT);
  let port = PORT;

  if (process.env.NODE_ENV !== "production") {
    if (!(await isPortAvailable(PORT))) {
      console.warn(`AVISO: A porta ${PORT} está em uso. Buscando porta alternativa...`);
      try {
        port = await findAvailablePort(PORT + 1);
        console.log(`Usando porta alternativa: ${port}`);
      } catch (error) {
        console.error("Não foi possível encontrar uma porta disponível.");
        exitProcessInProductionUnlessDevelopment(1);
      }
    }
    try {
      fs.writeFileSync(
        path.join(process.cwd(), "server", "_core", "port.ts"),
        `// Gerado automaticamente pelo servidor\nexport const PORT = ${port};\n`
      );
    } catch (_) {}
  }

  console.log("[SERVER] listen em", port);

  const shutdownMiddleware = setupGracefulShutdown(server, { timeoutMs: 30000 });
  shutdownMiddleware.forEach((middleware) => app.use(middleware));
  console.log("[BOOT] graceful shutdown configurado");

  if (process.env.ENABLE_HEALTH_WATCHDOG !== "0") {
    const watchdog = getHealthWatchdog();
    watchdog.start();
    console.log("[BOOT] health watchdog ativo");
  }

  server.listen(port, () => {
    systemLogger.info(`[BOOT] servidor ouvindo em http://localhost:${port}/`);
    (global as any).SERVER_PORT = port;
  });

}

// Fallback Windows para SIGINT via readline sem process.emit/process.exit direto
if (process.platform === "win32") {
  import("readline")
    .then((readline) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.on("SIGINT", () => {
        systemLogger.warn("[SHUTDOWN] SIGINT via readline");
        void requestShutdown({ reason: "SIGINT_READLINE", code: 0 });
      });
    })
    .catch((err) => {
      systemLogger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "[SHUTDOWN] Falha ao carregar readline"
      );
  });
}

startServer().catch((e) => {
  systemLogger.error(
    { error: e instanceof Error ? e.message : String(e) },
    "[BOOT] startServer falhou"
  );
  exitProcessInProductionUnlessDevelopment(1);
});
