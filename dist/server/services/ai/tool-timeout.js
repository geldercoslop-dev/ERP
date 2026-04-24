/**
 * Timeout de execução para tools do LEO.
 * Evita que uma tool trave indefinidamente.
 */
import { InfrastructureError } from '../../_core/errors/typed-errors.js';
const DEFAULT_MS = 15000;
const DEFAULT_RETRIES = 2;
const TIMEOUT_MESSAGE = "Operação demorou mais que o esperado.";
/**
 * Executa a promise com limite de tempo. Se ultrapassar, rejeita com resposta controlada.
 */
export function executeWithTimeout(promise, ms = DEFAULT_MS) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(TIMEOUT_MESSAGE));
        }, ms);
        promise
            .then((value) => {
            clearTimeout(timer);
            resolve(value);
        })
            .catch((err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
/**
 * Executa operação com timeout + retry automático + fallback de erro.
 * Nunca deixa a cadeia travar indefinidamente.
 */
export async function executeWithFailSafe(operation, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_MS;
    const retries = options.retries ?? DEFAULT_RETRIES;
    const toolLabel = options.toolName ?? "tool";
    let lastError;
    const attempts = retries + 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await executeWithTimeout(operation(), timeoutMs);
        }
        catch (error) {
            lastError = error;
            if (attempt < attempts) {
                console.warn(`[LEO_FAIL_SAFE] retry ${attempt}/${retries} para ${toolLabel}:`, error instanceof Error ? error.message : String(error));
            }
        }
    }
    const details = lastError instanceof Error ? lastError.message : String(lastError);
    throw new InfrastructureError(`Fallback de execução acionado para ${toolLabel}: ${details}`);
}
