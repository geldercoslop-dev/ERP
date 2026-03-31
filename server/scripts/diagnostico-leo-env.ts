/**
 * Script usado pelo ERP_DIAGNOSTICO_LEO.bat para verificar .env e integrações.
 * Carrega dotenv e chama verificarConfiguracaoIntegracoes(); imprime resumo e exit 0/1.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { verificarConfiguracaoIntegracoes } from "../config/verificarIntegracoes.js";

function main() {
  const envPath = path.join(process.cwd(), ".env");
  const envExists = fs.existsSync(envPath);
  if (!envExists) {
    console.log("ERRO:.env não encontrado");
    process.exit(1);
  }
  console.log("OK:.env encontrado");
  const { configuradas, naoConfiguradas } = verificarConfiguracaoIntegracoes();
  console.log(`INTEGRACOES_CONFIGURADAS:${configuradas.length}`);
  console.log(`INTEGRACOES_NAO_CONFIGURADAS:${naoConfiguradas.length}`);
  naoConfiguradas.forEach((n) => console.log(`FALTA:${n.nome}:${n.mensagem ?? ""}`));
  process.exit(0);
}

main();
