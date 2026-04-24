/**
 * Safe Shipment Module
 *
 * Módulo para criação e gestão de cargas com transações seguras
 * Tipos explícitos - ZERO ANY
 */
import { ValidationError } from '../_core/errors/typed-errors.js';
import { runTransaction } from '../services/db-transaction.js';
import { insertAuditLog } from '../services/audit-service.js';
import { getPool } from '../db/index.js';
// Type guards para resultados de query
function isQueryResult(obj) {
    return Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null && 'insertId' in obj[0] && typeof obj[0].insertId === 'number';
}
function isShipmentData(obj) {
    return Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null &&
        ('id' in obj[0] || 'clienteId' in obj[0] || 'endereco' in obj[0] || 'dataPrevistaChegada' in obj[0] || 'dataPrevistaSaida' in obj[0] || 'rota' in obj[0] || 'observacoes' in obj[0] || 'pesoTotal' in obj[0] || 'volumeTotal' in obj[0] || 'valorTotalCarga' in obj[0] || 'itens' in obj[0]);
}
/**
 * Cria carga de forma segura com validações completas
 */
export async function createShipmentSafe(shipmentData) {
    // Validação de tenantId obrigatório
    if (!shipmentData.tenantId || shipmentData.tenantId <= 0) {
        return {
            success: false,
            message: 'TENANT_ID_OBRIGATORIO: tenantId é obrigatório',
        };
    }
    return runTransaction(async (tx) => {
        console.log(`[SafeShipment] Criando carga - Placa: ${shipmentData.placa}, Motorista: ${shipmentData.motorista}`);
        // 1. Validar dados obrigatórios
        if (!shipmentData.placa || shipmentData.placa.trim() === '') {
            throw new ValidationError('CARGA_PLACA_OBRIGATORIA: Placa do veículo é obrigatória');
        }
        if (!shipmentData.motorista || shipmentData.motorista.trim() === '') {
            throw new ValidationError('CARGA_MOTORISTA_OBRIGATORIO: Nome do motorista é obrigatório');
        }
        if (!shipmentData.itens || shipmentData.itens.length === 0) {
            throw new ValidationError('CARGA_SEM_ITENS: Carga deve conter pelo menos um pedido');
        }
        // 2. Validar itens da carga
        const pedidosValidados = [];
        let valorTotalCarga = 0;
        for (const item of shipmentData.itens) {
            // Buscar pedido com bloqueio
            const [pedido] = await tx.execute(`SELECT id, numero, status, cliente_nome, total, peso, volume FROM pedidos WHERE id = ? FOR UPDATE`, [item.pedidoId]);
            const pedidoData = Array.isArray(pedido) && pedido.length > 0
                ? pedido[0]
                : null;
            // Validar se pedido foi encontrado
            if (!pedidoData) {
                throw new ValidationError(`CARGA_PEDIDO_NAO_ENCONTRADO: Pedido #${item.pedidoId} não encontrado`);
            }
            // Validar status do pedido
            if (pedidoData && typeof pedidoData.status === 'string' && pedidoData.status === 'CANCELADO') {
                throw new ValidationError(`CARGA_PEDIDO_CANCELADO: Pedido #${pedidoData.numero} está cancelado`);
            }
            if (pedidoData && typeof pedidoData.status === 'string' && pedidoData.status === 'ENTREGUE') {
                throw new ValidationError(`CARGA_PEDIDO_ENTREGUE: Pedido #${pedidoData.numero} já foi entregue`);
            }
            // Verificar se pedido já está em outra carga
            const [emCarga] = await tx.execute(`SELECT COUNT(*) as total FROM pedidos_carga WHERE pedido_id = ?`, [item.pedidoId]);
            const emCargaRow = Array.isArray(emCarga) && emCarga.length > 0
                ? emCarga[0]
                : null;
            const jaEmCarga = emCargaRow?.total || 0;
            if (jaEmCarga > 0 && pedidoData) {
                throw new ValidationError(`CARGA_PEDIDO_JA_EM_CARGA: Pedido #${pedidoData.numero} já está em outra carga`);
            }
            pedidosValidados.push({
                ...pedidoData,
                statusItem: item.status || 'PENDENTE',
                observacoesItem: item.observacoes
            });
            valorTotalCarga += Number(pedidoData?.total || 0);
        }
        // 3. Validar peso e volume totais (se houver limites)
        const pesoTotal = pedidosValidados.reduce((sum, p) => sum + Number(p.peso || 0), 0);
        const volumeTotal = pedidosValidados.reduce((sum, p) => sum + Number(p.volume || 0), 0);
        // Limites máximos (podem vir de configurações)
        const PESO_MAXIMO = 10000; // 10 toneladas
        const VOLUME_MAXIMO = 50; // 50 m³
        if (pesoTotal > PESO_MAXIMO) {
            throw new ValidationError(`CARGA_PESO_EXCEDIDO: Peso total (${pesoTotal}kg) excede limite máximo (${PESO_MAXIMO}kg)`);
        }
        if (volumeTotal > VOLUME_MAXIMO) {
            throw new ValidationError(`CARGA_VOLUME_EXCEDIDO: Volume total (${volumeTotal}m³) excede limite máximo (${VOLUME_MAXIMO}m³)`);
        }
        // 4. Inserir carga
        const [shipmentResult] = await tx.execute(`INSERT INTO cargas (
        placa, motorista, veiculo, dataSaida, dataPrevistaChegada, 
        rota, observacoes, pesoTotal, volumeTotal, valorTotal, 
        status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EM_PREPARACAO', NOW(), NOW())`, [
            shipmentData.placa.toUpperCase(),
            shipmentData.motorista.toUpperCase(),
            shipmentData.veiculo || null,
            shipmentData.dataSaida || new Date(),
            shipmentData.dataPrevistaChegada || null,
            shipmentData.rota || null,
            shipmentData.observacoes || null,
            pesoTotal,
            volumeTotal,
            valorTotalCarga
        ]);
        const shipmentId = isQueryResult(shipmentResult) ? shipmentResult.insertId : undefined;
        // 5. Associar pedidos à carga
        for (const item of shipmentData.itens) {
            await tx.execute(`INSERT INTO pedidos_carga (
          carga_id, pedido_id, status, observacoes, adicionado_em
        ) VALUES (?, ?, ?, ?, NOW())`, [
                shipmentId,
                item.pedidoId,
                item.status || 'PENDENTE',
                item.observacoes || null
            ]);
            // Atualizar status do pedido
            await tx.execute(`UPDATE pedidos SET status = 'EM_CARGA', updated_at = NOW() WHERE id = ?`, [item.pedidoId]);
        }
        // 6. Registrar auditoria
        if (!shipmentData.tenantId || shipmentData.tenantId <= 0) {
            throw new ValidationError('TENANT_ID_OBRIGATORIO: tenantId é obrigatório para auditoria de carga');
        }
        const auditRecord = await insertAuditLog({
            tenantId: shipmentData.tenantId,
            action: 'CARGA_CRIACAO',
            entity: 'carga',
            entityId: String(shipmentId),
            payloadJson: JSON.stringify({
                id: shipmentId,
                placa: shipmentData.placa,
                motorista: shipmentData.motorista,
                status: 'EM_PREPARACAO',
                dataSaida: shipmentData.dataSaida,
                pesoTotal,
                volumeTotal,
                valorTotal: valorTotalCarga
            }),
            actorUserId: shipmentData.usuarioId,
            actorVendedorId: shipmentData.vendedorId,
            traceId: `SHIPMENT_${shipmentId}_${Date.now()}`
        });
        console.log(`[SafeShipment] Carga criada com sucesso - ID: ${shipmentId}, Pedidos: ${pedidosValidados.length}`);
        return {
            success: true,
            shipmentId,
            message: `Carga criada com sucesso com ${pedidosValidados.length} pedidos`,
            auditRecord,
            itensProcessados: pedidosValidados.length
        };
    }, 'SERIALIZABLE');
}
/**
 * Inicia carga de forma segura
 */
