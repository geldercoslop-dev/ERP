import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getDb, getInsertId, cargas, pedidosCarga, pedidos, vendedores, insertAuditLog } from "../db/core.js";
import { nanoid } from "nanoid";
import * as financeService from "./finance.service.js";
import { ADMIN_ACTOR } from "../_core/service-actor.js";
import { ensureObject } from "../_core/service-response.js";
import { CargaStatus, CargaStatusValues, PedidoStatus } from "../shared/domain-status.js";
import { validateStatus } from "../shared/guards/domain-guard.js";
import { assertTenantId, assertDbConnection } from "../_core/errors/assertions.js";
import { ValidationError } from "../_core/errors/typed-errors.js";
import { toDbDate, toDbDateStrict } from "../utils/date.js";
// ... (types)
// ... (createCarga, getCargaById, listCargas, updateCargaStatus, addPedidosToCarga, removePedidosFromCarga, updatePedidoCarga, finalizarCarga)
/**
 * Libera carga para rota (marca status EM_ROTA)
 */
export async function liberarCargaParaRota(tenantId, cargaId) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    return await dbConn.transaction(async (tx) => {
        const pedidosCargaRows = await tx.select({ pedidoId: pedidosCarga.pedidoId })
            .from(pedidosCarga)
            .where(eq(pedidosCarga.cargaId, cargaId));
        const pedidoIds = pedidosCargaRows.map((r) => r.pedidoId);
        if (pedidoIds.length === 0)
            throw new ValidationError("Carga sem pedidos.");
        // 2. Atualizar status da carga
        await tx.update(cargas).set({ status: CargaStatus.EM_ROTA, updatedAt: toDbDate(new Date()) }).where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId)));
        // 3. Atualizar pedidos para EM_ROTA (somente se ainda estão CONFERIDO)
        await tx.update(pedidos).set({ status: PedidoStatus.EM_ROTA, updatedAt: toDbDate(new Date()) })
            .where(and(eq(pedidos.tenantId, tenantId), inArray(pedidos.id, pedidoIds), eq(pedidos.status, PedidoStatus.CONFERIDO)));
        // 4. Auditoria
        await insertAuditLog({
            tenantId,
            action: "update",
            entity: "carga",
            entityId: String(cargaId),
            payloadJson: JSON.stringify({ action: "liberar_rota", status: CargaStatus.EM_ROTA }),
            traceId: nanoid(10),
        });
        return { success: true };
    });
}
/**
 * Baixa um pedido de uma carga (entrega realizada)
 */
export async function baixarPedidoCarga(tenantId, pedidoCargaId, data) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    return await dbConn.transaction(async (tx) => {
        const rel = await tx.select().from(pedidosCarga).where(and(eq(pedidosCarga.tenantId, tenantId), eq(pedidosCarga.id, pedidoCargaId))).limit(1);
        if (rel.length === 0)
            throw new ValidationError("Relação carga-pedido não encontrada");
        const cargaIdRel = rel[0].cargaId;
        const cargaRow = await tx.select({ id: cargas.id, status: cargas.status, tenantId: cargas.tenantId })
            .from(cargas)
            .where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaIdRel)))
            .limit(1);
        if (!cargaRow.length) {
            throw new ValidationError('Carga não encontrada ou acesso negado');
        }
        if (cargaRow[0].status !== CargaStatus.EM_ROTA) {
            throw new ValidationError('Esta carga ainda não foi liberada para rota.');
        }
        await tx.update(pedidosCarga).set({
            entregue: 1,
            dataBaixa: toDbDate(new Date()),
        }).where(and(eq(pedidosCarga.tenantId, tenantId), eq(pedidosCarga.id, pedidoCargaId)));
        // 2. Baixar o pedido no fluxo único (financeiro + comissão + contas)
        const result = await financeService.baixarPedidoDireto(tenantId, rel[0].pedidoId, data, {
            tx,
            actor: ADMIN_ACTOR,
        });
        // 3. Verificar se a carga foi toda baixada
        const cargaId = rel[0].cargaId;
        const pendentes = await tx.select().from(pedidosCarga)
            .where(and(eq(pedidosCarga.cargaId, cargaId), eq(pedidosCarga.entregue, 0)));
        if (pendentes.length === 0) {
            await tx.update(cargas).set({ status: CargaStatus.ENTREGUE, updatedAt: toDbDate(new Date()) }).where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId)));
        }
        return result;
    });
}
/**
 * Cria uma nova carga
 */
