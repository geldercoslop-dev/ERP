/**
 * Critical Operations Audit Service
 *
 * Serviço para auditoria de operações críticas do ERP
 * Alinhado com schema Drizzle ORM
 */
import { nanoid } from 'nanoid';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { getDb } from '../db/index.js';
import { auditLogs as auditLog } from '../../drizzle/schema.js';
import { eq, sql, and, desc, like, gte, lte } from 'drizzle-orm';
import { toDbDateStrict } from '../utils/date.js';
import { ContaReceberStatus, PedidoStatus } from '../shared/domain-status.js';
import { createResponse } from '../_core/type-guards.js';
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from '../runtime/service-invocation.js';
/**
 * Busca registros de auditoria com filtros
 */
export async function buscarRegistros(filtros = {}) {
    try {
        return await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
            const dbConnection = await getDb();
            if (!dbConnection) {
                console.error('[Audit] Conexão com banco não disponível');
                throw new InfrastructureError('Conexão com banco não disponível para auditoria');
            }
            // Aplicar filtros
            const conditions = [];
            if (filtros.tenantId) {
                conditions.push(eq(auditLog.tenantId, filtros.tenantId));
            }
            if (filtros.tipo) {
                conditions.push(eq(auditLog.entity, filtros.tipo));
            }
            if (filtros.acao) {
                conditions.push(like(auditLog.action, `%${filtros.acao}%`));
            }
            if (filtros.usuarioId) {
                conditions.push(eq(auditLog.actorUserId, filtros.usuarioId));
            }
            if (filtros.vendedorId) {
                conditions.push(eq(auditLog.actorVendedorId, filtros.vendedorId));
            }
            if (filtros.entidadeId) {
                conditions.push(eq(auditLog.entityId, filtros.entidadeId));
            }
            if (filtros.traceId) {
                conditions.push(eq(auditLog.traceId, filtros.traceId));
            }
            if (filtros.dataInicio) {
                conditions.push(gte(auditLog.createdAt, toDbDateStrict(filtros.dataInicio)));
            }
            if (filtros.dataFim) {
                conditions.push(lte(auditLog.createdAt, toDbDateStrict(filtros.dataFim)));
            }
            const whereClause = conditions.length > 0 ? and(...conditions) : sql `1=1`;
            const rows = await dbConnection
                .select({
                id: auditLog.id,
                entity: auditLog.entity,
                action: auditLog.action,
                entityId: auditLog.entityId,
                payloadJson: auditLog.payloadJson,
                actorUserId: auditLog.actorUserId,
                actorVendedorId: auditLog.actorVendedorId,
                createdAt: auditLog.createdAt,
                traceId: auditLog.traceId,
            })
                .from(auditLog)
                .where(whereClause)
                .orderBy(desc(auditLog.createdAt))
                .limit(filtros.limit ?? 100_000)
                .offset(filtros.offset ?? 0);
            const totalResult = await dbConnection
                .select({ count: sql `count(*)` })
                .from(auditLog)
                .where(whereClause);
            return rows.map((row) => {
                let payload = {};
                try {
                    payload = row.payloadJson ? JSON.parse(row.payloadJson) : {};
                }
                catch (e) {
                    console.warn('[Audit] Erro ao parsear payload:', e);
                }
                return {
                    id: row.id,
                    tipo: row.entity,
                    acao: row.action.replace(`${row.entity.toUpperCase()}_`, '').toLowerCase(),
                    entidadeId: row.entityId,
                    dados: payload,
                    usuarioId: row.actorUserId,
                    vendedorId: row.actorVendedorId,
                    ip: payload.ip,
                    userAgent: payload.userAgent,
                    timestamp: new Date(row.createdAt),
                    traceId: row.traceId,
                    total: Number(totalResult[0]?.count ?? 0)
                };
            });
        });
    }
    catch (error) {
        console.error('[Audit] Erro ao buscar registros:', error);
        throw new InfrastructureError('Falha ao buscar registros de auditoria', { cause: error });
    }
}
/**
 * Gera resumo de auditoria para dashboard
 */
