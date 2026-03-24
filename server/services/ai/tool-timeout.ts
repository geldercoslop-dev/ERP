/**
 * Timeout de execução para tools do LEO.
 * Evita que uma tool trave indefinidamente.
 */

const DEFAULT_MS = 3000;

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
