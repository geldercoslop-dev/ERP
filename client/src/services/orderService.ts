/**
 * Serviço de Pedidos
 * Integração com API
 * Sem `any` - tipagem 100% forte
 */

import type {
  Pedido,
  PedidoCreateInput,
  PedidoListResponse,
  PedidoListParams,
} from '../types/pedido.types';
import { toast } from 'sonner';
import { InfrastructureError } from '../lib/errors/typed-errors.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Busca lista de pedidos com paginação
 */
export async function listarPedidos(params?: PedidoListParams): Promise<PedidoListResponse> {
  try {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.pageSize) query.append('pageSize', String(params.pageSize));
    if (params?.status) query.append('status', params.status);

    const response = await fetch(`${API_BASE}/api/pedidos?${query.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new InfrastructureError(`Erro ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as PedidoListResponse;
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar pedidos';
    toast.error(message);
    throw error;
  }
}

/**
 * Busca pedido por ID
 */
export async function obterPedidoPorId(id: number): Promise<Pedido | null> {
  try {
    const response = await fetch(`${API_BASE}/api/pedidos/${id}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new InfrastructureError(`Erro ${response.status}: ${response.statusText}`);

    const data = await response.json() as Pedido;
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao obter pedido';
    toast.error(message);
    throw error;
  }
}

/**
 * Cria novo pedido
 */
export async function criarPedido(input: PedidoCreateInput): Promise<Pedido> {
  try {
    const response = await fetch(`${API_BASE}/api/pedidos`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new InfrastructureError(`Erro ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as Pedido;
    toast.success('Pedido criado com sucesso!');
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao criar pedido';
    toast.error(message);
    throw error;
  }
}

/**
 * Atualiza pedido
 */
export async function atualizarPedido(id: number, input: Partial<PedidoCreateInput>): Promise<Pedido> {
  try {
    const response = await fetch(`${API_BASE}/api/pedidos/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new InfrastructureError(`Erro ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as Pedido;
    toast.success('Pedido atualizado com sucesso!');
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar pedido';
    toast.error(message);
    throw error;
  }
}

/**
 * Deleta pedido
 */
export async function deletarPedido(id: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/api/pedidos/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new InfrastructureError(`Erro ${response.status}: ${response.statusText}`);
    }

    toast.success('Pedido deletado com sucesso!');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao deletar pedido';
    toast.error(message);
    throw error;
  }
}
