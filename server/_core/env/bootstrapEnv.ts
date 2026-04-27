import dotenv from "dotenv";
import fs from "fs";
import path from "path";

/**
 * ENV BOOTSTRAP - ÚNICO PONTO DE CARREGAMENTO DE VARIÁVEIS DE AMBIENTE
 * 
 * Este é o ÚNICO local onde dotenv.config() deve ser chamado no sistema.
 * 
 * REGRAS:
 * - Nenhum script deve chamar dotenv.config() diretamente
 * - Nenhum script deve importar loadEnv() do loadEnv.ts
 * - Todos devem usar initEnv() deste arquivo
 * - ENV deve ser carregado antes de qualquer validação
 * 
 * CRÍTICO: Este arquivo NÃO executa nada no import-time.
 * initEnv() deve ser chamado explicitamente.
 */

let _loaded = false;

/**
 * Carrega variáveis de ambiente de .env (apenas em desenvolvimento)
 * 
 * Esta é a ÚNICA função autorizada para carregar ENV no sistema.
 * Deve ser chamada EXPLICITAMENTE antes de qualquer validação.
 * 
 * @throws Error se .env existir em produção ou se houver erro ao carregar
 */
export function initEnv(): void {
  console.log("🔥 INIT ENV FOI CHAMADO");

  // Fail-fast se já foi carregado (evita dupla injeção)
  if (_loaded) {
    console.log("🔥 ENV JÁ FOI CARREGADO ANTES");
    return;
  }

  const envPath = path.resolve(process.cwd(), ".env");
  console.log("🔥 ENV PATH:", envPath);
  const envExists = fs.existsSync(envPath);
  console.log("🔥 ENV EXISTS:", envExists);

  // Production block: if NODE_ENV=production and .env exists, fail hard
  if (process.env.NODE_ENV === "production" && envExists) {
    console.error("❌ [ENV] ERRO CRÍTICO: .env detectado em produção");
    console.error("❌ [ENV] Produção deve usar variáveis de ambiente do runtime, não arquivo .env");
    console.error(`❌ [ENV] Arquivo encontrado: ${envPath}`);
    process.exit(1);
  }

  // Load .env only in non-production with explicit path
  // NOTA: dotenv v17 tem logging automático "injected env" (não é possível desativar)
  // Este arquivo garante que initEnv() é a fonte autoritativa de configuração
  if (process.env.NODE_ENV !== "production") {
    if (envExists) {
      const result = dotenv.config({ path: envPath });
      console.log("🔥 DOTENV RESULT:", result);
      if (result.error) {
        console.error("❌ [ENV] Erro ao carregar .env:", result.error.message);
        process.exit(1);
      }
      console.log("✅ [ENV] carregado de arquivo .env (ambiente local)");
      console.log("[ENV] dotenv carregado (log 'injected env' é da biblioteca, ignorar)");
      console.log("🔥 DATABASE_URL após load:", process.env.DATABASE_URL);
      console.log("🔥 APP_SECRET após load:", process.env.APP_SECRET);
    } else {
      console.log("ℹ️  [ENV] usando variáveis do runtime (sem .env)");
    }
  } else {
    console.log("ℹ️  [ENV] produção: usando variáveis do runtime (sem .env)");
  }

  _loaded = true;
}

/**
 * Verifica se ENV foi carregado
 */
export function isEnvLoaded(): boolean {
  return _loaded;
}
