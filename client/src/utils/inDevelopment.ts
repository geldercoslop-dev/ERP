/**
 * Utilitários para marcar recursos em desenvolvimento SEM quebrar o app.
 *
 * Problema que isso resolve:
 * - Chamadas como inDevelopment(undefined, "...") causavam crash ao acessar fn.name.
 *
 * Regra:
 * - Se receber uma função, retorna ela (sem wrapper) para não mudar comportamento.
 * - Se receber undefined/null, retorna um handler seguro (ideal para onClick).
 */

export function inDevelopment<T extends (...args: any[]) => any>(
  fn?: T,
  message: string = 'Funcionalidade em desenvolvimento.'
): (...args: Parameters<T>) => ReturnType<T> | void {
  if (typeof fn === 'function') {
    // Log opcional e seguro
    try {
      // eslint-disable-next-line no-console
      console.log(`[DEV] Função ${fn.name || 'anônima'} marcada como em desenvolvimento`);
    } catch {}
    return fn;
  }

  // Fallback seguro para uso em onClick / handlers
  return () => {
    if (typeof window !== 'undefined') {
      window.alert(message);
    }
  };
}

export function asyncInDevelopment<T extends (...args: any[]) => Promise<any>>(
  fn?: T,
  message: string = 'Funcionalidade em desenvolvimento.'
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | void> {
  if (typeof fn === 'function') {
    try {
      // eslint-disable-next-line no-console
      console.log(`[DEV] Função assíncrona ${fn.name || 'anônima'} marcada como em desenvolvimento`);
    } catch {}
    return fn;
  }

  return async () => {
    if (typeof window !== 'undefined') {
      window.alert(message);
    }
  };
}
