/**
 * Módulo de serviço de clientes com cache seguro
 * 
 * Este módulo envolve as funções do clientes.service.ts com cache seguro
 * para reduzir a latência e evitar sobrecarga no banco de dados.
 */

import { withSafeCacheList, withSafeCacheObject } from "../_core/safe-cache";
import { invalidateClientesCachesForTenant } from "../_core/cache-invalidation";
import * as clientesService from "./clientes.service";
import type { CreateClienteWithVendedorInput } from "./clientes.service";
import type { CreateClienteInput } from "./clientes.service";
import type { Cliente } from "../db/core";
import { logInfo } from "../_core/service-logger";
import type { ServiceActor } from "../_core/service-actor";

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
): Promise<{ items: Cliente[]; total: number; page: number; pageSize: number }> {
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
  clientesService.getHistoricoCliente,
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
  clientesService.getVendedoresByCliente,
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
  clientesService.getReportClientesAtivos,
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
    payload: { tenantId, clienteId: result.id },
  });
  
  return result;
}

/**
 * Atualiza um cliente e invalida caches relacionados
 */
export async function updateCliente(
  tenantId: number,
  id: number,
  data: Partial<CreateClienteInput>
): Promise<{ success: boolean }> {
  const result = await clientesService.updateCliente(tenantId, id, data);
  
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
export async function deleteCliente(tenantId: number, id: number): Promise<{ success: boolean }> {
  const result = await clientesService.deleteCliente(tenantId, id);
  
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
): Promise<void> {
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
): Promise<void> {
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