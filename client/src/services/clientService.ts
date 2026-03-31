/**
 * Serviço de Clientes
 * Integração com API via tRPC
 * Sem `any` - tipagem 100% forte
 */

import { trpc } from '../lib/trpcClient';
import type {
  Cliente,
  ClienteCreateInput,
  ClienteUpdateInput,
  ClienteListResponse,
  ClienteListParams,
} from '../types/cliente.types';
import { toast } from 'sonner';

/**
 * Busca lista de clientes com paginação
 */
export async function listarClientes(params?: ClienteListParams): Promise<ClienteListResponse> {
  try {
    const result = await trpc.clientes.list.query(params);
    return result as ClienteListResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar clientes';
    toast.error(message);
    throw error;
  }
}

/**
 * Busca cliente por ID
 */
export async function obterClientePorId(id: number): Promise<Cliente | null> {
  try {
    const clientes = await listarClientes({ pageSize: 1000 });
    return clientes.items.find((c) => c.id === id) || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao obter cliente';
    toast.error(message);
    throw error;
  }
}

/**
 * Busca clientes por termo de busca
 */
export async function buscarClientes(termo: string): Promise<Cliente[]> {
  try {
    if (!termo.trim()) return [];
    const result = await trpc.clientes.search.query({ term: termo });
    return result as Cliente[];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar clientes';
    toast.error(message);
    return [];
  }
}

/**
 * Cria novo cliente
 */
export async function criarCliente(input: ClienteCreateInput): Promise<Cliente> {
  try {
    const result = await trpc.clientes.create.mutate(input);
    toast.success('Cliente criado com sucesso!');
    return result as Cliente;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao criar cliente';
    toast.error(message);
    throw error;
  }
}

/**
 * Atualiza cliente
 */
export async function atualizarCliente(id: number, input: Partial<ClienteCreateInput>): Promise<Cliente> {
  try {
    const result = await trpc.clientes.update.mutate({ id, ...input });
    toast.success('Cliente atualizado com sucesso!');
    return result as Cliente;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar cliente';
    toast.error(message);
    throw error;
  }
}

/**
 * Deleta cliente
 */
export async function deletarCliente(id: number): Promise<void> {
  try {
    await trpc.clientes.delete.mutate({ id });
    toast.success('Cliente deletado com sucesso!');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao deletar cliente';
    toast.error(message);
    throw error;
  }
}
