import { Request, Response } from 'express';
import { PaymentTool } from '../tools/payment.tool.js';
import { PaymentService } from '../services/payment.service.js';
import { RequestWithTenant } from '../middleware/tenant.middleware.js';

type Payload = Record<string, unknown>;



/**

 * PAYMENT CONTROLLER

 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE

 * 

 * Controllers chamam SERVICES através de TOOLS

 * Sem lógica de negócio no controller

 */



class PaymentController {

  private static paymentTool = new PaymentTool(new PaymentService());



  /**

   * POST /payments

   * Create new payment

   */

  static async create(req: Request, res: Response): Promise<void> {

    try {

      const payload: Payload = req.body;

      const reqWithTenant = req as RequestWithTenant;
      const tenantId = reqWithTenant.tenantId;
      
      if (!tenantId) {
        res.status(401).json({
          success: false,
          error: 'Tenant ID required',
          message: 'Tenant ID is required for payment creation'
        });
        return;
      }

      

      // Enrich with tenantId

      payload.tenantId = tenantId;

      

      const result = await PaymentController.paymentTool.create(payload);

      

      res.status(201).json({

        success: true,

        data: result,

        message: 'Payment created successfully'

      });

    } catch (error: unknown) {

      const message = error instanceof Error ? error.message : 'Unknown error';

      console.error('[PaymentController] Create error:', message);

      

      res.status(400).json({

        success: false,

        error: message,

        message: 'Failed to create payment'

      });

    }

  }



  /**

   * GET /payments

   * List payments with pagination and filters

   */

  static async list(req: Request, res: Response): Promise<void> {

    try {

      const payload: Payload = {
        page: typeof req.query.page === 'string' ? parseInt(req.query.page) : 1,
        limit: typeof req.query.limit === 'string' ? parseInt(req.query.limit) : 50,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        tipo: typeof req.query.tipo === 'string' ? req.query.tipo : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        dataInicio: typeof req.query.dataInicio === 'string' ? req.query.dataInicio : undefined,
        dataFim: typeof req.query.dataFim === 'string' ? req.query.dataFim : undefined,
        tenantId: (req as RequestWithTenant).tenantId
      };

      

      const result = await PaymentController.paymentTool.list(payload);

      

      res.status(200).json({

        success: true,

        data: result,

        message: 'Payments retrieved successfully'

      });

    } catch (error: unknown) {

      const message = error instanceof Error ? error.message : 'Unknown error';

      console.error('[PaymentController] List error:', message);

      

      res.status(500).json({

        success: false,

        error: message,

        message: 'Failed to retrieve payments'

      });

    }

  }



  /**

   * GET /payments/:id

   * Get payment by ID

   */

  static async getById(req: Request, res: Response): Promise<void> {

    try {

      const id = parseInt(req.params.id);

      const reqWithTenant = req as RequestWithTenant;
      const tenantId = reqWithTenant.tenantId;

      

      if (isNaN(id)) {

        res.status(400).json({

          success: false,

          error: 'Invalid payment ID',

          message: 'Payment ID must be a number'

        });

        return;

      }

      

      const payload: Payload = { id, tenantId };

      const result = await PaymentController.paymentTool.list(payload);

      

      // Find payment in results

      const payment = Array.isArray(result) ? result.find(p => typeof p === 'object' && p !== null && 'id' in p && (p as { id: number }).id === id) : null;

      

      if (!payment) {

        res.status(404).json({

          success: false,

          error: 'Payment not found',

          message: 'Payment not found'

        });

        return;

      }

      

      res.status(200).json({

        success: true,

        data: payment,

        message: 'Payment retrieved successfully'

      });

    } catch (error: unknown) {

      const message = error instanceof Error ? error.message : 'Unknown error';

      console.error('[PaymentController] GetById error:', message);

      

      res.status(500).json({

        success: false,

        error: message,

        message: 'Failed to retrieve payment'

      });

    }

  }



  /**

   * PUT /payments/:id

   * Update payment

   */

