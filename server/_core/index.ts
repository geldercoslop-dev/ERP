/**
 * Entry do servidor.
 * RISCOS DO SISTEMA (evitar): perda de dados por db:push em prod; banco fora do schema;
 * sessão não reconhecida; lista não atualizar após CRUD; deploy sem backup/migrations.
 * Ver /docs/RISCO_ATUAL.md e /docs/RECUPERACAO_SISTEMA.md.
 *
 * Rate limit: configurável por env RATE_LIMIT_WINDOW_MS e RATE_LIMIT_MAX (ex: 60000 e 120).
 * CORS: em produção defina ALLOWED_ORIGINS (separado por vírgula), ex: https://app.seudominio.com
 */
import dotenv from "dotenv";
// Em desenvolvimento não carregar .env.production antes do loadEnv (evita segredos curtos/fixos persistirem)
if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: ".env.production" });
}
import "./loadEnv";

// Forçar stdin para detecção de SIGINT no Windows
process.stdin.resume();

import { initializeOpenTelemetry } from "../infra/tracing";
import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { nanoid } from "nanoid";
// import { registerOAuthRoutes } from "./oauth"; // DESABILITADO
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { gerarBackupZip } from "../backup";
import * as fs from "fs";
import path from "path";
import { initCacheSystem, createCacheRouter } from "./cache-manager";
import { secureConsoleMiddleware } from "../security/secure-logger";
import { setupMonitoring, setupDatabaseMonitoring } from "./monitoring-setup";
import { globalTimeoutMiddleware } from "../resilience/timeout-middleware";
import { setupGracefulShutdown } from "../resilience/graceful-shutdown";
import { getHealthWatchdog } from "../monitoring/health-watchdog";
import { requestShutdown } from "../services/system/shutdown.service";
import { getServerHealth } from "../services/system/health.service";
import { getEnv } from "../config/env";
import { validateShutdownAuthPayload } from "../services/system/payload-validation.service";
import { createFailureSimulationRoutes } from "../resilience/failure-simulator";
import { exitProcessInProductionUnlessDevelopment } from "./dev-process-exit";
import { createLogger } from "../infra/structured-logger";
import { requestIdMiddleware, getRequestId } from "../middleware/request-id.middleware";
import { globalErrorHandler } from "../middleware/global-error-handler.middleware";
import { validateProductionEnvOrExit } from "./env.validation";
import { isRedisReady } from "../infra/redis";
import { getDb } from "../db/index";

