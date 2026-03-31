/**
 * Serviço de Pagamentos
 * Integração com API
 * Sem `any` - tipagem 100% forte
 */

import type {
  Pagamento,
  PagamentoCreateInput,
  PagamentoListResponse,
  PagamentoListParams,
} from '../types/pagamento.types';
import { toast } from 'sonner';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Busca lista de pagamentos com paginação
 */
export async function listarPagamentos(params?: PagamentoListParams): Promise<PagamentoListResponse> {
  try {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.pageSize) query.append('pageSize', String(params.pageSize));
    if (params?.status) query.append('status', params.status);

    const response = await fetch(`${API_BASE}/api/pagamentos?${query.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as PagamentoListResponse;
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar pagamentos';
    toast.error(message);
    throw error;
  }
}

/**
 * Busca pagamento por ID
 */
export async function obterPagamentoPorId(id: number): Promise<Pagamento | null> {
  try {
    const response = await fetch(`${API_BASE}/api/pagamentos/${id}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Erro ${response.status}: ${response.statusText}`);

    const data = await response.json() as Pagamento;
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao obter pagamento';
    toast.error(message);
    throw error;
  }
}

/**
 * Cria novo pagamento
 */
export async function criarPagamento(input: PagamentoCreateInput): Promise<Pagamento> {
  try {
    const response = await fetch(`${API_BASE}/api/pagamentos`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as Pagamento;
    toast.success('Pagamento criado com sucesso!');
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao criar pagamento';
    toast.error(message);
    throw error;
  }
}

/**
 * Atualiza pagamento
 */
export async function atualizarPagamento(id: number, input: Partial<PagamentoCreateInput>): Promise<Pagamento> {
  try {
    const response = await fetch(`${API_BASE}/api/pagamentos/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as Pagamento;
    toast.success('Pagamento atualizado com sucesso!');
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar pagamento';
    toast.error(message);
    throw error;
  }
}

/**
 * Deleta pagamento
 */
export async function deletarPagamento(id: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/api/pagamentos/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status}: ${response.statusText}`);
    }

    toast.success('Pagamento deletado com sucesso!');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao deletar pagamento';
    toast.error(message);
    throw error;
  }
}
