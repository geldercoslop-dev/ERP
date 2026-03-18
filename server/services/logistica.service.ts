import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { getDb, getInsertId, cargas, pedidosCarga, pedidos, insertAuditLog } from "../db/core";
import { nanoid } from "nanoid";
import * as financeService from "./finance.service";
import { ensureObject } from "../_core/service-response";

// ... (types)
// ... (createCarga, getCargaById, listCargas, updateCargaStatus, addPedidosToCarga, removePedidosFromCarga, updatePedidoCarga, finalizarCarga)

/**
 * Libera carga para rota (marca status EM_ROTA)
 */
export async function liberarCargaParaRota(tenantId: number, cargaId: number) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  return await dbConn.transaction(async (tx) => {
    const pedidosCargaRows = await tx.select({ pedidoId: pedidosCarga.pedidoId })
      .from(pedidosCarga)
      .where(eq(pedidosCarga.cargaId, cargaId));
    const pedidoIds = pedidosCargaRows.map((r) => r.pedidoId);
    if (pedidoIds.length === 0) throw new Error("Carga sem pedidos.");

    // 2. Atualizar status da carga
    await tx.update(cargas).set({ status: 'EM_ROTA', updatedAt: new Date() }).where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId)));

    // 3. Atualizar pedidos para EM_ROTA (somente se ainda estão CONFERIDO)
    await tx.update(pedidos).set({ status: 'EM_ROTA', updatedAt: new Date() })
      .where(and(
        eq(pedidos.tenantId, tenantId),
        inArray(pedidos.id, pedidoIds), 
        eq(pedidos.status, 'CONFERIDO')
      ));

    // 4. Auditoria
    await insertAuditLog({
      tenantId,
      action: "update",
      entity: "carga",
      entityId: String(cargaId),
      payloadJson: JSON.stringify({ action: "liberar_rota", status: 'EM_ROTA' }),
      traceId: nanoid(10),
    });

    return { success: true };
  });
}

/**
 * Baixa um pedido de uma carga (entrega realizada)
 */
export async function baixarPedidoCarga(tenantId: number, pedidoCargaId: number, data: financeService.BaixaPedidoInput) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  return await dbConn.transaction(async (tx) => {
    const rel = await tx.select().from(pedidosCarga).where(eq(pedidosCarga.id, pedidoCargaId)).limit(1);
    if (rel.length === 0) throw new Error("Relação carga-pedido não encontrada");
    const cargaIdRel = rel[0].cargaId;
    const cargaRow = await tx.select({ id: cargas.id, status: cargas.status, tenantId: cargas.tenantId })
      .from(cargas)
      .where(eq(cargas.id, cargaIdRel))
      .limit(1);
    
    if (!cargaRow.length || cargaRow[0].tenantId !== tenantId) {
      throw new Error('Carga não encontrada ou acesso negado');
    }

    if (cargaRow[0].status !== 'EM_ROTA') {
      throw new Error('Esta carga ainda não foi liberada para rota.');
    }

    await tx.update(pedidosCarga).set({
      entregue: true,
      dataBaixa: new Date(),
    }).where(eq(pedidosCarga.id, pedidoCargaId));
    
    // 2. Baixar o pedido no fluxo único (financeiro + comissão + contas)
    const result = await financeService.baixarPedidoDireto(tenantId, rel[0].pedidoId, data, tx);
    
    // 3. Verificar se a carga foi toda baixada
    const cargaId = rel[0].cargaId;
    const pendentes = await tx.select().from(pedidosCarga)
      .where(and(eq(pedidosCarga.cargaId, cargaId), eq(pedidosCarga.entregue, false)));
      
    if (pendentes.length === 0) {
      await tx.update(cargas).set({ status: 'ENTREGUE', updatedAt: new Date() }).where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId)));
    }
    
    return result;
  });
}

// ... (insertHistoricoRota, listHistoricoRotas, getPedidosParaCarga, getPontosMapa)

// Types
export type CreateCargaInput = {
  numero: number;
  cidadeRota?: string;
  dataEntrega: Date;
  status: 'ABERTA' | 'EM_ROTA' | 'ENTREGUE' | 'CANCELADO';
};

export type CreateHistoricoRotaInput = {
  cargaId: number;
  cidade: string;
  bairro?: string | null;
  ordemEntrega: number;
  tempoEntrega?: number | null;
};