export async function startShipmentSafe(shipmentId, tenantId, usuarioId, vendedorId) {
    return runTransaction(async (tx) => {
        console.log(`[SafeShipment] Iniciando carga - ID: ${shipmentId}`);
        // 1. Buscar carga com bloqueio
        const [shipment] = await tx.execute(`SELECT id, placa, motorista, status, tenant_id FROM cargas WHERE id = ? FOR UPDATE`, [shipmentId]);
        if (!shipment || !shipment[0]) {
            throw new ValidationError('CARGA_NAO_ENCONTRADA: Carga não encontrada');
        }
        const shipmentData = shipment[0];
        // 2. Validar status
        if (shipmentData.status !== 'EM_PREPARACAO') {
            throw new ValidationError(`CARGA_STATUS_INVALIDO: Carga está com status ${shipmentData.status}, não pode ser iniciada`);
        }
        // 3. Atualizar status da carga
        await tx.execute(`UPDATE cargas SET status = 'EM_TRANSITO', dataSaidaReal = NOW(), updated_at = NOW() WHERE id = ?`, [shipmentId]);
        // 4. Atualizar status dos pedidos na carga
        await tx.execute(`UPDATE pedidos SET status = 'ENTREGA', updated_at = NOW() 
       WHERE id IN (SELECT pedido_id FROM pedidos_carga WHERE carga_id = ?)`, [shipmentId]);
        // 5. Registrar auditoria
        const auditTenantId = tenantId ?? Number(shipmentData.tenant_id ?? 0);
        if (!auditTenantId || auditTenantId <= 0) {
            throw new ValidationError('TENANT_ID_OBRIGATORIO: tenantId indisponível para auditoria de início de carga');
        }
        await insertAuditLog({
            tenantId: auditTenantId,
            action: 'CARGA_INICIO',
            entity: 'carga',
            entityId: String(shipmentId),
            payloadJson: JSON.stringify({
                shipmentId,
                placa: shipmentData.placa,
                motorista: shipmentData.motorista,
                statusAnterior: shipmentData.status,
                statusNovo: 'EM_TRANSITO'
            }),
            actorUserId: usuarioId,
            actorVendedorId: vendedorId,
            traceId: `START_${shipmentId}_${Date.now()}`
        });
        console.log(`[SafeShipment] Carga iniciada com sucesso - ID: ${shipmentId}`);
        return {
            success: true,
            shipmentId,
            message: `Carga ${shipmentData.placa} iniciada com sucesso`
        };
    }, 'SERIALIZABLE');
}
/**
 * Finaliza carga de forma segura
 */
