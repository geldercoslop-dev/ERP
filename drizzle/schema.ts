import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * SCHEMA DO SISTEMA DE GESTÃO DE VENDAS
 */

// ===== USUÁRIOS E VENDEDORES =====
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const vendedores = mysqlTable("vendedores", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
  nome: varchar("nome", { length: 255 }).notNull(),
  telefone: varchar("telefone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  senha: varchar("senha", { length: 255 }),
  cidade: varchar("cidade", { length: 255 }),
  admin: boolean("admin").default(false).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  nomeIdx: index("nome_idx").on(table.nome),
  telefoneIdx: index("telefone_idx").on(table.telefone),
}));

// ===== PRODUTOS E CORES =====
export const cores = mysqlTable("cores", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const produtos = mysqlTable("produtos", {
  id: int("id").autoincrement().primaryKey(),
  descricao: text("descricao").notNull(),
  marca: varchar("marca", { length: 255 }),
  fornecedor: varchar("fornecedor", { length: 255 }),
  categoria: varchar("categoria", { length: 100 }),
  custo: decimal("custo", { precision: 10, scale: 2 }).default("0").notNull(),
  descontoFabrica: decimal("descontoFabrica", { precision: 5, scale: 2 }).default("0").notNull(),
  ipi: decimal("ipi", { precision: 5, scale: 2 }).default("0").notNull(),
  frete: decimal("frete", { precision: 10, scale: 2 }).default("0").notNull(),
  montagem: decimal("montagem", { precision: 10, scale: 2 }).default("0").notNull(),
  lucro: decimal("lucro", { precision: 10, scale: 2 }).default("0").notNull(),
  comissao: decimal("comissao", { precision: 5, scale: 2 }).default("0").notNull(),
  jurosCartao: decimal("jurosCartao", { precision: 5, scale: 2 }).default("0").notNull(),
  valorVenda: decimal("valorVenda", { precision: 10, scale: 2 }).default("0").notNull(),
  prazoGarantia: int("prazoGarantia").default(90).notNull(),
  grupoId: int("grupoId").references(() => gruposPrecificacao.id),
  estoque: int("estoque").default(0).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  marcaIdx: index("marca_idx").on(table.marca),
}));

