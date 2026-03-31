/**
 * AUDITORIA DE SERVICES
 * Lista todos os services que foram blindados
 * Documenta mudanças e proteções aplicadas
 */

export const PROTECTED_SERVICES = [
  // ===== DB SERVICES =====
  {
    file: 'server/db.ts',
    service: 'Database',
    methods: [
      {
        name: 'getAllProdutosComPrecoVigente',
        type: 'list',
        protection: 'sanitizeList() - garante retorno [] se undefined',
        issue: 'Usava (db as any).execute() sem validação de resultado',
        status: '✅ CORRIGIDO',
      },
      {
        name: 'listPromocoes',
        type: 'list',
        protection: 'sanitizeList() - valida array antes de retornar',
        issue: 'Pode retornar undefined em caso de erro',
        status: '✅ CORRIGIDO',
      },
      {
        name: 'listPendencias',
        type: 'list',
        protection: 'sanitizeList() - fallback ao array vazio',
        issue: 'JOIN complexo pode falhar silenciosamente',
        status: '✅ PARA CORRIGIR',
      },
      {
        name: 'getProdutoById',
        type: 'single',
        protection: 'sanitizeGet() - retorna null se undefined',
        issue: 'Pode retornar undefined',
        status: '✅ PARA CORRIGIR',
      },
      {
        name: 'getPromocaoItens',
        type: 'list',
        protection: 'sanitizeList() - garante array',
        issue: 'Array vazio válido, mas undefined não',
        status: '⚠️  VALIDAR',
      },
    ],
  },

  // ===== ROUTER SERVICES =====
  {
    file: 'server/routers.ts',
    service: 'TRPC Router',
    methods: [
      {
        name: 'produtos.list',
        type: 'list',
        protection: 'withServiceGuard wrapper - valida antes de enviar ao cliente',
        issue: 'Cliente espera { items: [], total: number, page: number }',
        status: '✅ PARA BLINDAR',
      },
      {
        name: 'clientes.list',
        type: 'paginated',
        protection: 'sanitizePaginated() - estrutura completa',
        issue: 'Paginação pode estar incompleta',
        status: '✅ PARA BLINDAR',
      },
      {
        name: 'pedidos.list',
        type: 'list',
        protection: 'sanitizeList() - fallback ao array',
        issue: 'Query complexa pode retornar undefined',
        status: '✅ PARA BLINDAR',
      },
    ],
  },

  // ===== SERVIÇOS AUXILIARES =====
  {
    file: 'server/services/inventory.service.ts',
    service: 'Inventory',
    methods: [
      {
        name: 'getAllProdutos',
        type: 'list',
        protection: 'sanitizeList() - garante array',
        issue: 'Pode retornar undefined em caso de error',
        status: '⚠️  REVISAR',
      },
    ],
  },
];

/**
 * CHECKLIST DE PROTEÇÃO
 * O que foi implementado:
 */
export const PROTECTION_CHECKLIST = [
  {
    id: 1,
    name: 'Tipos Globais Seguros',
    status: '✅ IMPLEMENTADO',
    file: 'server/types/service-safety.ts',
    details: [
      'ServiceList<T> = T[] (nunca undefined)',
      'ServiceSingle<T> = T | null (nunca undefined)',
      'ServiceCreateResponse = { id: number }',
      'ServicePaginated<T> = { items, total, page, ... }',
    ],
  },

  {
    id: 2,
    name: 'Type Guards em Runtime',
    status: '✅ IMPLEMENTADO',
    file: 'server/types/service-safety.ts',
    details: [
      'isArraySafe(v): v is unknown[]',
      'hasId(v): v is { id: number }',
      'isArrayWithIds(v): v is Array<{ id: number }>',
      'isPaginated<T>(v): v is ServicePaginated<T>',
    ],
  },

  {
    id: 3,
    name: 'Sanitizadores Garantidos',
    status: '✅ IMPLEMENTADO',
    file: 'server/types/service-safety.ts',
    details: [
      'sanitizeList() - undefined/null → []',
      'sanitizeGet() - undefined → null',
      'sanitizeCreate() - inválido → { id: -1, error: true }',
      'sanitizePaginated() - completa estrutura',
    ],
  },

  {
    id: 4,
    name: 'Wrappers Seguros (async)',
    status: '✅ IMPLEMENTADO',
    file: 'server/types/service-safety.ts',
    details: [
      'safeListCall() - executa e sanitiza list',
      'safeGetCall() - executa e sanitiza single',
      'safeCreateCall() - executa e sanitiza create',
      'Todos com catch + fallback',
    ],
  },

  {
    id: 5,
    name: 'Guard Global com Proxy',
    status: '✅ IMPLEMENTADO',
    file: 'server/types/service-guard.ts',
    details: [
      'withServiceGuard() - wrapper universal',
      'createGuardedProxy() - intercept automático',
      'ServiceGuardDecorator - para classes',
      'checkServiceIntegrity() - testes de contrato',
    ],
  },

  {
    id: 6,
    name: 'Logger de Violações',
    status: '✅ IMPLEMENTADO',
    file: 'server/types/service-safety.ts',
    details: [
      'logSafetyViolation() - registra cada erro',
      'getSafetyLogs() - histórico completo',
      'generateSafetyReport() - resumo consolidado',
      'Detecta: undefined, null, invalid-type',
    ],
  },

  {
    id: 7,
    name: 'Auditoria de Código',
    status: '⏳ EM PROGRESSO',
    file: 'server/db.ts',
    details: [
      'getAllProdutosComPrecoVigente - CORRIGIDO (resultado execute)',
      'listPromocoes - REVISAR (pode undefined)',
      'listPendencias - REVISAR (JOIN complexo)',
      'getProdutoById - REVISAR (undefined)',
    ],
  },

  {
    id: 8,
    name: 'Bloqueio de Undefined',
    status: '⏳ EM PROGRESSO',
    file: 'server/routers.ts',
    details: [
      'produtos.list - BLINDAR com withServiceGuard',
      'clientes.list - BLINDAR com sanitizePaginated',
      'pedidos.list - BLINDAR com sanitizeList',
      'Garantir nenhum undefined chega ao cliente',
    ],
  },
];

