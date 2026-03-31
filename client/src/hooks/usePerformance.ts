/**
 * Performance Hooks - Otimizações de React
 * 
 * - useDeepMemo: Memorização com comparação profunda
 * - useDebouncedValue: Debounce para valores
 * - useThrottledCallback: Throttle para callbacks
 */

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { deepCloneByJson } from '../utils/json-helpers';

/**
 * useDeepMemo - Memorização com comparação profunda
 * Útil para objetos/arrays complexos que mudam de referência
 */
export function useDeepMemo<T>(factory: () => T, deps: React.DependencyList): T {
  const ref = useRef<{ value: T; deps: React.DependencyList } | null>(null);

  // Comparação profunda de deps
  const depsChanged = !ref.current || depsDifferent(ref.current.deps, deps);

  if (depsChanged) {
    ref.current = { value: factory(), deps };
  }

  if (!ref.current) {
    ref.current = { value: factory(), deps };
  }

  return ref.current.value;
}

/**
 * useDebouncedValue - Debounce para valores
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(handler);
  }, [value, delayMs]);

  return debouncedValue;
}

/**
 * useThrottledCallback - Throttle para callbacks
 */
export function useThrottledCallback<A extends any[]>(
  callback: (...args: A) => void,
  delayMs: number = 500
): (...args: A) => void {
  const lastCallRef = useRef(Date.now());

  return useCallback(
    (...args: A) => {
      const now = Date.now();
      if (now - lastCallRef.current >= delayMs) {
        lastCallRef.current = now;
        callback(...args);
      }
    },
    [callback, delayMs]
  );
}

/**
 * useLazyCallback - Callback que executa lazy (com delay)
 */
export function useLazyCallback<A extends any[]>(
  callback: (...args: A) => void,
  delayMs: number = 0
): (...args: A) => void {
  return useCallback(
    (...args: A) => {
      if (delayMs > 0) {
        setTimeout(() => callback(...args), delayMs);
      } else {
        callback(...args);
      }
    },
    [callback, delayMs]
  );
}

/**
 * useAsync - Executar async effect com cleanup
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps?: React.DependencyList
): { data: T | null; loading: boolean; error: Error | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    asyncFn()
      .then((result) => {
        if (isMounted) {
          setData(result);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, deps);

  return { data, loading, error };
}

/**
 * useLocalStorage - Sincronizar estado com localStorage
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  const [stored, setStored] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(stored) : value;
        setStored(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error(`localStorage error [${key}]:`, error);
      }
    },
    [key, stored]
  );

  return [stored, setValue];
}

/**
 * usePrevious - Manter referência do valor anterior
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * useEffectOnce - Effect que roda uma vez (like componentDidMount)
 */
export function useEffectOnce(effect: () => void | (() => void)): void {
  useEffect(() => effect(), []);
}

/**
 * Comparador de dependencies
 */
function depsDifferent(deps1?: React.DependencyList, deps2?: React.DependencyList): boolean {
  if (!deps1 || !deps2 || deps1.length !== deps2.length) {
    return true;
  }

  for (let i = 0; i < deps1.length; i++) {
    try {
      // Tentar comparação profunda
      const json1 = JSON.stringify(deps1[i]);
      const json2 = JSON.stringify(deps2[i]);
      if (json1 !== json2) return true;
    } catch {
      // Fallback para comparação simples
      if (deps1[i] !== deps2[i]) return true;
    }
  }

  return false;
}

export default {
  useDeepMemo,
  useDebouncedValue,
  useThrottledCallback,
  useLazyCallback,
  useAsync,
  useLocalStorage,
  usePrevious,
  useEffectOnce,
};
