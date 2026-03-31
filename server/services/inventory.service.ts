import { eq, and, desc, asc, sql, or, inArray, lte } from "drizzle-orm";
import { getDb, getInsertId, insertAuditLog, normalizeNomeSobrenome } from "../db/index.js";
import type { NewProduto as InsertProduto, InsertCor } from "../db/index.js";
import {
  produtos,
  cores,
  pendencias,
  itensPedido,
  gruposPrecificacao,
} from "../../drizzle/schema.js";
import { PendenciaStatus } from "../shared/domain-status.js";
import { nanoid } from "nanoid";
import { ensureArray, ensureObject, ensureCreatedResult } from "../_core/service-response.js";

// Types
export type CreateProdutoInput = InsertProduto;
export type UpdateProdutoInput = Partial<InsertProduto>;
export type UpdateEstoqueInput = {
  id: number;
  quantidade: number;
  audit?: { actorUserId?: number; actorVendedorId?: number; traceId?: string; motivo?: string };
};

/**
 * CORES
 */
export async function listCores(_tenantId: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const result = await dbConn.select().from(cores).orderBy(asc(cores.nome));
  // Garantir que o retorno seja sempre um array
  return ensureArray(result);
}

export async function createCor(_tenantId: number, data: InsertCor): Promise<{ id: number }> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  const result = await dbConn.insert(cores).values(data);
  const corId = getInsertId(result);
  return ensureCreatedResult({ id: corId });
}

export async function updateCor(_tenantId: number, id: number, data: Partial<InsertCor>): Promise<{ success: boolean }> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  await dbConn.update(cores).set(data).where(eq(cores.id, id));
  const after = await dbConn.select().from(cores).where(eq(cores.id, id)).limit(1);
  if (!after.length) throw new Error("Falha ao atualizar cor");
  return { success: true };
}

export async function deleteCor(_tenantId: number, id: number): Promise<{ success: boolean }> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  await dbConn.delete(cores).where(eq(cores.id, id));
  const after = await dbConn.select().from(cores).where(eq(cores.id, id)).limit(1);
  if (after.length > 0) throw new Error("Falha ao excluir cor");
  return { success: true };
}

/**
 * PRODUTOS
 */
export async function createProduto(tenantId: number, data: CreateProdutoInput) {
  try {
    if (!tenantId) throw new Error("tenantId is required");
    const dbConn = await getDb();
    if (!dbConn) throw new Error("Database not available");
    
    const result = await dbConn.insert(produtos).values({
      ...data,
      tenantId,
    });
    const produtoId = getInsertId(result);

    // Registrar auditoria
    await insertAuditLog({
      tenantId,
      action: "create",
      entity: "produto",
      entityId: String(produtoId),
      payloadJson: JSON.stringify(data),
      traceId: nanoid(10),
    });
    
    // Garantir que o retorno tenha um ID válido
    return ensureCreatedResult({ id: produtoId });
  } catch (error) {
    console.error("Erro ao criar produto:", error);
    throw error;
  }
}

export async function getProdutoById(tenantId: number, id: number) {
  if (!tenantId) return null;
  const dbConn = await getDb();
  if (!dbConn) return null;
  
  const result = await dbConn.select().from(produtos).where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, id))).limit(1);
  // Se encontrou um resultado, retorna o objeto, caso contrário retorna null
  return result.length > 0 ? ensureObject(result[0]) : null;
}

export async function getAllProdutos(tenantId: number) {
  if (!tenantId) return [];
  const dbConn = await getDb();
  if (!dbConn) return [];
  
  const result = await dbConn.select()
    .from(produtos)
    .where(and(eq(produtos.tenantId, tenantId), eq(produtos.ativo, true)))
    .orderBy(asc(produtos.descricao));
  
  // Garantir que o retorno seja sempre um array
  return ensureArray(result);
}

