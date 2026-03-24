import { useCallback, useEffect, useRef, useState } from "react";

/** Debounce de valor (texto, número) para pesquisas — não confundir com useDebounce de funções. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Hook para debounce de funções
 * Impede múltiplas execuções enquanto usuário digita
 * @param func Função a ser executada
 * @param delay Tempo de espera em ms (padrão: 300ms)
 * @returns Função com debounce aplicado
 */
export function useDebounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number = 300
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedFunction = useCallback(
    (...args: Parameters<T>) => {
      // Limpar timeout anterior
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Configurar novo timeout
      timeoutRef.current = setTimeout(() => {
        func(...args);
      }, delay);
    },
    [func, delay]
  );

  return debouncedFunction as T;
}

/**
 * Hook para debounce com cancelamento
 * Permite cancelar execuções pendentes
 */
export function useDebounceWithCancel<T extends (...args: any[]) => any>(
  func: T,
  delay: number = 300
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedFunction = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        func(...args);
      }, delay);
    },
    [func, delay]
  );

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { debouncedFunction, cancel };
}
