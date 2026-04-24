import { trpc } from '../lib/trpcClient';

/**
 * Utilitário para gerenciar o cache do tRPC
 */

/**
 * Invalidar todas as queries de uma determinada rota
 * @param route Rota a ser invalidada (ex: 'produtos', 'clientes')
 */
export async function invalidateQueries(route: string): Promise<void> {
  const utils = trpc.useUtils();
  
  if (!utils) {
    console.warn(`[cacheUtils] Não foi possível obter utils para invalidar ${route}`);
    return;
  }
  
  try {
    const utilsRecord = utils as unknown as Record<string, { invalidate?: () => Promise<void> }>;
    if (route in utilsRecord && utilsRecord[route]?.invalidate) {
      await utilsRecord[route].invalidate();
      console.log(`[cacheUtils] Cache de ${route} invalidado com sucesso`);
    } else {
      console.warn(`[cacheUtils] Rota ${route} não encontrada ou não possui método invalidate`);
    }
  } catch (error) {
    console.error(`[cacheUtils] Erro ao invalidar cache de ${route}:`, error);
  }
}

/**
 * Invalidar uma query específica
 * @param route Rota a ser invalidada (ex: 'produtos', 'clientes')
 * @param query Nome da query (ex: 'list', 'getById')
 * @param input Parâmetros da query (opcional)
 */
export async function invalidateQuery(
  route: string,
  query: string,
  input?: any
): Promise<void> {
  const utils = trpc.useUtils();
  
  if (!utils) {
    console.warn(`[cacheUtils] Não foi possível obter utils para invalidar ${route}.${query}`);
    return;
  }
  
  try {
    const utilsRecord = utils as unknown as Record<string, Record<string, { invalidate?: (input?: unknown) => Promise<void> }>>;
    if (route in utilsRecord && query in utilsRecord[route]) {
      const queryUtils = utilsRecord[route][query];
      if (queryUtils?.invalidate) {
        await queryUtils.invalidate(input);
        console.log(`[cacheUtils] Cache de ${route}.${query} invalidado com sucesso`);
      } else {
        console.warn(`[cacheUtils] Query ${route}.${query} não possui método invalidate`);
      }
    } else {
      console.warn(`[cacheUtils] Query ${route}.${query} não encontrada`);
    }
  } catch (error) {
    console.error(`[cacheUtils] Erro ao invalidar cache de ${route}.${query}:`, error);
  }
}

/**
 * Limpar todo o cache do tRPC
 */
export async function clearCache(): Promise<void> {
  const utils = trpc.useUtils();
  
  if (!utils) {
    console.warn(`[cacheUtils] Não foi possível obter utils para limpar o cache`);
    return;
  }
  
  try {
    const utilsRecord = utils as unknown as { client?: { invalidate?: () => Promise<void> } };
    if (utilsRecord.client?.invalidate) {
      await utilsRecord.client.invalidate();
      console.log(`[cacheUtils] Cache limpo com sucesso`);
    } else {
      console.warn(`[cacheUtils] Não foi possível limpar o cache`);
    }
  } catch (error) {
    console.error(`[cacheUtils] Erro ao limpar cache:`, error);
  }
}