/**
 * Tipos globais para padronização de retornos dos serviços
 * 
 * Este módulo define tipos que garantem consistência nos retornos
 * de todos os serviços da aplicação, evitando erros como
 * "find is not a function" causados por tipos inconsistentes.
 */

/**
 * Tipo para retornos de listas (arrays)
 * Garante que o tipo de retorno seja sempre um array do tipo T
 */
export type ServiceList<T> = T[];

/**
 * Tipo para retornos de objetos
 * Garante que o tipo de retorno seja sempre um objeto do tipo T ou null
 * Nunca undefined
 */
export type ServiceObject<T> = T | null;

/**
 * Tipo para retornos de operações de criação
 * Garante que o retorno sempre tenha um ID
 */
export type ServiceCreatedResult = { id: number };

/**
 * Tipo para retornos de operações de atualização
 * Garante que o retorno sempre tenha um indicador de sucesso
 */
export type ServiceUpdateResult = { success: boolean };

/**
 * Tipo para retornos de operações de exclusão
 * Garante que o retorno sempre tenha um indicador de sucesso
 */
export type ServiceDeleteResult = { success: boolean };

/**
 * Tipo para retornos paginados
 * Garante que o retorno sempre tenha items como array e informações de paginação
 */
export type ServicePaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};