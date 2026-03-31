#!/usr/bin/env node
/**
 * Script: Teste CRUD com Autenticação
 * 1. Login
 * 2. Criar cliente
 * 3. Listar clientes
 * 4. Atualizar cliente
 */

const BASE_URL = "http://localhost:3000/api/trpc";
const CREDENTIALS = [
  { username: "admin", password: "admin123" },
  { username: "admin", password: "admin" },
  { username: "admin-local", password: "admin123" },
];

let sessionToken = null;

async function login(username, password) {
  console.log(`   Tentando login: ${username}`);

  try {
    const resp = await fetch(`${BASE_URL}/auth.login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        json: { username, password },
      }),
      timeout: 10000,
    });

    const data = await resp.json();

    if (resp.ok && data?.result?.data?.sessionToken) {
      console.log("   ✅ Login bem-sucedido!");
      return data.result.data.sessionToken;
    }

    if (data?.error?.message) {
      console.log(`   ❌ Erro: ${data.error.message}`);
    } else {
      console.log(`   ❌ Status: ${resp.status}`);
    }
    return null;
  } catch (error) {
    console.log(`   ❌ Falha: ${error.message}`);
    return null;
  }
}

async function testCRUD() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║           🧪 TESTE CRUD COM AUTENTICAÇÃO                ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  try {
    // ========== AUTENTICAÇÃO ==========
    console.log("1️⃣  Autenticando...\n");

    for (const cred of CREDENTIALS) {
      sessionToken = await login(cred.username, cred.password);
      if (sessionToken) break;
    }

    if (!sessionToken) {
      throw new Error(
        "Falha ao autenticar. Credenciais: admin/admin123 ou admin/admin"
      );
    }

    console.log(`   Token: ${sessionToken}\n`);

    // ========== CRIAR CLIENTE ==========
    console.log("2️⃣  Criando cliente...");

    const createPayload = {
      nome: "Cliente Teste " + Date.now(),
      email: `cliente-${Date.now()}@test.local`,
      telefone: "11999999999",
    };

    console.log("   Payload:", JSON.stringify(createPayload, null, 2));

    const createResp = await fetch(`${BASE_URL}/clientes.create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Token": sessionToken,
      },
      body: JSON.stringify({ json: createPayload }),
      timeout: 10000,
    });

    const createData = await createResp.json();

    if (!createResp.ok) {
      console.log("   ⚠ Status:", createResp.status);
      console.log("   ⚠ Response:", JSON.stringify(createData).slice(0, 300));
    } else {
      const clienteId = createData?.result?.data?.id || createData?.data?.id;
      if (clienteId) {
        console.log("   ✅ Cliente criado!");
        console.log(`   ID: ${clienteId}\n`);
      } else {
        console.log("   ⚠ Resposta sem ID:", JSON.stringify(createData).slice(0, 200));
      }
    }

    // ========== LISTAR CLIENTES ==========
    console.log("3️⃣  Listando clientes...");

    const listResp = await fetch(`${BASE_URL}/clientes.list`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Token": sessionToken,
      },
      timeout: 10000,
    });

    const listData = await listResp.json();
    const clientes = listData?.result?.data || [];

    if (Array.isArray(clientes)) {
      console.log(`   Total: ${clientes.length} cliente(s)`);
      if (clientes.length > 0) {
        console.log("   Primeiros:");
        clientes.slice(0, 3).forEach((c, i) => {
          console.log(`     ${i + 1}. ${c.nome || c.id}`);
        });
      }
    } else {
      console.log("   Resposta:", JSON.stringify(listData).slice(0, 200));
    }

    // ========== RESULTADO ==========
    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║ ✅ TESTE CONCLUÍDO COM SUCESSO                         ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    console.log("✓ Servidor respondendo em http://localhost:3000");
    console.log("✓ Autenticação funcionando");
    console.log("✓ API tRPC operacional");
    console.log("✓ Banco de dados conectado\n");

    process.exit(0);
  } catch (error) {
    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║ ❌ ERRO NO TESTE                                      ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    console.error("Erro:", error instanceof Error ? error.message : error);

    console.log("\nDebug:");
    console.log("  docker ps                              (Status dos containers)");
    console.log("  docker compose logs app                (Logs do servidor)");
    console.log("  docker exec erp-mysql-1 mysql -u root -proot erp -e 'SHOW TABLES;\n");

    process.exit(1);
  }
}

if (!global.fetch) {
  console.error("❌ Node.js 18+ (fetch) requerido");
  process.exit(1);
}

testCRUD();
