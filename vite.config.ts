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
            sourcemaps: {},
          }),
        ]
      : []),
  ],
  root: path.resolve(__dirname, "./client"),
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        // SECURITY HARDENING: Usar environment variable em vez de IP hardcoded
        target: process.env.VITE_API_URL || "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "./dist/public"),
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("react/")) return "react";
            if (id.includes("@tanstack/react-query") || id.includes("@trpc")) return "trpc-query";
            if (id.includes("lucide-react")) return "lucide";
            if (id.includes("recharts")) return "recharts";
            if (id.includes("sonner")) return "sonner";
            if (id.includes("framer-motion")) return "framer-motion";
          }
          return undefined;
        },
      },
    },
  },
  define: {
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(sentryRelease),
  },
});
