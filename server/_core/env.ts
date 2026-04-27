import { parseEnv } from "../services/env.schema.js";

let _env: ReturnType<typeof parseEnv> | null = null;

export function getEnv() {
  // REMOVIDO: requireBootstrap('env.getEnv') - causava circular import
  // A validação de bootstrap é feita pelo fluxo de bootstrapServer()
  if (!_env) {
    _env = parseEnv();
  }
  return _env;
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: () => getEnv().JWT_ACCESS_SECRET,
  databaseUrl: () => getEnv().DATABASE_URL,
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Helper para acesso direto ao objeto parsed (para compatibilidade)
  get parsed() {
    return getEnv();
  },
  // Helper para acesso direto a variáveis de ambiente validadas
  get required() {
    return getEnv();
  },
};