export async function getAllProdutosComPrecoVigente(tenantId: number, refDate: Date = new Date()) {
  if (!tenantId) return [];
  const dbConn = await getDb();
  if (!dbConn) return [];
  const sqlRunner = dbConn as unknown as {
    execute: (query: string, params?: ReadonlyArray<unknown>) => Promise<[unknown, unknown]>;
  };

  // Otimização: Buscar produtos com JOIN para evitar N+1
  const query = `
    SELECT 
      p.*,
      GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ' | ') as cores,
      GROUP_CONCAT(DISTINCT NULLIF(TRIM(pv.tamanho), '') ORDER BY pv.tamanho SEPARATOR ' | ') as tamanhos,
      MAX(CASE WHEN pv.temEspelho = 1 THEN 1 ELSE 0 END) as temEspelho,
      MIN(pi.precoPromocional) as precoPromo,
      SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT pr.nome ORDER BY pi.precoPromocional ASC SEPARATOR ' | '), ' | ', 1) as promoNome
    FROM produtos p
    LEFT JOIN produto_variacoes pv ON p.id = pv.produtoId
    LEFT JOIN cores c ON c.id = pv.corId
    LEFT JOIN promocoes_itens pi ON p.id = pi.produtoId
    LEFT JOIN promocoes pr ON pi.promocaoId = pr.id 
      AND pr.tenantId = ? 
      AND pr.ativo = 1 
      AND pr.inicio <= ? 
      AND pr.fim >= ?
    WHERE p.tenantId = ? AND p.ativo = 1
    GROUP BY p.id
    ORDER BY p.descricao ASC
  `;

  const [rows] = await sqlRunner.execute(query, [tenantId, refDate, refDate, tenantId]);
  
  // Garantir que rows seja um array
  const safeRows = ensureArray(rows as unknown[]);
  
  // Processar os resultados
  const result = safeRows.map((p) => {
    const row = p as Record<string, unknown>;
    const coresStr = String(row.cores || "").trim();
    const tamanhosStr = String(row.tamanhos || "").trim();
    const cor = coresStr ? coresStr.split("|")[0]?.trim() : "";
    const tamanho = tamanhosStr ? tamanhosStr.split("|")[0]?.trim() : "";
    const temEspelho = Boolean(row.temEspelho);
    const precoPromo = row.precoPromo ? Number(row.precoPromo) : null;
    const promoNome = row.promoNome || null;
    
    const valorVenda = precoPromo || Number(row.valorVenda);
    const temPromo = Boolean(precoPromo);
    
    let descricaoOperacional = String(row.descricao);
    if (cor) descricaoOperacional += ` - ${cor}`;
    if (tamanho) descricaoOperacional += ` (${tamanho})`;
    if (temEspelho) descricaoOperacional += " COM ESPELHO";
    
    // Remover campos temporários do resultado
    delete row.cores;
    delete row.tamanhos;
    delete row.temEspelho;
    delete row.precoPromo;
    delete row.promoNome;
    
    return { 
      ...row, 
      descricao: String(row.descricao ?? ""),
      valorVendaBase: Number(row.valorVenda), 
      valorVenda, 
      promoAtiva: temPromo, 
      promoNome: promoNome, 
      descricaoOperacional,
      cor: cor || undefined,
      tamanho: tamanho || undefined,
      temEspelho
    };
  });
  
  // Garantir que o retorno seja sempre um array
  return ensureArray(result);
}

export type GetProdutosComPrecoVigentePagedOpts = {
  refDate?: Date;
  page: number;
  pageSize: number;
  query?: string;
  ativo?: boolean;
  categoria?: string;
  marca?: string;
};

