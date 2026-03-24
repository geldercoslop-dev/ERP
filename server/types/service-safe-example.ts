/**
 * IMPLEMENTAÇÃO SEGURA DE SERVICES
 * Exemplo prático: getAllProdutosComPrecoVigente
 * 
 * Mostra como blindar um service existente
 */

import {
  ServiceList,
  ServiceSingle,
  sanitizeList,
  sanitizeGet,
  sanitizeCreate,
  safeListCall,
  logSafetyViolation,
} from './service-safety';

import { withServiceGuard } from './service-guard';

/**
 * ============================================================
 * ANTES (NÃO-SEGURO)
 * ============================================================
 * 
 * Problemas observados:
 * 1. (db as any).execute() retorna [[data], metadata]
 * 2. Código tenta acessar ?.[0] para desembrulhar
 * 3. Se não houver dados, ?.[0] retorna undefined
 * 4. Loop iterar sobre undefined → Error
 */

export async function getAllProdutosComPrecoVigenteUNSAFE(refDate: Date = new Date()) {
  const db = await getDb();
  if (!db) return [] as any[]; // ❌ Tipo incoerente

  const items = await db.select().from(produtos).where(
    eq(produtos.ativo, true)
  ).orderBy(produtos.nome);
  const ids = items.map((p) => p.id);
  if (ids.length === 0) return [];

  // ❌ PROBLEMA: execute() retorna [[rows], metadata]
  // ❌ O código faz row?.[0] que pode ser undefined
  const variacoesResult: any = await (db as any).execute(sql`...`);
  const variacoesRows = Array.isArray(variacoesResult[0])
    ? variacoesResult[0]
    : variacoesResult;
  for (const r of variacoesRows || []) {
    // ❌ || variacoesRows tenta usar undefined como array!
    // ...
  }

  return items.map((p: any) => ({ id: p.id, nome: p.nome })); // Pode retornar items com dados incompletos
}

/**
 * ============================================================
 * DEPOIS v1 (COM SANITIZAÇÃO)
 * ============================================================
 * 
 * - Desembrulha corretamente resultado do execute()
 * - Usa sanitizeList() para garantir array
 * - Type-safe
 */
export async function getAllProdutosComPrecoVigenteV1(
  refDate: Date = new Date()
): Promise<ServiceList<any>> {
  const db = await getDb();
  if (!db) return [];

  const items = await db.select().from(produtos).where(
    eq(produtos.ativo, true)
  ).orderBy(produtos.nome);
  const ids = items.map((p) => p.id);
  if (ids.length === 0) return [];

  // ✅ Desembrulhar corretamente
  const variacoesResult: any = await (db as any).execute(sql`...`);
  const variacoesRows = Array.isArray(variacoesResult[0])
    ? variacoesResult[0]
    : variacoesResult;

  // ✅ NUNCA undefined
  const variacoesMap = new Map<number, any>();
  for (const r of variacoesRows || []) {
    // ... processar
  }

  // Mesmo para promoções
  const promosResult: any = await (db as any).execute(sql`...`);
  const promoRows = Array.isArray(promosResult[0])
    ? promosResult[0]
    : promosResult;

  const promoMap = new Map<number, any>();
  for (const r of promoRows || []) {
    // ... processar
  }

  return items.map((p: any) => ({
    ...p,
    // ... enriched data
  }));
}

/**
 * ============================================================
 * DEPOIS v2 (COM WRAPPERS SEGUROS)
 * ============================================================
 * 
 * - Usa safeListCall para proteção de erro
 * - Fallback automático se tudo falhar
 * - Nenhuma chance de retornar undefined
 */
export async function getAllProdutosComPrecoVigenteV2(
  refDate: Date = new Date()
): Promise<ServiceList<any>> {
  return await safeListCall(
    async () => {
      const db = await getDb();
      if (!db) return undefined;

      const items = await db
        .select()
        .from(produtos)
        .where(eq(produtos.ativo, true))
        .orderBy(asc(produtos.descricao));

      const ids = items.map((p) => p.id);
      if (ids.length === 0) return [];

      // Variações
      const variacoesResult: any = await (db as any).execute(sql`...`);
      const variacoesRows = Array.isArray(variacoesResult[0])
        ? variacoesResult[0]
        : variacoesResult;

      const variacoesMap = new Map<number, any>();
      for (const r of variacoesRows || []) {
        // ... processar
      }

      // Promoções
      const promosResult: any = await (db as any).execute(sql`...`);
      const promoRows = Array.isArray(promosResult[0])
        ? promosResult[0]
        : promosResult;

      const promoMap = new Map<number, any>();
      for (const r of promoRows || []) {
        // ... processar
      }

      return items.map((p: any) => ({
        ...p,
        // ... enriched data
      }));
    },
    [] // Fallback: sempre retorna array vazio se tudo falhar
  );
}

