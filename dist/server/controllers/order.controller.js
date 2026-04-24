import { OrderTool } from '../tools/order.tool.js';
import { OrderService } from '../services/order.service.js';
import { createOrderSafe, updateOrderStatusSafe } from '../modules/safe-order.module.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
/**

 * ORDER CONTROLLER

 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE

 *

 * Controllers chamam SERVICES através de TOOLS

 * Sem lógica de negócio no controller

 */
class OrderController {
    static orderTool = new OrderTool(new OrderService());
    /**
  
     * POST /orders
  
     * Create new order
  
     */
    static async create(req, res) {
        try {
            // Log mínimo: apenas status da ação
            console.log('[ORDER-CONTROLLER] Recebida requisição de criação de pedido');
            if (!req.user) {
                throw new ValidationError("Usuário não autenticado");
            }
            const payload = req.body;
            const tenantId = req.user.tenantId;
            // Validar tenantId obrigatório
            if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
                throw new Error('TenantId inválido ou ausente');
            }
            // Log mínimo: validando payload
            console.log('[ORDER-CONTROLLER] Validando payload do pedido');
            // Enrich with tenantId
            payload.tenantId = tenantId;
            // Log mínimo: payload enriquecido com tenantId
            console.log('[ORDER-CONTROLLER] Payload enriquecido com tenantId');
            // Use safe order creation for transaction safety
            // Validar estrutura do payload
            if (!payload || typeof payload !== 'object') {
                throw new Error('Payload inválido');
            }
            // Validar campos obrigatórios CreateOrderData
            if (!('clienteNome' in payload) || typeof payload.clienteNome !== 'string' || payload.clienteNome.trim() === '') {
                throw new Error('clienteNome é obrigatório');
            }
            if (!('formaPagamento' in payload) || typeof payload.formaPagamento !== 'string' || payload.formaPagamento.trim() === '') {
                throw new Error('formaPagamento é obrigatório');
            }
            // Validar itens obrigatórios
            if (!('itens' in payload) || !Array.isArray(payload.itens)) {
                throw new Error('itens é obrigatório e deve ser array');
            }
            // Validar estrutura dos itens
            const itens = payload.itens;
            for (const [index, item] of itens.entries()) {
                if (!item || typeof item !== 'object') {
                    throw new Error(`Item ${index} inválido: esperado objeto`);
                }
                const itemObj = item;
                if (!('produtoId' in itemObj) || typeof itemObj.produtoId !== 'number' || itemObj.produtoId <= 0) {
                    throw new Error(`Item ${index}: produtoId inválido`);
                }
                if (!('quantidade' in itemObj) || typeof itemObj.quantidade !== 'number' || itemObj.quantidade <= 0) {
                    throw new Error(`Item ${index}: quantidade inválida`);
                }
                if (!('valorUnitario' in itemObj) || typeof itemObj.valorUnitario !== 'number' || itemObj.valorUnitario < 0) {
                    throw new Error(`Item ${index}: valorUnitario inválido`);
                }
                if (!('total' in itemObj) || typeof itemObj.total !== 'number' || itemObj.total < 0) {
                    throw new Error(`Item ${index}: total inválido`);
                }
            }
            // Construir CreateOrderData validado
            const createOrderData = {
                tenantId,
                clienteNome: payload.clienteNome,
                formaPagamento: payload.formaPagamento,
                itens: payload.itens
            };
            // Campos opcionais
            if ('numero' in payload && typeof payload.numero === 'number') {
                createOrderData.numero = payload.numero;
            }
            if ('clienteId' in payload && typeof payload.clienteId === 'number') {
                createOrderData.clienteId = payload.clienteId;
            }
            if ('entradaForma' in payload && typeof payload.entradaForma === 'string') {
                createOrderData.entradaForma = payload.entradaForma;
            }
            if ('entradaValor' in payload && typeof payload.entradaValor === 'number') {
                createOrderData.entradaValor = payload.entradaValor;
            }
            if ('segundaForma' in payload && typeof payload.segundaForma === 'string') {
                createOrderData.segundaForma = payload.segundaForma;
            }
            if ('segundaValor' in payload && typeof payload.segundaValor === 'number') {
                createOrderData.segundaValor = payload.segundaValor;
            }
            if ('boletoParcelas' in payload && typeof payload.boletoParcelas === 'number') {
                createOrderData.boletoParcelas = payload.boletoParcelas;
            }
            if ('boletoVencimentos' in payload && Array.isArray(payload.boletoVencimentos)) {
                createOrderData.boletoVencimentos = payload.boletoVencimentos;
            }
            if ('status' in payload && typeof payload.status === 'string') {
                createOrderData.status = payload.status;
            }
            if ('usuarioId' in payload && typeof payload.usuarioId === 'number') {
                createOrderData.usuarioId = payload.usuarioId;
            }
            if ('vendedorId' in payload && typeof payload.vendedorId === 'number') {
                createOrderData.vendedorId = payload.vendedorId;
            }
            if ('ip' in payload && typeof payload.ip === 'string') {
                createOrderData.ip = payload.ip;
            }
            if ('userAgent' in payload && typeof payload.userAgent === 'string') {
                createOrderData.userAgent = payload.userAgent;
            }
            const result = await createOrderSafe(createOrderData);
            console.log('[ORDER-CONTROLLER] Order created successfully:', {
                result,
                success: true
            });
            res.status(201).json({
                success: true,
                data: result,
                message: 'Order created successfully'
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[OrderController] Create error:', message);
            res.status(400).json({
                success: false,
                error: message,
                message: 'Failed to create order'
            });
        }
    }
    /**
  
     * GET /orders
  
     * List orders with pagination and filters
  
     */
    static async list(req, res) {
        try {
            if (!req.user) {
                throw new ValidationError("Usuário não autenticado");
            }
            const payload = {
                page: parseInt(req.query?.page) || 1,
                limit: parseInt(req.query?.limit) || 50,
                search: req.query?.search,
                status: req.query?.status,
                clienteId: (() => {
                    const q = req.query?.clienteId ?? req.query?.clientId;
                    return q ? parseInt(String(q), 10) : undefined;
                })(),
                dataInicio: req.query?.dataInicio,
                dataFim: req.query?.dataFim,
                tenantId: req.user.tenantId
            };
            const result = await OrderController.orderTool.list(payload);
            res.status(200).json({
                success: true,
                data: result,
                message: 'Orders retrieved successfully'
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[OrderController] List error:', message);
            res.status(500).json({
                success: false,
                error: message,
                message: 'Failed to retrieve orders'
            });
        }
    }
    /**
  
     * GET /orders/:id
  
     * Get order by ID
  
     */
    static async getById(req, res) {
        try {
            if (!req.user) {
                throw new ValidationError("Usuário não autenticado");
            }
            const id = parseInt(req.params?.id);
            if (!id || id <= 0) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }
            const tenantId = req.user.tenantId;
            if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
                res.status(400).json({
                    success: false,
                    error: 'TenantId inválido ou ausente'
                });
                return;
            }
            const payload = { id, tenantId };
            const result = await OrderController.orderTool.list(payload);
            // Find order in results
            const order = Array.isArray(result) ? result.find((o) => typeof o === 'object' && o !== null && 'id' in o ? o.id === id : false) : null;
            if (!order) {
                res.status(404).json({
                    success: false,
                    error: 'Order not found',
                    message: 'Order not found'
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: order,
                message: 'Order retrieved successfully'
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[OrderController] GetById error:', message);
            res.status(500).json({
                success: false,
                error: message,
                message: 'Failed to retrieve order'
            });
        }
    }
    /**
  
     * PATCH /orders/:id/status
  
     * Update order status
  
     */
    static async updateStatus(req, res) {
        try {
            if (!req.user) {
                throw new ValidationError("Usuário não autenticado");
            }
            const id = parseInt(req.params?.id);
            if (!id || id <= 0) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid order ID',
                    message: 'Order ID must be a number'
                });
                return;
            }
            const tenantId = req.user.tenantId;
            if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
                res.status(400).json({
                    success: false,
                    error: 'TenantId inválido ou ausente',
                    message: 'TenantId obrigatório para atualizar status'
                });
                return;
            }
            const status = typeof req.body?.status === 'string' ? req.body.status : undefined;
            if (!status) {
                res.status(400).json({
                    success: false,
                    error: 'Status ausente ou inválido',
                    message: 'Status obrigatório para atualizar pedido'
                });
                return;
            }
            const result = await updateOrderStatusSafe(tenantId, id, status, typeof req.body?.motivo === 'string' ? req.body.motivo : 'Status update', typeof req.body?.userId === 'number' ? req.body.userId : undefined);
            res.status(200).json({
                success: true,
                data: result,
                message: 'Order status updated successfully'
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[OrderController] UpdateStatus error:', message);
            res.status(400).json({
                success: false,
                error: message,
                message: 'Failed to update order status'
            });
        }
    }
}
export { OrderController };
