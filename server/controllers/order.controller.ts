import { Request, Response } from 'express';
import { OrderTool } from '../tools/order.tool.js';
import { OrderService } from '../services/order.service.js';
import { createOrderSafe } from '../modules/safe-order.module.js';

type Payload = Record<string, unknown>;

/**
 * ORDER CONTROLLER
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 * 
 * Controllers chamam SERVICES através de TOOLS
 * Sem lógica de negócio no controller
 */

class OrderController {
  private static orderTool = new OrderTool(new OrderService());

  /**
   * POST /orders
   * Create new order
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      // DEBUG: Log request state
      console.log('[ORDER-CONTROLLER] Create order request:', {
        hasTenantId: !!(req as any).tenantId,
        tenantId: (req as any).tenantId,
        hasUserId: !!(req as any).userId,
        userId: (req as any).userId,
        hasUser: !!(req as any).user,
        user: (req as any).user,
        body: req.body,
        headers: {
          authorization: req.headers.authorization?.substring(0, 50) + '...'
        }
      });

      const payload: Payload = req.body;
      const tenantId = (req as any).tenantId; // From tenant middleware
      
      console.log('[ORDER-CONTROLLER] Processing payload:', {
        originalPayload: payload,
        tenantId,
        tenantIdType: typeof tenantId
      });
      
      // Enrich with tenantId
      payload.tenantId = tenantId;
      
      console.log('[ORDER-CONTROLLER] Final payload with tenant:', {
        finalPayload: payload
      });
      
      // Use safe order creation for transaction safety
      const result = await createOrderSafe(payload as any);
      
      console.log('[ORDER-CONTROLLER] Order created successfully:', {
        result,
        success: true
      });
      
      res.status(201).json({
        success: true,
        data: result,
        message: 'Order created successfully'
      });
    } catch (error: unknown) {
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
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const payload: Payload = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
        search: req.query.search as string,
        status: req.query.status as string,
        clienteId: (() => {
          const q = req.query.clienteId ?? req.query.clientId;
          return q ? parseInt(String(q), 10) : undefined;
        })(),
        dataInicio: req.query.dataInicio as string,
        dataFim: req.query.dataFim as string,
        tenantId: (req as any).tenantId
      };
      
      const result = await OrderController.orderTool.list(payload);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Orders retrieved successfully'
      });
    } catch (error: unknown) {
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
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const tenantId = (req as any).tenantId;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID',
          message: 'Order ID must be a number'
        });
        return;
      }
      
      const payload: Payload = { id, tenantId };
      const result = await OrderController.orderTool.list(payload);
      
      // Find order in results
      const order = Array.isArray(result) ? result.find(o => (o as any).id === id) : null;
      
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
    } catch (error: unknown) {
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
   * PUT /orders/:id
   * Update order
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const tenantId = (req as any).tenantId;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID',
          message: 'Order ID must be a number'
        });
        return;
      }
      
      const payload: Payload = {
        ...req.body,
        id,
        tenantId
      };
      
      const result = await OrderController.orderTool.update(payload);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Order updated successfully'
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[OrderController] Update error:', message);
      
      res.status(400).json({
        success: false,
        error: message,
        message: 'Failed to update order'
      });
    }
  }

  /**
   * DELETE /orders/:id
   * Delete order
   */
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const tenantId = (req as any).tenantId;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID',
          message: 'Order ID must be a number'
        });
        return;
      }
      
      // Use safe order cancellation
      const result = await createOrderSafe({
        tenantId,
        pedidoId: id,
        motivo: 'Deletion',
        usuarioId: (req as any).userId
      } as any);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Order deleted successfully'
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[OrderController] Delete error:', message);
      
      res.status(500).json({
        success: false,
        error: message,
        message: 'Failed to delete order'
      });
    }
  }

  /**
   * POST /orders/:id/cancel
   * Cancel order
   */
  static async cancel(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const tenantId = (req as any).tenantId;
      const { motivo } = req.body;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID',
          message: 'Order ID must be a number'
        });
        return;
      }
      
      const result = await createOrderSafe({
        tenantId,
        pedidoId: id,
        motivo: motivo || 'Cancellation',
        usuarioId: (req as any).userId
      } as any);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Order cancelled successfully'
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[OrderController] Cancel error:', message);
      
      res.status(400).json({
        success: false,
        error: message,
        message: 'Failed to cancel order'
      });
    }
  }

  /**
   * POST /orders/:id/status
   * Update order status
   */
  static async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const tenantId = (req as any).tenantId;
      const { status, motivo } = req.body;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID',
          message: 'Order ID must be a number'
        });
        return;
      }
      
      const result = await createOrderSafe({
        tenantId,
        pedidoId: id,
        novoStatus: status,
        motivo: motivo || 'Status update',
        usuarioId: (req as any).userId
      } as any);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Order status updated successfully'
      });
    } catch (error: unknown) {
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