export async function finishShipmentSafe(shipmentId, observacoes, tenantId, usuarioId, vendedorId) {
    return runTransaction(async (tx) => {
        console.log(`[SafeShipment] Finalizando carga - ID: ${shipmentId}`);
        // 1. Buscar carga com bloqueio
        const [shipment] = await tx.execute(`SELECT id, placa, motorista, status, tenant_id FROM cargas WHERE id = ? FOR UPDATE`, [shipmentId]);
        if (!shipment || !shipment[0]) {
            throw new ValidationError('CARGA_NAO_ENCONTRADA: Carga não encontrada');
        }
        const shipmentData = shipment[0];
        // 2. Validar status
        if (shipmentData.status !== 'EM_TRANSITO') {
            throw new ValidationError(`CARGA_STATUS_INVALIDO: Carga está com status ${shipmentData.status}, não pode ser finalizada`);
        }
        // 3. Atualizar status da carga
        await tx.execute(`UPDATE cargas SET status = 'ENTREGUE', dataChegadaReal = NOW(), observacoesFinais = ?, updated_at = NOW() WHERE id = ?`, [observacoes || '', shipmentId]);
        // 4. Atualizar status dos pedidos na carga
        await tx.execute(`UPDATE pedidos SET status = 'ENTREGUE', data_entrega = NOW(), updated_at = NOW() 
       WHERE id IN (SELECT pedido_id FROM pedidos_carga WHERE carga_id = ?)`, [shipmentId]);
        // 5. Atualizar status dos itens na carga
        await tx.execute(`UPDATE pedidos_carga SET status = 'ENTREGUE', data_entrega = NOW() WHERE carga_id = ?`, [shipmentId]);
        // 6. Registrar auditoria
        const auditTenantId = tenantId ?? Number(shipmentData.tenant_id ?? 0);
        if (!auditTenantId || auditTenantId <= 0) {
            throw new ValidationError('TENANT_ID_OBRIGATORIO: tenantId indisponível para auditoria de finalização de carga');
        }
        await insertAuditLog({
            tenantId: auditTenantId,
            action: 'CARGA_FINALIZACAO',
            entity: 'carga',
            entityId: String(shipmentId),
            payloadJson: JSON.stringify({
                shipmentId,
                placa: shipmentData.placa,
                motorista: shipmentData.motorista,
                statusAnterior: shipmentData.status,
                statusNovo: 'ENTREGUE',
                observacoes
            }),
            actorUserId: usuarioId,
            actorVendedorId: vendedorId,
            traceId: `FINISH_${shipmentId}_${Date.now()}`
        });
        console.log(`[SafeShipment] Carga finalizada com sucesso - ID: ${shipmentId}`);
        return {
            success: true,
            shipmentId,
            message: `Carga ${shipmentData.placa} finalizada com sucesso`
        };
    }, 'SERIALIZABLE');
}
/**
 * Remove pedido da carga de forma segura
 */
