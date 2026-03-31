/**
 * Database Index - Único entrypoint do DB.
 * Exporta core + re-exports de services + wrappers (sem ciclo).
 */

import { ADMIN_ACTOR, type ServiceActor } from "../_core/service-actor.js";

export * from "./core.js";

// Exportar tabelas do schema para uso em services
export {
  caixaMensal,
  boletos,
  promocoes,
  promocoesItens,
  pendencias,
} from "./core.js";

export { getConnectionPool } from "../config/database.js";

export { gerarBackupCompleto } from "../services/backup.service.js";

/** Alias para compatibilidade */
export type { NewUser as InsertUser, NewVendedor as InsertVendedor } from "./core.js";

/** Wrappers/compat para APIs antigas de db.ts (fonte única via core). */
export {
  getUserById,
  getUserByOpenId,
  insertUser,
  upsertUser,
  touchLastSignedIn,
  getVendedorByUserId,
  getVendedorById,
  getAllVendedores,
  getVendedorByNome,
  createVendedor,
  updateVendedor,
  deleteVendedor,
  updateVendedorSenha,
  findOrCreateUserByOpenId,
  ensureAdminUser,
} from "./core.js";

/** Wrapper: delega para logistica.getCargaById(tenantId, id). */
export async function getCargaById(
  tenantId: number,
  id: number
): Promise<import("../services/logistica.service.js").CargaComPedidos | null> {
  const logistica = await import("../services/logistica.service.js");
  return logistica.getCargaById(tenantId, id);
}

export { getPedidoById } from "./core.js";

// ===== PRODUTOS / ESTOQUE (wrappers para services) =====
export async function getAllProdutosComPrecoVigente(tenantId: number, refDate: Date = new Date()) {
  const inv = await import("../services/inventory.service.js");
  return inv.getAllProdutosComPrecoVigente(tenantId, refDate);
}

export async function getProdutosComPrecoVigentePaged(
  tenantId: number,
  opts: import("../services/inventory.service.js").GetProdutosComPrecoVigentePagedOpts
) {
  const inv = await import("../services/inventory.service.js");
  return inv.getProdutosComPrecoVigentePaged(tenantId, opts);
}

export async function createProduto(tenantId: number, input: unknown) {
  const inv = await import("../services/inventory.service.js");
  return inv.createProduto(tenantId, input as never);
}

export async function getProdutoById(tenantId: number, id: number) {
  const inv = await import("../services/inventory.service.js");
  return inv.getProdutoById(tenantId, id);
}

export async function updateProduto(tenantId: number, id: number, data: unknown, version?: number) {
  const inv = await import("../services/inventory.service.js");
  // inventory.service tipa data internamente; aqui mantemos unknown para não vazar any
  return inv.updateProduto(tenantId, id, data as never, version);
}

export async function updateEstoqueProduto(
  tenantId: number,
  produtoId: number,
  quantidade: number,
  audit?: { actorUserId?: number; actorVendedorId?: number; traceId?: string; motivo?: string }
) {
  const inv = await import("../services/inventory.service.js");
  return inv.updateEstoqueProduto(tenantId, { id: produtoId, quantidade, audit });
}

export async function criarNotaEntrada(tenantId: number, input: unknown) {
  const inv = await import("../services/inventory.service.js");
  return inv.criarNotaEntrada(tenantId, input as never);
}

export async function deleteProduto(tenantId: number, id: number) {
  const inv = await import("../services/inventory.service.js");
  return inv.deleteProduto(tenantId, id);
}

export async function getAllCores(tenantId: number) {
  const inv = await import("../services/inventory.service.js");
  return inv.listCores(tenantId);
}

export async function createCor(tenantId: number, input: unknown) {
  const inv = await import("../services/inventory.service.js");
  return inv.createCor(tenantId, input as never);
}

export async function updateCor(tenantId: number, id: number, patch: unknown) {
  const inv = await import("../services/inventory.service.js");
  return inv.updateCor(tenantId, id, patch as never);
}

export async function deleteCor(tenantId: number, id: number) {
  const inv = await import("../services/inventory.service.js");
  return inv.deleteCor(tenantId, id);
}

export async function updateGrupoPrecificacao(tenantId: number, id: number, data: unknown) {
  const inv = await import("../services/inventory.service.js");
  return inv.updateGrupoPrecificacao(tenantId, id, data as never);
}

export async function deleteGrupoPrecificacao(tenantId: number, id: number) {
  const inv = await import("../services/inventory.service.js");
  return inv.deleteGrupoPrecificacao(tenantId, id);
}

export async function ajusteRapidoEstoque(
  tenantId: number,
  produtoId: number,
  quantidade: number,
  tipo: "entrada" | "saida",
  audit?: { actorUserId?: number; traceId?: string; motivo?: string }
) {
  const inv = await import("../services/inventory.service.js");
  return inv.ajusteRapidoEstoque(tenantId, produtoId, quantidade, tipo, audit as never);
}