export async function getProdutosComPrecoVigentePaged(
  tenantId: number,
  opts: GetProdutosComPrecoVigentePagedOpts
): Promise<{ items: Awaited<ReturnType<typeof getAllProdutosComPrecoVigente>>; total: number }> {
  if (!tenantId) return { items: [], total: 0 };
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0 };
  const sqlRunner = dbConn as unknown as {
    execute: (query: string, params?: ReadonlyArray<unknown>) => Promise<[unknown, unknown]>;
  };
  
  const refDate = opts.refDate ?? new Date();
  const page = opts.page || 1;
  const pageSize = opts.pageSize || 20;
  const offset = (page - 1) * pageSize;
  
  // Construir condições de filtro
  const conditions = [`p.tenantId = ?`, `p.ativo = 1`];
  const params: Array<string | number> = [tenantId];
  
  const q = (opts.query ?? "").trim();
  if (q) {
    conditions.push(`p.descricao LIKE ?`);
    params.push(`%${q}%`);
  }
  
  if (opts.categoria) {
    conditions.push(`p.categoria = ?`);
    params.push(opts.categoria);
  }
  
  if (opts.marca) {
    conditions.push(`p.marca = ?`);
    params.push(opts.marca);
  }
  
  // Consulta paginada com JOIN para evitar N+1
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Consulta de contagem total
  const countQuery = `
    SELECT COUNT(DISTINCT p.id) as total
    FROM produtos p
    ${whereClause}
  `;
  
  // Consulta principal com paginação
  const query = `
    SELECT 
      p.*,
      GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ' | ') as cores,
      GROUP_CONCAT(DISTINCT NULLIF(TRIM(pv.tamanho), '') ORDER BY pv.tamanho SEPARATOR ' | ') as tamanhos,
      MAX(CASE WHEN pv.temEspelho = 1 THEN 1 ELSE 0 END) as temEspelho,
      MIN(pi.precoPromocional) as precoPromo,
      SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT pr.nome ORDER BY pi.precoPromocional ASC SEPARATOR ' | '), ' | ', 1) as promoNome
    FROM produtos p
    LEFT JOIN produto_variacoes pv ON p.id = pv.produtoId
    LEFT JOIN cores c ON c.id = pv.corId
    LEFT JOIN promocoes_itens pi ON p.id = pi.produtoId
    LEFT JOIN promocoes pr ON pi.promocaoId = pr.id 
      AND pr.tenantId = ? 
      AND pr.ativo = 1 
      AND pr.inicio <= ? 
      AND pr.fim >= ?
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.descricao ASC
    LIMIT ? OFFSET ?
  `;
  
  // Adicionar parâmetros para JOIN de promoções e paginação
  const queryParams = [tenantId, refDate, refDate, ...params, pageSize, offset];
  
  // Executar consultas em paralelo para melhor performance
  const [countResult, rows] = await Promise.all([
    sqlRunner.execute(countQuery, params),
    sqlRunner.execute(query, queryParams)
  ]);
  
  const countRows = ensureArray(countResult[0] as unknown[]);
  const firstCount = (countRows[0] ?? {}) as Record<string, unknown>;
  const total = Number(firstCount.total ?? 0);
  const safeRows = ensureArray(rows[0] as unknown[]);
  
  // Processar os resultados
  const items = safeRows.map((p) => {
    const row = p as Record<string, unknown>;
    const coresStr = String(row.cores || "").trim();
    const tamanhosStr = String(row.tamanhos || "").trim();
    const cor = coresStr ? coresStr.split("|")[0]?.trim() : "";
    const tamanho = tamanhosStr ? tamanhosStr.split("|")[0]?.trim() : "";
    const temEspelho = Boolean(row.temEspelho);
    const precoPromo = row.precoPromo ? Number(row.precoPromo) : null;
    const promoNome = row.promoNome || null;
    
    const valorVenda = precoPromo || Number(row.valorVenda);
    const temPromo = Boolean(precoPromo);
    
    let descricaoOperacional = String(row.descricao);
    if (cor) descricaoOperacional += ` - ${cor}`;
    if (tamanho) descricaoOperacional += ` (${tamanho})`;
    if (temEspelho) descricaoOperacional += " COM ESPELHO";
    
    // Remover campos temporários do resultado
    delete row.cores;
    delete row.tamanhos;
    delete row.temEspelho;
    delete row.precoPromo;
    delete row.promoNome;
    
    return { 
      ...row, 
      descricao: String(row.descricao ?? ""),
      valorVendaBase: Number(row.valorVenda), 
      valorVenda, 
      promoAtiva: temPromo, 
      promoNome: promoNome, 
      descricaoOperacional,
      cor: cor || undefined,
      tamanho: tamanho || undefined,
      temEspelho
    };
  });
  
  return { items: ensureArray(items), total };
}

export async function updateEstoqueProduto(
  tenantId: number,
  input: { id: number; quantidade: number; audit?: UpdateEstoqueInput["audit"] & { usuario?: string } }
): Promise<Record<string, unknown>> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  const res = await dbConn
    .select({ estoque: produtos.estoque })
    .from(produtos)
    .where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, input.id)))
    .limit(1);
  const current = res[0];
  if (!current) throw new Error("Produto não encontrado ou acesso negado");
  const saldoAtual = Number(current.estoque ?? 0);
  const isAbsolute = input.audit?.motivo === "Ajuste manual";
  const delta = isAbsolute ? input.quantidade - saldoAtual : input.quantidade;
  const tipo: "entrada" | "saida" = delta >= 0 ? "entrada" : "saida";
  const qtd = Math.abs(delta);
  const out = await ajusteRapidoEstoque(tenantId, input.id, qtd, tipo, input.audit);
  return { ...out, id: input.id, estoque: saldoAtual + delta } as Record<string, unknown>;
}

