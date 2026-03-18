import { eq, and, desc, asc, sql, or, inArray } from "drizzle-orm";
import { getDb, getInsertId, insertAuditLog, normalizeNomeSobrenome } from "../db/index";
import type { NewProduto as InsertProduto, InsertCor } from "../db/index";
import { produtos, produtoVariacoes, cores, pendencias, itensPedido } from "../../drizzle/schema";
import { nanoid } from "nanoid";
import { ensureArray, ensureObject, ensureCreatedResult, ensureUpdateResult, ensureDeleteResult } from "../_core/service-response";

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
  return ensureUpdateResult();
}

export async function deleteCor(_tenantId: number, id: number): Promise<{ success: boolean }> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  await dbConn.delete(cores).where(eq(cores.id, id));
  return ensureDeleteResult();
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

  const [rows] = await (dbConn as any).execute(query, [tenantId, refDate, refDate, tenantId]);
  
  // Garantir que rows seja um array
  const safeRows = ensureArray(rows);
  
  // Processar os resultados
  const result = safeRows.map((p: any) => {
    const coresStr = String(p.cores || "").trim();
    const tamanhosStr = String(p.tamanhos || "").trim();
    const cor = coresStr ? coresStr.split("|")[0]?.trim() : "";
    const tamanho = tamanhosStr ? tamanhosStr.split("|")[0]?.trim() : "";
    const temEspelho = Boolean(p.temEspelho);
    const precoPromo = p.precoPromo ? Number(p.precoPromo) : null;
    const promoNome = p.promoNome || null;
    
    const valorVenda = precoPromo || Number(p.valorVenda);
    const temPromo = Boolean(precoPromo);
    
    let descricaoOperacional = String(p.descricao);
    if (cor) descricaoOperacional += ` - ${cor}`;
    if (tamanho) descricaoOperacional += ` (${tamanho})`;
    if (temEspelho) descricaoOperacional += " COM ESPELHO";
    
    // Remover campos temporários do resultado
    delete p.cores;
    delete p.tamanhos;
    delete p.temEspelho;
    delete p.precoPromo;
    delete p.promoNome;
    
    return { 
      ...p, 
      valorVendaBase: Number(p.valorVenda), 
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
  
  const refDate = opts.refDate ?? new Date();
  const page = opts.page || 1;
  const pageSize = opts.pageSize || 20;
  const offset = (page - 1) * pageSize;
  
  // Construir condições de filtro
  const conditions = [`p.tenantId = ?`, `p.ativo = 1`];
  const params: any[] = [tenantId];
  
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
    (dbConn as any).execute(countQuery, params),
    (dbConn as any).execute(query, queryParams)
  ]);
  
  const total = countResult[0][0]?.total || 0;
  const safeRows = ensureArray(rows[0]);
  
  // Processar os resultados
  const items = safeRows.map((p: any) => {
    const coresStr = String(p.cores || "").trim();
    const tamanhosStr = String(p.tamanhos || "").trim();
    const cor = coresStr ? coresStr.split("|")[0]?.trim() : "";
    const tamanho = tamanhosStr ? tamanhosStr.split("|")[0]?.trim() : "";
    const temEspelho = Boolean(p.temEspelho);
    const precoPromo = p.precoPromo ? Number(p.precoPromo) : null;
    const promoNome = p.promoNome || null;
    
    const valorVenda = precoPromo || Number(p.valorVenda);
    const temPromo = Boolean(precoPromo);
    
    let descricaoOperacional = String(p.descricao);
    if (cor) descricaoOperacional += ` - ${cor}`;
    if (tamanho) descricaoOperacional += ` (${tamanho})`;
    if (temEspelho) descricaoOperacional += " COM ESPELHO";
    
    // Remover campos temporários do resultado
    delete p.cores;
    delete p.tamanhos;
    delete p.temEspelho;
    delete p.precoPromo;
    delete p.promoNome;
    
    return { 
      ...p, 
      valorVendaBase: Number(p.valorVenda), 
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
  if (!current) throw new Error("Produto não encontrado");
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
    
    // Garantir que o retorno tenha success: true
    return ensureUpdateResult();
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
    
    // Garantir que o retorno tenha success: true
    return ensureDeleteResult();
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
      .where(and(eq(pendencias.tenantId, tenantId), eq(pendencias.produtoId, produtoId), inArray(pendencias.status, ["PENDENTE", "COMPRADO"])))
      .orderBy(asc(pendencias.dataPedido));

    for (const p of pendenciasAtivas) {
      if (qtdRestante <= 0) break;
      const qtdParaBaixa = Math.min(p.quantidade, qtdRestante);
      if (qtdParaBaixa === p.quantidade) {
        await dbConn.update(pendencias).set({ status: "RESOLVIDO", dataResolvido: new Date() }).where(eq(pendencias.id, p.id));
        qtdRestante -= qtdParaBaixa;
      } else break;
    }
  }
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

  await (dbConn as any).transaction(async (tx: any) => {
    // 1. Inserir nota (exemplo simplificado, idealmente via schema)
    const [notaRes]: any = await tx.execute(sql`
      INSERT INTO notas_entrada (tenantId, marca, dataChegada, valorTotal, formaPagamento, observacao, createdBy)
      VALUES (${tenantId}, ${input.marca}, ${input.dataChegada}, ${input.valorTotal}, ${input.formaPagamento}, ${input.observacao ?? null}, ${input.createdBy ?? null});
    `);
    const notaId = notaRes.insertId;

    // 2. Financeiro
    if (['PIX', 'DINHEIRO', 'CARTAO'].includes(input.formaPagamento)) {
      // Registrar no caixa (movimento de saída)
    } else if (input.parcelas) {
      // Gerar contas a pagar
    }

    // 3. Itens e Estoque
    for (const it of input.itens) {
      await tx.execute(
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
  return { success: true };
}

/**
 * GRUPOS DE PRECIFICAÇÃO
 */
export async function updateGrupoPrecificacao(tenantId: number, id: number, data: any) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  await dbConn.execute(
    'UPDATE grupo_precificacao SET markup = ?, updatedAt = NOW() WHERE tenantId = ? AND id = ?',
    [data.markup, tenantId, id]
  );
}

export async function deleteGrupoPrecificacao(tenantId: number, id: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  await dbConn.execute(
    'DELETE FROM grupo_precificacao WHERE tenantId = ? AND id = ?',
    [tenantId, id]
  );
  return { success: true };
}