export const produtoVariacoes = mysqlTable("produto_variacoes", {
  id: int("id").autoincrement().primaryKey(),
  produtoId: int("produtoId").notNull().references(() => produtos.id, { onDelete: "cascade" }),
  corId: int("corId").references(() => cores.id),
  tamanho: varchar("tamanho", { length: 100 }), // Ex: 2.30m, 2.50m
  temEspelho: boolean("temEspelho").default(false),
  acrescimoCusto: decimal("acrescimoCusto", { precision: 10, scale: 2 }).default("0"),
  estoque: int("estoque").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===== PROMOÇÕES =====
// Promoções são independentes do preço base do produto.
// O estoque/pedido sempre usa o "preço vigente" (promo ativa => preço promocional).
export const promocoes = mysqlTable(
  "promocoes",
  {
    id: int("id").autoincrement().primaryKey(),
    nome: varchar("nome", { length: 255 }).notNull(),
    inicio: timestamp("inicio").notNull(),
    fim: timestamp("fim").notNull(),
    ativo: boolean("ativo").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    ativoIdx: index("promocoes_ativo_idx").on(table.ativo),
    inicioIdx: index("promocoes_inicio_idx").on(table.inicio),
    fimIdx: index("promocoes_fim_idx").on(table.fim),
  })
);

export const promocoesItens = mysqlTable(
  "promocoes_itens",
  {
    id: int("id").autoincrement().primaryKey(),
    promocaoId: int("promocaoId")
      .notNull()
      .references(() => promocoes.id, { onDelete: "cascade" }),
    produtoId: int("produtoId")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    precoPromocional: decimal("precoPromocional", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    promocaoIdx: index("promocoes_itens_promocao_idx").on(table.promocaoId),
    produtoIdx: index("promocoes_itens_produto_idx").on(table.produtoId),
  })
);

export const gruposPrecificacao = mysqlTable("grupos_precificacao", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descontoFabrica: decimal("descontoFabrica", { precision: 5, scale: 2 }).default("0").notNull(),
  ipi: decimal("ipi", { precision: 5, scale: 2 }).default("0").notNull(),
  frete: decimal("frete", { precision: 10, scale: 2 }).default("0").notNull(),
  montagem: decimal("montagem", { precision: 10, scale: 2 }).default("0").notNull(),
  lucro: decimal("lucro", { precision: 10, scale: 2 }).default("0").notNull(),
  comissao: decimal("comissao", { precision: 5, scale: 2 }).default("0").notNull(),
  jurosCartao: decimal("jurosCartao", { precision: 5, scale: 2 }).default("0").notNull(),
  prazoGarantia: int("prazoGarantia").default(90).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ===== CLIENTES =====
export const clientes = mysqlTable("clientes", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  telefone: varchar("telefone", { length: 20 }),
  telefoneRecado: varchar("telefoneRecado", { length: 20 }),
  rua: text("rua"),
  numero: varchar("numero", { length: 20 }),
  bairro: varchar("bairro", { length: 100 }),
  cidade: varchar("cidade", { length: 100 }),
  uf: varchar("uf", { length: 2 }),
  referencia: text("referencia"),
  condominio: text("condominio"),
  bloco: varchar("bloco", { length: 50 }),
  apartamento: varchar("apartamento", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  nomeIdx: index("nome_idx").on(table.nome),
  telefoneIdx: index("telefone_idx").on(table.telefone),
}));

// ===== PEDIDOS =====
export const pedidos = mysqlTable("pedidos", {
  id: int("id").autoincrement().primaryKey(),
  numero: int("numero").notNull().unique(),
  vendedorId: int("vendedorId").notNull().references(() => vendedores.id),
  clienteId: int("clienteId").notNull().references(() => clientes.id),
  clienteNome: varchar("clienteNome", { length: 255 }).notNull(),
  clienteTelefone: varchar("clienteTelefone", { length: 20 }),
  clienteTelefoneRecado: varchar("clienteTelefoneRecado", { length: 20 }),
  clienteRua: text("clienteRua"),
  clienteNumero: varchar("clienteNumero", { length: 20 }),
  clienteBairro: varchar("clienteBairro", { length: 100 }),
  clienteCidade: varchar("clienteCidade", { length: 100 }),
  clienteUf: varchar("clienteUf", { length: 2 }),
  clienteReferencia: text("clienteReferencia"),
  clienteCondominio: text("clienteCondominio"),
  clienteBloco: varchar("clienteBloco", { length: 50 }),
  clienteApartamento: varchar("clienteApartamento", { length: 50 }),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0").notNull(),
  desconto: decimal("desconto", { precision: 10, scale: 2 }).default("0").notNull(),
  frete: decimal("frete", { precision: 10, scale: 2 }).default("0").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).default("0").notNull(),
  // IMPORTANTE: o status "EM_ROTA" é usado pelo módulo de Cargas.
  status: mysqlEnum("status", ["GERADO", "IMPRESSO", "EM_ROTA", "ENTREGUE", "CANCELADO"]).default("GERADO").notNull(),
  formaPagamento: varchar("formaPagamento", { length: 100 }), // Pode conter múltiplas formas JSON
  dataEntrega: timestamp("dataEntrega"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  vendedorIdx: index("vendedor_idx").on(table.vendedorId),
  clienteIdx: index("cliente_idx").on(table.clienteId),
  statusIdx: index("status_idx").on(table.status),
  numeroIdx: index("numero_idx").on(table.numero),
}));

