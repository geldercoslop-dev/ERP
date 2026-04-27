/**
 * Entidades do banco — fonte única: Drizzle schema.
 * Usado por client e server para garantir os mesmos tipos.
 *
 * Convenção:
 * - Nomes em minúsculo/plural (users, clientes, produtos, ...) representam as tabelas Drizzle.
 * - Nomes em PascalCase (User, Cliente, Produto, ...) representam o tipo da linha ($inferSelect).
 * - Prefixo New* representa o tipo de inserção ($inferInsert).
 */
import type {
  users,
  vendedores,
  clientes,
  cores,
  produtos,
  gruposPrecificacao,
  pedidos,
  itensPedido,
  cargas,
  pedidosCarga,
  comissoes,
  planoContas,
  contasFixas,
  contasPagar,
  contasReceber,
  counters,
  clienteVendedores,
  fornecedores,
  idempotencyKeys,
  promocoes,
  boletos,
  caixaMensal,
  pendencias,
} from "../../drizzle/schema.js";

// Re-export das tabelas Drizzle (para uso em queries tipadas)
export type {
  users,
  vendedores,
  clientes,
  cores,
  produtos,
  gruposPrecificacao,
  pedidos,
  itensPedido,
  cargas,
  pedidosCarga,
  comissoes,
  planoContas,
  contasFixas,
  contasPagar,
  contasReceber,
  counters,
  clienteVendedores,
  fornecedores,
  idempotencyKeys,
  promocoes,
  boletos,
  caixaMensal,
  pendencias,
};

// Tipos de linha (select) e de inserção (insert) por entidade

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Vendedor = typeof vendedores.$inferSelect;
export type NewVendedor = typeof vendedores.$inferInsert;

export type Cliente = typeof clientes.$inferSelect;
export type NewCliente = typeof clientes.$inferInsert;

export type Cor = typeof cores.$inferSelect;
export type NewCor = typeof cores.$inferInsert;

export type Produto = typeof produtos.$inferSelect;
export type NewProduto = typeof produtos.$inferInsert;
export type GrupoPrecificacao = typeof gruposPrecificacao.$inferSelect;
export type NewGrupoPrecificacao = typeof gruposPrecificacao.$inferInsert;
export type Pedido = typeof pedidos.$inferSelect;
export type NewPedido = typeof pedidos.$inferInsert;

export type ItemPedido = typeof itensPedido.$inferSelect;
export type NewItemPedido = typeof itensPedido.$inferInsert;

export type Carga = typeof cargas.$inferSelect;
export type NewCarga = typeof cargas.$inferInsert;

export type PedidoCarga = typeof pedidosCarga.$inferSelect;
export type NewPedidoCarga = typeof pedidosCarga.$inferInsert;

export type PendenciaCompra = Record<string, unknown> & { id?: number };
export type NewPendenciaCompra = Partial<PendenciaCompra>;

export type Comissao = typeof comissoes.$inferSelect;
export type NewComissao = typeof comissoes.$inferInsert;

export type PlanoConta = typeof planoContas.$inferSelect;
export type NewPlanoConta = typeof planoContas.$inferInsert;

export type ContaFixa = typeof contasFixas.$inferSelect;
export type NewContaFixa = typeof contasFixas.$inferInsert;

export type ContaPagar = typeof contasPagar.$inferSelect;
export type NewContaPagar = typeof contasPagar.$inferInsert;

export type ContaReceber = typeof contasReceber.$inferSelect;
export type NewContaReceber = typeof contasReceber.$inferInsert;

export type Counter = typeof counters.$inferSelect;
export type NewCounter = typeof counters.$inferInsert;

export type ClienteVendedor = typeof clienteVendedores.$inferSelect;
export type NewClienteVendedor = typeof clienteVendedores.$inferInsert;

export type Fornecedor = typeof fornecedores.$inferSelect;
export type NewFornecedor = typeof fornecedores.$inferInsert;

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;

export type Promocao = typeof promocoes.$inferSelect;
export type NewPromocao = typeof promocoes.$inferInsert;

export type Boleto = typeof boletos.$inferSelect;
export type NewBoleto = typeof boletos.$inferInsert;

export type CaixaMensal = typeof caixaMensal.$inferSelect;
export type NewCaixaMensal = typeof caixaMensal.$inferInsert;

export type Pendencia = typeof pendencias.$inferSelect;
export type NewPendencia = typeof pendencias.$inferInsert;

export type JobExecution = Record<string, unknown> & { id?: number };
export type NewJobExecution = Partial<JobExecution>;

// Stubs para tabelas removidas do schema atual (compatibilidade legada)
export type ProdutoVariacao = Record<string, unknown> & { id?: number };
export type NewProdutoVariacao = Partial<ProdutoVariacao>;
export type PromocaoItem = Record<string, unknown> & { id?: number };
export type NewPromocaoItem = Partial<PromocaoItem>;
export type PagamentoBoleto = Record<string, unknown> & { id?: number };
export type NewPagamentoBoleto = Partial<PagamentoBoleto>;
export type Configuracao = Record<string, unknown> & { id?: number };
export type NewConfiguracao = Partial<Configuracao>;
export type SchemaVersion = Record<string, unknown> & { id?: number; version?: number };
