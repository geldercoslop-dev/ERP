/**
 * Script para criar tenant padrão e admin
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function parseDatabaseUrl(): { host: string; port: number; user: string; password: string; database: string } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatório");
  }

  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1).replace(/^\//, "") || "vendas_app",
    };
  } catch (error) {
    throw new Error(`DATABASE_URL inválido: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  const config = parseDatabaseUrl();
  const connection = await mysql.createConnection(config);

  try {
    console.log("[seed-tenant] Criando tenant padrão...");
    
    // Inserir tenant padrão
    const [tenantResult] = await connection.execute(
      `INSERT INTO tenants (nome_empresa, plano, status, createdAt) VALUES (?, ?, ?, NOW())`,
      ["Empresa Padrão", "PROFESSIONAL", "ACTIVE"]
    );
    
    const tenantId = (tenantResult as any).insertId;
    console.log(`[seed-tenant] Tenant criado com ID: ${tenantId}`);
    
    // Inserir usuário admin
    const [userResult] = await connection.execute(
      `INSERT INTO users (tenantId, openId, name, email, role, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [tenantId, "admin-local", "Administrador", "admin@local.com", "admin"]
    );
    
    const userId = (userResult as any).insertId;
    console.log(`[seed-tenant] Usuário admin criado com ID: ${userId}`);
    
    // Inserir vendedor admin
    const [vendedorResult] = await connection.execute(
      `INSERT INTO vendedores (tenantId, userId, nome, admin, ativo, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [tenantId, userId, "Administrador", 1, 1]
    );
    
    console.log(`[seed-tenant] Vendedor admin criado com ID: ${(vendedorResult as any).insertId}`);
    console.log("[seed-tenant] ✅ Dados iniciais criados com sucesso!");
    
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("[seed-tenant] Erro:", err.message ?? err);
  process.exit(1);
});
