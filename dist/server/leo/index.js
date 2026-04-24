/**
 * Index do módulo LEO
 *
 * Exporta todos os componentes do núcleo do Leo e módulos avançados
 */
// Core - Infrastructure
export * from '../_core/env.js';
export * from '../_core/logger.js';
export * from '../_core/errors.js';
export * from '../_core/types.js';
// LEO Agent (NOVO)
export * from './agent/index.js';
// LEO Plugins
import { DesktopAutomationPlugin } from './plugins/desktop-plugin.js';
DesktopAutomationPlugin.start();
// LEO Engine
export { LeoEngine, leoEngine } from './engine/leo-engine.js';
export { leoLoop } from './engine/leo-loop.js';
export { leoSupervisor } from './engine/leo-supervisor.js';
export { leoScheduler } from './engine/leo-scheduler.js';
// LEO Perception
export { leoErpObserver } from './perception/leo-erp-observer.js';
export { LeoScreen, leoScreen } from './perception/leo-screen.js';
export { recognizeText } from './perception/leo-ocr.js';
export { LeoSystemMonitor, leoSystemMonitor } from './perception/leo-system-monitor.js';
// LEO Planning
export { leoPlanner } from './planning/leo-planner.js';
export { leoInsights } from './planning/leo-insights.js';
export { leoDailyReport } from './planning/leo-daily-report.js';
// LEO Actions
export { executeLeoAction } from './actions/leo-actions.js';
export { LeoAutomation, leoAutomation } from './actions/leo-automation.js';
export { LeoDesktopControl, leoDesktopControl } from './actions/leo-desktop-control.js';
export { LeoComputerControl, leoComputerControl } from './actions/leo-computer-control.js';
// LEO Memory
export { leoMemory } from './memory/leo-memory.js';
export { LeoEvents, leoEvents } from './memory/leo-events.js';
// LEO Security
export { checkLeoPermission, listarTodasPermissoes, temPermissaoEspecifica, getNivelMinimoParaAcao, promoverUsuario } from './security/leo-permissions.js';
export { leoLoopProtection } from './security/leo-loop-protection.js';
export { leoHardening } from './security/leo-hardening.js';
// LEO Intelligence
export { LeoPatternDetection } from './intelligence/leo-pattern-detection.js';
export { LeoSalesAnalysis } from './intelligence/leo-sales-analysis.js';
export { LeoClientBehavior } from './intelligence/leo-client-behavior.js';
export { LeoStockMonitor } from './intelligence/leo-stock-monitor.js';
export { LeoAnomalyDetection } from './intelligence/leo-anomaly-detection.js';
// LEO Operator Mode
export { LeoOperatorMode, leoOperatorMode, MODE_PERMISSIONS } from './operator/leo-operator-controller.js';
// LEO Utils (LeoContext canônico em `shared/types`; runtime em utils)
export { buildLeoContext } from './utils/leo-context.js';
export { leoLogManager } from './utils/leo-log-manager.js';
// Desktop Automation Configuration
export { DesktopAutomationManager, desktopAutomationManager, DEFAULT_DESKTOP_CONFIG } from './actions/desktop-automation-config.js';
// Legacy exports for backward compatibility
export { leoLongMemory } from './memory/leo-long-memory.js';
export { perguntar } from '../services/ai/erp-ai.service.js';
