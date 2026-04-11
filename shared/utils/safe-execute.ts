import { logMessage } from "./logger.js";

export function safeExecute<T>(fn: () => T, context?: Record<string, unknown>): T | null {
  try {
    return fn();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    logMessage("error", message, {
      ...(context ?? {}),
      source: "safeExecute",
    });
    return null;
  }
}
