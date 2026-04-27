/**
 * Ponto central de exportação de tipos LEO para o servidor
 * Reexporta todos os tipos de `shared/types` via barrel index.js
 * Enums são exportados como valores (não type-only) pois são usados em runtime
 */

export {
  // Enums (valores em runtime)
  LeoEventType,
  LeoEventStatus,
  LeoEventPriority,
  LeoMemoryType,
  LeoCommandOrigin,
  LeoInsightType,
  LeoInsightImpact,
  LeoTaskType,
  LeoTaskPriority,
  LeoTaskStatus,
} from "../../shared/types/index.js";

export type {
  // Interfaces principais
  LeoEvent,
  LeoAction,
  LeoDecision,
  LeoMemoryRecord,
  LeoTask,
  LeoInsight,
  LeoContext,
  
  // Interfaces de serviço
  ILeoLoop,
  ILeoMemory,
  ILeoEvents,
  ILeoTaskQueue,
  ILeoErpObserver,
  
  // Tipos auxiliares
  LeoObserveResult,
  CreateEventInput,
  CreateTaskInput,
  
  // Tipos globais
  GenericPayload,
  Payload
} from "../../shared/types/index.js";

// ActionResult definido localmente para garantir ESM compatibility
export interface ActionResult {
  success: boolean;
  message: string;
}
