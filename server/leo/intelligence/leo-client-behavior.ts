import { logInfo, logError } from '../../_core/logger.js';
import { ClientBehavior } from '../../_core/types.js';
import { InfrastructureError, ValidationError } from '../../_core/errors/typed-errors.js';
import { learningClientsTool } from '../../tools/learning-clients.tool.js';

export class LeoClientBehavior {
  private readonly name = 'ClientBehavior';
  private readonly tenantId: number;

  constructor(tenantId: number) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      throw new ValidationError("tenantId obrigatório");
    }
    this.tenantId = tenantId;
  }

  /**
   * Identify inactive clients
   */
  async identifyInactiveClients(daysThreshold: number = 90): Promise<ClientBehavior[]> {
    try {
      logInfo(`Identifying inactive clients (threshold: ${daysThreshold} days)`, {
        extra: { entity: this.name, acao: 'identifyInactiveClients', daysThreshold, tenantId: this.tenantId }
      });

      const inactiveClients = await learningClientsTool.getInactiveClients({
        tenantId: this.tenantId,
        daysThreshold
      });

      return inactiveClients.map(c => ({
        clientId: c.clienteId,
        lastPurchase: c.ultimaCompra ? new Date(c.ultimaCompra) : new Date(0),
        frequency: 0,
        avgTicket: 0,
        status: 'inactive',
        recommendations: ['Cliente inativo - entrar em contato para reativar']
      }));

    } catch (error) {
      logError('Failed to identify inactive clients', {
        extra: { error, entity: this.name, acao: 'identifyInactiveClients' }
      });
      throw error;
    }
  }

  /**
   * Analyze purchase frequency
   */
  async analyzePurchaseFrequency(clientId?: number): Promise<Array<{
    clientId: number;
    clientName: string;
    frequency: number;
    avgDaysBetweenPurchases: number;
    status: 'active' | 'at_risk' | 'inactive';
  }>> {
    try {
      logInfo(`Analyzing purchase frequency for client: ${clientId || 'all'}`, {
        extra: { entity: this.name, acao: 'analyzePurchaseFrequency', clientId }
      });

      const metrics = await learningClientsTool.analyzePurchaseFrequency({
        tenantId: this.tenantId,
        clientId
      });

      return metrics.map(m => ({
        clientId: m.clienteId,
        clientName: m.clienteNome,
        frequency: m.frequencia,
        avgDaysBetweenPurchases: m.diasEntrePedidos,
        status: m.status
      }));

    } catch (error) {
      logError('Failed to analyze purchase frequency', {
        extra: { error, entity: this.name, acao: 'analyzePurchaseFrequency' }
      });
      throw error;
    }
  }

  /**
   * Get client segmentation
   */
  async getClientSegmentation(): Promise<Array<{
    segment: string;
    count: number;
    avgTicket: number;
    totalRevenue: number;
    characteristics: string[];
  }>> {
    try {
      logInfo('Getting client segmentation', {
        extra: { entity: this.name, acao: 'getClientSegmentation' }
      });

      return await learningClientsTool.getClientSegmentation({
        tenantId: this.tenantId
      });

    } catch (error) {
      logError('Failed to get client segmentation', {
        extra: { error, entity: this.name, acao: 'getClientSegmentation' }
      });
      throw error;
    }
  }

  /**
   * Predict client churn risk
   */
  async predictChurnRisk(): Promise<Array<{
    clientId: number;
    clientName: string;
    riskScore: number;
    riskLevel: 'low' | 'medium' | 'high';
    factors: string[];
    recommendations: string[];
  }>> {
    try {
      logInfo('Predicting client churn risk', {
        extra: { entity: this.name, acao: 'predictChurnRisk' }
      });

      return await learningClientsTool.predictChurnRisk({
        tenantId: this.tenantId
      });

    } catch (error) {
      logError('Failed to predict churn risk', {
        extra: { error, entity: this.name, acao: 'predictChurnRisk' }
      });
      throw error;
    }
  }
}
