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
export { LeoScreen, leoScreen, type ScreenCaptureResult } from './perception/leo-screen.js';
export { recognizeText, type OCRResult } from './perception/leo-ocr.js';
export { LeoSystemMonitor, leoSystemMonitor, type SystemStatus, type LogEntry, type AlertLevel } from './perception/leo-system-monitor.js';

// LEO Planning
export { leoPlanner } from './planning/leo-planner.js';
export { leoInsights } from './planning/leo-insights.js';
export { leoDailyReport } from './planning/leo-daily-report.js';

// LEO Actions
export { executeLeoAction, type LeoActionResult } from './actions/leo-actions.js';
export { LeoAutomation, leoAutomation, type LeoScheduledTask, type CreateScheduledTaskInput, type TaskStatus, type TaskRecurrence } from './actions/leo-automation.js';
export { LeoDesktopControl, leoDesktopControl, type MousePosition, type ClickConfig, type KeyboardConfig } from './actions/leo-desktop-control.js';
export { LeoComputerControl, leoComputerControl, type ScriptResult, type FileOperation } from './actions/leo-computer-control.js';

// LEO Memory
export { leoMemory } from './memory/leo-memory.js';
export { LeoEvents, leoEvents, type CreateEventInput } from './memory/leo-events.js';

// LEO Security
export { 
  checkLeoPermission, 
  listarTodasPermissoes,
  temPermissaoEspecifica,
  getNivelMinimoParaAcao,
  promoverUsuario,
  type LeoPermission,
  type PermissionLevel 
} from './security/leo-permissions.js';
export { leoLoopProtection } from './security/leo-loop-protection.js';
export { leoHardening } from './security/leo-hardening.js';

// LEO Intelligence
export { LeoPatternDetection } from './intelligence/leo-pattern-detection.js';
export { LeoSalesAnalysis } from './intelligence/leo-sales-analysis.js';
export { LeoClientBehavior } from './intelligence/leo-client-behavior.js';
export { LeoStockMonitor } from './intelligence/leo-stock-monitor.js';
export { LeoAnomalyDetection } from './intelligence/leo-anomaly-detection.js';

// LEO Operator Mode
export { 
  LeoOperatorMode, 
  leoOperatorMode, 
  type LeoModeType,
  type OperatorPermissions,
  MODE_PERMISSIONS
} from './operator/leo-operator-controller.js';

// LEO Utils (LeoContext canônico em `shared/types`; runtime em utils)
export { buildLeoContext, type LeoRuntimeContext } from './utils/leo-context.js';
export type { LeoContext, LeoTask, LeoEvent, LeoAction, Payload } from '../../shared/types/index.js';
export { leoLogManager } from './utils/leo-log-manager.js';

// Desktop Automation Configuration
export { 
  DesktopAutomationManager,
  desktopAutomationManager,
  type DesktopAutomationConfig,
  DEFAULT_DESKTOP_CONFIG
} from './actions/desktop-automation-config.js';

// Legacy exports for backward compatibility
export { leoLongMemory } from './memory/leo-long-memory.js';
export { perguntar } from '../services/ai/erp-ai.service.js';