  static async update(req: Request, res: Response): Promise<void> {

    try {

      const id = parseInt(req.params.id);

      const reqWithTenant = req as RequestWithTenant;
      const tenantId = reqWithTenant.tenantId;

      

      if (isNaN(id)) {

        res.status(400).json({

          success: false,

          error: 'Invalid payment ID',

          message: 'Payment ID must be a number'

        });

        return;

      }

      

      const payload: Payload = {

        ...req.body,

        id,

        tenantId

      };

      

      const result = await PaymentController.paymentTool.update(payload);

      

      res.status(200).json({

        success: true,

        data: result,

        message: 'Payment updated successfully'

      });

    } catch (error: unknown) {

      const message = error instanceof Error ? error.message : 'Unknown error';

      console.error('[PaymentController] Update error:', message);

      

      res.status(400).json({

        success: false,

        error: message,

        message: 'Failed to update payment'

      });

    }

  }



  /**

   * DELETE /payments/:id

   * Delete payment

   */

  static async delete(req: Request, res: Response): Promise<void> {

    try {

      const id = parseInt(req.params.id);

      const reqWithTenant = req as RequestWithTenant;
      const tenantId = reqWithTenant.tenantId;

      

      if (isNaN(id)) {

        res.status(400).json({

          success: false,

          error: 'Invalid payment ID',

          message: 'Payment ID must be a number'

        });

        return;

      }

      

      // For now, we'll mark as cancelled (soft delete)

      const payload: Payload = {

        id,

        tenantId,

        status: 'cancelled'

      };

      

      const result = await PaymentController.paymentTool.update(payload);

      

      res.status(200).json({

        success: true,

        data: result,

        message: 'Payment deleted successfully'

      });

    } catch (error: unknown) {

      const message = error instanceof Error ? error.message : 'Unknown error';

      console.error('[PaymentController] Delete error:', message);

      

      res.status(500).json({

        success: false,

        error: message,

        message: 'Failed to delete payment'

      });

    }

  }



  /**

   * POST /payments/:id/cancel

   * Cancel payment

   */

  static async cancel(req: Request, res: Response): Promise<void> {

    try {

      const id = parseInt(req.params.id);

      const reqWithTenant = req as RequestWithTenant;
      const tenantId = reqWithTenant.tenantId;

      const { motivo } = req.body;

      

      if (isNaN(id)) {

        res.status(400).json({

          success: false,

          error: 'Invalid payment ID',

          message: 'Payment ID must be a number'

        });

        return;

      }

      

      const payload: Payload = {

        id,

        tenantId,

        status: 'cancelled',

        motivo: motivo || 'Cancellation'

      };

      

      const result = await PaymentController.paymentTool.update(payload);

      

      res.status(200).json({

        success: true,

        data: result,

        message: 'Payment cancelled successfully'

      });

    } catch (error: unknown) {

      const message = error instanceof Error ? error.message : 'Unknown error';

      console.error('[PaymentController] Cancel error:', message);

      

      res.status(400).json({

        success: false,

        error: message,

        message: 'Failed to cancel payment'

      });

    }

  }



  /**

   * POST /payments/:id/reconcile

   * Reconcile payment

   */

  static async reconcile(req: Request, res: Response): Promise<void> {

    try {

      const id = parseInt(req.params.id);

      const reqWithTenant = req as RequestWithTenant;
      const tenantId = reqWithTenant.tenantId;

      const { valorConciliado, dataConciliacao, observacoes } = req.body;

      

      if (isNaN(id)) {

        res.status(400).json({

          success: false,

          error: 'Invalid payment ID',

          message: 'Payment ID must be a number'

        });

        return;

      }

      

      const payload: Payload = {

        id,

        tenantId,

        status: 'reconciled',

        valorConciliado,

        dataConciliacao,

        observacoes

      };

      

      const result = await PaymentController.paymentTool.update(payload);

      

      res.status(200).json({

        success: true,

        data: result,

        message: 'Payment reconciled successfully'

      });

    } catch (error: unknown) {

      const message = error instanceof Error ? error.message : 'Unknown error';

      console.error('[PaymentController] Reconcile error:', message);

      

      res.status(400).json({

        success: false,

        error: message,

        message: 'Failed to reconcile payment'

      });

    }

  }

}



export { PaymentController };

