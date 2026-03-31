/**
 * Módulo de serviço de inventário com cache seguro
 * 
 * Este módulo envolve as funções do inventory.service.ts com cache seguro
 * para reduzir a latência e evitar sobrecarga no banco de dados.
 */

import { withSafeCacheList } from "../_core/safe-cache.js";
import { invalidateInventoryCachesForTenant } from "../_core/cache-invalidation.js";
import * as inventoryService from "./inventory.service.js";
import type { CreateProdutoInput, UpdateProdutoInput } from "./inventory.service.js";
import type { GetProdutosComPrecoVigentePagedOpts } from "./inventory.service.js";
import { logInfo } from "../_core/service-logger.js";

// Nome do serviço para logs e invalidação
const SERVICE_NAME = 'inventory';

// TTL para cada tipo de operação (em segundos)
const CACHE_TTL = {
  LIST: 20, // listas com possível estoque: TTL curto
};

/**
 * Lista todas as cores com cache
 */
export const listCores = withSafeCacheList(
  inventoryService.listCores,
  "inventory:cores",
  (tenantId: number) => ({ tenantId }),
  { 
    ttl: CACHE_TTL.LIST,
    serviceName: SERVICE_NAME,
    methodName: 'listCores'
  }
);

/**
 * Produto por ID: sem cache (estoque/preço críticos; evita dado desatualizado).
 */
export const getProdutoById = inventoryService.getProdutoById;

/**
 * Lista todos os produtos com cache
 */
export const getAllProdutos = withSafeCacheList(
  inventoryService.getAllProdutos,
  "inventory:produtos:all",
  (tenantId: number) => ({ tenantId }),
  { 
    ttl: CACHE_TTL.LIST,
    serviceName: SERVICE_NAME,
    methodName: 'getAllProdutos'
  }
);

/**
 * Lista todos os produtos com preço vigente com cache
 */
export const getAllProdutosComPrecoVigente = withSafeCacheList(
  inventoryService.getAllProdutosComPrecoVigente,
  "inventory:produtos:preco-vigente",
  (tenantId: number, refDate: Date = new Date()) => ({ 
    tenantId, 
    refDate: refDate.toISOString().split('T')[0] // Usar apenas a data para o cache
  }),
  { 
    ttl: CACHE_TTL.LIST,
    serviceName: SERVICE_NAME,
    methodName: 'getAllProdutosComPrecoVigente'
  }
);

/** Paginação: sempre DB (total correto + sem lista obsoleta). */
export async function getProdutosComPrecoVigentePaged(
  tenantId: number,
  opts: GetProdutosComPrecoVigentePagedOpts
): Promise<{ items: Awaited<ReturnType<typeof inventoryService.getAllProdutosComPrecoVigente>>; total: number }> {
  return inventoryService.getProdutosComPrecoVigentePaged(tenantId, opts);
}

/** Estoque baixo: sem cache (dado operacional crítico). */
export async function getProdutosEstoqueBaixo(
  tenantId: number,
  limiteOrOpts: number | { limite: number }
): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
  const limite =
    typeof limiteOrOpts === "number" ? limiteOrOpts : limiteOrOpts.limite;
  return inventoryService.getProdutosEstoqueBaixo(tenantId, limite);
}

/**
 * Cria um novo produto e invalida caches relacionados
 */
export async function createProduto(tenantId: number, data: CreateProdutoInput): Promise<{ id: number }> {
  const result = await inventoryService.createProduto(tenantId, data);
  
  // Invalidar todos os caches relacionados a produtos deste tenant
  invalidateInventoryCachesForTenant(tenantId);
  logInfo("Cache de produtos invalidado após criação", {
    payload: { tenantId, produtoId: result.id },
  });
  
  return result;
}

/**
 * Atualiza um produto e invalida caches relacionados
 */
export async function updateProduto(
  tenantId: number,
  id: number,
  data: UpdateProdutoInput
): Promise<{ success: boolean }> {
  const result = await inventoryService.updateProduto(tenantId, id, data);
  
  // Invalidar todos os caches relacionados a produtos deste tenant
  invalidateInventoryCachesForTenant(tenantId);
  logInfo("Cache de produtos invalidado após atualização", {
    payload: { tenantId, produtoId: id },
  });
  
  return result;
}

/**
 * Exclui um produto e invalida caches relacionados
 */
export async function deleteProduto(tenantId: number, id: number): Promise<{ success: boolean }> {
  const result = await inventoryService.deleteProduto(tenantId, id);
  
  // Invalidar todos os caches relacionados a produtos deste tenant
  invalidateInventoryCachesForTenant(tenantId);
  logInfo("Cache de produtos invalidado após exclusão", {
    payload: { tenantId, produtoId: id },
  });
  
  return result;
}

/**
 * Atualiza o estoque de um produto e invalida caches relacionados
 */
export async function updateEstoqueProduto(
  tenantId: number,
  data: Parameters<typeof inventoryService.updateEstoqueProduto>[1]
): Promise<Record<string, unknown>> {
  const result = await inventoryService.updateEstoqueProduto(tenantId, data);
  
  // Invalidar todos os caches relacionados a produtos deste tenant
  invalidateInventoryCachesForTenant(tenantId);
  logInfo("Cache de produtos invalidado após atualização de estoque", {
    payload: { tenantId, produtoId: data.id },
  });
  
  return result;
}

export async function createCor(...args: Parameters<typeof inventoryService.createCor>) {
  const r = await inventoryService.createCor(...args);
  const tenantId = args[0] as number;
  if (tenantId) invalidateInventoryCachesForTenant(tenantId);
  return r;
}
export async function updateCor(...args: Parameters<typeof inventoryService.updateCor>) {
  const r = await inventoryService.updateCor(...args);
  const tenantId = args[0] as number;
  if (tenantId) invalidateInventoryCachesForTenant(tenantId);
  return r;
}
export async function deleteCor(...args: Parameters<typeof inventoryService.deleteCor>) {
  const r = await inventoryService.deleteCor(...args);
  const tenantId = args[0] as number;
  if (tenantId) invalidateInventoryCachesForTenant(tenantId);
  return r;
}