/**
 * Wrapper seguro para funções que previne crashes do React
 * 
 * Problemas que resolve:
 * - onClick={fn} onde fn pode ser undefined
 * - Chamadas a funções que não existem
 * - Acesso a propriedades de funções undefined
 * 
 * Uso:
 * onClick={() => safeCall(fn, "Funcionalidade indisponível")}
 * onClick={() => safeCall(handleClick)}
 */

export function safeCall<T extends (...args: any[]) => any>(
  fn?: T,
  message: string = "Funcionalidade indisponível no momento."
): (...args: Parameters<T>) => ReturnType<T> | void {
  return (...args: Parameters<T>) => {
    if (typeof fn === 'function') {
      try {
        return fn(...args);
      } catch (error) {
        console.error('Erro ao executar função:', error);
        if (typeof window !== 'undefined') {
          window.alert('Erro ao executar ação. Tente novamente.');
        }
      }
    } else {
      console.warn('Função não definida:', message);
      if (typeof window !== 'undefined') {
        window.alert(message);
      }
    }
  };
}

/**
 * Versão async do safeCall para funções que retornam Promise
 */
export async function safeAsyncCall<T extends (...args: any[]) => Promise<any>>(
  fn?: T,
  message: string = "Funcionalidade indisponível no momento."
): Promise<Awaited<ReturnType<T>> | void> {
  if (typeof fn === 'function') {
    try {
      return await fn();
    } catch (error) {
      console.error('Erro ao executar função assíncrona:', error);
      if (typeof window !== 'undefined') {
        window.alert('Erro ao executar ação. Tente novamente.');
      }
    }
  } else {
    console.warn('Função assíncrona não definida:', message);
    if (typeof window !== 'undefined') {
      window.alert(message);
    }
  }
}
