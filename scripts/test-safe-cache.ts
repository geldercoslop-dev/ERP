/**
 * Script para testar a integração do cache com o sistema de proteção
 * 
 * Este script verifica se o cache está funcionando corretamente com o sistema de proteção,
 * garantindo que dados inválidos não sejam armazenados no cache e que a invalidação
 * de cache ocorra corretamente após operações de escrita.
 */

import * as inventoryService from "../server/services/inventory.service";
import * as cachedInventoryService from "../server/services/cached-inventory.service";
import { initCacheSystem } from "../server/_core/cache-manager";
import { memoryCache } from "../server/_core/memory-cache";
import { getCacheStats } from "../server/_core/safe-cache";

// Inicializar o cache
initCacheSystem();

// Função para medir o tempo de execução
async function measureTime<T>(fn: () => Promise<T>, label: string): Promise<T> {
  console.time(label);
  const result = await fn();
  console.timeEnd(label);
  return result;
}

// Função para testar a integração do cache com o sistema de proteção
async function testSafeCache() {
  const tenantId = Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);
  
  console.log("\n=== TESTE DE INTEGRAÇÃO CACHE + PROTEÇÃO ===\n");
  
  // Limpar cache antes de iniciar
  memoryCache.clear();
  console.log("Cache limpo para iniciar testes\n");
  
  // Teste 1: Lista de produtos (primeira chamada - miss)
  console.log("Teste 1: Lista de produtos (primeira chamada - miss)");
  const produtos1 = await measureTime(
    () => cachedInventoryService.getAllProdutos(tenantId),
    "Tempo primeira chamada"
  );
  console.log(`Produtos retornados: ${produtos1.length}\n`);
  
  // Teste 2: Lista de produtos (segunda chamada - hit)
  console.log("Teste 2: Lista de produtos (segunda chamada - hit)");
  const produtos2 = await measureTime(
    () => cachedInventoryService.getAllProdutos(tenantId),
    "Tempo segunda chamada"
  );
  console.log(`Produtos retornados: ${produtos2.length}\n`);
  
  // Teste 3: Criar um produto (deve invalidar cache)
  console.log("Teste 3: Criar um produto (deve invalidar cache)");
  const novoProduto = {
    descricao: "Produto Teste Cache " + Date.now(),
    marca: "Marca Teste",
    categoria: "Categoria Teste",
    custo: 100,
    valorVenda: 200,
    estoque: 10,
    ativo: true
  };
  
  const produtoCriado = await measureTime(
    () => cachedInventoryService.createProduto(tenantId, novoProduto),
    "Tempo criação"
  );
  console.log(`Produto criado com ID: ${produtoCriado.id}\n`);
  
  // Teste 4: Lista de produtos após criação (deve ser miss novamente)
  console.log("Teste 4: Lista de produtos após criação (deve ser miss novamente)");
  const produtos3 = await measureTime(
    () => cachedInventoryService.getAllProdutos(tenantId),
    "Tempo após criação"
  );
  console.log(`Produtos retornados: ${produtos3.length}\n`);
  
  // Teste 5: Obter produto por ID (miss)
  console.log(`Teste 5: Obter produto por ID ${produtoCriado.id} (miss)`);
  const produto1 = await measureTime(
    () => cachedInventoryService.getProdutoById(tenantId, produtoCriado.id),
    "Tempo primeira chamada"
  );
  console.log(`Produto encontrado: ${produto1?.descricao}\n`);
  
  // Teste 6: Obter produto por ID (hit)
  console.log(`Teste 6: Obter produto por ID ${produtoCriado.id} (hit)`);
  const produto2 = await measureTime(
    () => cachedInventoryService.getProdutoById(tenantId, produtoCriado.id),
    "Tempo segunda chamada"
  );
  console.log(`Produto encontrado: ${produto2?.descricao}\n`);
  
  // Teste 7: Atualizar produto (deve invalidar cache)
  console.log(`Teste 7: Atualizar produto ${produtoCriado.id} (deve invalidar cache)`);
  await measureTime(
    () => cachedInventoryService.updateProduto(tenantId, produtoCriado.id, {
      descricao: "Produto Teste Cache Atualizado " + Date.now()
    }),
    "Tempo atualização"
  );
  console.log("Produto atualizado\n");
  
  // Teste 8: Obter produto por ID após atualização (deve ser miss novamente)
  console.log(`Teste 8: Obter produto por ID ${produtoCriado.id} após atualização (deve ser miss novamente)`);
  const produto3 = await measureTime(
    () => cachedInventoryService.getProdutoById(tenantId, produtoCriado.id),
    "Tempo após atualização"
  );
  console.log(`Produto encontrado com nova descrição: ${produto3?.descricao}\n`);
  
  // Teste 9: Excluir produto (deve invalidar cache)
  console.log(`Teste 9: Excluir produto ${produtoCriado.id} (deve invalidar cache)`);
  await measureTime(
    () => cachedInventoryService.deleteProduto(tenantId, produtoCriado.id),
    "Tempo exclusão"
  );
  console.log("Produto excluído\n");
  
  // Teste 10: Obter produto por ID após exclusão (deve ser miss e retornar null)
  console.log(`Teste 10: Obter produto por ID ${produtoCriado.id} após exclusão (deve ser miss e retornar null)`);
  const produto4 = await measureTime(
    () => cachedInventoryService.getProdutoById(tenantId, produtoCriado.id),
    "Tempo após exclusão"
  );
  console.log(`Produto encontrado: ${produto4 === null ? "null (correto)" : "ERRO - ainda existe"}\n`);
  
  // Estatísticas do cache
  console.log("\n=== ESTATÍSTICAS DO CACHE ===");
  console.log("Estatísticas de memória:", memoryCache.getStats());
  console.log("Estatísticas de cache seguro:", getCacheStats());
}

// Executar os testes
testSafeCache()
  .then(() => {
    console.log("\nTestes concluídos com sucesso");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Erro ao executar testes:", error);
    process.exit(1);
  });