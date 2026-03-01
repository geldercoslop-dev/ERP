import { trpc } from '@/lib/trpcClient';

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
    // @ts-ignore - Acesso dinâmico às rotas
    if (utils[route] && typeof utils[route].invalidate === 'function') {
      // @ts-ignore - Acesso dinâmico às rotas
      await utils[route].invalidate();
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
    // @ts-ignore - Acesso dinâmico às rotas e queries
    if (utils[route] && utils[route][query] && typeof utils[route][query].invalidate === 'function') {
      // @ts-ignore - Acesso dinâmico às rotas e queries
      await utils[route][query].invalidate(input);
      console.log(`[cacheUtils] Cache de ${route}.${query} invalidado com sucesso`);
    } else {
      console.warn(`[cacheUtils] Query ${route}.${query} não encontrada ou não possui método invalidate`);
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
    // @ts-ignore - Acesso a método interno
    if (utils.client && typeof utils.client.invalidate === 'function') {
      // @ts-ignore - Acesso a método interno
      await utils.client.invalidate();
      console.log(`[cacheUtils] Cache limpo com sucesso`);
    } else {
      console.warn(`[cacheUtils] Não foi possível limpar o cache`);
    }
  } catch (error) {
    console.error(`[cacheUtils] Erro ao limpar cache:`, error);
  }
}