export async function removeOrderFromShipmentSafe(shipmentId, pedidoId, motivo = 'Remoção manual', tenantId, usuarioId, vendedorId) {
    return runTransaction(async (tx) => {
        console.log(`[SafeShipment] Removendo pedido da carga - Carga: ${shipmentId}, Pedido: ${pedidoId}`);
        // 1. Validar carga
        const [shipment] = await tx.execute(`SELECT id, status, tenant_id FROM cargas WHERE id = ? FOR UPDATE`, [shipmentId]);
        if (!shipment || !shipment[0]) {
            throw new ValidationError('CARGA_NAO_ENCONTRADA: Carga não encontrada');
        }
        const shipmentData = shipment[0];
        // 2. Validar se carga pode ser alterada
        if (shipmentData.status && ['EM_TRANSITO', 'ENTREGUE'].includes(shipmentData.status)) {
            throw new ValidationError(`CARGA_EM_TRANSITO: Carga está com status ${shipmentData.status}, não pode ser alterada`);
        }
        // 3. Validar pedido na carga
        const [pedidoNaCarga] = await tx.execute(`SELECT COUNT(*) as total FROM pedidos_carga WHERE carga_id = ? AND pedido_id = ?`, [shipmentId, pedidoId]);
        const estaNaCarga = pedidoNaCarga[0];
        const total = typeof estaNaCarga?.total === 'number' ? estaNaCarga.total : 0;
        if (total === 0) {
            throw new ValidationError('CARGA_PEDIDO_NA_ENCONTRADO: Pedido não está nesta carga');
        }
        // 4. Remover pedido da carga
        await tx.execute(`DELETE FROM pedidos_carga WHERE carga_id = ? AND pedido_id = ?`, [shipmentId, pedidoId]);
        // 5. Atualizar status do pedido
        await tx.execute(`UPDATE pedidos SET status = 'APROVADO', updated_at = NOW() WHERE id = ?`, [pedidoId]);
        // 6. Recalcular totais da carga
        await tx.execute(`UPDATE cargas c SET 
        pesoTotal = (SELECT COALESCE(SUM(p.peso), 0) FROM pedidos p INNER JOIN pedidos_carga pc ON p.id = pc.pedido_id WHERE pc.carga_id = c.id),
        volumeTotal = (SELECT COALESCE(SUM(p.volume), 0) FROM pedidos p INNER JOIN pedidos_carga pc ON p.id = pc.pedido_id WHERE pc.carga_id = c.id),
        valor_total = (SELECT COALESCE(SUM(p.total), 0) FROM pedidos p INNER JOIN pedidos_carga pc ON p.id = pc.pedido_id WHERE pc.carga_id = c.id),
        updated_at = NOW()
       WHERE id = ?`, [shipmentId]);
        // 7. Registrar auditoria
        const auditTenantId = tenantId ?? Number(shipmentData.tenant_id ?? 0);
        if (!auditTenantId || auditTenantId <= 0) {
            throw new ValidationError('TENANT_ID_OBRIGATORIO: tenantId indisponível para auditoria de remoção de pedido');
        }
        await insertAuditLog({
            tenantId: auditTenantId,
            action: 'CARGA_REMOCAO_PEDIDO',
            entity: 'carga',
            entityId: String(shipmentId),
            payloadJson: JSON.stringify({
                shipmentId,
                pedidoId,
                motivo,
                statusCarga: shipmentData.status
            }),
            actorUserId: usuarioId,
            actorVendedorId: vendedorId,
            traceId: `REMOVE_${shipmentId}_${pedidoId}_${Date.now()}`
        });
        console.log(`[SafeShipment] Pedido removido da carga com sucesso - Carga: ${shipmentId}, Pedido: ${pedidoId}`);
        return {
            success: true,
            shipmentId,
            message: `Pedido removido da carga com sucesso`
        };
    }, 'SERIALIZABLE');
}
/**
 * Gera relatório de cargas com filtros
 */
