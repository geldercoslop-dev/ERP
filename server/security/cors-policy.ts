import type { CorsOptions } from "cors";

/**
 * Origens permitidas (produção: só ALLOWED_ORIGINS; nunca *).
 */
export function getAllowedOriginsList(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean);
  if (envOrigins?.length) return envOrigins;
  if (process.env.NODE_ENV === "production") return [];
  return [
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
    "http://localhost:3004",
    "http://127.0.0.1:3004",
  ];
}

/** Opções CORS para /api (credentials + origem explícita). */
export function createApiCorsOptions(): CorsOptions {
  return {
    origin(origin, callback) {
      // Em desenvolvimento, permitir qualquer origem
      if (process.env.NODE_ENV !== "production") {
        callback(null, true);
        return;
      }
      
      if (!origin) {
        callback(null, true);
        return;
      }
      const allowed = getAllowedOriginsList();
      callback(null, allowed.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Origin",
      "X-Requested-With",
      "Accept",
      "Cookie",
    ],
    maxAge: 86400,
    optionsSuccessStatus: 200,
  };
}