// ===== CLIENTES (wrappers para clientes.service) =====
export async function getAllClientes(tenantId: number) {
  const cli = await import("../services/clientes.service.js");
  const res = await cli.listClientes(tenantId, ADMIN_ACTOR, { page: 1, pageSize: 100 });
  return res.items;
}

export async function listClientesByVendedor(tenantId: number, vendedorId: number) {
  const cli = await import("../services/clientes.service.js");
  const actor: ServiceActor = { role: "vendedor", vendedorId };
  const res = await cli.listClientes(tenantId, actor, { page: 1, pageSize: 100 });
  return res.items;
}

export async function searchClientes(tenantId: number, term: string) {
  const cli = await import("../services/clientes.service.js");
  const res = await cli.listClientes(tenantId, ADMIN_ACTOR, { page: 1, pageSize: 50, busca: term });
  return res.items;
}

export async function searchClientesByVendedor(tenantId: number, term: string, vendedorId: number) {
  const cli = await import("../services/clientes.service.js");
  const actor: ServiceActor = { role: "vendedor", vendedorId };
  const res = await cli.listClientes(tenantId, actor, { page: 1, pageSize: 50, busca: term });
  return res.items;
}

export async function searchClientesGlobal(tenantId: number, term: string, limit: number, actor: ServiceActor) {
  const cli = await import("../services/clientes.service.js");
  const res = await cli.listClientes(tenantId, actor, { page: 1, pageSize: Math.min(limit, 100), busca: term });
  return res.items;
}

export async function createCliente(tenantId: number, input: unknown, vendedorId?: number) {
  const cli = await import("../services/clientes.service.js");
  const data =
    typeof input === "object" && input !== null
      ? ({ ...(input as Record<string, unknown>), vendedorIdPrincipal: vendedorId } as unknown)
      : input;
  return cli.createCliente(tenantId, data as never);
}

export async function updateCliente(tenantId: number, actor: ServiceActor, id: number, patch: unknown) {
  const cli = await import("../services/clientes.service.js");
  return cli.updateCliente(tenantId, actor, id, patch as never);
}

export async function deleteClienteById(tenantId: number, actor: ServiceActor, id: number) {
  const cli = await import("../services/clientes.service.js");
  return cli.deleteCliente(tenantId, actor, id);
}

export async function getVendedorPrincipalDoCliente(tenantId: number, clienteId: number) {
  const cli = await import("../services/clientes.service.js");
  return cli.getVendedorPrincipalDoCliente(tenantId, clienteId);
}

export async function createClienteVinculo(tenantId: number, clienteId: number, vendedorId: number, tipo: "PRINCIPAL" | "SECUNDARIO") {
  const cli = await import("../services/clientes.service.js");
  return cli.associarClienteVendedor(tenantId, clienteId, vendedorId, tipo === "PRINCIPAL");
}

export async function ensureClienteVendedorLink(tx: unknown, clienteId: number, vendedorId: number) {
  const cli = await import("../services/clientes.service.js");
  return cli.ensureClienteVendedorLink(tx as never, clienteId, vendedorId);
}

// ===== PEDIDOS / FINANCEIRO / LOGÍSTICA (wrappers para services) =====
export async function getItensByPedido(pedidoId: number) {
  const core = await import("./core.js");
  const conn = await core.getDb();
  return conn.select().from(core.itensPedido).where(core.eq(core.itensPedido.pedidoId, pedidoId));
}

export async function updatePedido(
  tenantId: number,
  actor: ServiceActor,
  id: number,
  data: unknown,
  itens?: unknown
) {
  const orders = await import("../services/orders.service.js");
  void itens;
  return orders.updatePedido(tenantId, actor, id, data as never);
}

export async function deletePedido(tenantId: number, actor: ServiceActor, id: number) {
  const orders = await import("../services/orders.service.js");
  return orders.deletePedido(tenantId, actor, id);
}

export async function baixarPedidoDireto(
  tenantId: number,
  pedidoId: number,
  data: unknown,
  actor?: import("../_core/service-actor.js").ServiceActor
) {
  const finance = await import("../services/finance.service.js");
  return finance.baixarPedidoDireto(tenantId, pedidoId, data as never, actor ? { actor } : undefined);
}

export async function getAllCargas(tenantId: number) {
  const logistica = await import("../services/logistica.service.js");
  const res = await logistica.listCargas(tenantId);
  return res.items;
}

export async function createCarga(tenantId: number, data: unknown) {
  const logistica = await import("../services/logistica.service.js");
  return logistica.createCarga(tenantId, data as never);
}

export async function updateCargaPedidos(tenantId: number, id: number, pedidosIds: number[]) {
  const logistica = await import("../services/logistica.service.js");
  return logistica.addPedidosToCarga(tenantId, id, pedidosIds);
}

