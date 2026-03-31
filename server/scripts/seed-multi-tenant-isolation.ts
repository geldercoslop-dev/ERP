/**
 * Seed demonstrativo de isolamento multi-tenant (evidência para auditoria).
 *
 * Objetivo:
 * - Criar 2 tenants distintos
 * - Criar 2 usuários/vendedores (cada um em um tenant)
 * - Criar clientes distintos para cada tenant (associados ao vendedor principal)
 *
 * Observação: este script é apenas para testes/execução local. Não altera lógica do sistema.
 */

import mysql from "mysql2/promise";
import "dotenv/config";
import * as db from "../db/index.js";

async function hashPassword(plain: string): Promise<string> {
  const bcryptImported = await import("bcryptjs");
  const bcrypt: any = (bcryptImported as any).default ?? bcryptImported;
  if (typeof bcrypt?.hash !== "function") {
    throw new Error("bcryptjs hash indisponivel no ambiente de runtime.");
  }
  const hashed = await bcrypt.hash(plain, 10);
  if (!hashed.startsWith("$2")) {
    throw new Error(`Hash bcrypt invalido: ${hashed}`);
  }
  return hashed;
}

function uniqPhone(base: string, suffix: string) {
  // Normalizacao do sistema remove nao-digitos e corta; mantenha 8..15 digitos.
  return `${base}${suffix}`.replace(/\D/g, "").slice(0, 15);
}

async function main() {
  const DB_HOST = process.env.DB_HOST ?? "localhost";
  const DB_PORT = Number(process.env.DB_PORT ?? "3306");
  const DB_USER = process.env.DB_USER ?? "vendas";
  const DB_PASSWORD = process.env.DB_PASSWORD ?? "vendas123";
  const DB_NAME = process.env.DB_NAME ?? "vendas_app";

  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });

  const timestampSuffix = Date.now().toString().slice(-6);
  const tenantAName = `TENANT_A_ISO_${timestampSuffix}`;
  const tenantBName = `TENANT_B_ISO_${timestampSuffix}`;

  const vendorAPassword = "123456";
  const vendorBPassword = "123456";

  /**
   * 1) "Criar tenants":
   * - Nesta instância, pode nao existir tabela `tenants` (o sistema operacionaliza multi-tenancy via `tenant_id`).
   * - Portanto, selecionamos 2 tenantId novos e isolados para inserir users/vendedores/clientes.
   */
  const [maxRows] = await connection.execute(
    `SELECT COALESCE(MAX(tenant_id), 0) AS maxTenantId FROM users`
  );
  const maxTenantId = Array.isArray(maxRows) ? (maxRows as any)[0]?.maxTenantId : 0;
  const tenantAId = Number(maxTenantId) + 1;
  const tenantBId = Number(maxTenantId) + 2;

  // 2) Criar users/vendedores via camada drizzle (evita divergencia de nomes de colunas)
  const bcryptA = await hashPassword(vendorAPassword);
  const bcryptB = await hashPassword(vendorBPassword);

  const userAOpenId = `iso-tenantA-${timestampSuffix}`;
  const userBOpenId = `iso-tenantB-${timestampSuffix}`;

  const userA = await db.insertUser({
    tenantId: tenantAId,
    openId: userAOpenId,
    name: "Tenant A User",
    email: `tenantA-${timestampSuffix}@local.test`,
    loginMethod: "local",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  });

  const userB = await db.insertUser({
    tenantId: tenantBId,
    openId: userBOpenId,
    name: "Tenant B User",
    email: `tenantB-${timestampSuffix}@local.test`,
    loginMethod: "local",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  });

  const vendorA = await db.createVendedor({
    tenantId: tenantAId,
    userId: userA.id,
    nome: "Vendedor Tenant A",
    senha: bcryptA,
    admin: false,
    ativo: true,
    cidade: null,
    telefone: null,
    email: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const vendorB = await db.createVendedor({
    tenantId: tenantBId,
    userId: userB.id,
    nome: "Vendedor Tenant B",
    senha: bcryptB,
    admin: false,
    ativo: true,
    cidade: null,
    telefone: null,
    email: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 3) Criar clientes (distintos por tenant e associados ao vendedor principal)
  const clients = {
    tenantA: [
      {
        nome: `TA_CLIENTE_1_${timestampSuffix}`,
        telefone: uniqPhone("55", "701" + timestampSuffix),
      },
      {
        nome: `TA_CLIENTE_2_${timestampSuffix}`,
        telefone: uniqPhone("55", "702" + timestampSuffix),
      },
    ],
    tenantB: [
      {
        nome: `TB_CLIENTE_1_${timestampSuffix}`,
        telefone: uniqPhone("55", "801" + timestampSuffix),
      },
      {
        nome: `TB_CLIENTE_2_${timestampSuffix}`,
        telefone: uniqPhone("55", "802" + timestampSuffix),
      },
    ],
  };

  const createdClientsA: Array<{ id: number; nome: string; telefone: string }> = [];
  for (const c of clients.tenantA) {
    const r = await db.createCliente(tenantAId, { nome: c.nome, telefone: c.telefone }, vendorA.id);
    createdClientsA.push({ id: r.id, nome: c.nome, telefone: c.telefone });
  }

  const createdClientsB: Array<{ id: number; nome: string; telefone: string }> = [];
  for (const c of clients.tenantB) {
    const r = await db.createCliente(tenantBId, { nome: c.nome, telefone: c.telefone }, vendorB.id);
    createdClientsB.push({ id: r.id, nome: c.nome, telefone: c.telefone });
  }

  await connection.end();

  const result = {
    createdAt: new Date().toISOString(),
    tenants: {
      tenantA: { id: tenantAId, nome: tenantAName },
      tenantB: { id: tenantBId, nome: tenantBName },
    },
    users: {
      tenantA: { openId: userAOpenId, vendedorId: vendorA.id },
      tenantB: { openId: userBOpenId, vendedorId: vendorB.id },
    },
    clients: {
      tenantA: createdClientsA,
      tenantB: createdClientsB,
    },
    passwords: {
      vendorA: vendorAPassword,
      vendorB: vendorBPassword,
    },
    // Tokens diretos para testes (equivalente a autenticação via auth.login)
    sessionTokens: {
      userA: `v:${vendorA.id}`,
      userB: `v:${vendorB.id}`,
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[seed-multi-tenant-isolation] ERRO:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

