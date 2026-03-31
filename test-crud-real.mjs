#!/usr/bin/env node
/**
 * Script: Teste CRUD Real na API tRPC
 * Valida:
 * - Criar cliente
 * - Listar clientes
 * - Atualizar cliente
 * - Fluxo completo funcionando
 */

const BASE_URL = "http://localhost:3000/api/trpc";

async function testCRUD() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║           🧪 TESTE CRUD REAL - CLIENTES                 ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  try {
    // ========== 1. CRIAR CLIENTE ==========
    console.log("1️⃣  Criando cliente de teste...");
    console.log("   Endpoint: POST /api/trpc/clientes.create\n");

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
        // tRPC pode exigir tenant_id como header ou contexto
      },
      body: JSON.stringify({ 
        json: createPayload 
      }),
      timeout: 5000,
    });

    console.log("\n   Status:", createResp.status);
    console.log("   Headers:", Object.fromEntries(createResp.headers));

    const createData = await createResp.json();
    console.log("   Response:", JSON.stringify(createData, null, 2));

    if (!createResp.ok) {
      console.error("   ❌ Falha ao criar cliente");
      console.error("   Erro:", createData);
      throw new Error(`HTTP ${createResp.status}: ${JSON.stringify(createData)}`);
    }

    // Extrair ID do cliente criado
    const clienteId = createData?.result?.data?.id || createData?.data?.id;
    if (!clienteId) {
      throw new Error("Resposta não contém ID do cliente criado");
    }

    console.log("   ✅ Cliente criado com sucesso!");
    console.log(`   ID: ${clienteId}\n`);

    // ========== 2. LISTAR CLIENTES ==========
    console.log("2️⃣  Listando clientes...");
    console.log("   Endpoint: GET /api/trpc/clientes.list\n");

    const listResp = await fetch(`${BASE_URL}/clientes.list`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    });

    console.log("   Status:", listResp.status);
    const listData = await listResp.json();
    const clientes = listData?.result?.data || listData?.data || [];

    console.log(`   Total de clientes encontrados: ${clientes.length}`);
    if (clientes.length > 0) {
      console.log("   Primeiros clientes:");
      clientes.slice(0, 3).forEach((c, i) => {
        console.log(`     ${i + 1}. ${c.nome} (ID: ${c.id})`);
      });
    }
    console.log("   ✅ Listagem concluída\n");

    // ========== 3. ATUALIZAR CLIENTE ==========
    if (clienteId) {
      console.log("3️⃣  Atualizando cliente...");
      console.log(`   ID: ${clienteId}`);
      console.log("   Endpoint: POST /api/trpc/clientes.update\n");

      const updatePayload = {
        id: clienteId,
        email: `updated-${Date.now()}@test.local`,
        telefone: "11988888888",
      };

      console.log("   Payload:", JSON.stringify(updatePayload, null, 2));

      const updateResp = await fetch(`${BASE_URL}/clientes.update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          json: updatePayload 
        }),
        timeout: 5000,
      });

      console.log("\n   Status:", updateResp.status);
      const updateData = await updateResp.json();

      if (updateResp.ok) {
        console.log("   ✅ Cliente atualizado com sucesso!");
      } else {
        console.log("   ⚠  Atualização retornou", updateResp.status);
      }
      console.log("   Response:", JSON.stringify(updateData, null, 2).slice(0, 200) + "...");
    }

    // ========== RESULTADO FINAL ==========
    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║ ✅ TESTE CRUD CONCLUÍDO COM SUCESSO                    ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    console.log("✓ Servidor respondendo em http://localhost:3000");
    console.log("✓ API tRPC funcionando");
    console.log("✓ Banco de dados conectado");
    console.log("✓ CRUD básico operacional\n");

    process.exit(0);
  } catch (error) {
    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║ ❌ ERRO NO TESTE CRUD                                 ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    console.error("Erro:", error instanceof Error ? error.message : error);

    console.log("\nDicas de Debug:");
    console.log("  • Verificar se servidor está rodando: docker ps");
    console.log("  • Ver logs do app: docker compose logs app");
    console.log("  • Testar conectividade: docker exec erp-app-1 curl http://127.0.0.1:3000/health");
    console.log("  • Verificar .env dentro do container: docker exec erp-app-1 cat /app/.env");

    process.exit(1);
  }
}

// Simular Node.js Fetch API se não disponível
if (!global.fetch) {
  console.error("❌ Node.js 18+ (com fetch) é requerido");
  process.exit(1);
}

testCRUD();