export async function getProdutosEstoqueBaixo(
  tenantId: number,
  limite: number
): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
  if (!tenantId) return { items: [], total: 0 };
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0 };
  const rows = await dbConn
    .select()
    .from(produtos)
    .where(and(eq(produtos.tenantId, tenantId), eq(produtos.ativo, true)))
    .orderBy(asc(produtos.estoque))
    .limit(Math.max(1, Math.min(limite, 500)));
  
  // Garantir que rows seja um array
  const safeRows = ensureArray(rows);
  const items = safeRows.map((r) => ({ ...r } as Record<string, unknown>));
  
  // Garantir que items seja um array
  return { items: ensureArray(items), total: items.length };
}

export async function updateProduto(tenantId: number, id: number, data: UpdateProdutoInput, version?: number) {
  try {
    if (!tenantId) throw new Error("tenantId is required");
    const dbConn = await getDb();
    if (!dbConn) throw new Error("Database not available");
    
    if (version !== undefined) {
      const produtoAtual = await dbConn.select().from(produtos).where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, id))).limit(1);
      if (produtoAtual.length === 0) throw new Error("Produto não encontrado");
      const updatedAt = produtoAtual[0].updatedAt;
      const versionDate = new Date(version);
      if (updatedAt && updatedAt > versionDate) throw new Error(`O produto foi modificado por outro usuário desde que você o abriu.`);
    }
    
    await dbConn.update(produtos).set({ ...data, updatedAt: new Date() }).where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, id)));
    const after = await getProdutoById(tenantId, id);
    if (!after) throw new Error("Falha ao atualizar produto");
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar produto:", error);
    throw error;
  }
}

export async function deleteProduto(tenantId: number, id: number) {
  try {
    if (!tenantId) throw new Error("tenantId is required");
    const dbConn = await getDb();
    if (!dbConn) throw new Error("Database not available");
    await dbConn.update(produtos).set({ ativo: false, updatedAt: new Date() }).where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, id)));
    const after = await getProdutoById(tenantId, id);
    if (!after || after.ativo !== false) throw new Error("Falha ao excluir logicamente produto");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir produto:", error);
    throw error;
  }
}

/**
 * AJUSTE RÁPIDO DE ESTOQUE
 */
export async function ajusteRapidoEstoque(
  tenantId: number,
  produtoId: number,
  quantidade: number,
  tipo: "entrada" | "saida",
  audit?: { actorUserId?: number; actorVendedorId?: number; traceId?: string; motivo?: string }
) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  
  const ajuste = tipo === "entrada" ? quantidade : -quantidade;
  const res = await dbConn.select({ estoque: produtos.estoque, descricao: produtos.descricao }).from(produtos).where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, produtoId))).limit(1);
  const row = res[0];
  if (!row) throw new Error("Produto não encontrado");
  const saldoAnterior = Number(row.estoque ?? 0);

  if (tipo === "saida" && quantidade > 0 && saldoAnterior < quantidade) {
    throw new Error(`Estoque insuficiente para saída do produto "${row.descricao}". Saldo atual: ${saldoAnterior}.`);
  }
  
  // Primeiro obter o estoque atual
  const produtoAtual = await dbConn.select({ estoque: produtos.estoque })
    .from(produtos)
    .where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, produtoId)))
    .limit(1);
  
  if (produtoAtual.length === 0) {
    throw new Error(`Produto não encontrado: ID ${produtoId}`);
  }
  
  const estoqueAtual = Number(produtoAtual[0].estoque || 0);
  const novoEstoque = estoqueAtual + ajuste;
  
  await dbConn.update(produtos)
    .set({ estoque: novoEstoque })
    .where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, produtoId)));

  const saldoNovo = saldoAnterior + ajuste;
  await insertAuditLog({
    tenantId,
    actorUserId: audit?.actorUserId ?? null,
    actorVendedorId: audit?.actorVendedorId ?? null,
    action: tipo === "entrada" ? "ENTRADA" : "SAIDA",
    entity: "estoque",
    entityId: String(produtoId),
    payloadJson: JSON.stringify({ quantidade, saldoAnterior, saldoNovo, motivo: audit?.motivo ?? "ajusteRapidoEstoque", tipo }),
    traceId: audit?.traceId ?? nanoid(10),
  });
  
  if (tipo === "entrada" && ajuste > 0) {
    let qtdRestante = ajuste;
    const pendenciasAtivas = await dbConn.select().from(pendencias)
      .where(
        and(
          eq(pendencias.tenantId, tenantId),
          eq(pendencias.produtoId, produtoId),
          inArray(pendencias.status, [PendenciaStatus.PENDENTE, PendenciaStatus.COMPRADO])
        )
      )
      .orderBy(asc(pendencias.dataPedido));

    for (const p of pendenciasAtivas) {
      if (qtdRestante <= 0) break;
      const qtdParaBaixa = Math.min(p.quantidade, qtdRestante);
      if (qtdParaBaixa === p.quantidade) {
        await dbConn
          .update(pendencias)
          .set({ status: PendenciaStatus.RESOLVIDO, dataResolvido: new Date() })
          .where(eq(pendencias.id, p.id));
        qtdRestante -= qtdParaBaixa;
      } else break;
    }
  }
  void import("../_core/cache-invalidation.js")
    .then((m) => m.invalidateInventoryCachesForTenant(tenantId))
    .catch(() => {});
  return { success: true, tipo, quantidade, produtoId };
}