export async function getShipmentsReport(filtros) {
    const pool = await getPool();
    try {
        let query = `
      SELECT 
        c.id,
        c.placa,
        c.motorista,
        c.veiculo,
        c.dataSaida,
        c.dataSaidaReal,
        c.dataPrevistaChegada,
        c.data_chegadaReal,
        c.rota,
        c.status,
        c.pesoTotal,
        c.volumeTotal,
        c.valor_total,
        c.observacoes,
        c.observacoesFinais,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*) FROM pedidos_carga pc WHERE pc.carga_id = c.id) as totalPedidos,
        (SELECT COALESCE(SUM(p.total), 0) FROM pedidos p INNER JOIN pedidos_carga pc ON p.id = pc.pedido_id WHERE pc.carga_id = c.id) as valorPedidos
      FROM cargas c
      WHERE 1=1
    `;
        const params = [];
        // Aplicar filtros
        if (filtros.status) {
            query += ` AND c.status = ?`;
            params.push(filtros.status);
        }
        if (filtros.placa) {
            query += ` AND c.placa LIKE ?`;
            params.push(`%${filtros.placa}%`);
        }
        if (filtros.motorista) {
            query += ` AND c.motorista LIKE ?`;
            params.push(`%${filtros.motorista}%`);
        }
        if (filtros.dataInicio) {
            query += ` AND c.created_at >= ?`;
            params.push(filtros.dataInicio);
        }
        if (filtros.dataFim) {
            query += ` AND c.created_at <= ?`;
            params.push(filtros.dataFim);
        }
        query += ` ORDER BY c.created_at DESC`;
        if (filtros.limit) {
            query += ` LIMIT ?`;
            params.push(filtros.limit);
        }
        if (filtros.offset) {
            query += ` OFFSET ?`;
            params.push(filtros.offset);
        }
        const pool = await getPool();
        const [rows] = await pool.execute(query, params);
        return Array.isArray(rows) ? rows : [];
    }
    catch (error) {
        console.error('[SafeShipment] Erro ao gerar relatório:', error);
        return [];
    }
}
/**
 * Valida integridade das cargas
 */
export async function validateShipmentsIntegrity() {
    const pool = await getPool();
    try {
        const erros = [];
        let detalhes = null;
        // 1. Verificar cargas sem pedidos
        const [cargasSemPedidos] = await pool.execute(`SELECT COUNT(*) as total 
       FROM cargas c 
       LEFT JOIN pedidos_carga pc ON c.id = pc.carga_id 
       WHERE pc.carga_id IS NULL`);
        const semPedidosArr = Array.isArray(cargasSemPedidos) ? cargasSemPedidos : [];
        const totalSemPedidos = Number(semPedidosArr[0]?.total ?? 0);
        if (totalSemPedidos > 0) {
            erros.push(`${totalSemPedidos} cargas sem pedidos associados`);
        }
        // 2. Verificar pedidos em múltiplas cargas
        const [pedidosMultiplasCargas] = await pool.execute(`SELECT COUNT(*) as total 
       FROM pedidos_carga 
       GROUP BY pedido_id 
       HAVING COUNT(*) > 1`);
        const multiplasArr = Array.isArray(pedidosMultiplasCargas) ? pedidosMultiplasCargas : [];
        const totalMultiplasCargas = Number(multiplasArr[0]?.total ?? 0);
        if (totalMultiplasCargas > 0) {
            erros.push(`${totalMultiplasCargas} pedidos em múltiplas cargas`);
        }
        // 3. Verificar cargas em trânsito há muito tempo
        const [cargasTransitoAntigas] = await pool.execute(`SELECT COUNT(*) as total 
       FROM cargas 
       WHERE status = 'EM_TRANSITO' 
       AND dataSaidaReal < DATE_SUB(NOW(), INTERVAL 7 DAY)`);
        const transitoArr = Array.isArray(cargasTransitoAntigas) ? cargasTransitoAntigas : [];
        const totalTransitoAntigas = Number(transitoArr[0]?.total ?? 0);
        if (totalTransitoAntigas > 0) {
            erros.push(`${totalTransitoAntigas} cargas em trânsito há mais de 7 dias`);
        }
        detalhes = {
            cargasSemPedidos: totalSemPedidos,
            pedidosMultiplasCargas: totalMultiplasCargas,
            cargasTransitoAntigas: totalTransitoAntigas
        };
        return {
            valido: erros.length === 0,
            erros,
            detalhes
        };
    }
    catch (error) {
        console.error('[SafeShipment] Erro na validação:', error);
        return {
            valido: false,
            erros: ['Erro na validação: ' + (error instanceof Error ? error.message : String(error))],
            detalhes: null
        };
    }
}