// Exportar funções de padronização de resposta
export { ensureArray, ensureObject, ensureCreatedResult, ensureUpdateResult, ensureDeleteResult } from "./service-response";

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
  validateProductionEnvOrExit();
  console.log("[ENV] variáveis obrigatórias ok");
  const env = getEnv();
  secureConsoleMiddleware();
  console.log("[BOOT] inicialização do servidor");

  console.log("[BOOT] OpenTelemetry…");
  initializeOpenTelemetry();
  console.log("[BOOT] OpenTelemetry ok");

  try {
    const { getConnectionPool } = await import("../config/database");
    await getConnectionPool();
    console.log("[DB] pool conectado");
  } catch (e) {
    console.error("[DB] falha ao conectar:", e);
    process.exit(1);
  }

  try {
    const { redisManager } = await import("../infra/redis");
    const redisTest = await redisManager.testConnection();
    if (!redisTest.success) {
      console.error("[REDIS] falha:", redisTest.message);
      process.exit(1);
    }
    console.log("[REDIS] ok");
  } catch (e) {
    console.error("[REDIS] falha:", e);
    process.exit(1);
  }

  console.log("[BOOT] sistema de cache…");
  initCacheSystem();
  console.log("[BOOT] cache ok");

  const app = express();
  const server = createServer(app);
  console.log("[BOOT] Express + HTTP criados");

  app.use(requestIdMiddleware);
  
  console.log("[BOOT] monitoramento…");
  setupMonitoring(app);
  console.log("[BOOT] monitoramento ok");

  try {
    console.log("[BOOT] usuário admin…");
    const { ensureAdminUser } = await import("../db/index");
    await ensureAdminUser(1);
    console.log("[BOOT] admin ok");
  } catch (e) {
    console.error("[ERROR] ensureAdminUser:", e);
    if (process.env.NODE_ENV === "development") {
      console.error("[ERROR] em desenvolvimento o servidor continua; corrija o banco.");
    } else {
      process.exit(1);
    }
  }

  console.log("[BOOT] middlewares de segurança…");
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    })
  );

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
        "X-Shutdown-Secret",
        "User-Agent",
      ],
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // Security extra: métodos inesperados bloqueados na API
  const allowedApiMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
  app.use("/api", (req, res, next) => {
    if (!allowedApiMethods.has(req.method.toUpperCase())) {
      logSecurity("método HTTP bloqueado", req, { method: req.method });
      return sendStandardError(req, res, 405, "METHOD_NOT_ALLOWED", "Método não permitido");
    }
    next();
  });

  // Middleware de monitoramento global (registra métricas de performance e acesso)
  app.use((req, res, next) => {
    const startTime = Date.now();
    
    // Registrar conexão ativa
    try {
      const { metricsService } = require("../monitoring/metrics");
      metricsService.recordConnection(1);
    } catch {}

    // Registrar conclusão da resposta
    res.on("finish", () => {
      try {
        const duration = Date.now() - startTime;
        const { metricsService } = require("../monitoring/metrics");
        
        // Registrar métrica
        metricsService.recordRequest(duration);
        metricsService.recordConnection(-1);

        // Registrar erro se status >= 400
        if (res.statusCode >= 400) {
          metricsService.recordError();
        }

        // Log de acesso estruturado
        try {
          const { loggerStructured } = require("../monitoring/logger");
          loggerStructured.access(req.method, req.path, res.statusCode, duration, {
            ip: getClientIp(req),
            userAgent: req.get("user-agent"),
          });
        } catch {}

        // Verificar e registrar alertas
        try {
          const { metricsService: metricsService2 } = require("../monitoring/metrics");
          const alerts = metricsService2.checkAlerts();
          if (alerts.length > 0) {
            const { loggerStructured: loggerStructured2 } = require("../monitoring/logger");
            for (const alert of alerts) {
              loggerStructured2.alert(alert.level, alert.message, { path: req.path });
            }
          }
        } catch {}
      } catch {}
    });

    next();
  });

  const appSecret = env.APP_SECRET;
  const internalEndpointSecret =
    process.env.HARD_TEST_SHUTDOWN_SECRET?.trim() || appSecret || "";
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    if (req.path === "/api/health" || req.path === "/api/health/") return next();

    const userAgent = req.get("user-agent")?.trim();
    if (!userAgent) {
      logSecurity("user-agent ausente", req);
      return sendStandardError(req, res, 400, "MISSING_USER_AGENT", "user-agent obrigatório");
    }

    const secret = req.get("x-app-secret")?.trim();
    if (!appSecret || !secret || secret !== appSecret) {
      logSecurity("x-app-secret inválido", req, { hasSecret: Boolean(secret) });
      return sendStandardError(req, res, 401, "UNAUTHORIZED", "unauthorized");
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
    
    // Rate limit específico para endpoint de shutdown
    const shutdownRateLimit = rateLimit({
      windowMs: 60 * 1000, // 1 minuto
      max: 3, // máximo 3 requests por minuto
      message: { error: "Too many shutdown requests" },
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => false, // nunca pular este rate limit
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
          const { initiateGracefulShutdown } = await import("../services/system/shutdown.service");
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

  // Rate limit global: 60 req/min por IP (health fica de fora)
  const authRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !/\/api\/trpc\/auth(\.|\/)|\/api\/auth(\/|$)/.test(req.originalUrl || req.url),
    handler: (req, res) =>
      sendStandardError(req, res, 429, "AUTH_RATE_LIMITED", "Muitas tentativas de autenticação."),
  });
  app.use("/api", authRateLimiter);

  const adminRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !/\/api\/admin(\/|$)|\/api\/trpc\/admin(\.|\/)/.test(req.originalUrl || req.url),
    handler: (req, res) =>
      sendStandardError(req, res, 429, "ADMIN_RATE_LIMITED", "Limite de requisições administrativas atingido."),
  });
  app.use("/api", adminRateLimiter);

  const internalRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !(req.originalUrl || req.url).startsWith("/api/__"),
    handler: (req, res) =>
      sendStandardError(req, res, 429, "INTERNAL_RATE_LIMITED", "Limite em endpoint interno atingido."),
  });
  app.use("/api", internalRateLimiter);

  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMITED",
          message: "Muitas requisições. Tente novamente em instantes.",
        },
      },
      handler: (req, res) => {
        logSecurity("rate limit excedido", req);
        sendStandardError(
          req,
          res,
          429,
          "RATE_LIMITED",
          "Muitas requisições. Tente novamente em instantes."
        );
      },
      skip: (req) => {
        const base = (req.originalUrl ?? req.url ?? "").split("?")[0];
        return base === "/api/health" || base === "/api/health/";
      },
    })
  );

  // Body parser aplicado no hardening global (1mb)

  // Timeout global para todas as requests
  app.use(globalTimeoutMiddleware(10000)); // 10 segundos

  // CSRF Protection para endpoints state-changing
  const { CSRFProtection } = await import("../security/csrf-protection");
  
  // Endpoint para obter token CSRF (para SPA/React)
  app.get("/api/csrf-token", CSRFProtection.csrfTokenEndpoint());
  
  // Aplicar CSRF protection em todas as rotas /api exceto GET/HEAD/OPTIONS
  app.use("/api", CSRFProtection.csrfProtection());

  // OAuth callback under /api/oauth/callback - DESABILITADO
  // registerOAuthRoutes(app);
  // Login/Logout: apenas tRPC (auth.login / auth.logout). Rotas /api/login e /api/logout removidas.

  // Rota de teste rápido para debug
    app.get("/ping", (req, res) => {
      console.log("[SERVER] GET /ping");
      res.json({ 
        ok: true, 
        message: "Server responde!",
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

  // Health check avançado - implementado via tRPC em /api/trpc/health.*

  app.get("/api/health", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const report = await getServerHealth();
      res.status(200).json({
        ...report,
        requestId: res.locals.requestId,
      });
    } catch {
      res.status(503).json({
        error: {
          code: "HEALTH_UNAVAILABLE",
          message: "Health check indisponível",
          details: {
            requestId: res.locals.requestId,
          },
        },
      });
    }
  });

  app.get("/health", async (_req, res) => {
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    let dbStatus: "ok" | "down" = "down";
    let redisStatus: "ok" | "down" = "down";

    try {
      const db = await getDb();
      dbStatus = db ? "ok" : "down";
    } catch {
      dbStatus = "down";
    }

    try {
      const redisReady = await isRedisReady();
      redisStatus = redisReady ? "ok" : "down";
    } catch {
      redisStatus = "down";
    }

    const httpStatus = dbStatus === "ok" && redisStatus === "ok" ? 200 : 503;
    res.status(httpStatus).json({
      status: httpStatus === 200 ? "ok" : "degraded",
      db: dbStatus,
      redis: redisStatus,
      uptime,
      memory,
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

  // Rota para testar Sentry (só quando SENTRY_DSN está definido)
  app.get("/api/debug-sentry", (req, res) => {
    if (process.env.SENTRY_DSN) {
      throw new Error("Teste Sentry: este erro foi gerado de propósito.");
    }
    res.status(200).json({ ok: true, message: "Sentry não configurado (SENTRY_DSN ausente)." });
  });

  // Rota de backup (download ZIP) — apenas admin (correção SECURITY_FULL_AUDIT)
  const { requireAdmin } = await import("./requireAdmin");
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
  const dashboardRouter = (await import("../routes/dashboard")).default;
  app.use("/api/dashboard", dashboardRouter);
  
  // Monitor de serviços: GET /api/monitor/status
  const { createMonitorRouter } = await import("./monitor-router");
  app.use("/api/monitor", createMonitorRouter());
  
  // Cache manager: GET /api/cache/stats, POST /api/cache/clear
  app.use("/api/cache", createCacheRouter());
  
  // Métricas: GET /api/metrics
  const metricsRouter = (await import("../routes/metrics")).default;
  app.use("/api/metrics", metricsRouter);
  
  // Rotas de teste de monitoramento (apenas em desenvolvimento)
  if (process.env.NODE_ENV !== "production") {
    const testMonitoringRouter = (await import("../routes/test-monitoring")).default;
    app.use("/api/test-monitoring", testMonitoringRouter);
  }

  // Failure simulation endpoints (apenas desenvolvimento)
  if (process.env.NODE_ENV === "development") {
    const failureRoutes = createFailureSimulationRoutes();
    app.use("/api/test/failure", failureRoutes);
    console.log("[BOOT] rotas /api/test/failure (dev)");
  }
  // tRPC API com tratamento de erros melhorado
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      allowMethodOverride: true, // permite POST em queries (ex.: auth.me em batch)
      onError: ({ error, type, path, input, ctx, req }) => {
        const traceId = nanoid(10);
        const err = error as Error & { code?: string; errno?: number; sqlState?: string; sqlMessage?: string; sql?: string };
        console.error(`[ERROR] [TRPC] traceId=${traceId} path=${path ?? "<no-path>"} message=${error.message}`);
        console.error("[ERROR] [TRPC] MySQL", {
          code: err?.code,
          errno: err?.errno,
          sqlState: err?.sqlState,
          sqlMessage: err?.sqlMessage,
        });
        if (err?.sql) console.error("[ERROR] [TRPC] sql:", err.sql);
        console.error("[ERROR] [TRPC] request", { method: req.method, url: req.url, input });
        if (process.env.SENTRY_DSN) {
          Sentry.captureException(error, { extra: { traceId, type, path, input, code: err?.code, sqlMessage: err?.sqlMessage } });
        }
      }
    })
  );

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
    console.log(`[SERVER] http://localhost:${port}/`);
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
        console.log("[SHUTDOWN] SIGINT via readline");
        void requestShutdown({ reason: "SIGINT_READLINE", code: 0 });
      });
    })
    .catch((err) => {
      console.log("[SHUTDOWN] Falha ao carregar readline:", err);
  });
}

process.on("uncaughtException", (error) => {
  securityLogger.error("uncaught_exception", error instanceof Error ? error : new Error(String(error)), {
    metadata: { scope: "process" },
  });
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  securityLogger.error("unhandled_rejection", error, {
    metadata: { scope: "process" },
  });
});

startServer().catch((e) => {
  console.error(e);
  exitProcessInProductionUnlessDevelopment(1);
});