export const itensPedido = mysqlTable("itens_pedido", {
  id: int("id").autoincrement().primaryKey(),
  pedidoId: int("pedidoId").notNull().references(() => pedidos.id, { onDelete: "cascade" }),
  tipo: mysqlEnum("tipo", ["LIVRE", "CATALOGO"]).default("LIVRE").notNull(),
  produtoId: int("produtoId").references(() => produtos.id),
  corId: int("corId").references(() => cores.id),
  corNome: varchar("corNome", { length: 100 }),
  descricao: text("descricao").notNull(),
  marca: varchar("marca", { length: 255 }),
  quantidade: int("quantidade").default(1).notNull(),
  valorUnitario: decimal("valorUnitario", { precision: 10, scale: 2 }).default("0").notNull(),
  custo: decimal("custo", { precision: 10, scale: 2 }).default("0").notNull(),
  prazoGarantia: int("prazoGarantia").default(90).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  pedidoIdx: index("pedido_idx").on(table.pedidoId),
}));

// ===== CARGAS E ENTREGAS =====
export const cargas = mysqlTable("cargas", {
  id: int("id").autoincrement().primaryKey(),
  numero: int("numero").notNull().unique(),
  cidadeRota: varchar("cidadeRota", { length: 100 }),
  dataEntrega: timestamp("dataEntrega"),
  // "EM_ROTA" = caminhão saiu / carga liberada.
  status: mysqlEnum("status", ["ABERTA","EM_ROTA","ENTREGUE"]).default("ABERTA").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  statusIdx: index("status_idx").on(table.status),
  numeroIdx: index("numero_idx").on(table.numero),
}));

export const pedidosCarga = mysqlTable("pedidos_carga", {
  id: int("id").autoincrement().primaryKey(),
  cargaId: int("cargaId").notNull().references(() => cargas.id, { onDelete: "cascade" }),
  pedidoId: int("pedidoId").notNull().references(() => pedidos.id),
  entregue: boolean("entregue").default(false).notNull(),
  dataBaixa: timestamp("dataBaixa"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  cargaIdx: index("carga_idx").on(table.cargaId),
  pedidoIdx: index("pedido_idx").on(table.pedidoId),
}));

// ===== FINANCEIRO E BOLETOS =====
export const boletos = mysqlTable("boletos", {
  id: int("id").autoincrement(), // Removido .primaryKey() para evitar conflito se já existir no banco
  pedidoId: int("pedidoId").notNull().references(() => pedidos.id),
  clienteId: int("clienteId").notNull().references(() => clientes.id),
  vendedorId: int("vendedorId").notNull().references(() => vendedores.id),
  numeroPedido: int("numeroPedido").notNull(),
  valorOriginal: decimal("valorOriginal", { precision: 10, scale: 2 }).notNull(),
  valorAberto: decimal("valorAberto", { precision: 10, scale: 2 }).notNull(),
  dataVencimento: timestamp("dataVencimento").notNull(),
  status: mysqlEnum("status", ["ABERTO", "PARCIAL", "PAGO", "ATRASADO"]).default("ABERTO").notNull(),
  codigoBarras: varchar("codigoBarras", { length: 100 }),
  pixCopiaECola: text("pixCopiaECola"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  clienteIdx: index("cliente_idx").on(table.clienteId),
  statusIdx: index("status_idx").on(table.status),
  vencimentoIdx: index("vencimento_idx").on(table.dataVencimento),
}));