export async function fecharCarga(tenantId: number, id: number) {
  const logistica = await import("../services/logistica.service.js");
  return logistica.finalizarCarga(tenantId, id);
}

export async function baixarPedidoCarga(tenantId: number, pedidoCargaId: number, data: unknown) {
  const logistica = await import("../services/logistica.service.js");
  return logistica.baixarPedidoCarga(tenantId, pedidoCargaId, data as never);
}

export async function listPendencias(tenantId: number, vendedorId?: number) {
  const pend = await import("../services/pendencias.service.js");
  return pend.listPendencias(tenantId, vendedorId);
}

export async function updateStatusPendencia(
  tenantId: number,
  id: number,
  status: "PENDENTE" | "COMPRADO" | "RESOLVIDO",
  vendedorId?: number
) {
  const pend = await import("../services/pendencias.service.js");
  return pend.updateStatusPendencia(tenantId, id, status, vendedorId);
}

export async function getBoletosByVendedor(tenantId: number, vendedorId: number) {
  const fin = await import("../services/finance.service.js");
  return fin.getBoletosByVendedor(tenantId, vendedorId);
}

export async function baixarBoletoParcial(tenantId: number, boletoId: number, valorPago: number, dataPagamento?: string) {
  const fin = await import("../services/finance.service.js");
  void dataPagamento;
  return fin.baixarBoletoParcial(tenantId, boletoId, valorPago);
}

export async function getAllContasReceber(tenantId: number) {
  const core = await import("./core.js");
  const conn = await core.getDb();
  return conn.select().from(core.contasReceber).where(core.eq(core.contasReceber.tenantId, tenantId));
}

export async function getContasReceberByVendedor(tenantId: number, vendedorId: number) {
  const core = await import("./core.js");
  const conn = await core.getDb();
  return conn
    .select()
    .from(core.contasReceber)
    .where(core.and(core.eq(core.contasReceber.tenantId, tenantId), core.eq(core.contasReceber.vendedorId, vendedorId)));
}

function parseContaReceberPayload(input: unknown): import("../services/finance.service.js").CreateContaReceberInput {
  const raw = input as Record<string, unknown>;
  const dataVencRaw = raw.dataVencimento;
  const dataVencimento =
    dataVencRaw instanceof Date
      ? dataVencRaw
      : new Date(typeof dataVencRaw === "string" || typeof dataVencRaw === "number" ? String(dataVencRaw) : "");
  if (Number.isNaN(dataVencimento.getTime())) {
    throw new Error("dataVencimento inválida");
  }
  const vid = raw.vendedorId;
  const vendedorId =
    vid != null && Number.isFinite(Number(vid)) && Number(vid) > 0 ? Number(vid) : null;
  const valor = Number(raw.valor);
  if (!Number.isFinite(valor)) throw new Error("valor inválido");
  return {
    clienteNome: String(raw.clienteNome ?? ""),
    vendedorId,
    descricao: String(raw.descricao ?? ""),
    valor,
    dataVencimento,
    status: "PENDENTE",
    observacoes: raw.observacoes != null ? String(raw.observacoes) : undefined,
    pedidoNumero: raw.pedidoNumero != null ? Number(raw.pedidoNumero) : undefined,
  };
}

export async function createContaReceber(tenantId: number, input: unknown) {
  const fin = await import("../services/finance.service.js");
  return fin.createContaReceber(tenantId, parseContaReceberPayload(input));
}

export async function marcarContaRecebida(tenantId: number, id: number, dataRecebimento: string, formaPagamento: string) {
  const fin = await import("../services/finance.service.js");
  return fin.marcarContaRecebida(tenantId, id, dataRecebimento, formaPagamento);
}

export async function deleteContaReceber(tenantId: number, id: number) {
  const fin = await import("../services/finance.service.js");
  return fin.deleteContaReceber(tenantId, id);
}

export async function getCaixaMensal(tenantId: number, mesAno: string) {
  const fin = await import("../services/finance.service.js");
  return fin.getCaixaMensal(tenantId, mesAno);
}

export async function getAllCaixaMensal(tenantId: number) {
  const fin = await import("../services/finance.service.js");
  return fin.getAllCaixaMensal(tenantId);
}

export async function getPlanoContas(tenantId: number, tipo?: "RECEITA" | "DESPESA") {
  const fin = await import("../services/finance.service.js");
  return fin.getPlanoContas(tenantId, tipo);
}

export async function createPlanoContas(tenantId: number, input: unknown) {
  const fin = await import("../services/finance.service.js");
  return fin.createPlanoContas(tenantId, input as never);
}

