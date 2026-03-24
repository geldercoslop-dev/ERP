/**
 * Testes de integração ERRO ZERO: pedido+itens+estoque, baixa estoque (impedir negativo), idempotência, rollback.
 * Requer MySQL rodando (npm run test:db deve passar) e migração 0005+0006 idempotency_keys.
 * Uso: npm run test:core
 */
import "../_core/loadEnv";
import * as db from "../db/index";
import { executeCommand } from "../_core/command";
import { isInProgress } from "@shared/idempotency";

async function main() {
  console.log("[test:core] Iniciando testes de integração...");
  const errors: string[] = [];

  // 1) Conexão
  const conn = await db.getDb();
  if (!conn) {
    console.error("[test:core] Falha: banco indisponível. Rode npm run test:db.");
    process.exit(1);
  }

  const tenantPick = await conn.select({ tenantId: db.produtos.tenantId }).from(db.produtos).limit(1);
  const testTenantId = Number(process.env.TEST_TENANT_ID) || Number(tenantPick[0]?.tenantId);
  if (!testTenantId) {
    console.error("[test:core] Defina TEST_TENANT_ID ou insira produtos com tenant_id.");
    process.exit(1);
  }

  // 2) Baixa estoque: impedir negativo
  try {
    const produtosList = await conn
      .select({ id: db.produtos.id, estoque: db.produtos.estoque, tenantId: db.produtos.tenantId })
      .from(db.produtos)
      .where(db.eq(db.produtos.tenantId, testTenantId))
      .limit(1);
    if (produtosList.length > 0) {
      const pid = produtosList[0].id;
      const saldo = Number(produtosList[0].estoque ?? 0);
      const tenantId = Number(produtosList[0].tenantId);
      try {
        await db.ajusteRapidoEstoque(tenantId, pid, saldo + 100, "saida");
        errors.push("Esperado erro ESTOQUE_NEGATIVO em ajusteRapidoEstoque ao tirar mais do que tem.");
      } catch (e: any) {
        if (e?.code !== "ESTOQUE_NEGATIVO" && !e?.message?.includes("Estoque insuficiente")) {
          errors.push(`ajusteRapidoEstoque: esperava ESTOQUE_NEGATIVO, obteve: ${e?.message}`);
        }
      }
    }
  } catch (e: any) {
    errors.push(`Teste baixa estoque: ${e?.message}`);
  }

  // 3) updateEstoqueProduto com quantidade negativa além do saldo
  try {
    const produtosList = await conn
      .select({ id: db.produtos.id, estoque: db.produtos.estoque, tenantId: db.produtos.tenantId })
      .from(db.produtos)
      .where(db.eq(db.produtos.tenantId, testTenantId))
      .limit(1);
    if (produtosList.length > 0) {
      const pid = produtosList[0].id;
      const saldo = Number(produtosList[0].estoque ?? 0);
      const tenantId = Number(produtosList[0].tenantId);
      try {
        await db.updateEstoqueProduto(tenantId, pid, -(saldo + 50));
        errors.push("Esperado erro ESTOQUE_NEGATIVO em updateEstoqueProduto ao reduzir além do saldo.");
      } catch (e: any) {
        if (e?.code !== "ESTOQUE_NEGATIVO" && !e?.message?.includes("Estoque insuficiente")) {
          errors.push(`updateEstoqueProduto: esperava ESTOQUE_NEGATIVO, obteve: ${e?.message}`);
        }
      }
    }
  } catch (e: any) {
    errors.push(`Teste updateEstoqueProduto negativo: ${e?.message}`);
  }

  // 4) Diagnóstico de consistência (formato ProblemaDiagnostico: tipo, idReferencia, descricao, nivel)
  try {
    const problemas = await db.runDiagnosticoConsistencia(testTenantId);
    if (!Array.isArray(problemas)) {
      errors.push("runDiagnosticoConsistencia deve retornar array.");
    } else {
      const valid = problemas.every(
        (p: unknown) =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as { tipo?: unknown }).tipo === "string" &&
          typeof (p as { descricao?: unknown }).descricao === "string" &&
          typeof (p as { nivel?: unknown }).nivel === "string"
      );
      if (!valid && problemas.length > 0) {
        errors.push("runDiagnosticoConsistencia: cada item deve ter tipo, descricao, nivel.");
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`runDiagnosticoConsistencia: ${msg}`);
  }

  // 5) Transação faz rollback: simular falha no meio e checar que nada foi gravado
  try {
    const produtosList = await conn
      .select({ id: db.produtos.id, estoque: db.produtos.estoque })
      .from(db.produtos)
      .where(db.eq(db.produtos.tenantId, testTenantId))
      .limit(1);
    if (produtosList.length > 0) {
      const pid = produtosList[0].id;
      const estoqueAntes = Number(produtosList[0].estoque ?? 0);
      try {
        await conn.transaction(async (tx: any) => {
          await tx.update(db.produtos).set({ estoque: 999999 }).where(db.eq(db.produtos.id, pid));
          throw new Error("rollback_test");
        });
      } catch (e: any) {
        if (!e?.message?.includes("rollback_test")) {
          errors.push(`Transação esperava rollback_test, obteve: ${e?.message}`);
        }
      }
      const [row] = await conn
        .select({ estoque: db.produtos.estoque })
        .from(db.produtos)
        .where(db.and(db.eq(db.produtos.id, pid), db.eq(db.produtos.tenantId, testTenantId)))
        .limit(1);
      const estoqueDepois = Number(row?.estoque ?? 0);
      if (estoqueDepois === 999999) {
        errors.push("Rollback falhou: estoque foi alterado mesmo com throw na transação.");
      }
      if (estoqueDepois !== estoqueAntes) {
        errors.push(`Rollback: estoque antes ${estoqueAntes}, depois ${estoqueDepois} (deveria ser igual).`);
      }
    }
  } catch (e: any) {
    errors.push(`Teste rollback transação: ${e?.message}`);
  }

  // 5) Idempotência: reserva + update na mesma tx, depois get por (commandName, key)
  try {
    const key = `test-idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const payload = JSON.stringify({ ok: true, traceId: "trace-1", changes: ["a"] });
    await conn.transaction(async (tx: any) => {
      const reserve = await db.reserveIdempotencyKey(tx, "testCommand", key);
      if (!reserve.reserved) throw new Error("Reserva de idempotência falhou (duplicata inesperada)");
      await db.updateIdempotencyResult(tx, "testCommand", key, payload, "trace-1");
    });
    const got = await db.getIdempotencyResult("testCommand", key);
    if (!got?.resultJson || got.resultJson !== payload) {
      errors.push("Idempotência: resultado recuperado não bate com o gravado.");
    }
  } catch (e: any) {
    errors.push(`Teste idempotência: ${e?.message}`);
  }

  // 6) Idempotência segunda chamada: mesmo key retorna resultado em cache (handler não reexecuta)
  try {
    const key = `test-idem2-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const res1 = await executeCommand(
      { commandName: "testIdemTwice", idempotencyKey: key },
      async (tx) => ({ ok: true, traceId: "t1", value: 42 })
    );
    const res2 = await executeCommand(
      { commandName: "testIdemTwice", idempotencyKey: key },
      async (tx) => ({ ok: true, traceId: "t2", value: 999 }) // não deve rodar
    );
    if (isInProgress(res1) || isInProgress(res2)) {
      errors.push("Idempotência 2ª chamada: não esperado IN_PROGRESS em teste.");
    } else if (res1.value !== 42 || res2.value !== 42) {
      errors.push("Idempotência 2ª chamada: esperado value=42 em ambos (segunda deve vir do cache).");
    }
  } catch (e: any) {
    errors.push(`Teste idempotência 2ª chamada: ${e?.message}`);
  }

  // 7) Concorrência: dois executeCommand em paralelo com mesma key → mesmo resultado, uma execução
  try {
    const key = `test-concurrent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const [r1, r2] = await Promise.all([
      executeCommand({ commandName: "testConcurrent", idempotencyKey: key }, async (tx) => ({ ok: true, traceId: "c1", n: 1 })),
      executeCommand({ commandName: "testConcurrent", idempotencyKey: key }, async (tx) => ({ ok: true, traceId: "c2", n: 2 })),
    ]);
    if (isInProgress(r1) || isInProgress(r2)) {
      errors.push("Concorrência: não esperado IN_PROGRESS em teste.");
    } else if (r1.n !== r2.n) {
      errors.push("Concorrência: ambos devem retornar o mesmo n (uma execução só).");
    }
  } catch (e: any) {
    errors.push(`Teste concorrência idempotência: ${e?.message}`);
  }

  // 8) Cliente único por (telefoneNorm, nomeNorm, sobrenomeNorm): não duplicar
  try {
    const nome = `Cliente Teste ${Date.now()}`;
    const telefone = `11999${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
    const r1 = await db.createCliente(testTenantId, { nome, telefone });
    const r2 = await db.createCliente(testTenantId, {
      nome: nome.toLowerCase(),
      telefone: `(${telefone.slice(0, 2)}) ${telefone.slice(2)}`,
    });
    if (r1.id !== r2.id) {
      errors.push(`Cliente único: esperado mesmo id para mesmo (telefoneNorm, nomeNorm, sobrenomeNorm), obteve ${r1.id} e ${r2.id}.`);
    }
  } catch (e: any) {
    errors.push(`Teste cliente único: ${e?.message}`);
  }

  if (errors.length > 0) {
    console.error("[test:core] Falhas:");
    errors.forEach((e) => console.error("  -", e));
    process.exit(1);
  }
  console.log("[test:core] Todos os testes passaram.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[test:core] Erro fatal:", e);
  process.exit(1);
});