export async function createCarga(tenantId, data) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
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
 * Busca carga por ID (inclui pedidos da carga).
 */
export async function getCargaById(tenantId, id) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = await dbConn
        .select()
        .from(cargas)
        .where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, id)))
        .limit(1);
    if (result.length === 0)
        return null;
    const row = ensureObject(result[0]);
    const links = await dbConn
        .select({
        pedidoCargaId: pedidosCarga.id,
        entregue: pedidosCarga.entregue,
        pedidoId: pedidos.id,
        numero: pedidos.numero,
        clienteNome: pedidos.clienteNome,
        clienteTelefone: pedidos.clienteTelefone,
        clienteRua: pedidos.clienteRua,
        clienteNumero: pedidos.clienteNumero,
        clienteBairro: pedidos.clienteBairro,
        clienteCidade: pedidos.clienteCidade,
        total: pedidos.total,
        formaPagamento: pedidos.formaPagamento,
        observacoes: pedidos.observacoes,
        vendedorNome: vendedores.nome,
    })
        .from(pedidosCarga)
        .innerJoin(pedidos, eq(pedidosCarga.pedidoId, pedidos.id))
        .innerJoin(vendedores, eq(pedidos.vendedorId, vendedores.id))
        .where(and(eq(pedidosCarga.cargaId, id), eq(pedidos.tenantId, tenantId)));
    row.pedidos = links.map((l, idx) => ({
        id: l.pedidoId,
        pedidoCargaId: l.pedidoCargaId,
        numero: l.numero,
        clienteNome: l.clienteNome,
        clienteTelefone: l.clienteTelefone,
        clienteRua: l.clienteRua,
        clienteNumero: l.clienteNumero,
        clienteBairro: l.clienteBairro,
        clienteCidade: l.clienteCidade,
        ordemEntrega: idx,
        total: String(l.total),
        formaPagamento: l.formaPagamento,
        observacoes: l.observacoes,
        vendedorNome: l.vendedorNome,
        entregue: l.entregue === 1,
    }));
    return row;
}
/**
 * Lista cargas com filtros
 */
export async function listCargas(tenantId, filtros) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    // Aplicar filtros
    const conditions = [eq(cargas.tenantId, tenantId)];
    if (filtros?.status) {
        conditions.push(eq(cargas.status, validateStatus(filtros.status, CargaStatusValues, "filtros.status")));
    }
    if (filtros?.dataInicio) {
        conditions.push(sql `${cargas.dataEntrega} >= ${filtros.dataInicio}`);
    }
    if (filtros?.dataFim) {
        conditions.push(sql `${cargas.dataEntrega} <= ${filtros.dataFim}`);
    }
    // Paginação
    const page = filtros?.page ?? 1;
    const pageSize = Math.min(filtros?.pageSize ?? 50, 100);
    const offset = (page - 1) * pageSize;
    const items = await dbConn
        .select()
        .from(cargas)
        .where(and(...conditions))
        .orderBy(desc(cargas.dataEntrega))
        .limit(pageSize)
        .offset(offset);
    const totalResult = await dbConn
        .select({ count: sql `count(*)` })
        .from(cargas)
        .where(and(...conditions));
    const total = Number(totalResult[0]?.count || 0);
    return { items, total, page, pageSize };
}
/**
 * Atualiza status de uma carga
 */