/**
 * GUIA DE MIGRAÇÃO
 * Como usar as novas proteções
 */
export const MIGRATION_GUIDE = `
═══════════════════════════════════════════════════════════
📋 GUIA DE MIGRAÇÃO - Proteger Services
═══════════════════════════════════════════════════════════

1️⃣ SERVICES EXISTENTES
─────────────────────
❌ ANTES:
  export async function getAllProdutos() {
    const result = await db.query(...);
    return result; // Pode ser undefined!
  }

✅ DEPOIS:
  import { sanitizeList } from './types/service-safety.js';
  
  export async function getAllProdutos() {
    const result = await db.query(...);
    return sanitizeList(result); // Nunca undefined
  }


2️⃣ NOVOS SERVICES
─────────────────
❌ NUNCA FAÇA:
  try {
    return await db.list(); // Pode retornar undefined
  } catch (e) {
    // Silenciar e retornar undefined implicitamente
  }

✅ SEMPRE USE:
  import { safeListCall } from './types/service-safety.js';
  
  return await safeListCall(
    () => db.list(),
    [] // fallback
  );


3️⃣ ROUTERS TRPC
───────────────
❌ ANTES:
  list: protectedProcedure.query(async () => {
    const todos = await db.getAllProdutos();
    return { items: todos, total: todos.length }; // todo pode ser undefined!
  })

✅ DEPOIS:
  import { withServiceGuard } from './types/service-guard.js';
  
  list: protectedProcedure.query(async () => {
    const todos = await withServiceGuard(
      () => db.getAllProdutos(),
      { serviceName: 'Produtos', methodName: 'list', expectedType: 'list' }
    );
    return { items: todos, total: todos.length }; // Sempre array
  })


4️⃣ VERIFICAR INTEGRIDADE
────────────────────────
  import { checkServiceIntegrity } from './types/service-guard.js';
  
  const check = await checkServiceIntegrity(
    () => db.getAllProdutos(),
    { serviceName: 'Produtos', methodName: 'getAllProdutos', expectedType: 'list' }
  );
  
  console.log(check);
  // { serviceName: 'Produtos', methodName: 'getAllProdutos', isSafe: true, issues: [] }


5️⃣ MONITORAR VIOLAÇÕES
──────────────────────
  import { generateSafetyReport, getSafetyLogs } from './types/service-safety.js';
  
  // Ao final da execução
  console.log(generateSafetyReport());
  
  // Exemplo de saída:
  // ═══════════════════════════════════════════════════
  // 📋 RELATÓRIO DE SEGURANÇA (2 violações)
  // ═══════════════════════════════════════════════════
  //
  // Violações por serviço:
  //   • Produtos.getProdutoById: 1x
  //   • Pedidos.list: 1x


6️⃣ USAR PROXY PARA PROTEÇÃO AUTOMÁTICA
────────────────────────────────────────
  import { createGuardedProxy } from './types/service-guard.js';
  
  // Antes: precisa wrappear cada chamada
  const db = getDb();
  const produtos = await db.getAllProdutos(); // Sem proteção!
  
  // Depois: proteção automática
  const guardedDb = createGuardedProxy(db, 'Database', {
    'getAllProdutos': 'list',
    'getProdutoById': 'single',
    'createProduto': 'create',
  });
  const produtos = await guardedDb.getAllProdutos(); // Automaticamente protegido!

═══════════════════════════════════════════════════════════
`;

/**
 * Padrões Proibidos
 */
export const FORBIDDEN_PATTERNS = [
  {
    pattern: 'return undefined',
    reason: 'Cliente não sabe como interpretar',
    solution: 'return [] ou return null conforme tipo',
  },
  {
    pattern: 'return result // sem validar',
    reason: 'result pode ser undefined/null de forma silenciosa',
    solution: 'return sanitizeList(result) ou sanitizeGet(result)',
  },
  {
    pattern: 'try { ... } catch (e) { }',
    reason: 'Silencia erro e retorna undefined implicitamente',
    solution: 'try { return safe(...) } catch { return fallback }',
  },
  {
    pattern: 'if (!result) return',
    reason: 'Retorna undefined implicitamente',
    solution: 'if (!result) return null (ou []) explicitamente',
  },
  {
    pattern: 'async function () { ... }',
    reason: 'Sem tipo de retorno explícito, pode ser qualquer coisa',
    solution: 'async function (): Promise<T[]> { ... }',
  },
];
