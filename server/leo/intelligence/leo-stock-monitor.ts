import { logInfo, logError } from '../../_core/logger.js';
import { inventoryMonitorTool } from '../../tools/inventory-monitor.tool.js';
import { LeoTaskPriority } from '../../../shared/types/index.js';
import { ValidationError } from '../../_core/errors/typed-errors.js';

const LEO_STOCK_RUNNING_LOW_THRESHOLD = 5;

// O schema atual não possui estoque_minimo por produto. 
// Este valor é uma política operacional única para alerta de "item acabando". 
// Não representa bloqueio de estoque negativo nem estoque mínimo real do cadastro. 

type LeoStockMonitorProductRow = {
  id: number | string;
  descricao?: string | null;
  estoque?: number | string | null;
};

export interface StockAlert {
  productId: number;
  productName: string;
  currentStock: number;
  minStock: number;
  status: 'low' | 'critical' | 'out';
  recommendation: string;
  priority: LeoTaskPriority;
}

/**
 * Obtém tenantId do ambiente ou lança erro se não disponível
 * CRÍTICO: Não permite fallback para tenant fixo
 */


export class LeoStockMonitor {
  private static instance: LeoStockMonitor;
  private name = 'LeoStockMonitor';

  private constructor() {}

  public static getInstance(): LeoStockMonitor {
    if (!LeoStockMonitor.instance) {
      LeoStockMonitor.instance = new LeoStockMonitor();
    }
    return LeoStockMonitor.instance;
  }

  async checkLowStock(tenantId: number): Promise<StockAlert[]> {
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new ValidationError("tenantId obrigatório");
    }
    try {
      const rows = await inventoryMonitorTool.listProdutosBaixoEstoqueLeo({ tenantId, limite: 20 });

      const alerts: StockAlert[] = rows.map((product: LeoStockMonitorProductRow) => {
        const currentStock = Number(product.estoque || 0);
        const runningLowThreshold = LEO_STOCK_RUNNING_LOW_THRESHOLD;

        let status: 'low' | 'critical' | 'out' = 'low';
        let recommendation = '';
        let priority: LeoTaskPriority = LeoTaskPriority.LOW;

        if (currentStock <= 0) {
          status = 'out';
          recommendation = 'Item esgotado - reposição urgente necessária';
          priority = LeoTaskPriority.CRITICAL;
        } else if (currentStock <= Math.floor(runningLowThreshold / 2)) {
          status = 'critical';
          recommendation = 'Item acabando (nível crítico) - verificar reposição imediata';
          priority = LeoTaskPriority.HIGH;
        } else if (currentStock <= runningLowThreshold) {
          status = 'low';
          recommendation = 'Item acabando - política operacional sugere verificar reposição';
          priority = LeoTaskPriority.MEDIUM;
        } else {
          recommendation = 'Estoque acima do threshold de alerta operacional';
          priority = LeoTaskPriority.LOW;
        }

        return {
          productId: Number(product.id),
          productName: product.descricao || 'Produto sem nome',
          currentStock,
          minStock: runningLowThreshold,
          status,
          recommendation,
          priority,
        };
      });

      logInfo(`Found ${alerts.length} products with low stock`, {
        extra: { entity: this.name, acao: 'checkLowStock', alertCount: alerts.length },
      });

      return alerts;
    } catch (error) {
      logError('Failed to check low stock', {
        extra: { error, entity: this.name, acao: 'checkLowStock' },
      });
      throw error;
    }
  }

  async getProductsNeedingRestock(tenantId: number): Promise<StockAlert[]> {
    try {
      const alerts = await this.checkLowStock(tenantId);

      const result = alerts.filter((alert) => alert.status === 'critical' || alert.status === 'out');

      logInfo(`Found ${result.length} products needing immediate restock`, {
        extra: { entity: this.name, acao: 'getProductsNeedingRestock', count: result.length },
      });

      return result;
    } catch (error) {
      logError('Failed to get products needing restock', {
        extra: { error, entity: this.name, acao: 'getProductsNeedingRestock' },
      });
      throw error;
    }
  }
}

export const leoStockMonitor = LeoStockMonitor.getInstance();
