import { AsyncLocalStorage } from "node:async_hooks";

export interface ObservabilityContext {
  traceId: string;
  spanId?: string;
  requestId?: string;
}

const storage = new AsyncLocalStorage<ObservabilityContext>();

export function runWithObservabilityContext<T>(
  context: ObservabilityContext,
  operation: () => T
): T {
  return storage.run(context, operation);
}

export function getObservabilityContext(): ObservabilityContext | undefined {
  return storage.getStore();
}