export type UpdateCargaStatusInput = {
  id: number;
  status: 'ABERTA' | 'EM_ROTA' | 'ENTREGUE';
};

/**
 * Cria uma nova carga
 */
export async function createCarga(tenantId: number, data: CreateCargaInput) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  
  const result = await dbConn.insert(cargas).values({
    ...data,
    tenantId,
  });
  const cargaId = getInsertId(result);

  // Registrar auditoria
  await insertAuditLog({
    tenantId,
    action: "create",
    entity: "carga",
    entityId: String(cargaId),
    payloadJson: JSON.stringify(data),
    traceId: nanoid(10),
  });

  return { id: cargaId };
}

/**
 * Busca carga por ID
 */
export async function getCargaById(tenantId: number, id: number) {
  if (!tenantId) return null;
  const dbConn = await getDb();
  if (!dbConn) return null;
  
  const result = await dbConn.select().from(cargas).where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, id))).limit(1);
  return result.length > 0 ? ensureObject(result[0]) : null;
}

/**
 * Lista cargas com filtros
 */
export async function listCargas(tenantId: number, filtros?: {
  status?: string;
  dataInicio?: Date;
  dataFim?: Date;
  page?: number;
  pageSize?: number;
}) {
  if (!tenantId) return { items: [], total: 0 };
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0 };

  let query = dbConn.select().from(cargas) as any;
  
  // Aplicar filtros
  const conditions = [eq(cargas.tenantId, tenantId)];
  if (filtros?.status) {
    conditions.push(sql`${cargas.status} = ${filtros.status}`);
  }
  if (filtros?.dataInicio) {
    conditions.push(sql`${cargas.dataEntrega} >= ${filtros.dataInicio}`);
  }
  if (filtros?.dataFim) {
    conditions.push(sql`${cargas.dataEntrega} <= ${filtros.dataFim}`);
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  // Paginação
  const page = filtros?.page ?? 1;
  const pageSize = Math.min(filtros?.pageSize ?? 50, 100);
  const offset = (page - 1) * pageSize;
  
  query = query.orderBy(desc(cargas.dataEntrega)).limit(pageSize).offset(offset);
  
  const items = await (query as any).execute?.() as unknown as any[];
  
  // Contar total
  const countQuery = dbConn.select({ count: sql`count(*)` }).from(cargas);
  if (conditions.length > 0) {
    countQuery.where(and(...conditions));
  }
  const totalResult = await countQuery;
  const total = Number(totalResult[0]?.count || 0) as number;
  
  return { items, total, page, pageSize };
}

/**
 * Atualiza status de uma carga
 */
export async function updateCargaStatus(tenantId: number, data: UpdateCargaStatusInput) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  
  const updateData: { status: any; updatedAt: Date } = {
    status: data.status as any,
    updatedAt: new Date(),
  };
  
  
  await dbConn.update(cargas)
    .set(updateData)
    .where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, data.id)));

  // Registrar auditoria
  await insertAuditLog({
    tenantId,
    action: "update",
    entity: "carga",
    entityId: String(data.id),
    payloadJson: JSON.stringify(updateData),
    traceId: nanoid(10),
  });
}

/**
 * Adiciona pedidos a uma carga
 */
export async function addPedidosToCarga(tenantId: number, cargaId: number, pedidoIds: number[]) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  return await dbConn.transaction(async (tx) => {
    // Verificar se carga existe e está em status adequado
    const carga = await tx.select().from(cargas).where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId))).limit(1);
    if (!carga.length) {
      throw new Error("Carga não encontrada");
    }

    if (carga[0].status !== 'GERADO') {
      throw new Error("Apenas cargas com status GERADO podem receber pedidos");
    }

    // Inserir pedidos na carga
    for (const pedidoId of pedidoIds) {
      await tx.insert(pedidosCarga).values({
        tenantId,
        cargaId,
        pedidoId,
      } as any);
    }

    // Atualizar status da carga para CONFERIDO
    await tx.update(cargas)
      .set({ 
        status: 'CONFERIDO',
        updatedAt: new Date()
      })
      .where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId)));

    // Registrar auditoria
    await insertAuditLog({
      tenantId,
      action: "update",
      entity: "carga",
      entityId: String(cargaId),
      payloadJson: JSON.stringify({
        action: "add_pedidos",
        pedidoIds,
        newStatus: 'CONFERIDO'
      }),
      traceId: nanoid(10),
    });

    return { message: "Pedidos adicionados à carga com sucesso" };
  });
}

