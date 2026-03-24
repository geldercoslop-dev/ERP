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
  produtoVariacoes,
  gruposPrecificacao,
  promocoes,
  promocoesItens,
  pedidos,
  itensPedido,
  cargas,
  pedidosCarga,
  pendencias,
  boletos,
  pagamentosBoleto,
  comissoes,
  planoContas,
  contasFixas,
  contasPagar,
  contasReceber,
  caixaMensal,
  configuracoes,
  counters,
  schemaVersion,
} from "../../drizzle/schema";

// Re-export das tabelas Drizzle (para uso em queries tipadas)
export type {
  users,
  vendedores,
  clientes,
  cores,
  produtos,
  produtoVariacoes,
  gruposPrecificacao,
  promocoes,
  promocoesItens,
  pedidos,
  itensPedido,
  cargas,
  pedidosCarga,
  pendencias,
  boletos,
  pagamentosBoleto,
  comissoes,
  planoContas,
  contasFixas,
  contasPagar,
  contasReceber,
  caixaMensal,
  configuracoes,
  counters,
  schemaVersion,
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

export type ProdutoVariacao = typeof produtoVariacoes.$inferSelect;
export type NewProdutoVariacao = typeof produtoVariacoes.$inferInsert;

export type GrupoPrecificacao = typeof gruposPrecificacao.$inferSelect;
export type NewGrupoPrecificacao = typeof gruposPrecificacao.$inferInsert;

export type Promocao = typeof promocoes.$inferSelect;
export type NewPromocao = typeof promocoes.$inferInsert;

export type PromocaoItem = typeof promocoesItens.$inferSelect;
export type NewPromocaoItem = typeof promocoesItens.$inferInsert;

export type Pedido = typeof pedidos.$inferSelect;
export type NewPedido = typeof pedidos.$inferInsert;

export type ItemPedido = typeof itensPedido.$inferSelect;
export type NewItemPedido = typeof itensPedido.$inferInsert;

export type Carga = typeof cargas.$inferSelect;
export type NewCarga = typeof cargas.$inferInsert;

export type PedidoCarga = typeof pedidosCarga.$inferSelect;
export type NewPedidoCarga = typeof pedidosCarga.$inferInsert;

export type Pendencia = typeof pendencias.$inferSelect;
export type NewPendencia = typeof pendencias.$inferInsert;

export type Boleto = typeof boletos.$inferSelect;
export type NewBoleto = typeof boletos.$inferInsert;

export type PagamentoBoleto = typeof pagamentosBoleto.$inferSelect;
export type NewPagamentoBoleto = typeof pagamentosBoleto.$inferInsert;

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

export type CaixaMensal = typeof caixaMensal.$inferSelect;
export type NewCaixaMensal = typeof caixaMensal.$inferInsert;

export type Configuracao = typeof configuracoes.$inferSelect;
export type NewConfiguracao = typeof configuracoes.$inferInsert;

export type Counter = typeof counters.$inferSelect;
export type NewCounter = typeof counters.$inferInsert;

export type SchemaVersion = typeof schemaVersion.$inferSelect;
