import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { getProjectRoot } from "./project-root";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Nunca servir HTML para rotas de API (evita "Unable to transform response from server")
    if (url.startsWith("/api/")) {
      res.status(404).json({ error: "Not found", path: url });
      return;
    }

    try {
      const clientTemplate = path.resolve(getProjectRoot(), "client", "index.html");

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      const err = e as Error;
      console.error("[Vite] Erro ao transformar index.html:", err?.message ?? err);
      vite.ssrFixStacktrace(err);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(getProjectRoot(), "dist", "public");
  const indexHtml = path.join(distPath, "index.html");
  const hasClient = fs.existsSync(distPath) && fs.existsSync(indexHtml);

  if (!hasClient) {
    console.error(
      `[STATIC] Build do frontend ausente ou incompleto. Esperado diretório com index.html em: ${distPath}`
    );
    console.error("[STATIC] Rode: pnpm run build (client → dist/public). Rotas não-API responderão 503 até lá.");
    app.use((req, res, next) => {
      if (req.originalUrl?.split("?")[0]?.startsWith("/api")) {
        next();
        return;
      }
      res.status(503).type("application/json").json({
        error: "client_not_built",
        message: "Frontend não encontrado em dist/public. Execute o build do client.",
        path: distPath,
      });
    });
    return;
  }

  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(indexHtml, (err) => {
      if (err) {
        console.error("[STATIC] Falha ao enviar index.html:", err instanceof Error ? err.message : String(err));
        if (!res.headersSent) {
          res.status(500).type("application/json").json({ error: "static_send_failed" });
        }
      }
    });
  });
}