/**
 * Remove pedidos de uma carga
 */
export async function removePedidosFromCarga(tenantId: number, cargaId: number, pedidoIds: number[]) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  return await dbConn.transaction(async (tx) => {
    // Verificar se carga existe
    const carga = await tx.select().from(cargas).where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId))).limit(1);
    if (!carga.length) {
      throw new Error("Carga não encontrada");
    }

    // Remover pedidos da carga
    // Verificar se há pedidos para remover
    if (pedidoIds.length > 0) {
      await tx.delete(pedidosCarga)
        .where(and(
          eq(pedidosCarga.cargaId, cargaId),
          inArray(pedidosCarga.pedidoId, pedidoIds)
        ));
    }

    // Se não houver mais pedidos, voltar status para GERADO
    const remainingPedidos = await tx.select()
      .from(pedidosCarga)
      .where(eq(pedidosCarga.cargaId, cargaId));

    if (remainingPedidos.length === 0) {
      await tx.update(cargas)
        .set({ 
          status: 'GERADO',
          updatedAt: new Date()
        })
        .where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId)));
    }

    // Registrar auditoria
    await insertAuditLog({
      tenantId,
      action: "update",
      entity: "carga",
      entityId: String(cargaId),
      payloadJson: JSON.stringify({
        action: "remove_pedidos",
        pedidoIds
      }),
      traceId: nanoid(10),
    });

    return { message: "Pedidos removidos da carga com sucesso" };
  });
}

/**
 * Atualiza campos de um pedido vinculado a uma carga (ordem, horários, entrega)
 */
export async function updatePedidoCarga(tenantId: number, pedidoCargaId: number, data: {
  ordemEntrega?: number;
  horarioPrevisto?: string;
  horarioReal?: string | null;
  observacao?: string;
  entregue?: boolean | null;
}) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  // Validar que o pedidoCarga pertence a uma carga do tenant
  const pc = await dbConn.select({ cargaId: pedidosCarga.cargaId })
    .from(pedidosCarga)
    .innerJoin(cargas, eq(pedidosCarga.cargaId, cargas.id))
    .where(and(eq(pedidosCarga.id, pedidoCargaId), eq(cargas.tenantId, tenantId)))
    .limit(1);

  if (!pc.length) {
    throw new Error("Pedido de carga não encontrado ou acesso negado");
  }

  const updateData = { ...data, updatedAt: new Date() } as any;
  await dbConn.update(pedidosCarga).set(updateData).where(eq(pedidosCarga.id, pedidoCargaId));

  // Registrar auditoria
  await insertAuditLog({
    tenantId,
    action: "update",
    entity: "pedido_carga",
    entityId: String(pedidoCargaId),
    payloadJson: JSON.stringify(data),
    traceId: nanoid(10),
  }, dbConn);

  return { success: true };
}

/**
 * Finaliza uma carga (marca como ENTREGUE)
 */
export async function finalizarCarga(tenantId: number, cargaId: number) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  return await dbConn.transaction(async (tx) => {
    // Verificar se carga existe e está EM_ROTA
    const carga = await tx.select().from(cargas).where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId))).limit(1);
    if (!carga.length) {
      throw new Error("Carga não encontrada");
    }

    if (carga[0].status !== 'EM_ROTA') {
      throw new Error("Apenas cargas EM_ROTA podem ser finalizadas");
    }

    const updateData: { status: string; dataEntrega: Date; updatedAt: Date } = {
      status: 'ENTREGUE',
      dataEntrega: new Date(),
      updatedAt: new Date(),
    };
    await tx.update(cargas)
      .set(updateData)
      .where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId)));

    // Registrar auditoria
    await insertAuditLog({
      tenantId,
      action: "update",
      entity: "carga",
      entityId: String(cargaId),
      payloadJson: JSON.stringify(updateData),
      traceId: nanoid(10),
    });

    return { message: "Carga finalizada com sucesso" };
  });
}

/**
 * Registra histórico de rota executada (TEMPORARIAMENTE DESABILITADO)
 */
