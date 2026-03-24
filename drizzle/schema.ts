import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, index, unique } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Tipos de status para melhor tipagem
export type PedidoStatus = "GERADO" | "IMPRESSO" | "EM_ROTA" | "ENTREGUE" | "CANCELADO" | "PENDENTE_ESTOQUE";
export type CargaStatus = "ABERTA" | "EM_ROTA" | "ENTREGUE";
export type ContaReceberStatus = "ABERTO" | "PARCIAL" | "PAGO" | "ATRASADO";
export type ContaPagarStatus = "PENDENTE" | "PAGO";
export type ComissaoStatus = "PENDENTE" | "PAGA";
export type PendenciaStatus = "PENDENTE" | "COMPRADO" | "RESOLVIDO";

/**
 * SCHEMA DO SISTEMA DE GESTÃO DE VENDAS
 */

// ===== USUÁRIOS E VENDEDORES =====
export const users = mysqlTable("users", {
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
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  openIdIdx: index("open_id_idx").on(table.openId),
}));

export const vendedores = mysqlTable("vendedores", {
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
}, (table) => ({
  tenantIdIdx: index("vendedores_tenant_id_idx").on(table.tenantId),
  userIdIdx: index("vendedores_user_id_idx").on(table.userId),
  nomeIdx: index("nome_idx").on(table.nome),
  telefoneIdx: index("telefone_idx").on(table.telefone),
}));

// ===== PRODUTOS E CORES =====
export const cores = mysqlTable("cores", {
  id: int("id").primaryKey().autoincrement(),
  nome: varchar("nome", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const produtos = mysqlTable("produtos", {
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
}, (table) => ({
  tenantIdIdx: index("produtos_tenant_id_idx").on(table.tenantId),
  descricaoIdx: index("produtos_descricao_idx").on(table.descricao),
  marcaIdx: index("marca_idx").on(table.marca),
  ativoIdx: index("produtos_ativo_idx").on(table.ativo),
}));

export const produtoVariacoes = mysqlTable("produto_variacoes", {
  id: int("id").primaryKey().autoincrement(),
  produtoId: int("produto_id").notNull().references(() => produtos.id, { onDelete: "cascade" }),
  corId: int("cor_id").references(() => cores.id),
  tamanho: varchar("tamanho", { length: 100 }), // Ex: 2.30m, 2.50m
  temEspelho: boolean("tem_espelho").default(false),
  acrescimoCusto: decimal("acrescimo_custo", { precision: 10, scale: 2 }).default("0"),
  estoque: int("estoque").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===== PROMOÇÕES =====
// Promoções são independentes do preço base do produto.
// O estoque/pedido sempre usa o "preço vigente" (promo ativa => preço promocional).
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
    ativoIdx: index("promocoes_ativo_idx").on(table.ativo),
    inicioIdx: index("promocoes_inicio_idx").on(table.inicio),
    fimIdx: index("promocoes_fim_idx").on(table.fim),
  })
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
    promocaoIdx: index("promocoes_itens_promocao_idx").on(table.promocaoId),
    produtoIdx: index("promocoes_itens_produto_idx").on(table.produtoId),
  })
);

