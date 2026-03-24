/**
 * Cria o primeiro vendedor admin no DB com senha hasheada.
 * Uso: npx tsx server/scripts/seed-admin.ts
 * Depois faça login com o nome e senha configurados abaixo.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import * as db from "../db/index";

const ADMIN_NOME = "admin";
const ADMIN_SENHA_PLAINA = "admin123";

async function main() {
  const existing = await db.getVendedorByNome(ADMIN_NOME);
  if (existing) {
    console.log("Vendedor 'admin' já existe. Para redefinir a senha, altere em Vendedores no app.");
    process.exit(0);
    return;
  }

  const senhaHash = await bcrypt.hash(ADMIN_SENHA_PLAINA, 10);
  await db.createVendedor({
    nome: ADMIN_NOME,
    senha: senhaHash,
    admin: true,
  } as any);

  console.log("Admin criado. Login: nome =", ADMIN_NOME, ", senha =", ADMIN_SENHA_PLAINA);
  console.log("Recomendado: altere a senha após o primeiro acesso.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