/**
 * NOTA DE ENTRADA
 */
export async function criarNotaEntrada(tenantId: number, input: {
  marca: string;
  dataChegada: Date;
  valorTotal: number;
  formaPagamento: 'PIX' | 'DINHEIRO' | 'BOLETO' | 'CHEQUE' | 'CARTAO';
  parcelas?: Array<{ parcela: number; valor: number; dataVencimento: Date }>;
  observacao?: string;
  itens: Array<{ produtoId: number; quantidade: number; custoUnit?: number }>;
  createdBy?: number;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error('Database not available');
  const txSqlRunner = (tx: unknown) =>
    tx as { execute: (query: string, params?: ReadonlyArray<unknown>) => Promise<[unknown, unknown]> };

  await dbConn.transaction(async (tx) => {
    // 1. Inserir nota (exemplo simplificado, idealmente via schema)
    const [notaRes] = await txSqlRunner(tx).execute(
      "INSERT INTO notas_entrada (tenantId, marca, dataChegada, valorTotal, formaPagamento, observacao, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [tenantId, input.marca, input.dataChegada, input.valorTotal, input.formaPagamento, input.observacao ?? null, input.createdBy ?? null]
    );
    const notaPacket = notaRes as { insertId?: number };
    const notaId = Number(notaPacket.insertId ?? 0);
    if (!notaId) throw new Error("Falha ao criar nota de entrada");

    // 2. Financeiro
    if (['PIX', 'DINHEIRO', 'CARTAO'].includes(input.formaPagamento)) {
      // Registrar no caixa (movimento de saída)
    } else if (input.parcelas) {
      // Gerar contas a pagar
    }

    // 3. Itens e Estoque
    for (const it of input.itens) {
      await txSqlRunner(tx).execute(
        'INSERT INTO notas_entrada_itens (tenantId, notaId, produtoId, quantidade, custoUnit) VALUES (?, ?, ?, ?, ?)',
        [tenantId, notaId, it.produtoId, it.quantidade, it.custoUnit ?? null]
      );
      // Primeiro obter o estoque atual
      const produtoAtual = await tx.select({ estoque: produtos.estoque })
        .from(produtos)
        .where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, it.produtoId)))
        .limit(1);
      
      if (produtoAtual.length === 0) {
        throw new Error(`Produto não encontrado: ID ${it.produtoId}`);
      }
      
      const estoqueAtual = Number(produtoAtual[0].estoque || 0);
      const novoEstoque = estoqueAtual + it.quantidade;
      
      await tx.update(produtos)
        .set({ estoque: novoEstoque })
        .where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, it.produtoId)));
    }
  });
  void import("../_core/cache-invalidation.js")
    .then((m) => m.invalidateInventoryCachesForTenant(tenantId))
    .catch(() => {});
  return { success: true };
}

/**
 * GRUPOS DE PRECIFICAÇÃO
 */
export type UpdateGrupoPrecificacaoInput = {
  nome: string;
  descontoFabrica?: number;
  ipi?: number;
  frete?: number;
  montagem?: number;
  lucro?: number;
  comissao?: number;
  jurosCartao?: number;
  prazoGarantia?: number;
};

