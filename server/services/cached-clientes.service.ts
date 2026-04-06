/**
 * Módulo de serviço de clientes com cache seguro
 * 
 * Este módulo envolve as funções do clientes.service.ts com cache seguro
 * para reduzir a latência e evitar sobrecarga no banco de dados.
 */

import { withSafeCacheList, withSafeCacheObject } from "../_core/safe-cache.js";
import { invalidateClientesCachesForTenant } from "../_core/cache-invalidation.js";
import * as clientesService from "./clientes.service.js";
import type { CreateClienteWithVendedorInput } from "./clientes.service.js";
import type { CreateClienteInput } from "./clientes.service.js";
import type { Cliente } from "../db/core.js";
import { logInfo } from "../_core/service-logger.js";
import type { ServiceActor } from "../_core/service-actor.js";

// Nome do serviço para logs e invalidação
const SERVICE_NAME = 'clientes';

// TTL para cada tipo de operação (em segundos)
const CACHE_TTL = {
  LIST: 30, // 30 segundos para listas
  DETAIL: 60, // 1 minuto para detalhes
  HISTORICO: 20, // 20 segundos para histórico
};

/**
 * Lista clientes (sem cache de lista — chave composta ator+paginação; total preciso vem do service).
 */
export async function listClientes(
  tenantId: number,
  actor: ServiceActor,
  params: { page?: number; pageSize?: number; busca?: string; vendedorId?: number }
): Promise<{ success: boolean; data?: { items: Cliente[]; total: number; page: number; pageSize: number }; error?: string }> {
  return clientesService.listClientes(tenantId, actor, params);
}

/**
 * Obtém um cliente por ID com cache seguro
 */
export const getClienteById = withSafeCacheObject(
  clientesService.getClienteById,
  "clientes:detail",
  (tenantId: number, actor: ServiceActor, id: number) => ({
    tenantId,
    id,
    role: actor.role,
    vendedorId: actor.vendedorId ?? 0,
  }),
  {
    ttl: CACHE_TTL.DETAIL,
    serviceName: SERVICE_NAME,
    methodName: "getClienteById",
  }
);

/**
 * Obtém histórico de um cliente com cache seguro
 */
export const getHistoricoCliente = withSafeCacheList(
  async (tenantId: number, actor: ServiceActor, clienteId: number, limit = 20) => {
    const result = await clientesService.getHistoricoCliente(tenantId, actor, clienteId, limit);
    return result.success && result.data ? result.data : [];
  },
  "clientes:historico",
  (tenantId: number, actor: ServiceActor, clienteId: number, limit = 20) => ({
    tenantId,
    clienteId,
    limit,
    role: actor.role,
    vendedorId: actor.vendedorId ?? 0,
  }),
  {
    ttl: CACHE_TTL.HISTORICO,
    serviceName: SERVICE_NAME,
    methodName: "getHistoricoCliente",
  }
);

/**
 * Obtém vendedores associados a um cliente com cache seguro
 */
export const getVendedoresByCliente = withSafeCacheList(
  async (tenantId: number, clienteId: number) => {
    const result = await clientesService.getVendedoresByCliente(tenantId, clienteId);
    return result.success && result.data ? result.data : [];
  },
  "clientes:vendedores",
  (tenantId: number, clienteId: number) => ({ tenantId, clienteId }),
  { 
    ttl: CACHE_TTL.DETAIL,
    serviceName: SERVICE_NAME,
    methodName: 'getVendedoresByCliente'
  }
);

/**
 * Obtém relatório de clientes ativos com cache seguro
 */
export const getReportClientesAtivos = withSafeCacheList(
  async (tenantId: number, params: { dataInicio: Date; dataFim: Date; limit: number }) => {
    const result = await clientesService.getReportClientesAtivos(tenantId, params);
    return result.success && result.data ? result.data : [];
  },
  "clientes:report:ativos",
  (tenantId: number, params: { dataInicio: Date; dataFim: Date; limit: number }) => ({ tenantId, ...params }),
  { 
    ttl: CACHE_TTL.LIST,
    serviceName: SERVICE_NAME,
    methodName: 'getReportClientesAtivos'
  }
);

/**
 * Cria um novo cliente e invalida caches relacionados
 */
export async function createCliente(tenantId: number, data: CreateClienteWithVendedorInput): Promise<{ id: number }> {
  const result = await clientesService.createCliente(tenantId, data);
  
  // Invalidar todos os caches relacionados a clientes deste tenant
  invalidateClientesCachesForTenant(tenantId);
  logInfo("Cache de clientes invalidado após criação", {
    payload: { tenantId, clienteId: result.data?.id ?? 0 },
  });

  if (!result.success || !result.data) {
    throw new Error(result.error ?? "Falha ao criar cliente");
  }

  return result.data;
}

/**
 * Atualiza um cliente e invalida caches relacionados
 */
export async function updateCliente(
  tenantId: number,
  actor: ServiceActor,
  id: number,
  data: Partial<CreateClienteInput>
): Promise<{ success: boolean }> {
  const result = await clientesService.updateCliente(tenantId, actor, id, data);
  
  // Invalidar todos os caches relacionados a este cliente
  invalidateClientesCachesForTenant(tenantId, id);
  logInfo("Cache de clientes invalidado após atualização", {
    payload: { tenantId, clienteId: id },
  });
  
  return result;
}

/**
 * Exclui um cliente e invalida caches relacionados
 */
export async function deleteCliente(tenantId: number, actor: ServiceActor, id: number): Promise<{ success: boolean }> {
  const result = await clientesService.deleteCliente(tenantId, actor, id);
  
  // Invalidar todos os caches relacionados a este cliente
  invalidateClientesCachesForTenant(tenantId, id);
  logInfo("Cache de clientes invalidado após exclusão", {
    payload: { tenantId, clienteId: id },
  });
  
  return result;
}

/**
 * Associa um cliente a um vendedor e invalida caches relacionados
 */
export async function associarClienteVendedor(
  tenantId: number,
  clienteId: number,
  vendedorId: number,
  tipo?: boolean
): Promise<{ success: boolean; error?: string }> {
  const result = await clientesService.associarClienteVendedor(tenantId, clienteId, vendedorId, tipo);
  
  // Invalidar todos os caches relacionados a este cliente
  invalidateClientesCachesForTenant(tenantId, clienteId);
  logInfo("Cache de clientes invalidado após associação com vendedor", {
    payload: { tenantId, clienteId, vendedorId },
  });
  
  return result;
}

/**
 * Remove a associação de um cliente com um vendedor e invalida caches relacionados
 */
export async function removerAssociacaoClienteVendedor(
  tenantId: number,
  clienteId: number,
  vendedorId: number
): Promise<{ success: boolean; error?: string }> {
  const result = await clientesService.removerAssociacaoClienteVendedor(tenantId, clienteId, vendedorId);
  
  // Invalidar todos os caches relacionados a este cliente
  invalidateClientesCachesForTenant(tenantId, clienteId);
  logInfo("Cache de clientes invalidado após remoção de associação com vendedor", {
    payload: { tenantId, clienteId, vendedorId },
  });
  
  return result;
}

export const searchClientesByTelefone = clientesService.getClienteByTelefone;
export const searchClientesByNome = clientesService.searchClientesByNome;