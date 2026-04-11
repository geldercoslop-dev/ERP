import { Request, Response } from 'express';
import { ClientTool } from '../tools/client.tool.js';
import { ClientService } from '../services/client.service.js';
import { RequestWithTenant } from '../middleware/tenant.middleware.js';

type Payload = Record<string, unknown>;

/**
 * CLIENT CONTROLLER
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 * 
 * Controllers chamam SERVICES através de TOOLS
 * Sem lógica de negócio no controller
 */

class ClientController {
  private static clientTool = new ClientTool(new ClientService());

  /**
   * POST /clients
   * Create new client
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
          message: 'Tenant ID is required for client creation'
        });
        return;
      }
      
      // Enrich with tenantId
      payload.tenantId = tenantId;
      
      const result = await ClientController.clientTool.create(payload);
      
      res.status(201).json({
        success: true,
        data: result,
        message: 'Client created successfully'
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ClientController] Create error:', message);
      
      res.status(400).json({
        success: false,
        error: message,
        message: 'Failed to create client'
      });
    }
  }

  /**
   * GET /clients
   * List clients with pagination and filters
   */
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const payload: Payload = {
        page: typeof req.query.page === 'string' ? parseInt(req.query.page) : 1,
        limit: typeof req.query.limit === 'string' ? parseInt(req.query.limit) : 50,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        tenantId: (req as RequestWithTenant).tenantId
      };
      
      const result = await ClientController.clientTool.list(payload);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Clients retrieved successfully'
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ClientController] List error:', message);
      
      res.status(500).json({
        success: false,
        error: message,
        message: 'Failed to retrieve clients'
      });
    }
  }

  /**
   * GET /clients/:id
   * Get client by ID
   */
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const reqWithTenant = req as RequestWithTenant;
      const tenantId = reqWithTenant.tenantId;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: 'Invalid client ID',
          message: 'Client ID must be a number'
        });
        return;
      }
      
      const payload: Payload = { id, tenantId };
      const result = await ClientController.clientTool.list(payload);
      
      // Find client in results
      const client = Array.isArray(result) ? result.find(c => typeof c === 'object' && c !== null && 'id' in c && (c as { id: number }).id === id) : null;
      
      if (!client) {
        res.status(404).json({
          success: false,
          error: 'Client not found',
          message: 'Client not found'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        data: client,
        message: 'Client retrieved successfully'
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ClientController] GetById error:', message);
      
      res.status(500).json({
        success: false,
        error: message,
        message: 'Failed to retrieve client'
      });
    }
  }

  /**
   * PUT /clients/:id
   * Update client
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const reqWithTenant = req as RequestWithTenant;
      const tenantId = reqWithTenant.tenantId;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: 'Invalid client ID',
          message: 'Client ID must be a number'
        });
        return;
      }
      
      const payload: Payload = {
        ...req.body,
        id,
        tenantId
      };
      
      const result = await ClientController.clientTool.update(payload);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Client updated successfully'
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ClientController] Update error:', message);
      
      res.status(400).json({
        success: false,
        error: message,
        message: 'Failed to update client'
      });
    }
  }

  /**
   * DELETE /clients/:id
   * Delete client
   */
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const reqWithTenant = req as RequestWithTenant;
      const tenantId = reqWithTenant.tenantId;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: 'Invalid client ID',
          message: 'Client ID must be a number'
        });
        return;
      }
      
      // For now, we'll mark as inactive (soft delete)
      const payload: Payload = {
        id,
        tenantId,
        status: 'inactive'
      };
      
      const result = await ClientController.clientTool.update(payload);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Client deleted successfully'
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ClientController] Delete error:', message);
      
      res.status(500).json({
        success: false,
        error: message,
        message: 'Failed to delete client'
      });
    }
  }
}

export { ClientController };
