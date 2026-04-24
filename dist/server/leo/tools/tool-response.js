/**
 * Resposta padronizada de todas as tools do LEO.
 * Garante formato único para o ActionExecutor e o frontend.
 */
/**
 * Helper para criar resposta no formato padrão.
 */
export function createToolResponse(success, message, data, meta) {
    return {
        success,
        message,
        ...(data !== undefined && { data }),
        ...(meta && Object.keys(meta).length > 0 && { meta }),
    };
}
