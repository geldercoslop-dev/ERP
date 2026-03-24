/**
 * Script para testar o desempenho do cache
 * 
 * Este script compara o desempenho de chamadas com e sem cache
 */

import * as inventoryService from "../server/services/inventory.service";
import * as cachedInventoryService from "../server/services/cached-inventory.service";
import * as clientesService from "../server/services/clientes.service";
import * as cachedClientesService from "../server/services/cached-clientes.service";
import { initCacheSystem } from "../server/_core/cache-manager";
import { memoryCache } from "../server/_core/memory-cache";

// Inicializar o cache
initCacheSystem();

// Função para medir o tempo de execução
async function measureTime<T>(fn: () => Promise<T>, label: string): Promise<T> {
  console.time(label);
  const result = await fn();
  console.timeEnd(label);
  return result;
}

// Função para comparar desempenho
async function comparePerformance() {
  const tenantId = Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);
  
  console.log("\n=== TESTE DE DESEMPENHO DO CACHE ===\n");
  
  // Limpar cache antes de iniciar
  memoryCache.clear();
  console.log("Cache limpo para iniciar testes\n");
  
  // Teste 1: Lista de produtos (sem cache)
  console.log("Teste 1: Lista de produtos (sem cache)");
  await measureTime(
    () => inventoryService.getAllProdutos(tenantId),
    "Tempo sem cache"
  );
  
  // Teste 2: Lista de produtos (primeira chamada com cache - miss)
  console.log("\nTeste 2: Lista de produtos (primeira chamada com cache - miss)");
  await measureTime(
    () => cachedInventoryService.getAllProdutos(tenantId),
    "Tempo com cache (miss)"
  );
  
  // Teste 3: Lista de produtos (segunda chamada com cache - hit)
  console.log("\nTeste 3: Lista de produtos (segunda chamada com cache - hit)");
  await measureTime(
    () => cachedInventoryService.getAllProdutos(tenantId),
    "Tempo com cache (hit)"
  );
  
  // Teste 4: Lista de clientes (sem cache)
  console.log("\nTeste 4: Lista de clientes (sem cache)");
  await measureTime(
    () => clientesService.listClientes(tenantId, { page: 1, pageSize: 50 }),
    "Tempo sem cache"
  );
  
  // Teste 5: Lista de clientes (primeira chamada com cache - miss)
  console.log("\nTeste 5: Lista de clientes (primeira chamada com cache - miss)");
  await measureTime(
    () => cachedClientesService.listClientes(tenantId, { page: 1, pageSize: 50 }),
    "Tempo com cache (miss)"
  );
  
  // Teste 6: Lista de clientes (segunda chamada com cache - hit)
  console.log("\nTeste 6: Lista de clientes (segunda chamada com cache - hit)");
  await measureTime(
    () => cachedClientesService.listClientes(tenantId, { page: 1, pageSize: 50 }),
    "Tempo com cache (hit)"
  );
  
  // Estatísticas do cache
  console.log("\n=== ESTATÍSTICAS DO CACHE ===");
  console.log(memoryCache.getStats());
}

// Executar os testes
comparePerformance()
  .then(() => {
    console.log("\nTestes concluídos com sucesso");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Erro ao executar testes:", error);
    process.exit(1);
  });