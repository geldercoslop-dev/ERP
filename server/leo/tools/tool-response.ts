/**
 * Resposta padronizada de todas as tools do LEO.
 * Garante formato único para o ActionExecutor e o frontend.
 */

export type ToolResponse = {
  success: boolean;
  message: string;
  data?: unknown;
  meta?: Record<string, unknown>;
};

/**
 * Helper para criar resposta no formato padrão.
 */
export function createToolResponse(
  success: boolean,
  message: string,
  data?: unknown,
  meta?: Record<string, unknown>
): ToolResponse {
  return {
    success,
    message,
    ...(data !== undefined && { data }),
    ...(meta && Object.keys(meta).length > 0 && { meta }),
  };
}
