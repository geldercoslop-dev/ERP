/**
 * Index do módulo LEO
 * 
 * Exporta todos os componentes do núcleo do Leo e módulos avançados
 */

// Core - Infrastructure
export * from '../_core/env';
export * from '../_core/logger';
export * from '../_core/errors';
export * from '../_core/types';

// LEO Agent (NOVO)
export * from './agent';

// LEO Plugins
import { DesktopAutomationPlugin } from './plugins/desktop-plugin';
DesktopAutomationPlugin.start();

// LEO Engine
export { LeoEngine, leoEngine } from './engine/leo-engine';
export { leoLoop } from './engine/leo-loop';
export { leoSupervisor } from './engine/leo-supervisor';
export { leoScheduler } from './engine/leo-scheduler';

// LEO Perception
export { leoErpObserver } from './perception/leo-erp-observer';
export { LeoScreen, leoScreen, type ScreenCaptureResult } from './perception/leo-screen';
export { recognizeText, type OCRResult } from './perception/leo-ocr';
export { LeoSystemMonitor, leoSystemMonitor, type SystemStatus, type LogEntry, type AlertLevel } from './perception/leo-system-monitor';

// LEO Planning
export { leoPlanner } from './planning/leo-planner';
export { leoInsights } from './planning/leo-insights';
export { leoDailyReport } from './planning/leo-daily-report';

// LEO Actions
export { executeLeoAction, type LeoActionResult } from './actions/leo-actions';
export { LeoAutomation, leoAutomation, type LeoScheduledTask, type CreateScheduledTaskInput, type TaskStatus, type TaskRecurrence } from './actions/leo-automation';
export { LeoDesktopControl, leoDesktopControl, type MousePosition, type ClickConfig, type KeyboardConfig } from './actions/leo-desktop-control';
export { LeoComputerControl, leoComputerControl, type ScriptResult, type FileOperation } from './actions/leo-computer-control';

// LEO Memory
export { leoMemory } from './memory/leo-memory';
export { LeoEvents, leoEvents, type CreateEventInput } from './memory/leo-events';

// LEO Security
export { 
  checkLeoPermission, 
  listarTodasPermissoes,
  temPermissaoEspecifica,
  getNivelMinimoParaAcao,
  promoverUsuario,
  type LeoPermission,
  type PermissionLevel 
} from './security/leo-permissions';
export { leoLoopProtection } from './security/leo-loop-protection';
export { leoHardening } from './security/leo-hardening';

// LEO Intelligence
export { LeoPatternDetection } from './intelligence/leo-pattern-detection';
export { LeoSalesAnalysis } from './intelligence/leo-sales-analysis';
export { LeoClientBehavior } from './intelligence/leo-client-behavior';
export { LeoStockMonitor } from './intelligence/leo-stock-monitor';
export { LeoAnomalyDetection } from './intelligence/leo-anomaly-detection';

// LEO Operator Mode
export { 
  LeoOperatorMode, 
  leoOperatorMode, 
  type LeoModeType,
  type OperatorPermissions,
  MODE_PERMISSIONS
} from './operator/leo-operator-controller';

// LEO Utils (LeoContext canônico em @shared/types; runtime em utils)
export { buildLeoContext, type LeoRuntimeContext } from './utils/leo-context';
export type { LeoContext, LeoTask, LeoEvent, LeoAction, Payload } from '../../shared/types';
export { leoLogManager } from './utils/leo-log-manager';

// Desktop Automation Configuration
export { 
  DesktopAutomationManager,
  desktopAutomationManager,
  type DesktopAutomationConfig,
  DEFAULT_DESKTOP_CONFIG
} from './actions/desktop-automation-config';

// Legacy exports for backward compatibility
export { leoLongMemory } from './memory/leo-long-memory';
export { perguntar } from '../services/ai/erp-ai.service';
