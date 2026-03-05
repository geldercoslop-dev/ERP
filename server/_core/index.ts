/**
 * Entry do servidor.
 * RISCOS DO SISTEMA (evitar): perda de dados por db:push em prod; banco fora do schema;
 * sessão não reconhecida; lista não atualizar após CRUD; deploy sem backup/migrations.
 * Ver /docs/RISCO_ATUAL.md e /docs/RECUPERACAO_SISTEMA.md.
 *
 * Rate limit: configurável por env RATE_LIMIT_WINDOW_MS e RATE_LIMIT_MAX (ex: 60000 e 120).
 * CORS: em produção defina ALLOWED_ORIGINS (separado por vírgula), ex: https://app.seudominio.com
 */
import "./loadEnv";
import * as Sentry from "@sentry/node";
import express from "express";
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

// Tipos para o middleware de erro
import { Request, Response, NextFunction } from "express";
interface ErrorWithStatus extends Error {
  status?: number;
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
  const app = express();
  const server = createServer(app);

  try {
    const { ensureAdminUser } = await import("../db");
    await ensureAdminUser();
  } catch (e) {
    console.error("[Boot] ensureAdminUser failed:", e);
  }

  // CORS middleware
  app.use((req, res, next) => {
    if (!req.url?.startsWith("/api")) {
      return next();
    }

    const origin = req.headers.origin;
    const envOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean);
    const allowedOrigins = envOrigins?.length
      ? envOrigins
      : [
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:5174",
          "http://127.0.0.1:5174",
          "http://localhost:5175",
          "http://127.0.0.1:5175",
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "http://localhost:3001",
          "http://127.0.0.1:3001",
          "http://localhost:3003",
          "http://127.0.0.1:3003",
        ];
    
    if (!origin) {
      // Same-origin (browser não manda Origin): não aplicar headers CORS para não atrapalhar cookie/sessão.
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
      return;
    }

    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    } else {
      res.header('Access-Control-Allow-Origin', 'null');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token, Origin, X-Requested-With, Accept, Cookie');
    
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });
  
  // Rate limit na API (evita abuso; em produção ajuste por RATE_LIMIT_*)
  const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;
  const rateLimitMax = Number(process.env.RATE_LIMIT_MAX) || 120;
  app.use(
    "/api",
    rateLimit({
      windowMs: rateLimitWindowMs,
      max: rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Muitas requisições. Tente novamente em instantes." },
    })
  );

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback - DESABILITADO
  // registerOAuthRoutes(app);
  // Login/Logout: apenas tRPC (auth.login / auth.logout). Rotas /api/login e /api/logout removidas.

  // Health: status do banco, versão do schema, uptime (sempre ativo)
  app.get("/api/health", async (_req, res) => {
    const start = Date.now();
    let dbStatus: "ok" | "error" = "error";
    let dbTimeMs = 0;
    let database = "";
    let schemaVersionDb: number | null = null;
    try {
      const { getDb, getSchemaVersion } = await import("../db");
      const db = await getDb();
      dbTimeMs = Date.now() - start;
      if (db) {
        dbStatus = "ok";
        schemaVersionDb = await getSchemaVersion();
      }
      if (process.env.DATABASE_URL) {
        try {
          database = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "") || "vendas_app";
        } catch {
          database = process.env.DB_NAME || "vendas_app";
        }
      } else {
        database = process.env.DB_NAME || "vendas_app";
      }
    } catch (e) {
      dbTimeMs = Date.now() - start;
    }
    const { EXPECTED_SCHEMA_VERSION } = await import("./schemaVersion");
    res.json({
      status: dbStatus === "ok" ? "ok" : "degraded",
      db: { status: dbStatus, timeMs: dbTimeMs, database },
      schemaVersion: schemaVersionDb,
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      schemaMatch: schemaVersionDb === EXPECTED_SCHEMA_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      nodeEnv: process.env.NODE_ENV || "development",
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
        console.error(`[TRPC onError] traceId: ${traceId} path: ${path ?? "<no-path>"} message: ${error.message}`);
        console.error('[TRPC onError] MySQL err.code:', err?.code ?? '(não informado)');
        console.error('[TRPC onError] MySQL err.errno:', err?.errno ?? '(não informado)');
        console.error('[TRPC onError] MySQL err.sqlState:', err?.sqlState ?? '(não informado)');
        console.error('[TRPC onError] MySQL err.sqlMessage:', err?.sqlMessage ?? '(não informado)');
        if (err?.sql) console.error('[TRPC onError] query (sql):', err.sql);
        console.error('Request data:', { method: req.method, url: req.url, input });
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
  app.use((err: ErrorWithStatus, req: Request, res: Response, next: NextFunction) => {
    console.error('Erro global não tratado:', err);
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err);
    }
    res.status(err.status || 500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Ocorreu um erro no servidor'
    });
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Porta fixa: PORT do .env ou 3003 (produção e dev)
  const PORT = Number(process.env.PORT) || 3003;
  let port = PORT;

  if (process.env.NODE_ENV !== "production") {
    if (!(await isPortAvailable(PORT))) {
      console.warn(`AVISO: A porta ${PORT} está em uso. Buscando porta alternativa...`);
      try {
        port = await findAvailablePort(PORT + 1);
        console.log(`Usando porta alternativa: ${port}`);
      } catch (error) {
        console.error("Não foi possível encontrar uma porta disponível.");
        process.exit(1);
      }
    }
    try {
      fs.writeFileSync(
        path.join(process.cwd(), "server", "_core", "port.ts"),
        `// Gerado automaticamente pelo servidor\nexport const PORT = ${port};\n`
      );
    } catch (_) {}
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