export const pagamentosBoleto = mysqlTable("pagamentos_boleto", {
  id: int("id").autoincrement().primaryKey(),
  boletoId: int("boletoId").notNull().references(() => boletos.id),
  valorPago: decimal("valorPago", { precision: 10, scale: 2 }).notNull(),
  dataPagamento: timestamp("dataPagamento").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===== FINANCEIRO GERAL =====
export const comissoes = mysqlTable("comissoes", {
  id: int("id").autoincrement().primaryKey(),
  vendedorId: int("vendedorId").notNull().references(() => vendedores.id),
  pedidoId: int("pedidoId").notNull().references(() => pedidos.id),
  valorVenda: decimal("valorVenda", { precision: 10, scale: 2 }).default("0").notNull(),
  percentualComissao: decimal("percentualComissao", { precision: 5, scale: 2 }).default("0").notNull(),
  valorComissao: decimal("valorComissao", { precision: 10, scale: 2 }).default("0").notNull(),
  status: mysqlEnum("status", ["PENDENTE", "PAGA"]).default("PENDENTE").notNull(),
  dataPagamento: timestamp("dataPagamento"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const planoContas = mysqlTable("plano_contas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  tipo: mysqlEnum("tipo", ["RECEITA", "DESPESA"]).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
});

export const contasFixas = mysqlTable("contas_fixas", {
  id: int("id").autoincrement().primaryKey(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  diaVencimento: int("diaVencimento").notNull(),
  planoContaId: int("planoContaId").references(() => planoContas.id),
  ativo: boolean("ativo").default(true).notNull(),
});

export const contasPagar = mysqlTable("contas_pagar", {
  id: int("id").autoincrement().primaryKey(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  dataVencimento: timestamp("dataVencimento").notNull(),
  status: mysqlEnum("status", ["PENDENTE", "PAGO"]).default("PENDENTE").notNull(),
  dataPagamento: timestamp("dataPagamento"),
  planoContaId: int("planoContaId").references(() => planoContas.id),
  fornecedorId: int("fornecedorId"),
});

export const contasReceber = mysqlTable("contas_receber", {
  id: int("id").autoincrement().primaryKey(),
  pedidoNumero: int("pedidoNumero"),
  clienteNome: varchar("clienteNome", { length: 255 }).notNull(),
  vendedorId: int("vendedorId"),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  dataVencimento: timestamp("dataVencimento").notNull(),
  status: mysqlEnum("status", ["PENDENTE", "RECEBIDA"]).default("PENDENTE").notNull(),
  dataRecebimento: timestamp("dataRecebimento"),
  formaPagamento: mysqlEnum("formaPagamento", ["PIX", "BOLETO", "CARTAO", "DINHEIRO"]),
  observacoes: text("observacoes"),
});

export const caixaMensal = mysqlTable("caixa_mensal", {
  id: int("id").autoincrement().primaryKey(),
  mesAno: varchar("mesAno", { length: 7 }).notNull().unique(), // YYYY-MM
  totalPix: decimal("totalPix", { precision: 12, scale: 2 }).default("0").notNull(),
  totalBoleto: decimal("totalBoleto", { precision: 12, scale: 2 }).default("0").notNull(),
  totalCartao: decimal("totalCartao", { precision: 12, scale: 2 }).default("0").notNull(),
  totalDinheiro: decimal("totalDinheiro", { precision: 12, scale: 2 }).default("0").notNull(),
  totalGeral: decimal("totalGeral", { precision: 12, scale: 2 }).default("0").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const pendencias = mysqlTable("pendencias", {
  id: int("id").autoincrement().primaryKey(),
  pedidoId: int("pedidoId").notNull().references(() => pedidos.id),
  vendedorId: int("vendedorId").notNull().references(() => vendedores.id),
  produtoId: int("produtoId").notNull().references(() => produtos.id),
  corId: int("corId").references(() => cores.id),
  quantidade: int("quantidade").notNull(),
  status: mysqlEnum("status", ["PENDENTE", "COMPRADO", "RESOLVIDO"]).default("PENDENTE").notNull(),
  dataPedido: timestamp("dataPedido").defaultNow().notNull(),
  dataResolvido: timestamp("dataResolvido"),
});

export const counters = mysqlTable("counters", {
  id: int("id").autoincrement().primaryKey(),
  // IMPORTANTE: deve bater com as migrations (0001_busy_vargas.sql)
  // para a numeração global reaproveitável funcionar (seq + lista de livres).
  name: varchar("name", { length: 50 }).notNull().unique(),
  seq: int("seq").notNull().default(0),
  free: text("free"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const configuracoes = mysqlTable("configuracoes", {
  id: int("id").autoincrement().primaryKey(),
  chave: varchar("chave", { length: 64 }).notNull().unique(),
  valor: text("valor").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Controle de versão do schema (usado por /api/health). id=1 único.
export const schemaVersion = mysqlTable("schema_version", {
  id: int("id").primaryKey(), // sempre 1
  version: int("version").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