export async function updateCargaStatus(tenantId, data) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const statusVal = validateStatus(data.status, CargaStatusValues, "carga.status");
    const updateData = {
        status: statusVal,
        updatedAt: toDbDateStrict(new Date()),
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
export async function addPedidosToCarga(tenantId, cargaId, pedidoIds) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    return await dbConn.transaction(async (tx) => {
        // Verificar se carga existe e está em status adequado
        const carga = await tx.select().from(cargas).where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId))).limit(1);
        if (!carga.length) {
            throw new ValidationError("Carga não encontrada");
        }
        if (carga[0].status !== CargaStatus.GERADO) {
            throw new ValidationError("Apenas cargas com status GERADO podem receber pedidos");
        }
        // Inserir pedidos na carga
        for (const pedidoId of pedidoIds) {
            await tx.insert(pedidosCarga).values({
                tenantId,
                cargaId,
                pedidoId,
            });
        }
        // Atualizar status da carga para CONFERIDO
        await tx.update(cargas)
            .set({
            status: CargaStatus.CONFERIDO,
            updatedAt: toDbDate(new Date())
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
                newStatus: CargaStatus.CONFERIDO
            }),
            traceId: nanoid(10),
        });
        return { message: "Pedidos adicionados à carga com sucesso" };
    });
}
/**
 * Remove pedidos de uma carga
 */
