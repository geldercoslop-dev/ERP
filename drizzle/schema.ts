import {
  boolean,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    openId: varchar("open_id", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("login_method", { length: 64 }),
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("users_tenant_id_idx").on(table.tenantId),
    openIdIdx: index("users_open_id_idx").on(table.openId),
  }),
);

export const vendedores = mysqlTable(
  "vendedores",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    userId: int("user_id").references(() => users.id),
    nome: varchar("nome", { length: 255 }).notNull(),
    telefone: varchar("telefone", { length: 20 }),
    email: varchar("email", { length: 320 }),
    senha: varchar("senha", { length: 255 }),
    cidade: varchar("cidade", { length: 255 }),
    admin: boolean("admin").default(false).notNull(),
    ativo: boolean("ativo").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("vendedores_tenant_id_idx").on(table.tenantId),
    userIdIdx: index("vendedores_user_id_idx").on(table.userId),
    nomeIdx: index("vendedores_nome_idx").on(table.nome),
  }),
);

export const cores = mysqlTable("cores", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  nome: varchar("nome", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gruposPrecificacao = mysqlTable("grupos_precificacao", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descontoFabrica: decimal("desconto_fabrica", { precision: 5, scale: 2 }).default("0").notNull(),
  ipi: decimal("ipi", { precision: 5, scale: 2 }).default("0").notNull(),
  frete: decimal("frete", { precision: 10, scale: 2 }).default("0").notNull(),
  montagem: decimal("montagem", { precision: 10, scale: 2 }).default("0").notNull(),
  lucro: decimal("lucro", { precision: 10, scale: 2 }).default("0").notNull(),
  comissao: decimal("comissao", { precision: 5, scale: 2 }).default("0").notNull(),
  jurosCartao: decimal("juros_cartao", { precision: 5, scale: 2 }).default("0").notNull(),
  prazoGarantia: int("prazo_garantia").default(90).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const produtos = mysqlTable(
  "produtos",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    descricao: text("descricao").notNull(),
    marca: varchar("marca", { length: 255 }),
    fornecedor: varchar("fornecedor", { length: 255 }),
    categoria: varchar("categoria", { length: 100 }),
    custo: decimal("custo", { precision: 10, scale: 2 }).default("0").notNull(),
    descontoFabrica: decimal("desconto_fabrica", { precision: 5, scale: 2 }).default("0").notNull(),
    ipi: decimal("ipi", { precision: 5, scale: 2 }).default("0").notNull(),
    frete: decimal("frete", { precision: 10, scale: 2 }).default("0").notNull(),
    montagem: decimal("montagem", { precision: 10, scale: 2 }).default("0").notNull(),
    lucro: decimal("lucro", { precision: 10, scale: 2 }).default("0").notNull(),
    comissao: decimal("comissao", { precision: 5, scale: 2 }).default("0").notNull(),
    jurosCartao: decimal("juros_cartao", { precision: 5, scale: 2 }).default("0").notNull(),
    valorVenda: decimal("valor_venda", { precision: 10, scale: 2 }).default("0").notNull(),
    prazoGarantia: int("prazo_garantia").default(90).notNull(),
    grupoId: int("grupo_id").references(() => gruposPrecificacao.id),
    estoque: int("estoque").default(0).notNull(),
    ativo: boolean("ativo").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("produtos_tenant_id_idx").on(table.tenantId),
    marcaIdx: index("produtos_marca_idx").on(table.marca),
    ativoIdx: index("produtos_ativo_idx").on(table.ativo),
  }),
);

export const promocoes = mysqlTable(
  "promocoes",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    nome: varchar("nome", { length: 255 }).notNull(),
    inicio: timestamp("inicio").notNull(),
    fim: timestamp("fim").notNull(),
    ativo: boolean("ativo").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("promocoes_tenant_id_idx").on(table.tenantId),
    ativoIdx: index("promocoes_ativo_idx").on(table.ativo),
    inicioIdx: index("promocoes_inicio_idx").on(table.inicio),
    fimIdx: index("promocoes_fim_idx").on(table.fim),
  }),
);

