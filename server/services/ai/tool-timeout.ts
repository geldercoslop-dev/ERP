/**
 * Timeout de execução para tools do LEO.
 * Evita que uma tool trave indefinidamente.
 */

const DEFAULT_MS = 15000;
const DEFAULT_RETRIES = 2;

const TIMEOUT_MESSAGE = "Operação demorou mais que o esperado.";

/**
 * Executa a promise com limite de tempo. Se ultrapassar, rejeita com resposta controlada.
 */
export function executeWithTimeout<T>(
  promise: Promise<T>,
  ms: number = DEFAULT_MS
): Promise<T> {
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

export type FailSafeOptions = {
  timeoutMs?: number;
  retries?: number;
  toolName?: string;
};

/**
 * Executa operação com timeout + retry automático + fallback de erro.
 * Nunca deixa a cadeia travar indefinidamente.
 */
export async function executeWithFailSafe<T>(
  operation: () => Promise<T>,
  options: FailSafeOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const toolLabel = options.toolName ?? "tool";

  let lastError: unknown;
  const attempts = retries + 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await executeWithTimeout(operation(), timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(
          `[LEO_FAIL_SAFE] retry ${attempt}/${retries} para ${toolLabel}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }

  const details = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Fallback de execução acionado para ${toolLabel}: ${details}`);
}
