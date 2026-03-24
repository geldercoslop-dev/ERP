import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Plugin Sentry opcional
let sentryVitePlugin: typeof import("@sentry/vite-plugin").sentryVitePlugin | null = null;
try {
  sentryVitePlugin = createRequire(import.meta.url)("@sentry/vite-plugin").sentryVitePlugin;
} catch {
  // Opcional
}

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
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            console.log('Sending Request to the Target:', proxyReq.method, proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, _req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, proxyRes.headers);
          });
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../dist/public"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("react/")) return "react";
            if (id.includes("@tanstack/react-query") || id.includes("@trpc")) return "trpc-query";
            if (id.includes("lucide-react")) return "lucide";
            if (id.includes("recharts")) return "recharts";
            if (id.includes("sonner")) return "sonner";
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
