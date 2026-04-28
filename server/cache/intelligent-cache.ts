/**
 * Cache inteligente para consultas frequentes do ERP.
 * Extende o cache base com métodos específicos para dados do negócio.
 * 
 * SEGURANÇA: Todas as funções exigem tenantId e actor (quando aplicável).
 * Usa services existentes em vez de acesso direto ao DB.
 */
import { getOrSet } from './api-cache.js';
import type { ServiceActor } from '../_core/service-actor.js';
import { listProdutosResumoLeoLearning } from '../services/inventory.service.js';
import { listClientes } from '../services/clientes.service.js';
import { listContasReceber, listContasPagar } from '../services/finance.service.js';

// TTL específicos por tipo de dado
const CACHE_TTL = {
  produtos: 10 * 60 * 1000, // 10 minutos
  clientes: 15 * 60 * 1000, // 15 minutos
  estoque: 5 * 60 * 1000,  // 5 minutos (mudança rápida)
  vendas: 2 * 60 * 1000,  // 2 minutos (alta frequência)
  relatorios: 30 * 60 * 1000, // 30 minutos
  cargas: 20 * 60 * 1000,  // 20 minutos
  financeiro: 10 * 60 * 1000, // 10 minutos
} as const;

/**
 * Cache para produtos com busca por descrição.
 */
interface Produto {
  id: number;
  descricao: string;
  marca?: string | null;
  estoque?: number;
  ativo?: boolean;
}

interface Cliente {
  id: number;
  nome: string;
  telefone?: string | null;
}

interface Pedido {
  id: number;
  total?: number | string;
  createdAt: Date;
  status: string;
}

interface Conta {
  valor?: number | string;
  status: string;
  dataVencimento?: Date;
}

export async function getProdutosCache(tenantId: number, busca?: string): Promise<unknown[]> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error("tenantId obrigatório para getProdutosCache");
  }
  
  const key = `produtos:${tenantId}:${busca || 'todos'}`;
  return getOrSet(key, async () => {
    const produtos = await listProdutosResumoLeoLearning(tenantId);
    
    if (busca) {
      const buscaLower = busca.toLowerCase();
      return produtos.filter(p => 
        (p.descricao?.toLowerCase().includes(buscaLower) || false) ||
        (p.categoria?.toLowerCase().includes(buscaLower) || false)
      ).slice(0, 100);
    }
    
    return produtos.slice(0, 100);
  }, CACHE_TTL.produtos);
}

/**
 * Cache para clientes com busca por nome e telefone.
 * Requer tenantId e actor para controle de acesso.
 */
export async function getClientesCache(tenantId: number, actor: ServiceActor, busca?: string): Promise<unknown[]> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error("tenantId obrigatório para getClientesCache");
  }
  if (!actor) {
    throw new Error("actor obrigatório para getClientesCache");
  }
  
  const key = `clientes:${tenantId}:${actor.userId || actor.vendedorId || 'admin'}:${busca || 'todos'}`;
  return getOrSet(key, async () => {
    const result = await listClientes(tenantId, actor, {
      page: 1,
      pageSize: 100,
      busca
    });
    if (!result.success || !result.data) {
      return [];
    }
    return result.data.items || [];
  }, CACHE_TTL.clientes);
}

/**
 * Cache para vendas do dia (crítico para LEO).
 * Requer tenantId para isolamento multi-tenant.
 */
export async function getVendasHojeCache(tenantId: number, data?: Date): Promise<{ quantidade: number; total: number; pedidos: unknown[] }> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error("tenantId obrigatório para getVendasHojeCache");
  }
  
  const dataStr = data?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
  const key = `vendas:dia:${tenantId}:${dataStr}`;
  return getOrSet(key, async () => {
    // TODO: Implementar usando serviço de pedidos quando disponível
    // Por enquanto retorna vazio para não quebrar o cache
    return { quantidade: 0, total: 0, pedidos: [] };
  }, CACHE_TTL.vendas);
}

/**
 * Cache para estoque baixo (crítico para alertas do LEO).
 * Requer tenantId para isolamento multi-tenant.
 */
export async function getEstoqueBaixoCache(tenantId: number): Promise<unknown[]> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error("tenantId obrigatório para getEstoqueBaixoCache");
  }
  
  const key = `estoque:baixo:${tenantId}:${new Date().toISOString().split('T')[0]}`;
  return getOrSet(key, async () => {
    // TODO: Implementar usando serviço de inventory quando disponível
    // Por enquanto retorna vazio para não quebrar o cache
    return [];
  }, CACHE_TTL.estoque);
}

/**
 * Cache para resumo financeiro (contas a pagar/receber).
 * Requer tenantId e actor para controle de acesso.
 */
export async function getFinanceiroResumoCache(tenantId: number, actor: ServiceActor): Promise<{ aReceber: number; aPagar: number; vencidas: number; aVencer: number }> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error("tenantId obrigatório para getFinanceiroResumoCache");
  }
  if (!actor) {
    throw new Error("actor obrigatório para getFinanceiroResumoCache");
  }
  
  const key = `financeiro:resumo:${tenantId}:${actor.userId || actor.vendedorId || 'admin'}`;
  return getOrSet(key, async () => {
    const hoje = new Date();
    const daqui30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    // Contas a receber
    const contasReceberResult = await listContasReceber(tenantId, actor, {
      dataInicio: hoje,
      dataFim: daqui30dias,
      page: 1,
      pageSize: 1000
    });
    
    // Contas a pagar (vendedor não tem acesso)
    let aPagar = 0;
    if (actor.role === "admin") {
      const contasPagarResult = await listContasPagar(tenantId, actor, {
        dataInicio: hoje,
        dataFim: daqui30dias,
        page: 1,
        pageSize: 1000
      });
      aPagar = contasPagarResult.items.reduce((sum, c) => {
        const valor = Number(c.valor || 0);
        return sum + (isNaN(valor) ? 0 : valor);
      }, 0);
    }
    
    const aReceber = contasReceberResult.items.reduce((sum, c) => {
      const valor = Number(c.valor || 0);
      return sum + (isNaN(valor) ? 0 : valor);
    }, 0);
    
    // Calcular vencidas (dataVencimento < hoje)
    const vencidas = contasReceberResult.items.filter(c => {
      const vencimento = new Date(c.dataVencimento || 0);
      return vencimento < hoje && c.status !== 'RECEBIDA';
    }).length;
    
    // Calcular a vencer (hoje <= dataVencimento <= daqui30dias)
    const aVencer = contasReceberResult.items.filter(c => {
      const vencimento = new Date(c.dataVencimento || 0);
      return vencimento >= hoje && vencimento <= daqui30dias && c.status !== 'RECEBIDA';
    }).length;
    
    return {
      aReceber,
      aPagar,
      vencidas,
      aVencer
    };
  }, CACHE_TTL.financeiro);
}

// Exportações para compatibilidade com LEO router já estão disponíveis acima
