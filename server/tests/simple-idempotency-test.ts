/**
 * TESTE SIMPLES DE IDEMPOTÊNCIA - VALIDAÇÃO LÓGICA
 */
import { createHash } from "crypto";
import { pathToFileURL } from "node:url";

console.log("🚀 INICIANDO TESTE DE IDEMPOTÊNCIA...");
const TEST_TENANT_ID = Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);

function generatePedidoIdempotencyKey(
  tenantId: number,
  vendedorId: number,
  clienteId: number,
  itens: Array<{ produtoId?: number; quantidade: number; valorUnitario: number }>
): string {
  const keyData = {
    tenantId,
    vendedorId,
    clienteId,
    itens: itens
      .map((i) => ({
        produtoId: i.produtoId || 0,
        quantidade: i.quantidade,
        valorUnitario: Number(i.valorUnitario || 0),
      }))
      .sort((a, b) => a.produtoId - b.produtoId),
  };

  const keyString = JSON.stringify(keyData);
  return createHash("sha256").update(keyString).digest("hex").substring(0, 32);
}

function testIdempotencyKeyGeneration(): boolean {
  console.log("🧪 TESTE DE GERAÇÃO DE CHAVE IDEMPOTÊNCIA\n");

  const pedidoData = {
    tenantId: TEST_TENANT_ID,
    vendedorId: 1,
    clienteId: 1,
    itens: [
      { produtoId: 1, quantidade: 2, valorUnitario: 50.0 },
      { produtoId: 2, quantidade: 1, valorUnitario: 100.0 },
    ],
  };

  const key1 = generatePedidoIdempotencyKey(
    pedidoData.tenantId,
    pedidoData.vendedorId,
    pedidoData.clienteId,
    pedidoData.itens
  );

  const key2 = generatePedidoIdempotencyKey(
    pedidoData.tenantId,
    pedidoData.vendedorId,
    pedidoData.clienteId,
    pedidoData.itens
  );

  const key3 = generatePedidoIdempotencyKey(
    pedidoData.tenantId,
    pedidoData.vendedorId,
    pedidoData.clienteId,
    [
      { produtoId: 2, quantidade: 1, valorUnitario: 100.0 },
      { produtoId: 1, quantidade: 2, valorUnitario: 50.0 },
    ]
  );

  const key4 = generatePedidoIdempotencyKey(
    pedidoData.tenantId,
    pedidoData.vendedorId,
    pedidoData.clienteId + 1,
    pedidoData.itens
  );

  console.log("📊 RESULTADOS:");
  console.log(`Key 1 (mesmo dados): ${key1}`);
  console.log(`Key 2 (mesmo dados): ${key2}`);
  console.log(`Key 3 (ordem inversa): ${key3}`);
  console.log(`Key 4 (cliente diferente): ${key4}`);

  console.log("\n🔍 ANÁLISE:");
  console.log(`✅ Keys 1 e 2 iguais: ${key1 === key2 ? "SIM" : "NÃO"}`);
  console.log(`✅ Keys 1 e 3 iguais (ordem inversa): ${key1 === key3 ? "SIM" : "NÃO"}`);
  console.log(`✅ Keys 1 e 4 diferentes: ${key1 !== key4 ? "SIM" : "NÃO"}`);

  const testPass = key1 === key2 && key1 === key3 && key1 !== key4;
  console.log(`\n🎯 TESTE ${testPass ? "PASSOU" : "FALHOU"}!`);

  return testPass;
}

function testConcurrencySimulation(): boolean {
  console.log("\n🔄 TESTE DE SIMULAÇÃO DE CONCORRÊNCIA\n");

  const idempotencyTable = new Set<string>();

  const pedidoData = {
    tenantId: TEST_TENANT_ID,
    vendedorId: 1,
    clienteId: 1,
    itens: [{ produtoId: 1, quantidade: 2, valorUnitario: 50.0 }],
  };

  const idempotencyKey = generatePedidoIdempotencyKey(
    pedidoData.tenantId,
    pedidoData.vendedorId,
    pedidoData.clienteId,
    pedidoData.itens
  );

  function simulateRequest(requestNumber: number): boolean {
    console.log(`🚀 Request ${requestNumber}: Tentando criar pedido...`);

    if (idempotencyTable.has(idempotencyKey)) {
      console.log(`❌ Request ${requestNumber}: Chave já existe! Abortando.`);
      return false;
    }

    idempotencyTable.add(idempotencyKey);
    console.log(`✅ Request ${requestNumber}: Pedido criado com sucesso!`);
    return true;
  }

  const result1 = simulateRequest(1);
  const result2 = simulateRequest(2);

  console.log("\n📊 RESULTADOS DA SIMULAÇÃO:");
  console.log(`Request 1: ${result1 ? "SUCESSO" : "FALHA"}`);
  console.log(`Request 2: ${result2 ? "SUCESSO" : "FALHA"}`);

  const successCount = [result1, result2].filter((r) => r).length;
  const testPass = successCount === 1;

  console.log(`\n🎯 Pedidos criados: ${successCount}`);
  console.log(`🎯 TESTE ${testPass ? "PASSOU" : "FALHOU"}! ${testPass ? "Apenas 1 pedido criado" : "Múltiplos pedidos criados"}`);

  return testPass;
}

export function runSimpleIdempotencyTests(): { keyGeneration: boolean; concurrency: boolean } {
  console.log("🚀 TESTES SIMPLES DE IDEMPOTÊNCIA E CONCORRÊNCIA\n");

  const results = {
    keyGeneration: testIdempotencyKeyGeneration(),
    concurrency: testConcurrencySimulation(),
  };

  console.log("\n📋 RELATÓRIO FINAL:");
  console.log(`✅ Geração de Chave: ${results.keyGeneration ? "FUNCIONANDO" : "FALHOU"}`);
  console.log(`✅ Simulação Concorrência: ${results.concurrency ? "FUNCIONANDO" : "FALHOU"}`);

  if (results.keyGeneration && results.concurrency) {
    console.log("\n🎉 TODOS OS TESTES PASSARAM! Lógica de idempotência está correta.");
  } else {
    console.log("\n⚠️ ALGUNS TESTES FALHARAM! Revisar implementação.");
  }

  return results;
}

const isMainModule = typeof process !== "undefined" && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const r = runSimpleIdempotencyTests();
  process.exit(r.keyGeneration && r.concurrency ? 0 : 1);
}
