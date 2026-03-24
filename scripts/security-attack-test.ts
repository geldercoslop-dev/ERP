/**
 * AUDITOR EXTERNO - TESTE DE BYPASS REAL LEO
 * NÃO CONFIA EM NADA INTERNO
 *
 * Esperado: todas as execuções maliciosas lançam erro (bloqueadas).
 */

process.env.SERVICE_ENTRY_GUARD ??= "0";

/** Carrega .env da raiz antes de qualquer módulo que use DATABASE_URL. */
import "../server/_core/loadEnv";

import { toolExecutor } from "../server/leo/agent/tool-executor";

console.log("🔍 AUDITOR EXTERNO - TESTE DE BYPASS LEO");
console.log("==========================================\n");

type AttackResult = { name: string; blocked: boolean; detail: string };

async function testAttack(name: string, fn: () => Promise<unknown>): Promise<AttackResult> {
  console.log(`\n🚨 ATAQUE: ${name}`);
  console.log("-------------------");
  try {
    const result = await fn();
    console.log("❌ FALHA DE SEGURANÇA - ATAQUE BEM SUCEDIDO:");
    console.log(JSON.stringify(result, null, 2));
    return { name, blocked: false, detail: "ataque retornou sem throw" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("✅ BLOQUEADO - ATAQUE FRACASSADO:");
    console.log(message);
    return { name, blocked: true, detail: message };
  }
}

async function main(): Promise<void> {
  const results: AttackResult[] = [];

  results.push(
    await testAttack("A) Tool SEM tenantId", async () => {
      return await toolExecutor.executeTool(
        "buscar_cliente",
        {},
        {
          tenantId: 0,
          userId: 123,
          userRole: "vendedor",
          role: "vendedor",
        } as never
      );
    })
  );

  results.push(
    await testAttack("B) Tool com tenantId fake", async () => {
      return await toolExecutor.executeTool(
        "buscar_cliente",
        {},
        {
          tenantId: 99999,
          userId: 123,
          userRole: "vendedor",
          role: "vendedor",
        } as never
      );
    })
  );

  results.push(
    await testAttack("C) Tool NÃO registrada", async () => {
      return await toolExecutor.executeTool(
        "tool_nao_existe",
        {},
        {
          tenantId: 1,
          userId: 123,
          userRole: "admin",
          role: "admin",
        } as never
      );
    })
  );

  results.push(
    await testAttack("D) Vendedor chamando tool admin", async () => {
      return await toolExecutor.executeTool(
        "system_status",
        {},
        {
          tenantId: 1,
          userId: 123,
          userRole: "vendedor",
          role: "vendedor",
        } as never
      );
    })
  );

  results.push(
    await testAttack("E) Acesso direto ao DB", async () => {
      return await toolExecutor.executeTool(
        "db_direct_access",
        { query: "SELECT * FROM usuarios" },
        {
          tenantId: 1,
          userId: 123,
          userRole: "admin",
          role: "admin",
        } as never
      );
    })
  );

  results.push(
    await testAttack("F) Bypass manual - injection", async () => {
      return await toolExecutor.executeTool(
        "criar_pedido",
        {
          clienteId: 1,
          itens: [{ produtoId: 1, quantidade: 2, valorUnitario: 100 }],
          vendedorId: 999,
          tenantId: 2,
          bypassSecurity: true,
          adminOverride: "admin",
        },
        {
          tenantId: 1,
          userId: 123,
          userRole: "vendedor",
          role: "vendedor",
          vendedorId: 456,
        } as never
      );
    })
  );

  results.push(
    await testAttack("G) Tool perigosa como admin", async () => {
      return await toolExecutor.executeTool(
        "read_file",
        { filePath: "C:\\Windows\\System32\\config\\SAM" },
        {
          tenantId: 1,
          userId: 123,
          userRole: "admin",
          role: "admin",
        } as never
      );
    })
  );

  results.push(
    await testAttack("H) Contexto vazio", async () => {
      return await toolExecutor.executeTool("buscar_cliente", {}, {} as never);
    })
  );

  results.push(
    await testAttack("I) Role injection", async () => {
      return await toolExecutor.executeTool(
        "system_status",
        {},
        {
          tenantId: 1,
          userId: 123,
          userRole: "admin\nvendedor\nroot",
          role: "admin",
        } as never
      );
    })
  );

  results.push(
    await testAttack("J) userId inválido (zero)", async () => {
      return await toolExecutor.executeTool(
        "buscar_cliente",
        {},
        {
          tenantId: 1,
          userId: 0,
          userRole: "admin",
          role: "admin",
        } as never
      );
    })
  );

  const passed = results.filter((r) => r.blocked).length;
  const total = results.length;
  console.log("\n==========================================");
  console.log(`📊 RESULTADO: ${passed}/${total} ataques bloqueados`);
  results.forEach((r) => {
    console.log(`  ${r.blocked ? "✅" : "❌"} ${r.name}`);
  });

  if (passed !== total) {
    console.error("\n❌ AUDITORIA FALHOU: existe bypass ou comportamento inesperado.");
    process.exit(1);
  } else {
    console.log("\n✅ AUDITORIA OK: 10/10 bloqueados.");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