export async function listContasPagarFiltro(tenantId: number, input: unknown) {
  const fin = await import("../services/finance.service.js");
  const { ADMIN_ACTOR } = await import("../_core/service-actor.js");
  return fin.listContasPagar(tenantId, ADMIN_ACTOR, input as never);
}

export async function createContaPagar(tenantId: number, input: unknown) {
  const fin = await import("../services/finance.service.js");
  const raw = input as Record<string, unknown>;
  const dataVenc = raw.dataVencimento;
  const dataVencimento = dataVenc instanceof Date ? dataVenc : new Date(typeof dataVenc === "string" ? dataVenc : String(dataVenc ?? ""));
  if (Number.isNaN(dataVencimento.getTime())) throw new Error("dataVencimento inválida");
  const valor = Number(raw.valor);
  if (!Number.isFinite(valor)) throw new Error("valor inválido");
  return fin.createContaPagar(tenantId, {
    fornecedor: String(raw.fornecedor ?? ""),
    descricao: String(raw.descricao ?? raw.fornecedor ?? "Conta a pagar"),
    valor,
    dataVencimento,
    status: "PENDENTE",
    observacoes: raw.observacoes != null ? String(raw.observacoes) : undefined,
    planoContasId: raw.planoContasId != null ? Number(raw.planoContasId) : undefined,
  });
}

export async function pagarConta(tenantId: number, id: number, valorPago: number) {
  const fin = await import("../services/finance.service.js");
  return fin.pagarConta(tenantId, id, valorPago);
}

export async function deleteContaPagar(tenantId: number, id: number) {
  const fin = await import("../services/finance.service.js");
  return fin.deleteContaPagar(tenantId, id);
}

export async function listContasFixas(tenantId: number) {
  const fin = await import("../services/finance.service.js");
  return fin.listContasFixas(tenantId);
}

export async function createContaFixa(tenantId: number, input: unknown) {
  const fin = await import("../services/finance.service.js");
  const raw = input as Record<string, unknown>;
  const descricao =
    typeof raw.nome === "string" ? raw.nome : typeof raw.descricao === "string" ? raw.descricao : String(raw.descricao ?? "");
  const valorStr = typeof raw.valorPadrao === "string" ? raw.valorPadrao : String(raw.valor ?? "0");
  const valor = Number(valorStr);
  const diaVencimento = Number(raw.diaVencimento);
  if (!Number.isFinite(valor) || !Number.isInteger(diaVencimento)) {
    throw new Error("Dados de conta fixa inválidos");
  }
  return fin.createContaFixa(tenantId, {
    descricao,
    valor,
    diaVencimento,
    planoContasId: raw.planoContasId != null ? Number(raw.planoContasId) : undefined,
  } as never);
}

export async function gerarContasFixasMes(tenantId: number, mesAno: string) {
  const fin = await import("../services/finance.service.js");
  return fin.gerarContasFixasMes(tenantId, mesAno);
}

export async function getAllComissoes(tenantId: number) {
  const fin = await import("../services/finance.service.js");
  return fin.getAllComissoes(tenantId);
}

export async function getComissoesByVendedor(tenantId: number, vendedorId: number) {
  const fin = await import("../services/finance.service.js");
  return fin.getComissoesByVendedor(tenantId, vendedorId);
}

export async function marcarComissaoPaga(tenantId: number, id: number, dataPagamento?: string) {
  const fin = await import("../services/finance.service.js");
  void dataPagamento;
  return fin.marcarComissaoPaga(tenantId, id);
}

// ===== PROMOÇÕES =====
export async function listPromocoes(tenantId: number, options?: { page?: number; pageSize?: number }) {
  const promo = await import("../services/promocoes.service.js");
  return promo.listPromocoes(tenantId, options);
}

export async function createPromocao(tenantId: number, input: unknown) {
  const promo = await import("../services/promocoes.service.js");
  return promo.createPromocao(tenantId, input as never);
}

export async function updatePromocao(tenantId: number, id: number, input: unknown) {
  const promo = await import("../services/promocoes.service.js");
  return promo.updatePromocao(tenantId, id, input as never);
}

export async function deletePromocao(tenantId: number, id: number) {
  const promo = await import("../services/promocoes.service.js");
  return promo.deletePromocao(tenantId, id);
}

export async function getPromocaoItens(tenantId: number, promocaoId: number) {
  const promo = await import("../services/promocoes.service.js");
  return promo.getPromocaoItens(tenantId, promocaoId);
}

export async function setPromocaoItens(tenantId: number, promocaoId: number, itens: unknown) {
  const promo = await import("../services/promocoes.service.js");
  return promo.setPromocaoItens(tenantId, promocaoId, itens as never);
}

// ===== SYSTEM DIAGNOSTIC =====
export async function runDiagnosticoConsistencia(tenantId: number) {
  const sys = await import("../services/system.service.js");
  return sys.runDiagnosticoConsistencia(tenantId);
}
