/**
 * Motor de ações do LEO (LEO Operador).
 * Executa ações do sistema somente após confirmação; registra em leo_actions_log.
 */
import { insertLeoActionLog } from "../leo-action-log.service.js";
import * as ordersService from "../orders.service.js";
import * as financeService from "../finance.service.js";
import * as inventoryService from "../inventory.service.js";
import { logLeoSyntheticAudit } from "../app-audit.service.js";
import { ContaReceberStatus, PedidoStatus } from "../../shared/domain-status.js";
import { assertVendedorActor, type ServiceActor } from "../../_core/service-actor.js";

function fmtMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

export type ResumoBaixaPedido = {
  pedidoNumero: number;
  clienteNome: string;
  valor: number;
  pedidoId: number;
};

/** Prepara resumo para baixa de pedido. LEO exibe: "Pedido 0005 — cliente X — valor R$ 300. Confirma baixa?" */
export async function prepararBaixaPedido(
  tenantId: number,
  actor: ServiceActor,
  numeroPedido: number
): Promise<ResumoBaixaPedido | null> {
  const ped = await ordersService.getPedidoByNumeroForActor(tenantId, actor, numeroPedido);
  if (!ped || ped.status === PedidoStatus.CANCELADO) return null;
  const total = Number(ped.total ?? 0);
  return {
    pedidoNumero: ped.numero ?? numeroPedido,
    clienteNome: String(ped.clienteNome ?? ""),
    valor: total,
    pedidoId: ped.id,
  };
}

/** Executa baixa do pedido (após confirmação). Registra em leo_actions_log. */
export async function executarBaixaPedido(
  tenantId: number,
  pedidoId: number,
  params: Record<string, unknown>,
  usuario: string,
  actor: ServiceActor
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const pedidoPermitido = await ordersService.getPedidoByIdForActor(tenantId, actor, pedidoId);
    if (!pedidoPermitido) {
      return { ok: false, mensagem: "Pedido não encontrado ou sem permissão para baixa." };
    }
    const baixaData = params as financeService.BaixaPedidoInput;
    await financeService.baixarPedidoDireto(tenantId, pedidoId, baixaData, { actor });
    await logLeoSyntheticAudit({
      tenantId,
      entity: "pedidos",
      entityId: pedidoId,
      payloadJson: JSON.stringify({ kind: "baixa_pedido", pedidoId, params, usuario }),
    });
    
    return { ok: true, mensagem: "Baixa registrada com sucesso." };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { ok: false, mensagem: error.message ?? "Erro ao dar baixa." };
  }
}

/** Prepara resumo para registrar pagamento (conta a receber). */
export async function prepararRegistrarPagamento(
  tenantId: number,
  contaId: number,
  actor: ServiceActor
): Promise<{
  id: number;
  clienteNome: string;
  valor: number;
  descricao: string;
} | null> {
  const { items } = await financeService.listContasReceber(tenantId, actor);
  const c = items.find((x: Record<string, unknown>) => (x.id as number) === contaId);
  if (!c || c.status !== ContaReceberStatus.PENDENTE) return null;
  return {
    id: c.id,
    clienteNome: c.clienteNome ?? "",
    valor: Number(c.valor ?? 0),
    descricao: c.descricao ?? "",
  };
}

/** Executa registro de pagamento (conta recebida). */
export async function executarRegistrarPagamento(
  tenantId: number,
  contaId: number,
  dataRecebimento: string,
  formaPagamento: string,
  usuario: string,
  actor: ServiceActor
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const conta = await financeService.getContaReceberByIdForTenant(tenantId, contaId);
    if (!conta) {
      return { ok: false, mensagem: "Conta não encontrada." };
    }
    if (actor.role === "vendedor") {
      assertVendedorActor(actor);
      if (conta.vendedorId == null || Number(conta.vendedorId) !== actor.vendedorId) {
        return { ok: false, mensagem: "Acesso negado a esta conta." };
      }
    }
    await financeService.marcarContaRecebida(tenantId, contaId, dataRecebimento, formaPagamento);
    return { ok: true, mensagem: "Pagamento registrado." };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { ok: false, mensagem: error.message ?? "Erro ao registrar pagamento." };
  }
}

/** Prepara resumo para criar pedido. */
export async function prepararCriarPedido(tenantId: number): Promise<{
  mensagem: string;
  totalPedidosHoje: number;
}> {
  const totalPedidosHoje = await ordersService.countPedidosByTenant(tenantId);
  return {
    mensagem: `Posso criar um novo pedido. Hoje já temos ${totalPedidosHoje} pedidos. Deseja continuar?`,
    totalPedidosHoje,
  };
}

/** Executa criação de pedido (após confirmação). */
export async function executarCriarPedido(
  tenantId: number,
  params: {
    clienteId?: number;
    itens?: Array<{ produtoId: number; quantidade: number; preco: number }>;
    formaPagamento?: string;
    vendedorId?: number;
  },
  usuario: string
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    // Registro de auditoria
    await logLeoSyntheticAudit({
      tenantId,
      entity: "pedidos",
      entityId: 0,
      payloadJson: JSON.stringify({ kind: "criar_pedido", params, usuario }),
    });
    
    return { ok: true, mensagem: "Função de criar pedido em desenvolvimento. Ação registrada." };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { ok: false, mensagem: error.message ?? "Erro ao criar pedido." };
  }
}

