/**
 * Database Index - Único entrypoint do DB.
 * Exporta core + re-exports de services + wrappers (sem ciclo).
 */
import { ADMIN_ACTOR } from "../_core/service-actor.js";
import { InfrastructureError } from '../_core/errors/typed-errors.js';
export * from "./core.js";
// Exportar tabelas do schema para uso em services
export { caixaMensal, boletos, promocoes, promocoesItens, pendencias, } from "./core.js";
export { getConnectionPool } from "../config/database.js";
export { gerarBackupCompleto } from "../services/backup.service.js";
/** Wrappers/compat para APIs antigas de db.ts (fonte única via core). */
export { getUserById, getUserByOpenId, insertUser, upsertUser, touchLastSignedIn, getVendedorByUserId, getVendedorById, getAllVendedores, getVendedorByNome, createVendedor, updateVendedor, deleteVendedor, updateVendedorSenha, findOrCreateUserByOpenId, ensureAdminUser, } from "./core.js";
/** Wrapper: delega para logistica.getCargaById(tenantId, id). */
export async function getCargaById(tenantId, id) {
    const logistica = await import("../services/logistica.service.js");
    return logistica.getCargaById(tenantId, id);
}
export { getPedidoById } from "./core.js";
// ===== PRODUTOS / ESTOQUE (wrappers para services) =====
export async function getAllProdutosComPrecoVigente(tenantId, refDate = new Date()) {
    const inv = await import("../services/inventory.service.js");
    return inv.getAllProdutosComPrecoVigente(tenantId, refDate);
}
export async function getProdutosComPrecoVigentePaged(tenantId, opts) {
    const inv = await import("../services/inventory.service.js");
    return inv.getProdutosComPrecoVigentePaged(tenantId, opts);
}
export async function createProduto(tenantId, input) {
    const inv = await import("../services/inventory.service.js");
    return inv.createProduto(tenantId, input);
}
export async function getProdutoById(tenantId, id) {
    const inv = await import("../services/inventory.service.js");
    return inv.getProdutoById(tenantId, id);
}
export async function updateProduto(tenantId, id, data, version) {
    const inv = await import("../services/inventory.service.js");
    // inventory.service tipa data internamente; aqui mantemos unknown para não vazar any
    return inv.updateProduto(tenantId, id, data, version);
}
export async function updateEstoqueProduto(tenantId, produtoId, quantidade, audit) {
    const inv = await import("../services/inventory.service.js");
    return inv.updateEstoqueProduto(tenantId, { id: produtoId, quantidade, audit });
}
export async function criarNotaEntrada(tenantId, input) {
    const inv = await import("../services/inventory.service.js");
    return inv.criarNotaEntrada(tenantId, input);
}
export async function deleteProduto(tenantId, id) {
    const inv = await import("../services/inventory.service.js");
    return inv.deleteProduto(tenantId, id);
}
export async function getAllCores(tenantId) {
    const inv = await import("../services/inventory.service.js");
    return inv.listCores(tenantId);
}
export async function createCor(tenantId, input) {
    const inv = await import("../services/inventory.service.js");
    return inv.createCor(tenantId, input);
}
export async function updateCor(tenantId, id, patch) {
    const inv = await import("../services/inventory.service.js");
    return inv.updateCor(tenantId, id, patch);
}
export async function deleteCor(tenantId, id) {
    const inv = await import("../services/inventory.service.js");
    return inv.deleteCor(tenantId, id);
}
export async function updateGrupoPrecificacao(tenantId, id, data) {
    const inv = await import("../services/inventory.service.js");
    return inv.updateGrupoPrecificacao(tenantId, id, data);
}
export async function deleteGrupoPrecificacao(tenantId, id) {
    const inv = await import("../services/inventory.service.js");
    return inv.deleteGrupoPrecificacao(tenantId, id);
}
export async function ajusteRapidoEstoque(tenantId, produtoId, quantidade, tipo, audit) {
    const inv = await import("../services/inventory.service.js");
    return inv.ajusteRapidoEstoque(tenantId, produtoId, quantidade, tipo, audit);
}
// ===== CLIENTES (wrappers para clientes.service) =====
export async function getAllClientes(tenantId) {
    const cli = await import("../services/clientes.service.js");
    const res = await cli.listClientes(tenantId, ADMIN_ACTOR, { page: 1, pageSize: 100 });
    return res.success && res.data ? res.data.items : [];
}
export async function listClientesByVendedor(tenantId, vendedorId) {
    const cli = await import("../services/clientes.service.js");
    const actor = { role: "vendedor", vendedorId };
    const res = await cli.listClientes(tenantId, actor, { page: 1, pageSize: 100 });
    return res.success && res.data ? res.data.items : [];
}
export async function searchClientes(tenantId, term) {
    const cli = await import("../services/clientes.service.js");
    const res = await cli.listClientes(tenantId, ADMIN_ACTOR, { page: 1, pageSize: 50, busca: term });
    return res.success && res.data ? res.data.items : [];
}
export async function searchClientesByVendedor(tenantId, term, vendedorId) {
    const cli = await import("../services/clientes.service.js");
    const actor = { role: "vendedor", vendedorId };
    const res = await cli.listClientes(tenantId, actor, { page: 1, pageSize: 50, busca: term });
    return res.success && res.data ? res.data.items : [];
}
export async function searchClientesGlobal(tenantId, term, limit, actor) {
    const cli = await import("../services/clientes.service.js");
    const res = await cli.listClientes(tenantId, actor, { page: 1, pageSize: Math.min(limit, 100), busca: term });
    return res.success && res.data ? res.data.items : [];
}
export async function createCliente(tenantId, input, vendedorId) {
    const cli = await import("../services/clientes.service.js");
    const data = typeof input === "object" && input !== null
        ? { ...input, vendedorIdPrincipal: vendedorId }
        : input;
    const result = await cli.createCliente(tenantId, data);
    if (!result.success || !result.data) {
        throw new InfrastructureError(result.error ?? "Falha ao criar cliente");
    }
    return result.data;
}
export async function updateCliente(tenantId, actor, id, patch) {
    const cli = await import("../services/clientes.service.js");
    return cli.updateCliente(tenantId, actor, id, patch);
}
export async function deleteClienteById(tenantId, actor, id) {
    const cli = await import("../services/clientes.service.js");
    return cli.deleteCliente(tenantId, actor, id);
}
export async function getVendedorPrincipalDoCliente(tenantId, clienteId) {
    const cli = await import("../services/clientes.service.js");
    return cli.getVendedorPrincipalDoCliente(tenantId, clienteId);
}
export async function createClienteVinculo(tenantId, clienteId, vendedorId, tipo) {
    const cli = await import("../services/clientes.service.js");
    return cli.associarClienteVendedor(tenantId, clienteId, vendedorId, tipo === "PRINCIPAL");
}
export async function ensureClienteVendedorLink(tx, clienteId, vendedorId) {
    const cli = await import("../services/clientes.service.js");
    return cli.ensureClienteVendedorLink(tx, clienteId, vendedorId);
}
// ===== PEDIDOS / FINANCEIRO / LOGÍSTICA (wrappers para services) =====
export async function getItensByPedido(pedidoId) {
    const core = await import("./core.js");
    const conn = await core.getDb();
    return conn.select().from(core.itensPedido).where(core.eq(core.itensPedido.pedidoId, pedidoId));
}
export async function updatePedido(tenantId, actor, id, data, itens) {
    const orders = await import("../services/orders.service.js");
    void itens;
    return orders.updatePedido(tenantId, actor, id, data);
}
export async function deletePedido(tenantId, actor, id) {
    const orders = await import("../services/orders.service.js");
    return orders.deletePedido(tenantId, actor, id);
}
export async function baixarPedidoDireto(tenantId, pedidoId, data, actor) {
    const finance = await import("../services/finance.service.js");
    return finance.baixarPedidoDireto(tenantId, pedidoId, data, actor ? { actor } : undefined);
}
export async function getAllCargas(tenantId) {
    const logistica = await import("../services/logistica.service.js");
    const res = await logistica.listCargas(tenantId);
    return res.items;
}
export async function createCarga(tenantId, data) {
    const logistica = await import("../services/logistica.service.js");
    return logistica.createCarga(tenantId, data);
}
export async function updateCargaPedidos(tenantId, id, pedidosIds) {
    const logistica = await import("../services/logistica.service.js");
    return logistica.addPedidosToCarga(tenantId, id, pedidosIds);
}
export async function fecharCarga(tenantId, id) {
    const logistica = await import("../services/logistica.service.js");
    return logistica.finalizarCarga(tenantId, id);
}
export async function baixarPedidoCarga(tenantId, pedidoCargaId, data) {
    const logistica = await import("../services/logistica.service.js");
    return logistica.baixarPedidoCarga(tenantId, pedidoCargaId, data);
}
export async function listPendencias(tenantId, vendedorId) {
    const pend = await import("../services/pendencias.service.js");
    return pend.listPendencias(tenantId, vendedorId);
}
export async function updateStatusPendencia(tenantId, id, status, vendedorId) {
    const pend = await import("../services/pendencias.service.js");
    return pend.updateStatusPendencia(tenantId, id, status, vendedorId);
}
export async function getBoletosByVendedor(tenantId, vendedorId) {
    const fin = await import("../services/finance.service.js");
    return fin.getBoletosByVendedor(tenantId, vendedorId);
}
export async function baixarBoletoParcial(tenantId, boletoId, valorPago, dataPagamento) {
    const fin = await import("../services/finance.service.js");
    void dataPagamento;
    return fin.baixarBoletoParcial(tenantId, boletoId, valorPago);
}
export async function getAllContasReceber(tenantId) {
    const core = await import("./core.js");
    const conn = await core.getDb();
    return conn.select().from(core.contasReceber).where(core.eq(core.contasReceber.tenantId, tenantId));
}
export async function getContasReceberByVendedor(tenantId, vendedorId) {
    const core = await import("./core.js");
    const conn = await core.getDb();
    return conn
        .select()
        .from(core.contasReceber)
        .where(core.and(core.eq(core.contasReceber.tenantId, tenantId), core.eq(core.contasReceber.vendedorId, vendedorId)));
}
function parseContaReceberPayload(input) {
    const raw = input;
    const dataVencRaw = raw.dataVencimento;
    const dataVencimento = dataVencRaw instanceof Date
        ? dataVencRaw
        : new Date(typeof dataVencRaw === "string" || typeof dataVencRaw === "number" ? String(dataVencRaw) : "");
    if (Number.isNaN(dataVencimento.getTime())) {
        throw new InfrastructureError("dataVencimento inválida");
    }
    const vid = raw.vendedorId;
    const vendedorId = vid != null && Number.isFinite(Number(vid)) && Number(vid) > 0 ? Number(vid) : null;
    const valor = Number(raw.valor);
    if (!Number.isFinite(valor))
        throw new InfrastructureError("valor inválido");
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
export async function createContaReceber(tenantId, input) {
    const fin = await import("../services/finance.service.js");
    return fin.createContaReceber(tenantId, parseContaReceberPayload(input));
}
export async function marcarContaRecebida(tenantId, id, dataRecebimento, formaPagamento) {
    const fin = await import("../services/finance.service.js");
    return fin.marcarContaRecebida(tenantId, id, dataRecebimento, formaPagamento);
}
export async function deleteContaReceber(tenantId, id) {
    const fin = await import("../services/finance.service.js");
    return fin.deleteContaReceber(tenantId, id);
}
export async function getCaixaMensal(tenantId, mesAno) {
    const fin = await import("../services/finance.service.js");
    return fin.getCaixaMensal(tenantId, mesAno);
}
export async function getAllCaixaMensal(tenantId) {
    const fin = await import("../services/finance.service.js");
    return fin.getAllCaixaMensal(tenantId);
}
export async function getPlanoContas(tenantId, tipo) {
    const fin = await import("../services/finance.service.js");
    return fin.getPlanoContas(tenantId, tipo);
}
export async function createPlanoContas(tenantId, input) {
    const fin = await import("../services/finance.service.js");
    return fin.createPlanoContas(tenantId, input);
}
export async function listContasPagarFiltro(tenantId, input) {
    const fin = await import("../services/finance.service.js");
    const { ADMIN_ACTOR } = await import("../_core/service-actor.js");
    return fin.listContasPagar(tenantId, ADMIN_ACTOR, input);
}
export async function createContaPagar(tenantId, input) {
    const fin = await import("../services/finance.service.js");
    const raw = input;
    const dataVenc = raw.dataVencimento;
    const dataVencimento = dataVenc instanceof Date ? dataVenc : new Date(typeof dataVenc === "string" ? dataVenc : String(dataVenc ?? ""));
    if (Number.isNaN(dataVencimento.getTime()))
        throw new InfrastructureError("dataVencimento inválida");
    const valor = Number(raw.valor);
    if (!Number.isFinite(valor))
        throw new InfrastructureError("valor inválido");
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
export async function pagarConta(tenantId, id, valorPago) {
    const fin = await import("../services/finance.service.js");
    return fin.pagarConta(tenantId, id, valorPago);
}
export async function deleteContaPagar(tenantId, id) {
    const fin = await import("../services/finance.service.js");
    return fin.deleteContaPagar(tenantId, id);
}
export async function listContasFixas(tenantId) {
    const fin = await import("../services/finance.service.js");
    return fin.listContasFixas(tenantId);
}
export async function createContaFixa(tenantId, input) {
    const fin = await import("../services/finance.service.js");
    const raw = input;
    const descricao = typeof raw.nome === "string" ? raw.nome : typeof raw.descricao === "string" ? raw.descricao : String(raw.descricao ?? "");
    const valorStr = typeof raw.valorPadrao === "string" ? raw.valorPadrao : String(raw.valor ?? "0");
    const valor = Number(valorStr);
    const diaVencimento = Number(raw.diaVencimento);
    if (!Number.isFinite(valor) || !Number.isInteger(diaVencimento)) {
        throw new InfrastructureError("Dados de conta fixa inválidos");
    }
    return fin.createContaFixa(tenantId, {
        descricao,
        valor,
        diaVencimento,
        planoContasId: raw.planoContasId != null ? Number(raw.planoContasId) : undefined,
    });
}
export async function gerarContasFixasMes(tenantId, mesAno) {
    const fin = await import("../services/finance.service.js");
    return fin.gerarContasFixasMes(tenantId, mesAno);
}
export async function getAllComissoes(tenantId) {
    const fin = await import("../services/finance.service.js");
    return fin.getAllComissoes(tenantId);
}
export async function getComissoesByVendedor(tenantId, vendedorId) {
    const fin = await import("../services/finance.service.js");
    return fin.getComissoesByVendedor(tenantId, vendedorId);
}
export async function marcarComissaoPaga(tenantId, id, dataPagamento) {
    const fin = await import("../services/finance.service.js");
    void dataPagamento;
    return fin.marcarComissaoPaga(tenantId, id);
}
// ===== PROMOÇÕES =====
export async function listPromocoes(tenantId, options) {
    const promo = await import("../services/promocoes.service.js");
    return promo.listPromocoes(tenantId, options);
}
export async function createPromocao(tenantId, input) {
    const promo = await import("../services/promocoes.service.js");
    return promo.createPromocao(tenantId, input);
}
export async function updatePromocao(tenantId, id, input) {
    const promo = await import("../services/promocoes.service.js");
    return promo.updatePromocao(tenantId, id, input);
}
export async function deletePromocao(tenantId, id) {
    const promo = await import("../services/promocoes.service.js");
    return promo.deletePromocao(tenantId, id);
}
export async function getPromocaoItens(tenantId, promocaoId) {
    const promo = await import("../services/promocoes.service.js");
    return promo.getPromocaoItens(tenantId, promocaoId);
}
export async function setPromocaoItens(tenantId, promocaoId, itens) {
    const promo = await import("../services/promocoes.service.js");
    return promo.setPromocaoItens(tenantId, promocaoId, itens);
}
// ===== SYSTEM DIAGNOSTIC =====
export async function runDiagnosticoConsistencia(tenantId) {
    const sys = await import("../services/system.service.js");
    return sys.runDiagnosticoConsistencia(tenantId);
}