export const gruposPrecificacao = mysqlTable("grupos_precificacao", {
  id: int("id").primaryKey().autoincrement(),
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

// ===== CLIENTES (global; único por telefoneNorm+nomeNorm+sobrenomeNorm) =====
export const clientes = mysqlTable("clientes", {
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
}, (table) => ({
  nomeIdx: index("nome_idx").on(table.nome),
  telefoneIdx: index("telefone_idx").on(table.telefone),
  /** Lookup em createVenda (tenant + normas) — reduz range scan */
  tenantLookupIdx: index("clientes_tenant_lookup_idx").on(
    table.tenantId,
    table.telefoneNorm,
    table.nomeNorm,
    table.sobrenomeNorm
  ),
  clienteUnicoNorm: unique("clientes_telefone_nome_sobrenome_unique").on(table.telefoneNorm, table.nomeNorm, table.sobrenomeNorm),
}));

// Vínculo cliente ↔ vendedor (visibilidade / quem atende). 1 cliente pode ter vários vendedores (PRINCIPAL/SECUNDARIO).
export const clienteVendedores = mysqlTable(
  "cliente_vendedores",
  {
    id: int("id").primaryKey().autoincrement(),
    clienteId: int("cliente_id").notNull().references(() => clientes.id, { onDelete: "cascade" }),
    vendedorId: int("vendedor_id").notNull().references(() => vendedores.id, { onDelete: "cascade" }),
    tipo: mysqlEnum("tipo", ["PRINCIPAL", "SECUNDARIO"]).default("PRINCIPAL").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    clienteVendedorUnique: unique("cliente_vendedor_unique").on(table.clienteId, table.vendedorId),
    clienteIdx: index("cliente_vendedores_cliente_idx").on(table.clienteId),
    vendedorIdx: index("cliente_vendedores_vendedor_idx").on(table.vendedorId),
  })
);

// ===== PEDIDOS =====
export const pedidos = mysqlTable("pedidos", {
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
  total: decimal("total", { precision: 10, scale: 2 }).default("0").notNull(),
  dataCriacao: timestamp("data_criacao").defaultNow().notNull(),
  /** Ver `server/shared/domain-status.ts` → PedidoStatusValues (inclui EM_ROTA para logística). */
  status: varchar("status", { length: 50 }).notNull(),
  formaPagamento: varchar("forma_pagamento", { length: 100 }), // Pode conter múltiplas formas JSON
  dataEntrega: timestamp("data_entrega"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdIdx: index("pedidos_tenant_id_idx").on(table.tenantId),
  vendedorIdx: index("vendedor_idx").on(table.vendedorId),
  clienteIdx: index("cliente_idx").on(table.clienteId),
  statusIdx: index("status_idx").on(table.status),
  numeroIdx: index("numero_idx").on(table.numero),
  createdAtIdx: index("pedidos_created_at_idx").on(table.createdAt),
}));

export const itensPedido = mysqlTable("itens_pedido", {
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
}, (table) => ({
  pedidoIdx: index("pedido_idx").on(table.pedidoId),
}));

// ===== CARGAS E ENTREGAS =====
export const cargas = mysqlTable("cargas", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  numero: int("numero").notNull().unique(),
  cidadeRota: varchar("cidade_rota", { length: 100 }),
  dataEntrega: timestamp("data_entrega"),
  /** Ver `server/shared/domain-status.ts` → CargaStatus / CargaStatusValues. */
  status: varchar("status", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  statusIdx: index("status_idx").on(table.status),
  numeroIdx: index("numero_idx").on(table.numero),
}));

export const pedidosCarga = mysqlTable("pedidos_carga", {
  id: int("id").primaryKey().autoincrement(),
  cargaId: int("carga_id").notNull().references(() => cargas.id, { onDelete: "cascade" }),
  pedidoId: int("pedido_id").notNull().references(() => pedidos.id),
  entregue: boolean("entregue").default(false).notNull(),
  dataBaixa: timestamp("data_baixa"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  cargaIdx: index("carga_idx").on(table.cargaId),
  pedidoIdx: index("pedido_idx").on(table.pedidoId),
}));

// ===== FINANCEIRO E BOLETOS =====
export const boletos = mysqlTable("boletos", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  pedidoId: int("pedido_id").notNull().references(() => pedidos.id),
  clienteId: int("cliente_id").notNull().references(() => clientes.id),
  vendedorId: int("vendedor_id").notNull().references(() => vendedores.id),
  numeroPedido: int("numero_pedido").notNull(),
  valorOriginal: decimal("valor_original", { precision: 10, scale: 2 }).notNull(),
  valorAberto: decimal("valor_aberto", { precision: 10, scale: 2 }).notNull(),
  dataVencimento: timestamp("data_vencimento").notNull(),
  /** Ver `server/shared/finance-status.ts` → BoletoStatus (ABERTO | PAGO | PARCIAL | ATRASADO) */
  status: varchar("status", { length: 50 }).notNull(),
  codigoBarras: varchar("codigo_barras", { length: 100 }),
  pixCopiaECola: text("pix_copia_e_cola"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  clienteIdx: index("cliente_idx").on(table.clienteId),
  statusIdx: index("status_idx").on(table.status),
  vencimentoIdx: index("vencimento_idx").on(table.dataVencimento),
}));

