/**
 * Utilitário para padronização de respostas dos serviços
 * 
 * Este módulo implementa funções para garantir que todos os serviços
 * retornem dados em formatos consistentes, evitando erros como
 * "find is not a function" causados por tipos inconsistentes.
 */

import { InfrastructureError } from './errors/typed-errors.js';

export type Payload = Record<string, unknown>;

export type ServiceResponse = {
  success: boolean;
  data?: unknown;
  error?: string;
};

/**
 * Garante que o retorno seja sempre um array, mesmo quando vazio ou nulo
 * @param result - O resultado a ser normalizado
 * @returns Um array garantido, nunca undefined ou null
 * @throws InfrastructureError quando o resultado é null, undefined ou não é um array
 */
export function ensureArray<T>(result: T[] | null | undefined): T[] {
  // Se o resultado for null, undefined ou não for um array, lança erro
  if (!result || !Array.isArray(result)) {
    throw new InfrastructureError(`Invalid array result: expected array, got ${result === null ? 'null' : result === undefined ? 'undefined' : typeof result}`);
  }
  return result;
}

/**
 * Garante que o retorno seja sempre um objeto, mesmo quando vazio ou nulo
 * @param result - O resultado a ser normalizado
 * @returns Um objeto garantido, nunca undefined ou null
 * @throws InfrastructureError quando o resultado é null ou undefined
 */
export function ensureObject<T extends Record<string, unknown>>(result: T | null | undefined): T {
  // Se o resultado for null ou undefined, lança erro
  if (result === null || result === undefined) {
    throw new InfrastructureError(`Invalid object result: expected object, got ${result === null ? 'null' : 'undefined'}`);
  }
  return result;
}

/**
 * Garante que o retorno de uma operação de criação sempre tenha um ID
 * @param result - O resultado da operação de criação
 * @returns Um objeto com pelo menos a propriedade id
 */
export function ensureCreatedResult(result: unknown): { id: number } {
  if (!result) {
    throw new InfrastructureError("Falha na operação de criação: resultado indefinido");
  }

  if (typeof result !== "object") {
    if (typeof result === 'number') {
      return { id: result };
    }
    throw new InfrastructureError("Falha na operação de criação: formato inválido");
  }

  const record = result as Record<string, unknown>;
  
  // Se já tiver um ID, retorna como está
  if (record.id !== undefined && typeof record.id === 'number') {
    return { id: record.id };
  }
  
  // Se for um número direto, assume que é o ID
  throw new InfrastructureError("Falha na operação de criação: ID não encontrado");
}

/**
 * Garante que o retorno de uma operação de atualização seja consistente
 * @returns Um objeto indicando sucesso
 */
export function ensureUpdateResult(): { success: boolean } {
  return { success: true };
}

/**
 * Garante que o retorno de uma operação de exclusão seja consistente
 * @returns Um objeto indicando sucesso
 */
export function ensureDeleteResult(): { success: boolean } {
  return { success: true };
}