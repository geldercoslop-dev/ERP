import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path from "path";
import { getProjectRoot } from "./project-root.js";
export async function setupVite(app, server) {
    const [{ createServer: createViteServer }, viteConfigModule] = await Promise.all([
        import("vite"),
        import("../../vite.config.js"),
    ]);
    const viteConfig = viteConfigModule.default;
    const serverOptions = {
        middlewareMode: true,
        hmr: { server },
        allowedHosts: true,
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
            // always reloads index.html file from disk incase it changes
            let template = await fs.promises.readFile(clientTemplate, "utf-8");
            template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
            const page = await vite.transformIndexHtml(url, template);
            res.status(200).set({ "Content-Type": "text/html" }).end(page);
        }
        catch (e) {
            const err = e;
            console.error("[Vite] Erro ao transformar index.html:", err?.message ?? err);
            vite.ssrFixStacktrace(err);
            next(e);
        }
    });
}
export function serveStatic(app) {
    const distPath = path.resolve(getProjectRoot(), "dist", "public");
    const assetsPath = path.join(distPath, "assets");
    const indexHtml = path.join(distPath, "index.html");
    const hasClient = fs.existsSync(distPath) && fs.existsSync(indexHtml);
    const hasAssets = fs.existsSync(assetsPath);
    console.log("Serving static from:", distPath);
    console.log("Static assets path:", assetsPath, "exists:", hasAssets);
    if (!hasClient) {
        console.error(`[STATIC] Build do frontend ausente ou incompleto. Esperado diretório com index.html em: ${distPath}`);
        console.error("[STATIC] Rode: pnpm run build (client → dist/public). Rotas não-API responderão 503 até lá.");
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
            res.sendFile(indexHtml, (err) => {
                if (err) {
                    console.error("[STATIC] Falha ao enviar index.html:", err instanceof Error ? err.message : String(err));
                    if (!res.headersSent) {
                        res.status(500).type("application/json").json({ error: "static_send_failed" });
                    }
                }
            });
        });
        return;
    }
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
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