/** Prepara resumo para cadastrar produto. */
export async function prepararConsultarProduto(tenantId: number, produtoId: number): Promise<{
  id: number;
  nome: string;
  estoque: number;
  preco: number;
  ativo: boolean;
} | null> {
  const produto = await inventoryService.getProdutoById(tenantId, produtoId);
  if (!produto || !produto.ativo) return null;
  return {
    id: produto.id,
    nome: produto.descricao,
    estoque: produto.estoque || 0,
    preco: produto.custo ? Number(produto.custo) : 0,
    ativo: produto.ativo,
  };
}

/** Executa consulta de produto (apenas leitura, sem alteração). */
export async function executarConsultaProduto(
  tenantId: number,
  produtoId: number,
  usuario: string
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const produto = await inventoryService.getProdutoById(tenantId, produtoId);
    if (!produto) {
      return { ok: false, mensagem: "Produto não encontrado." };
    }
    await insertLeoActionLog({
      usuario,
      acao: "consultar_produto",
      entidade: "produtos",
      dados: JSON.stringify({ produtoId }),
      resultado: "ok",
    });
    return {
      ok: true,
      mensagem: `Produto: ${produto.descricao} | Estoque: ${produto.estoque} | Preço: ${fmtMoeda(Number(produto.custo || 0))}`,
    };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    await insertLeoActionLog({
      usuario,
      acao: "consultar_produto",
      entidade: "produtos",
      dados: JSON.stringify({ produtoId, erro: error.message }),
      resultado: "erro",
    });
    return { ok: false, mensagem: error.message ?? "Erro ao consultar produto." };
  }
}

/** Prepara resumo para ajuste de estoque. */
export async function getProdutoEstoqueInfo(tenantId: number, produtoId: number): Promise<{
  id: number;
  nome: string;
  estoque: number;
  estoqueMinimo: number;
} | null> {
  const produto = await inventoryService.getProdutoById(tenantId, produtoId);
  if (!produto) return null;
  return {
    id: produto.id,
    nome: produto.descricao,
    estoque: produto.estoque || 0,
    estoqueMinimo: 5, // Default mínimo
  };
}

/** Executa ajuste de estoque (após confirmação). */
export async function executarAjustarEstoque(
  produtoId: number,
  params: { quantidade: number; motivo?: string },
  usuario: string
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    // Simplificado - apenas log da ação por enquanto
    await insertLeoActionLog({
      usuario,
      acao: "ajustar_estoque",
      entidade: "produtos",
      dados: JSON.stringify({ produtoId, params }),
      resultado: "simulado",
    });
    return { ok: true, mensagem: `Função de ajustar estoque em desenvolvimento. Ação registrada.` };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    await insertLeoActionLog({
      usuario,
      acao: "ajustar_estoque",
      entidade: "produtos",
      dados: JSON.stringify({ produtoId, params, erro: error.message }),
      resultado: "erro",
    });
    return { ok: false, mensagem: error.message ?? "Erro ao ajustar estoque." };
  }
}

/** Prepara resumo para gerar relatório. */
export async function prepararGerarRelatorio(tipo: string): Promise<{
  mensagem: string;
  totalRegistros?: number;
}> {
  let mensagem = '';
  const totalRegistros = 0;
  
  switch (tipo) {
    case 'vendas':
      mensagem = 'Posso gerar relatório de vendas. Deseja gerar relatório de vendas?';
      break;
    case 'clientes':
      mensagem = 'Posso gerar relatório de clientes. Deseja gerar relatório de clientes?';
      break;
    case 'produtos':
      mensagem = 'Posso gerar relatório de produtos. Deseja gerar relatório de produtos?';
      break;
    case 'estoque':
      mensagem = 'Posso gerar relatório de estoque. Deseja gerar relatório de estoque?';
      break;
    default:
      mensagem = 'Tipo de relatório não reconhecido. Opções: vendas, clientes, produtos, estoque.';
  }
  
  return { mensagem, totalRegistros };
}

/** Executa geração de relatório (após confirmação). */
export async function executarGerarRelatorio(
  tipo: string,
  usuario: string
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    // Simplificado - apenas log da ação por enquanto
    await insertLeoActionLog({
      usuario,
      acao: "gerar_relatorio",
      entidade: "relatorios",
      dados: JSON.stringify({ tipo }),
      resultado: "simulado",
    });
    
    return { ok: true, mensagem: `Relatório de ${tipo} em desenvolvimento. Ação registrada.` };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    await insertLeoActionLog({
      usuario,
      acao: "gerar_relatorio",
      entidade: "relatorios",
      dados: JSON.stringify({ tipo, erro: error.message }),
      resultado: "erro",
    });
    return { ok: false, mensagem: error.message ?? "Erro ao gerar relatório." };
  }
}