export async function insertHistoricoRota(tenantId: number, registro: CreateHistoricoRotaInput) {
  // TODO: Implementar quando tabela historicoRotas for criada
  console.log('[logistica.service] insertHistoricoRota temporariamente desabilitado', registro);
  return { message: "Função temporariamente desabilitada" };
}

/**
 * Lista histórico de rotas
 */
export async function listHistoricoRotas(tenantId: number, filtros?: {
  cargaId?: number;
  cidade?: string;
  dataInicio?: Date;
  dataFim?: Date;
}) {
  // TODO: Implementar quando tabela historicoRotas for criada
  console.log('[logistica.service] listHistoricoRotas temporariamente desabilitado');
  return [];
}

/**
 * Busca pedidos disponíveis para carga (status GERADO)
 */
export async function getPedidosParaCarga(tenantId: number, filtros?: {
  vendedorId?: number;
  clienteId?: number;
  dataInicio?: Date;
  dataFim?: Date;
}) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) return [];

  const conditions = [
    eq(pedidos.tenantId, tenantId),
    eq(pedidos.status, 'GERADO')
  ];
  
  // Aplicar filtros adicionais
  if (filtros?.vendedorId) {
    conditions.push(eq(pedidos.vendedorId, filtros.vendedorId));
  }
  if (filtros?.clienteId) {
    conditions.push(eq(pedidos.clienteId, filtros.clienteId));
  }
  if (filtros?.dataInicio) {
    conditions.push(sql`${pedidos.createdAt} >= ${filtros.dataInicio}`);
  }
  if (filtros?.dataFim) {
    conditions.push(sql`${pedidos.createdAt} <= ${filtros.dataFim}`);
  }
  
  // Adicionar paginação para evitar sobrecarga com muitos registros
  const page = options?.page ?? 1;
  const pageSize = Math.min(options?.pageSize ?? 50, 100);
  const offset = (page - 1) * pageSize;
  
  const items = await dbConn.select().from(pedidos).where(and(...conditions)).orderBy(desc(pedidos.createdAt)).limit(pageSize).offset(offset);
  const totalResult = await dbConn.select({ count: sql`count(*)` }).from(pedidos).where(and(...conditions));
  const total = Number(totalResult[0]?.count ?? 0);
  
  return { items, total, page, pageSize };
}

/**
 * Obtém pontos para o mapa de logística
 */
export async function getPontosMapa(tenantId: number) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) return [];

  // Buscar cargas EM_ROTA com pedidos (filtrado por tenantId)
  const cargasEmRota = await dbConn
    .select({
      carga: cargas,
    })
    .from(cargas)
    .where(and(eq(cargas.tenantId, tenantId), eq(cargas.status, 'EM_ROTA')));

  const pontos: Record<string, unknown>[] = [];

  for (const cargaRow of cargasEmRota) {
    const carga = cargaRow.carga;
    
    // Buscar pedidos desta carga
    const pedidosCargaRows = await dbConn
      .select({
        pedido: pedidos,
        pedidoCarga: pedidosCarga,
      })
      .from(pedidosCarga)
      .innerJoin(pedidos, eq(pedidos.id, pedidosCarga.pedidoId))
      .where(eq(pedidosCarga.cargaId, carga.id));

    // Agrupar por cidade
    const cidadesMap = new Map<string, Record<string, unknown>[]>();
    
    for (const pc of pedidosCargaRows) {
      const pedido = pc.pedido;
      const cidade = pedido.clienteCidade || 'Não informada';
      
      if (!cidadesMap.has(cidade)) {
        cidadesMap.set(cidade, []);
      }
      
      cidadesMap.get(cidade)!.push({
        id: pedido.id,
        numero: pedido.numero,
        clienteNome: pedido.clienteNome,
        rua: pedido.clienteRua,
        clienteNumero: pedido.clienteNumero,
        bairro: pedido.clienteBairro,
        cidade: cidade,
      });
    }

    // Adicionar pontos para esta carga
    cidadesMap.forEach((pedidosCidade, cidade) => {
      pontos.push({
        cargaId: carga.id,
        cidadeRota: carga.cidadeRota,
        cidade,
        pedidos: pedidosCidade,
        totalPedidos: pedidosCidade.length,
      });
    });
  }

  return pontos;
}
