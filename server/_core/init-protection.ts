/**
 * Inicialização da proteção de serviços
 * 
 * Este módulo deve ser importado no início da aplicação para
 * aplicar proteção a todos os serviços.
 * 
 * CRÍTICO: initializeServiceProtection() deve ser chamado explicitamente,
 * NÃO executa automaticamente no import-time.
 */
import * as clientesService from '../services/clientes.service.js';
import * as inventoryService from '../services/inventory.service.js';
import * as ordersService from '../services/orders.service.js';
import * as financeService from '../services/finance.service.js';
import * as stockSafetyService from '../services/stock-safety.service.js';
import { applyServiceProtection } from './service-protection.js';
import { startServiceMonitor } from './service-monitor.js';
import { logInfo } from './service-logger.js';

/**
 * Aplica proteção a todos os serviços conhecidos
 * 
 * Esta função deve ser chamada explicitamente após bootstrapServer().
 * NÃO executa automaticamente no import-time.
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