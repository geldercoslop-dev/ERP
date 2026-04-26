import dotenv from "dotenv";
import fs from "fs";
import path from "path";

/**
 * IMPORTANTE:
 * dotenv v17 sempre imprime "injected env" no console.
 * Isso NÃO é dupla injeção.
 * NÃO remover, NÃO silenciar, NÃO alterar biblioteca.
 * loadEnv() é a única fonte de carregamento de ENV.
 * 
 * CRÍTICO: Este arquivo NÃO executa nada no import-time.
 * loadEnv() deve ser chamado explicitamente dentro de bootstrapServer().
 */

let _loaded = false;

/**
 * Carrega variáveis de ambiente de .env (apenas em desenvolvimento)
 * 
 * Esta função deve ser chamada EXPLICITAMENTE dentro de bootstrapServer().
 * NUNCA deve ser chamado no import-time.
 * 
 * @throws Error se .env existir em produção ou se houver erro ao carregar
 */
export function loadEnv(): void {
  // Fail-fast se já foi carregado (evita dupla injeção)
  if (_loaded) {
    return;
  }

  const envPath = path.resolve(process.cwd(), ".env");
  const envExists = fs.existsSync(envPath);

  // Production block: if NODE_ENV=production and .env exists, fail hard
  if (process.env.NODE_ENV === "production" && envExists) {
    console.error("❌ [ENV] ERRO CRÍTICO: .env detectado em produção");
    console.error("❌ [ENV] Produção deve usar variáveis de ambiente do runtime, não arquivo .env");
    console.error(`❌ [ENV] Arquivo encontrado: ${envPath}`);
    process.exit(1);
  }

  // Load .env only in non-production with explicit path
  // NOTA: dotenv v17 tem logging automático "injected env" (não é possível desativar)
  // Este arquivo garante que loadEnv() é a fonte autoritativa de configuração
  if (process.env.NODE_ENV !== "production") {
    if (envExists) {
      const result = dotenv.config({ path: envPath });
      if (result.error) {
        console.error("❌ [ENV] Erro ao carregar .env:", result.error.message);
        process.exit(1);
      }
      console.log("✅ [ENV] carregado de arquivo .env (ambiente local)");
      console.log("[ENV] dotenv carregado (log 'injected env' é da biblioteca, ignorar)");
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