/**
 * ============================================================
 * DEPOIS v3 (COM GUARDA GLOBAL + LOG + AUDITORIA)
 * ============================================================
 * 
 * - Wrap com withServiceGuard
 * - Detecta violações de contrato
 * - Log automático
 * - Relatório de segurança
 */
export async function getAllProdutosComPrecoVigenteV3(
  refDate: Date = new Date()
): Promise<ServiceList<any>> {
  return await withServiceGuard(
    async () => {
      return await safeListCall(
        async () => {
          const db = await getDb();
          if (!db) return undefined;

          const items = await db
            .select()
            .from(produtos)
            .where(eq(produtos.ativo, true))
            .orderBy(asc(produtos.descricao));

          const ids = items.map((p) => p.id);
          if (ids.length === 0) return [];

          // Variações com proteção
          const variacoesResult: any = await (db as any).execute(sql`...`);
          const variacoesRows = Array.isArray(variacoesResult[0])
            ? variacoesResult[0]
            : variacoesResult;

          const variacoesMap = new Map<number, any>();
          for (const r of sanitizeList(variacoesRows) || []) {
            // ... processar
          }

          // Promoções com proteção
          const promosResult: any = await (db as any).execute(sql`...`);
          const promoRows = Array.isArray(promosResult[0])
            ? promosResult[0]
            : promosResult;

          const promoMap = new Map<number, any>();
          for (const r of sanitizeList(promoRows) || []) {
            // ... processar
          }

          return items.map((p: any) => ({
            ...p,
            // ... enriched data
          }));
        },
        []
      );
    },
    {
      serviceName: 'Database',
      methodName: 'getAllProdutosComPrecoVigente',
      expectedType: 'list',
      logErrors: true,
    }
  );
}

/**
 * ============================================================
 * PADRÃO RECOMENDADO
 * ============================================================
 * 
 * Combina:
 * 1. Type explícito no retorno
 * 2. safeListCall para proteção
 * 3. withServiceGuard para auditoria
 * 4. Nenhuma chance de undefined
 */
export async function getAllProdutosComPrecoVigenteRECOMMENDED(
  refDate: Date = new Date()
): Promise<ServiceList<any>> {
  return await withServiceGuard(
    () =>
      safeListCall(async () => {
        const db = await getDb();
        if (!db) return undefined;

        const items = await db
          .select()
          .from(produtos)
          .where(eq(produtos.ativo, true))
          .orderBy(asc(produtos.descricao));

        const ids = items.map((p) => p.id);
        if (ids.length === 0) return [];

        // Variações com desembrulho correto
        const variacoesResult: any = await (db as any).execute(sql`
          SELECT pv.produtoId, ... FROM produto_variacoes pv ...
        `);
        const variacoesRows = Array.isArray(variacoesResult[0])
          ? variacoesResult[0]
          : variacoesResult;

        const variacoesMap = new Map<number, any>();
        for (const r of variacoesRows || []) {
          const pid = Number(r.produtoId);
          if (!Number.isFinite(pid)) continue;

          variacoesMap.set(pid, {
            cor: r.cores ? r.cores.split('|')[0]?.trim() : undefined,
            tamanho: r.tamanhos ? r.tamanhos.split('|')[0]?.trim() : undefined,
            temEspelho: Number(r.temEspelho) === 1,
          });
        }

        // Promoções com desembrulho correto
        const promosResult: any = await (db as any).execute(sql`
          SELECT pi.produtoId, MIN(pi.precoPromocional) as precoPromo, ...
        `);
        const promoRows = Array.isArray(promosResult[0])
          ? promosResult[0]
          : promosResult;

        const promoMap = new Map<number, any>();
        for (const r of promoRows || []) {
          const pid = Number(r.produtoId);
          if (!Number.isFinite(pid)) continue;
          promoMap.set(pid, {
            precoPromo: Number(r.precoPromo),
            promoNome: String(r.promoNome || ''),
          });
        }

        // Retornar com dados completos
        return items.map((p: any) => {
          const base = Number(p.valorVenda);
          const promo = promoMap.get(p.id);
          const vigente =
            promo?.precoPromo && promo.precoPromo > 0
              ? promo.precoPromo
              : base;

          const v = variacoesMap.get(p.id);
          const parts = [
            String(p.descricao || '').trim(),
            v?.cor ? String(v.cor).trim() : '',
            v?.tamanho ? String(v.tamanho).trim() : '',
            v?.temEspelho ? 'COM ESPELHO' : '',
          ].filter(Boolean);

          return {
            ...p,
            valorVendaBase: base,
            valorVenda: vigente,
            promoAtiva: !!promo,
            promoNome: promo?.promoNome || null,
            descricaoOperacional: parts.join(' '),
          };
        });
      }),
    {
      serviceName: 'Database',
      methodName: 'getAllProdutosComPrecoVigente',
      expectedType: 'list',
    }
  );
}

// Placeholders para não quebrar durante compilação
const getDb = async () => null;
const produtos = {} as any;
const sql = (template: any, ...values: any[]) => template;
const eq = (a: any, b: any) => a;
const asc = (col: any) => col;