export async function removePedidosFromCarga(tenantId, cargaId, pedidoIds) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    return await dbConn.transaction(async (tx) => {
        // Verificar se carga existe
        const carga = await tx.select().from(cargas).where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId))).limit(1);
        if (!carga.length) {
            throw new ValidationError("Carga não encontrada");
        }
        // Remover pedidos da carga
        // Verificar se há pedidos para remover
        if (pedidoIds.length > 0) {
            await tx.delete(pedidosCarga)
                .where(and(eq(pedidosCarga.cargaId, cargaId), inArray(pedidosCarga.pedidoId, pedidoIds)));
        }
        // Se não houver mais pedidos, voltar status para GERADO
        const remainingPedidos = await tx.select()
            .from(pedidosCarga)
            .where(eq(pedidosCarga.cargaId, cargaId));
        if (remainingPedidos.length === 0) {
            await tx.update(cargas)
                .set({
                status: CargaStatus.GERADO,
                updatedAt: toDbDate(new Date())
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
export async function updatePedidoCarga(tenantId, pedidoCargaId, data) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    // Validar que o pedidoCarga pertence a uma carga do tenant
    const pc = await dbConn.select({ cargaId: pedidosCarga.cargaId })
        .from(pedidosCarga)
        .innerJoin(cargas, eq(pedidosCarga.cargaId, cargas.id))
        .where(and(eq(pedidosCarga.id, pedidoCargaId), eq(cargas.tenantId, tenantId)))
        .limit(1);
    if (!pc.length) {
        throw new ValidationError("Pedido de carga não encontrado ou acesso negado");
    }
    const updateData = {};
    if (data.entregue !== undefined && data.entregue !== null) {
        updateData.entregue = data.entregue ? 1 : 0;
        if (data.entregue) {
            updateData.dataBaixa = toDbDate(new Date());
        }
    }
    if (Object.keys(updateData).length > 0) {
        await dbConn.update(pedidosCarga).set(updateData).where(and(eq(pedidosCarga.tenantId, tenantId), eq(pedidosCarga.id, pedidoCargaId)));
    }
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
export async function finalizarCarga(tenantId, cargaId) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    return await dbConn.transaction(async (tx) => {
        // Verificar se carga existe e está EM_ROTA
        const carga = await tx.select().from(cargas).where(and(eq(cargas.tenantId, tenantId), eq(cargas.id, cargaId))).limit(1);
        if (!carga.length) {
            throw new ValidationError("Carga não encontrada");
        }
        if (carga[0].status !== CargaStatus.EM_ROTA) {
            throw new ValidationError("Apenas cargas EM_ROTA podem ser finalizadas");
        }
        const updateData = {
            status: CargaStatus.ENTREGUE,
            dataEntrega: toDbDateStrict(new Date()),
            updatedAt: toDbDateStrict(new Date()),
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
export async function insertHistoricoRota(tenantId, registro) {
    // TODO: Implementar quando tabela historicoRotas for criada
    console.log('[logistica.service] insertHistoricoRota temporariamente desabilitado', registro);
    return { message: "Função temporariamente desabilitada" };
}
/**
 * Lista histórico de rotas
 */
export async function listHistoricoRotas(tenantId, filtros) {
    // TODO: Implementar quando tabela historicoRotas for criada
    console.log('[logistica.service] listHistoricoRotas temporariamente desabilitado');
    return []; // Ausência legítima - funcionalidade não implementada
}
/**
 * Busca pedidos disponíveis para carga (status GERADO)
 */
export async function getPedidosParaCarga(tenantId, filtros, options) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    const pageEarly = options?.page ?? 1;
    const pageSizeEarly = Math.min(options?.pageSize ?? 50, 100);
    assertDbConnection(dbConn);
    const conditions = [
        eq(pedidos.tenantId, tenantId),
        eq(pedidos.status, PedidoStatus.GERADO)
    ];
    // Aplicar filtros adicionais
    if (filtros?.vendedorId) {
        conditions.push(eq(pedidos.vendedorId, filtros.vendedorId));
    }
    if (filtros?.clienteOwnerUserId != null) {
        conditions.push(sql `exists (select 1 from clientes c where c.id = ${pedidos.clienteId} and c.user_id = ${filtros.clienteOwnerUserId})`);
    }
    if (filtros?.clienteId) {
        conditions.push(eq(pedidos.clienteId, filtros.clienteId));
    }
    if (filtros?.dataInicio) {
        conditions.push(sql `${pedidos.createdAt} >= ${filtros.dataInicio}`);
    }
    if (filtros?.dataFim) {
        conditions.push(sql `${pedidos.createdAt} <= ${filtros.dataFim}`);
    }
    // Adicionar paginação para evitar sobrecarga com muitos registros
    const page = options?.page ?? 1;
    const pageSize = Math.min(options?.pageSize ?? 50, 100);
    const offset = (page - 1) * pageSize;
    const items = await dbConn.select().from(pedidos).where(and(...conditions)).orderBy(desc(pedidos.createdAt)).limit(pageSize).offset(offset);
    const totalResult = await dbConn.select({ count: sql `count(*)` }).from(pedidos).where(and(...conditions));
    const total = Number(totalResult[0]?.count ?? 0);
    return { items, total, page, pageSize };
}
/**
 * Obtém pontos para o mapa de logística
 */
export async function getPontosMapa(tenantId) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    // Buscar cargas EM_ROTA com pedidos (filtrado por tenantId)
    const cargasEmRota = await dbConn
        .select({
        carga: cargas,
    })
        .from(cargas)
        .where(and(eq(cargas.tenantId, tenantId), eq(cargas.status, CargaStatus.EM_ROTA)));
    const pontos = [];
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
        const cidadesMap = new Map();
        for (const pc of pedidosCargaRows) {
            const pedido = pc.pedido;
            const cidade = pedido.clienteCidade || 'Não informada';
            if (!cidadesMap.has(cidade)) {
                cidadesMap.set(cidade, []);
            }
            cidadesMap.get(cidade).push({
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
/**
 * Retorna pedidos de uma carga para o relatório de entrega.
 */
export async function getRelatorioEntrega(tenantId, cargaId) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const rows = await dbConn
        .select({
        pedido: pedidos,
        pedidoCarga: pedidosCarga,
    })
        .from(pedidosCarga)
        .innerJoin(pedidos, eq(pedidos.id, pedidosCarga.pedidoId))
        .innerJoin(cargas, eq(cargas.id, pedidosCarga.cargaId))
        .where(and(eq(pedidosCarga.cargaId, cargaId), eq(cargas.tenantId, tenantId)));
    return rows.map((row) => ({
        pedido: row.pedido.numero,
        cliente: row.pedido.clienteNome,
        valor: row.pedido.total,
        bairro: row.pedido.clienteBairro ?? "N/A",
        entregue: row.pedidoCarga.entregue === 1,
    }));
}