export async function gerarResumoAuditoria(tenantId, dias = 30) {
    try {
        const dbConnection = await getDb();
        if (!dbConnection) {
            return { erro: 'Banco indisponível' };
        }
        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - dias);
        // Total de operações no período
        const totalResult = await dbConnection
            .select({ total: sql `count(*)` })
            .from(auditLog)
            .where(and(eq(auditLog.tenantId, tenantId), sql `createdAt >= '${dataInicio.toISOString()}'`));
        // Operações por tipo
        const tipoResult = await dbConnection
            .select({
            entity: auditLog.entity,
            count: sql `count(*)`
        })
            .from(auditLog)
            .where(and(eq(auditLog.tenantId, tenantId), sql `createdAt >= '${dataInicio.toISOString()}'`))
            .groupBy(auditLog.entity);
        // Operações por usuário
        const usuarioResult = await dbConnection
            .select({
            actorUserId: auditLog.actorUserId,
            count: sql `count(*)`
        })
            .from(auditLog)
            .where(and(eq(auditLog.tenantId, tenantId), sql `createdAt >= '${dataInicio.toISOString()}'`, sql `actorUserId IS NOT NULL`))
            .groupBy(auditLog.actorUserId);
        // Operações últimas 24h
        const data24h = new Date();
        data24h.setHours(data24h.getHours() - 24);
        const ultimas24hResult = await dbConnection
            .select({ total: sql `count(*)` })
            .from(auditLog)
            .where(and(eq(auditLog.tenantId, tenantId), sql `createdAt >= '${data24h.toISOString()}'`));
        // Operações com erro
        const errosResult = await dbConnection
            .select({ total: sql `count(*)` })
            .from(auditLog)
            .where(and(eq(auditLog.tenantId, tenantId), sql `createdAt >= '${dataInicio.toISOString()}'`, sql `(action LIKE '%ERRO%' OR payloadJson LIKE '%error%')`));
        return {
            periodo: `${dias} dias`,
            totalOperacoes: (totalResult[0]?.total) || 0,
            operacoesPorTipo: tipoResult.map(r => ({
                tipo: r.entity,
                quantidade: Number(r.count)
            })),
            operacoesPorUsuario: usuarioResult.map(r => ({
                usuarioId: r.actorUserId,
                quantidade: Number(r.count)
            })),
            ultimas24h: (ultimas24hResult[0]?.total) || 0,
            operacoesComErro: (errosResult[0]?.total) || 0,
            dataGeracao: new Date()
        };
    }
    catch (error) {
        console.error('[Audit] Erro ao gerar resumo:', error);
        return { erro: 'Falha ao gerar resumo' };
    }
}
/**
 * Insere log de auditoria de forma segura
 */
export async function insertAuditLog(data) {
    return await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
        try {
            const dbConnection = await getDb();
            if (!dbConnection) {
                return createResponse(false, 'Banco indisponível');
            }
            if (!data.tenantId || data.tenantId <= 0) {
                throw new Error('tenantId obrigatório para auditoria');
            }
            const record = {
                tenantId: data.tenantId,
                actorUserId: data.actorUserId ?? null,
                actorVendedorId: data.actorVendedorId ?? null,
                action: data.action,
                entity: data.entity,
                entityId: data.entityId ?? null,
                payloadJson: data.payloadJson ?? '{}',
                traceId: data.traceId ?? nanoid(10),
                createdAt: toDbDateStrict(new Date())
            };
            await dbConnection.insert(auditLog).values(record);
            return createResponse(true, 'Log de auditoria inserido com sucesso');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Erro desconhecido';
            console.error('[Audit] Erro ao inserir log:', error);
            return createResponse(false, `Falha ao inserir log: ${message}`);
        }
    });
}
/**
 * Verifica consistência de dados críticos
 */
export async function verificarConsistenciaDados(tenantId) {
    try {
        return await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
            const dbConnection = await getDb();
            if (!dbConnection) {
                return { erro: 'Banco indisponível' };
            }
            // Verificar produtos com estoque negativo
            const estoqueNegativoResult = await dbConnection
                .select({ total: sql `count(*)` })
                .from(sql `produtos`)
                .where(and(eq(auditLog.tenantId, tenantId), sql `estoque < 0`));
            // Verificar pedidos inconsistentes
            const pedidosInconsistentesResult = await dbConnection
                .select({ total: sql `count(*)` })
                .from(sql `
        (SELECT p.id FROM pedidos p
         LEFT JOIN itens_pedido ip ON p.id = ip.pedidoId
         WHERE p.tenantId = ${tenantId}
         GROUP BY p.id
         HAVING COALESCE(SUM(ip.valorUnitario * ip.quantidade), 0) != p.total
        ) AS inconsistentes
      `);
            // Verificar totais financeiros
            const totalVendasResult = await dbConnection
                .select({ total: sql `COALESCE(SUM(total), 0)` })
                .from(sql `pedidos`)
                .where(and(eq(auditLog.tenantId, tenantId), sql `status != ${PedidoStatus.CANCELADO}`));
            const totalRecebidoResult = await dbConnection
                .select({ total: sql `COALESCE(SUM(valor), 0)` })
                .from(sql `contas_receber`)
                .where(and(eq(auditLog.tenantId, tenantId), sql `status = ${ContaReceberStatus.RECEBIDA}`));
            return {
                produtosEstoqueNegativo: (estoqueNegativoResult[0]?.total) || 0,
                pedidosInconsistentes: (pedidosInconsistentesResult[0]?.total) || 0,
                totalVendas: Number((totalVendasResult[0]?.total) || 0),
                totalRecebido: Number((totalRecebidoResult[0]?.total) || 0),
                dataVerificacao: new Date()
            };
        });
    }
    catch (error) {
        console.error('[Audit] Erro na verificação de consistência:', error);
        return { erro: 'Falha na verificação' };
    }
}
export default {
    buscarRegistros,
    gerarResumoAuditoria,
    insertAuditLog,
    verificarConsistenciaDados
};