export const promocoesItens = mysqlTable(
  "promocoes_itens",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    promocaoId: int("promocao_id")
      .notNull()
      .references(() => promocoes.id, { onDelete: "cascade" }),
    produtoId: int("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    precoPromocional: decimal("preco_promocional", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("promocoes_itens_tenant_id_idx").on(table.tenantId),
    promocaoIdx: index("promocoes_itens_promocao_idx").on(table.promocaoId),
    produtoIdx: index("promocoes_itens_produto_idx").on(table.produtoId),
  }),
);

export const clientes = mysqlTable(
  "clientes",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    nome: varchar("nome", { length: 255 }).notNull(),
    telefone: varchar("telefone", { length: 20 }),
    telefoneNorm: varchar("telefone_norm", { length: 32 }).notNull(),
    nomeNorm: varchar("nome_norm", { length: 120 }).notNull(),
    sobrenomeNorm: varchar("sobrenome_norm", { length: 120 }).notNull(),
    telefoneRecado: varchar("telefone_recado", { length: 20 }),
    rua: text("rua"),
    numero: varchar("numero", { length: 20 }),
    bairro: varchar("bairro", { length: 100 }),
    cidade: varchar("cidade", { length: 100 }),
    uf: varchar("uf", { length: 2 }),
    referencia: text("referencia"),
    condominio: text("condominio"),
    bloco: varchar("bloco", { length: 50 }),
    apartamento: varchar("apartamento", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantLookupIdx: index("clientes_tenant_lookup_idx").on(
      table.tenantId,
      table.telefoneNorm,
      table.nomeNorm,
      table.sobrenomeNorm,
    ),
    nomeIdx: index("clientes_nome_idx").on(table.nome),
    telefoneIdx: index("clientes_telefone_idx").on(table.telefone),
    clienteUnicoNorm: unique("clientes_telefone_nome_sobrenome_unique").on(
      table.telefoneNorm,
      table.nomeNorm,
      table.sobrenomeNorm,
    ),
  }),
);

export const clienteVendedores = mysqlTable(
  "cliente_vendedores",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    clienteId: int("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    vendedorId: int("vendedor_id")
      .notNull()
      .references(() => vendedores.id, { onDelete: "cascade" }),
    tipo: mysqlEnum("tipo", ["PRINCIPAL", "SECUNDARIO"]).default("PRINCIPAL").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    clienteVendedorUnique: unique("cliente_vendedor_unique").on(table.clienteId, table.vendedorId),
    tenantIdIdx: index("cliente_vendedores_tenant_id_idx").on(table.tenantId),
    clienteIdx: index("cliente_vendedores_cliente_idx").on(table.clienteId),
    vendedorIdx: index("cliente_vendedores_vendedor_idx").on(table.vendedorId),
  }),
);

export const pedidos = mysqlTable(
  "pedidos",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    numero: int("numero").notNull().unique(),
    vendedorId: int("vendedor_id").notNull().references(() => vendedores.id),
    clienteId: int("cliente_id").notNull().references(() => clientes.id),
    clienteNome: varchar("cliente_nome", { length: 255 }).notNull(),
    clienteTelefone: varchar("cliente_telefone", { length: 20 }),
    clienteTelefoneRecado: varchar("cliente_telefone_recado", { length: 20 }),
    clienteRua: text("cliente_rua"),
    clienteNumero: varchar("cliente_numero", { length: 20 }),
    clienteBairro: varchar("cliente_bairro", { length: 100 }),
    clienteCidade: varchar("cliente_cidade", { length: 100 }),
    clienteUf: varchar("cliente_uf", { length: 2 }),
    clienteReferencia: text("cliente_referencia"),
    clienteCondominio: text("cliente_condominio"),
    clienteBloco: varchar("cliente_bloco", { length: 50 }),
    clienteApartamento: varchar("cliente_apartamento", { length: 50 }),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0").notNull(),
    desconto: decimal("desconto", { precision: 10, scale: 2 }).default("0").notNull(),
    frete: decimal("frete", { precision: 10, scale: 2 }).default("0").notNull(),
    acrescimo: decimal("acrescimo", { precision: 10, scale: 2 }).default("0").notNull(),
    total: decimal("total", { precision: 10, scale: 2 }).default("0").notNull(),
    dataCriacao: timestamp("data_criacao").defaultNow().notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    formaPagamento: varchar("forma_pagamento", { length: 100 }),
    dataEntrega: timestamp("data_entrega"),
    garantiaInicio: timestamp("garantia_inicio"),
    observacoes: text("observacoes"),
    conferidoEm: timestamp("conferido_em"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("pedidos_tenant_id_idx").on(table.tenantId),
    vendedorIdx: index("pedidos_vendedor_idx").on(table.vendedorId),
    clienteIdx: index("pedidos_cliente_idx").on(table.clienteId),
    statusIdx: index("pedidos_status_idx").on(table.status),
    numeroIdx: index("pedidos_numero_idx").on(table.numero),
    createdAtIdx: index("pedidos_created_at_idx").on(table.createdAt),
  }),
);