export async function updateGrupoPrecificacao(
  _tenantId: number,
  id: number,
  data: UpdateGrupoPrecificacaoInput
) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  const set: Record<string, string | number> = {
    nome: data.nome,
    descontoFabrica: String(data.descontoFabrica ?? 0),
    ipi: String(data.ipi ?? 0),
    frete: String(data.frete ?? 0),
    montagem: String(data.montagem ?? 0),
    lucro: String(data.lucro ?? 0),
    comissao: String(data.comissao ?? 0),
    jurosCartao: String(data.jurosCartao ?? 0),
    prazoGarantia: data.prazoGarantia ?? 90,
  };
  await dbConn.update(gruposPrecificacao).set(set).where(eq(gruposPrecificacao.id, id));
}

export async function deleteGrupoPrecificacao(_tenantId: number, id: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  await dbConn.delete(gruposPrecificacao).where(eq(gruposPrecificacao.id, id));
  return { success: true };
}

export async function countProdutosAtivosEstoqueAte(tenantId: number, maxInclusive: number): Promise<number> {
  if (!tenantId) return 0;
  const dbConn = await getDb();
  if (!dbConn) return 0;
  const [row] = await dbConn
    .select({ c: sql<number>`COUNT(*)`.as("c") })
    .from(produtos)
    .where(and(eq(produtos.tenantId, tenantId), eq(produtos.ativo, true), lte(produtos.estoque, maxInclusive)))
    .limit(1);
  return Number(row?.c ?? 0);
}

export async function countProdutosAtivosEstoqueZero(tenantId: number): Promise<number> {
  return countProdutosAtivosEstoqueAte(tenantId, 0);
}

export async function listProdutosBaixoEstoqueLeo(
  tenantId: number,
  maxInclusive: number
): Promise<Array<{ id: number; descricao: string | null; estoque: number }>> {
  if (!tenantId) return [];
  const dbConn = await getDb();
  if (!dbConn) return [];
  return dbConn
    .select({ id: produtos.id, descricao: produtos.descricao, estoque: produtos.estoque })
    .from(produtos)
    .where(and(eq(produtos.tenantId, tenantId), lte(produtos.estoque, maxInclusive)))
    .orderBy(desc(produtos.estoque));
}

export async function listProdutosResumoLeoLearning(tenantId: number): Promise<
  Array<{ id: number; descricao: string | null; estoque: number; categoria: string | null; valorVenda: string }>
> {
  if (!tenantId) return [];
  const dbConn = await getDb();
  if (!dbConn) return [];
  return dbConn
    .select({
      id: produtos.id,
      descricao: produtos.descricao,
      estoque: produtos.estoque,
      categoria: produtos.categoria,
      valorVenda: produtos.valorVenda,
    })
    .from(produtos)
    .where(eq(produtos.tenantId, tenantId));
}

export async function listProdutoVendasStatsLeoLearning(tenantId: number): Promise<
  Array<{
    produtoId: number;
    descricao: string | null;
    preco: string;
    categoria: string | null;
    vendasCount: number;
    receita: number;
  }>
> {
  if (!tenantId) return [];
  const dbConn = await getDb();
  if (!dbConn) return [];
  const rows = await dbConn
    .select({
      produtoId: produtos.id,
      descricao: produtos.descricao,
      preco: produtos.valorVenda,
      categoria: produtos.categoria,
      vendasCount: sql<number>`(SELECT COUNT(*) FROM itens_pedido i INNER JOIN pedidos p ON p.id = i.pedido_id WHERE i.produto_id = ${produtos.id} AND p.tenant_id = ${tenantId})`.as(
        "vendasCount"
      ),
      receita: sql<number>`(SELECT COALESCE(SUM(i.quantidade * i.valor_unitario), 0) FROM itens_pedido i INNER JOIN pedidos p ON p.id = i.pedido_id WHERE i.produto_id = ${produtos.id} AND p.tenant_id = ${tenantId})`.as(
        "receita"
      ),
    })
    .from(produtos)
    .where(eq(produtos.tenantId, tenantId));
  return rows.map((r) => ({
    produtoId: r.produtoId,
    descricao: r.descricao,
    preco: String(r.preco ?? "0"),
    categoria: r.categoria,
    vendasCount: Number(r.vendasCount ?? 0),
    receita: Number(r.receita ?? 0),
  }));
}