export const pagamentosBoleto = mysqlTable("pagamentos_boleto", {
  id: int("id").primaryKey().autoincrement(),
  boletoId: int("boleto_id").notNull().references(() => boletos.id),
  valorPago: decimal("valor_pago", { precision: 10, scale: 2 }).notNull(),
  dataPagamento: timestamp("data_pagamento").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===== FINANCEIRO GERAL =====
export const comissoes = mysqlTable("comissoes", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  vendedorId: int("vendedor_id").notNull().references(() => vendedores.id),
  pedidoId: int("pedido_id").notNull().references(() => pedidos.id),
  valorVenda: decimal("valor_venda", { precision: 10, scale: 2 }).default("0").notNull(),
  percentualComissao: decimal("percentual_comissao", { precision: 5, scale: 2 }).default("0").notNull(),
  valorComissao: decimal("valor_comissao", { precision: 10, scale: 2 }).default("0").notNull(),
  /** Ver `server/shared/finance-status.ts` → ComissaoStatus */
  status: varchar("status", { length: 50 }).notNull(),
  dataPagamento: timestamp("data_pagamento"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const planoContas = mysqlTable("plano_contas", {
  id: int("id").primaryKey().autoincrement(),
  nome: varchar("nome", { length: 255 }).notNull(),
  tipo: mysqlEnum("tipo", ["RECEITA", "DESPESA"]).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
});

export const contasFixas = mysqlTable("contas_fixas", {
  id: int("id").primaryKey().autoincrement(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  diaVencimento: int("dia_vencimento").notNull(),
  planoContasId: int("plano_contas_id").references(() => planoContas.id),
  ativo: boolean("ativo").default(true).notNull(),
});

export const contasPagar = mysqlTable("contas_pagar", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  dataVencimento: timestamp("data_vencimento").notNull(),
  /** Ver `server/shared/finance-status.ts` → ContaPagarStatus */
  status: varchar("status", { length: 50 }).notNull(),
  dataPagamento: timestamp("data_pagamento"),
  planoContasId: int("plano_contas_id").references(() => planoContas.id),
  fornecedor: varchar("fornecedor", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const contasReceber = mysqlTable("contas_receber", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  pedidoNumero: int("pedido_numero"),
  clienteNome: varchar("cliente_nome", { length: 255 }).notNull(),
  vendedorId: int("vendedor_id"),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  dataVencimento: timestamp("data_vencimento").notNull(),
  /** Ver `server/shared/finance-status.ts` (PENDENTE | RECEBIDA | VENCIDA) */
  status: varchar("status", { length: 50 }).notNull(),
  dataRecebimento: timestamp("data_recebimento"),
  formaPagamento: mysqlEnum("forma_pagamento", ["PIX", "BOLETO", "CARTAO", "DINHEIRO"]),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  idxReceberVencimento: index("idx_receber_vencimento").on(table.dataVencimento),
}));

export const caixaMensal = mysqlTable("caixa_mensal", {
  id: int("id").primaryKey().autoincrement(),
  mesAno: varchar("mes_ano", { length: 7 }).notNull().unique(), // YYYY-MM
  totalPix: decimal("total_pix", { precision: 12, scale: 2 }).default("0").notNull(),
  totalBoleto: decimal("total_boleto", { precision: 12, scale: 2 }).default("0").notNull(),
  totalCartao: decimal("total_cartao", { precision: 12, scale: 2 }).default("0").notNull(),
  totalDinheiro: decimal("total_dinheiro", { precision: 12, scale: 2 }).default("0").notNull(),
  totalGeral: decimal("total_geral", { precision: 12, scale: 2 }).default("0").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const pendencias = mysqlTable("pendencias", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  pedidoId: int("pedido_id").notNull().references(() => pedidos.id),
  vendedorId: int("vendedor_id").notNull().references(() => vendedores.id),
  produtoId: int("produto_id").notNull().references(() => produtos.id),
  corId: int("cor_id").references(() => cores.id),
  quantidade: int("quantidade").notNull(),
  /** Ver `server/shared/domain-status.ts` → PendenciaStatusValues. */
  status: varchar("status", { length: 50 }).notNull(),
  dataPedido: timestamp("data_pedido").defaultNow().notNull(),
  dataResolvido: timestamp("data_resolvido"),
});

export const counters = mysqlTable("counters", {
  id: int("id").primaryKey().autoincrement(),
  // IMPORTANTE: deve bater com as migrations (0001_busy_vargas.sql)
  // para a numeração global reaproveitável funcionar (seq + lista de livres).
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  seq: int("seq").notNull().default(0),
  free: text("free"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  /** SELECT ... WHERE tenant_id = ? AND name = 'pedidos' FOR UPDATE */
  countersTenantNameIdx: index("counters_tenant_name_idx").on(table.tenantId, table.name),
}));

export const configuracoes = mysqlTable("configuracoes", {
  id: int("id").primaryKey().autoincrement(),
  chave: varchar("chave", { length: 64 }).notNull().unique(),
  valor: text("valor").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// Controle de versão do schema (migrações / auditoria). id=1 único.
export const schemaVersion = mysqlTable("schema_version", {
  id: int("id").primaryKey(), // sempre 1
  version: int("version").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// Chaves de idempotência: evita duplicação por retry/clique duplo em commands críticos.
// UNIQUE(commandName, key) garante concorrência: dois requests com mesma key do mesmo command => um só insere.
export const idempotencyKeys = mysqlTable(
  "idempotency_keys",
  {
    id: int("id").primaryKey().autoincrement(),
    key: varchar("key", { length: 64 }).notNull(),
    commandName: varchar("command_name", { length: 64 }).notNull(),
    resultJson: text("result_json"), // NULL = em processamento
    traceId: varchar("trace_id", { length: 32 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    keyIdx: index("idempotency_key_idx").on(table.key),
    createdAtIdx: index("idempotency_created_at_idx").on(table.createdAt),
    idempotencyCmdKey: unique("idempotency_cmd_key").on(table.commandName, table.key),
  })
);

// Auditoria mínima: create/update/delete em entidades críticas (sem senha nem dados sensíveis).
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    actorUserId: int("actor_user_id"),
    actorVendedorId: int("actor_vendedor_id"),
    action: varchar("action", { length: 32 }).notNull(), // create | update | delete
    entity: varchar("entity", { length: 64 }).notNull(), // vendedor | pedido | estoque | contas_receber | etc
    entityId: varchar("entity_id", { length: 64 }),
    payloadJson: text("payload_json"), // resumo (sem senha)
    traceId: varchar("trace_id", { length: 32 }),
  },
  (table) => ({
    entityIdx: index("audit_entity_idx").on(table.entity),
    entityIdIdx: index("audit_entity_id_idx").on(table.entityId),
    createdAtIdx: index("audit_created_at_idx").on(table.createdAt),
  })
);

// ===== IDEMPOTÊNCIA FINANCEIRA =====
export const financialIdempotency = mysqlTable("financial_idempotency", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  operationKey: varchar("operation_key", { length: 255 }).notNull(),
  operationType: mysqlEnum("operation_type", ["BAIXA_BOLETO", "CREDITO_CAIXA"]).notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
  metadata: text("metadata"), // JSON
}, (table) => ({
  tenantOperationIdx: unique("tenant_operation_idx").on(table.tenantId, table.operationKey, table.operationType),
  operationKeyIdx: index("operation_key_idx").on(table.operationKey),
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
}));

export type FinancialIdempotency = typeof financialIdempotency.$inferSelect;
