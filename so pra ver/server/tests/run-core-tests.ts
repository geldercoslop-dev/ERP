/**
 * Testes de integração ERRO ZERO: pedido+itens+estoque, baixa estoque (impedir negativo), idempotência, rollback.
 * Requer MySQL rodando (npm run test:db deve passar) e migração 0005+0006 idempotency_keys.
 * Uso: npm run test:core
 */
import "../_core/loadEnv";
import * as db from "../db";
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

  // 2) Baixa estoque: impedir negativo
  try {
    const produtosList = await conn.select({ id: db.produtos.id, estoque: db.produtos.estoque }).from(db.produtos).limit(1);
    if (produtosList.length > 0) {
      const pid = produtosList[0].id;
      const saldo = Number(produtosList[0].estoque ?? 0);
      try {
        await db.ajusteRapidoEstoque(pid, saldo + 100, "saida");
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
    const produtosList = await conn.select({ id: db.produtos.id, estoque: db.produtos.estoque }).from(db.produtos).limit(1);
    if (produtosList.length > 0) {
      const pid = produtosList[0].id;
      const saldo = Number(produtosList[0].estoque ?? 0);
      try {
        await db.updateEstoqueProduto(pid, -(saldo + 50));
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

  // 4) Diagnóstico de consistência (não deve lançar; retorna formato tipoProblema, entidade, detalhe, sugestao)
  try {
    const problemas = await db.runDiagnosticoConsistencia();
    if (!Array.isArray(problemas)) {
      errors.push("runDiagnosticoConsistencia deve retornar array.");
    } else {
      const valid = problemas.every(
        (p: any) =>
          typeof p.tipoProblema === "string" &&
          typeof p.entidade === "string" &&
          typeof p.detalhe === "string" &&
          typeof p.sugestao === "string"
      );
      if (!valid && problemas.length > 0) {
        errors.push("runDiagnosticoConsistencia: cada item deve ter tipoProblema, entidade, detalhe, sugestao.");
      }
    }
  } catch (e: any) {
    errors.push(`runDiagnosticoConsistencia: ${e?.message}`);
  }

  // 5) Transação faz rollback: simular falha no meio e checar que nada foi gravado
  try {
    const produtosList = await conn.select({ id: db.produtos.id, estoque: db.produtos.estoque }).from(db.produtos).limit(1);
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
      const [row] = await conn.select({ estoque: db.produtos.estoque }).from(db.produtos).where(db.eq(db.produtos.id, pid)).limit(1);
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
