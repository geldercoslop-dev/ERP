/**
 * Tipos Centrais LEO - Estrutura Oficial
 * Tipos de dados vêm de `shared/types` via `../types.ts`; interfaces de sistema ficam aqui.
 */
// ============================================================================
// ERROR TYPES
// ============================================================================
/**
 * Erro LEO base
 */
export class LeoError extends Error {
    code;
    context;
    constructor(message, code, context) {
        super(message);
        this.code = code;
        this.context = context;
        this.name = 'LeoError';
    }
}
/**
 * Erro de permissão
 */
export class LeoPermissionError extends LeoError {
    constructor(action, context) {
        super(`Permission denied: ${action}`, 'PERMISSION_DENIED', context);
        this.name = 'LeoPermissionError';
    }
}
/**
 * Erro de timeout
 */
export class LeoTimeoutError extends LeoError {
    constructor(taskId, timeout) {
        super(`Task timeout: ${taskId} after ${timeout}ms`, 'TIMEOUT', { taskId, timeout });
        this.name = 'LeoTimeoutError';
    }
}
/**
 * Erro de validação
 */
export class LeoValidationError extends LeoError {
    constructor(field, value, expected) {
        super(`Validation failed: ${field}`, 'VALIDATION_ERROR', { field, value, expected });
        this.name = 'LeoValidationError';
    }
}
