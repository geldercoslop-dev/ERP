/**
 * Inicialização da proteção de serviços
 * 
 * Este módulo deve ser importado no início da aplicação para
 * aplicar proteção a todos os serviços.
 */
import * as clientesService from '../services/clientes.service';
import * as inventoryService from '../services/inventory.service';
import * as ordersService from '../services/orders.service';
import * as financeService from '../services/finance.service';
import * as stockSafetyService from '../services/stock-safety.service';
import { applyServiceProtection } from './service-protection';
import { startServiceMonitor } from './service-monitor';
import { logInfo } from './service-logger';

/**
 * Aplica proteção a todos os serviços conhecidos
 */
export function initializeServiceProtection(): void {
  logInfo('Iniciando proteção de serviços...');
  
  // Aplicar proteção a cada serviço
  applyServiceProtection(clientesService, 'clientes.service');
  applyServiceProtection(inventoryService, 'inventory.service');
  applyServiceProtection(ordersService, 'orders.service');
  applyServiceProtection(financeService, 'finance.service');
  applyServiceProtection(stockSafetyService, 'stock-safety.service');
  
  // Iniciar monitor global
  startServiceMonitor();
  
  logInfo('Proteção de serviços aplicada com sucesso');
}

// Executar a inicialização automaticamente
initializeServiceProtection();