export const itensPedido = mysqlTable(
  "itens_pedido",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    pedidoId: int("pedido_id").notNull().references(() => pedidos.id, { onDelete: "cascade" }),
    tipo: mysqlEnum("tipo", ["LIVRE", "CATALOGO"]).default("LIVRE").notNull(),
    produtoId: int("produto_id").references(() => produtos.id),
    corId: int("cor_id").references(() => cores.id),
    corNome: varchar("cor_nome", { length: 100 }),
    descricao: text("descricao").notNull(),
    marca: varchar("marca", { length: 255 }),
    quantidade: int("quantidade").default(1).notNull(),
    valorUnitario: decimal("valor_unitario", { precision: 10, scale: 2 }).default("0").notNull(),
    custo: decimal("custo", { precision: 10, scale: 2 }).default("0").notNull(),
    prazoGarantia: int("prazo_garantia").default(90).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("itens_pedido_tenant_id_idx").on(table.tenantId),
    pedidoIdx: index("itens_pedido_pedido_idx").on(table.pedidoId),
  }),
);

export const cargas = mysqlTable(
  "cargas",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    numero: int("numero").notNull().unique(),
    cidadeRota: varchar("cidade_rota", { length: 100 }),
    dataEntrega: timestamp("data_entrega"),
    status: varchar("status", { length: 50 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("cargas_tenant_id_idx").on(table.tenantId),
    statusIdx: index("cargas_status_idx").on(table.status),
    numeroIdx: index("cargas_numero_idx").on(table.numero),
  }),
);

export const pedidosCarga = mysqlTable(
  "pedidos_carga",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    cargaId: int("carga_id").notNull().references(() => cargas.id, { onDelete: "cascade" }),
    pedidoId: int("pedido_id").notNull().references(() => pedidos.id),
    numeroPedido: int("numero_pedido"),
    clienteNome: varchar("cliente_nome", { length: 255 }),
    valorTotal: decimal("valor_total", { precision: 10, scale: 2 }).default("0"),
    entregue: boolean("entregue").default(false).notNull(),
    dataBaixa: timestamp("data_baixa"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("pedidos_carga_tenant_id_idx").on(table.tenantId),
    cargaIdx: index("pedidos_carga_carga_idx").on(table.cargaId),
    pedidoIdx: index("pedidos_carga_pedido_idx").on(table.pedidoId),
  }),
);

export const boletos = mysqlTable(
  "boletos",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    pedidoId: int("pedido_id").notNull().references(() => pedidos.id),
    clienteId: int("cliente_id").notNull().references(() => clientes.id),
    vendedorId: int("vendedor_id").notNull().references(() => vendedores.id),
    numeroPedido: int("numero_pedido").notNull(),
    valorOriginal: decimal("valor_original", { precision: 10, scale: 2 }).notNull(),
    valorAberto: decimal("valor_aberto", { precision: 10, scale: 2 }).notNull(),
    dataVencimento: timestamp("data_vencimento").notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    codigoBarras: varchar("codigo_barras", { length: 100 }),
    pixCopiaECola: text("pix_copia_e_cola"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("boletos_tenant_id_idx").on(table.tenantId),
    clienteIdx: index("boletos_cliente_idx").on(table.clienteId),
    statusIdx: index("boletos_status_idx").on(table.status),
    vencimentoIdx: index("boletos_vencimento_idx").on(table.dataVencimento),
  }),
);

