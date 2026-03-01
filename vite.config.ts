import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Plugin Sentry opcional: só carrega se o pacote estiver instalado (evita quebrar o dev)
let sentryVitePlugin: typeof import("@sentry/vite-plugin").sentryVitePlugin | null = null;
try {
  sentryVitePlugin = createRequire(import.meta.url)("@sentry/vite-plugin").sentryVitePlugin;
} catch {
  // @sentry/vite-plugin não instalado – source maps no build ficam desativados
}

// Release para Sentry (source maps): use SENTRY_RELEASE no build (ex.: vendas-app@1.0.0)
const sentryRelease = process.env.SENTRY_RELEASE || "vendas-app@1.0.0";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(sentryVitePlugin && process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: sentryRelease },
            sourcemaps: { deleteSourcemapsAfterUpload: true },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  root: path.resolve(__dirname, "./client"),
  build: {
    outDir: path.resolve(__dirname, "./dist/public"),
    emptyOutDir: true,
    sourcemap: true,
  },
  define: {
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(sentryRelease),
  },
});
