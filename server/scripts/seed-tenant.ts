/**
 * Script para criar tenant padrão e admin
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function getConnectionConfig(): { host: string; port: number; user: string; password: string; database: string } {
  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME?.trim() || "vendas_app";
  
  if (!host || !user || password === undefined) {
    throw new Error("Credenciais obrigatórias. Defina DB_HOST, DB_USER, DB_PASSWORD.");
  }
  
  return {
    host,
    port: parseInt(process.env.DB_PORT ?? "3306", 10),
    user,
    password,
    database,
  };
}

async function main(): Promise<void> {
  const config = getConnectionConfig();
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