export const planoContas = mysqlTable(
  "plano_contas",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    nome: varchar("nome", { length: 255 }).notNull(),
    tipo: mysqlEnum("tipo", ["RECEITA", "DESPESA"]).notNull(),
    ativo: boolean("ativo").default(true).notNull(),
  },
  (table) => ({
    tenantIdIdx: index("plano_contas_tenant_id_idx").on(table.tenantId),
    tenantNomeIdx: unique("plano_contas_tenant_nome_idx").on(table.tenantId, table.nome),
  }),
);

export const fornecedores = mysqlTable(
  "fornecedores",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    nome: varchar("nome", { length: 255 }).notNull(),
    telefone: varchar("telefone", { length: 20 }),
    email: varchar("email", { length: 320 }),
    tipo: varchar("tipo", { length: 100 }),
    observacoes: text("observacoes"),
    ativo: boolean("ativo").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    nomeIdx: index("fornecedores_nome_idx").on(table.nome),
  }),
);

export const contasFixas = mysqlTable(
  "contas_fixas",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    nome: varchar("nome", { length: 255 }),
    descricao: varchar("descricao", { length: 255 }),
    valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
    diaVencimento: int("dia_vencimento").notNull(),
    fornecedorId: int("fornecedor_id").references(() => fornecedores.id),
    planoContasId: int("plano_contas_id").references(() => planoContas.id),
    ativo: boolean("ativo").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("contas_fixas_tenant_id_idx").on(table.tenantId),
  }),
);

export const contasPagar = mysqlTable(
  "contas_pagar",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    contaFixaId: int("conta_fixa_id").references(() => contasFixas.id),
    fornecedorId: int("fornecedor_id").references(() => fornecedores.id),
    descricao: varchar("descricao", { length: 255 }).notNull(),
    valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
    dataVencimento: timestamp("data_vencimento").notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    dataPagamento: timestamp("data_pagamento"),
    planoContasId: int("plano_contas_id").references(() => planoContas.id),
    fornecedor: varchar("fornecedor", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("contas_pagar_tenant_id_idx").on(table.tenantId),
    statusIdx: index("contas_pagar_status_idx").on(table.status),
    vencimentoIdx: index("contas_pagar_vencimento_idx").on(table.dataVencimento),
  }),
);

export const contasReceber = mysqlTable(
  "contas_receber",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    pedidoId: int("pedido_id").references(() => pedidos.id),
    pedidoNumero: int("pedido_numero"),
    clienteId: int("cliente_id").references(() => clientes.id),
    clienteNome: varchar("cliente_nome", { length: 255 }).notNull(),
    vendedorId: int("vendedor_id"),
    descricao: varchar("descricao", { length: 255 }).notNull(),
    valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
    dataVencimento: timestamp("data_vencimento").notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    dataRecebimento: timestamp("data_recebimento"),
    formaPagamento: mysqlEnum("forma_pagamento", ["PIX", "BOLETO", "CARTAO", "DINHEIRO"]),
    observacoes: text("observacoes"),
    planoContasId: int("plano_contas_id").references(() => planoContas.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("contas_receber_tenant_id_idx").on(table.tenantId),
    statusIdx: index("contas_receber_status_idx").on(table.status),
    vencimentoIdx: index("contas_receber_vencimento_idx").on(table.dataVencimento),
    clienteIdx: index("contas_receber_cliente_idx").on(table.clienteId),
  }),
);

export const caixaMensal = mysqlTable(
  "caixa_mensal",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    mesAno: varchar("mes_ano", { length: 7 }).notNull(),
    totalPix: decimal("total_pix", { precision: 12, scale: 2 }).default("0").notNull(),
    totalBoleto: decimal("total_boleto", { precision: 12, scale: 2 }).default("0").notNull(),
    totalCartao: decimal("total_cartao", { precision: 12, scale: 2 }).default("0").notNull(),
    totalDinheiro: decimal("total_dinheiro", { precision: 12, scale: 2 }).default("0").notNull(),
    totalGeral: decimal("total_geral", { precision: 12, scale: 2 }).default("0").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("caixa_mensal_tenant_id_idx").on(table.tenantId),
    tenantMesAnoIdx: unique("caixa_mensal_tenant_mes_ano_idx").on(table.tenantId, table.mesAno),
  }),
);

export const comissoes = mysqlTable(
  "comissoes",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    vendedorId: int("vendedor_id").notNull().references(() => vendedores.id),
    pedidoId: int("pedido_id").notNull().references(() => pedidos.id),
    cargaId: int("carga_id").references(() => cargas.id),
    valorVenda: decimal("valor_venda", { precision: 10, scale: 2 }).default("0").notNull(),
    percentualComissao: decimal("percentual_comissao", { precision: 5, scale: 2 }).default("0").notNull(),
    valorComissao: decimal("valor_comissao", { precision: 10, scale: 2 }).default("0").notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    dataPagamento: timestamp("data_pagamento"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("comissoes_tenant_id_idx").on(table.tenantId),
    vendedorIdx: index("comissoes_vendedor_idx").on(table.vendedorId),
    pedidoIdx: index("comissoes_pedido_idx").on(table.pedidoId),
    statusIdx: index("comissoes_status_idx").on(table.status),
  }),
);

export const pendencias = mysqlTable("pendencias", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  pedidoId: int("pedido_id").notNull().references(() => pedidos.id),
  vendedorId: int("vendedor_id").notNull().references(() => vendedores.id),
  produtoId: int("produto_id").notNull().references(() => produtos.id),
  corId: int("cor_id").references(() => cores.id),
  quantidade: int("quantidade").notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  dataPedido: timestamp("data_pedido").defaultNow().notNull(),
  dataResolvido: timestamp("data_resolvido"),
});

export const counters = mysqlTable(
  "counters",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    name: varchar("name", { length: 50 }).notNull().unique(),
    seq: int("seq").notNull().default(0),
    free: text("free"),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    countersTenantNameIdx: index("counters_tenant_name_idx").on(table.tenantId, table.name),
  }),
);

// Tabela GLOBAL: NÃO multi-tenant. Uso restrito, documentado explicitamente.
// EXCEÇÃO: Não possui tenantId por design. Qualquer acesso deve ser validado e isolado por service.
export const configuracoes = mysqlTable("configuracoes", {
  id: int("id").primaryKey().autoincrement(),
  chave: varchar("chave", { length: 64 }).notNull().unique(),
  valor: text("valor").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const idempotencyKeys = mysqlTable(
  "idempotency_keys",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    key: varchar("key", { length: 64 }).notNull(),
    commandName: varchar("command_name", { length: 64 }).notNull(),
    resultJson: text("result_json"),
    traceId: varchar("trace_id", { length: 32 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index("idempotency_keys_tenant_id_idx").on(table.tenantId),
    keyIdx: index("idempotency_key_idx").on(table.key),
    createdAtIdx: index("idempotency_created_at_idx").on(table.createdAt),
    idempotencyCmdKey: unique("idempotency_cmd_key").on(table.commandName, table.key),
  }),
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    actorUserId: int("actor_user_id"),
    actorVendedorId: int("actor_vendedor_id"),
    action: varchar("action", { length: 32 }).notNull(),
    entity: varchar("entity", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }),
    payloadJson: text("payload_json"),
    traceId: varchar("trace_id", { length: 32 }),
    ip: varchar("ip", { length: 45 }), // IPv4 ou IPv6
    userAgent: text("user_agent"),
    severity: varchar("severity", { length: 10 }).notNull().default("INFO"),
    source: varchar("source", { length: 20 }).notNull().default("api"),
  },
  (table) => ({
    entityIdx: index("audit_entity_idx").on(table.entity),
    entityIdIdx: index("audit_entity_id_idx").on(table.entityId),
    createdAtIdx: index("audit_created_at_idx").on(table.createdAt),
    ipIdx: index("audit_ip_idx").on(table.ip),
  }),
);

export const financialIdempotency = mysqlTable(
  "financial_idempotency",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    operationKey: varchar("operation_key", { length: 255 }).notNull(),
    operationType: mysqlEnum("operation_type", ["BAIXA_BOLETO", "CREDITO_CAIXA"]).notNull(),
    processedAt: timestamp("processed_at").defaultNow().notNull(),
    metadata: text("metadata"),
  },
  (table) => ({
    tenantOperationIdx: unique("tenant_operation_idx").on(
      table.tenantId,
      table.operationKey,
      table.operationType,
    ),
    operationKeyIdx: index("operation_key_idx").on(table.operationKey),
    tenantIdIdx: index("financial_idempotency_tenant_id_idx").on(table.tenantId),
  }),
);
