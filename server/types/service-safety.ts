/**
 * TIPOS GLOBAIS SEGUROS PARA SERVICES
 * Força contrato de retorno explícito e válido
 * Evita undefined, null inesperado
 */

/**
 * Lista segura: sempre array, nunca undefined/null
 * Exemplo: ServiceList<Produto> → Produto[]
 */
export type ServiceList<T> = T[];

/**
 * Objeto único: pode ser null, mas nunca undefined
 * Exemplo: ServiceSingle<Produto> → Produto | null
 */
export type ServiceSingle<T> = T | null;

/**
 * Criar/Update com ID: sempre retorna { id: number }
 * Exemplo: ServiceCreate → { id: number }
 */
export interface ServiceCreateResponse {
  id: number;
}

/**
 * Operação genérica: { success: boolean, error?: string }
 * Exemplo: ServiceOperation → { success: true } | { success: false, error: '...' }
 */
export interface ServiceResult {
  success: boolean;
  error?: string;
}

/**
 * Delete/Remove response
 */
export interface ServiceDeleteResponse {
  success: boolean;
  deletedId?: number;
}

/**
 * Paginado: sempre tem items (array), total, page
 */
export interface ServicePaginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize?: number;
  hasMore?: boolean;
}

/**
 * TYPE GUARDS: Validam tipo em runtime
 */

/**
 * Valida se valor é array seguro
 * @example if (isArraySafe(data)) { data.forEach(...) }
 */
export function isArraySafe(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Valida se é objeto com id:number
 */
export function hasId(value: unknown): value is { id: number } {
  return value !== null && 
    typeof value === 'object' && 
    'id' in value && 
    typeof (value as any).id === 'number';
}

/**
 * Valida se é array de objetos com id
 */
export function isArrayWithIds(value: unknown): value is Array<{ id: number }> {
  return Array.isArray(value) && 
    (value.length === 0 || value.every((item) => hasId(item)));
}

/**
 * Valida paginação
 */
export function isPaginated<T>(value: unknown): value is ServicePaginated<T> {
  return value !== null &&
    typeof value === 'object' &&
    'items' in value &&
    'total' in value &&
    'page' in value &&
    Array.isArray((value as any).items) &&
    typeof (value as any).total === 'number' &&
    typeof (value as any).page === 'number';
}

/**
 * SANITIZADORES: Garante que função não retorna undefined
 */

/**
 * Sanitiza retorno de list: undefined/null vira []
 * @example return sanitizeList(dados)
 */
export function sanitizeList<T>(value: ServiceList<T> | undefined | null): ServiceList<T> {
  if (!isArraySafe(value)) {
    console.warn('[ServiceGuard] sanitizeList: valor não é array, retornando []');
    return [];
  }
  return value as T[];
}

/**
 * Sanitiza retorno de create: valida { id: number }
 * @example return sanitizeCreate(result, defaultId)
 */
export function sanitizeCreate(
  value: unknown,
  defaultId: number = -1
): ServiceCreateResponse {
  if (hasId(value)) {
    return { id: (value as any).id };
  }
  console.warn('[ServiceGuard] sanitizeCreate: retorno inválido, usando ID padrão', defaultId);
  return { id: defaultId };
}

/**
 * Sanitiza retorno de single/get: valida tipo ou retorna null
 * @example return sanitizeGet(produto)
 */
export function sanitizeGet<T>(value: T | undefined | null): ServiceSingle<T> {
  if (value === undefined || value === null) {
    return null;
  }
  return value;
}

/**
 * Sanitiza paginação
 * @example return sanitizePaginated(data, page)
 */
export function sanitizePaginated<T>(
  items: unknown,
  total: number,
  page: number,
  pageSize: number = 50
): ServicePaginated<T> {
  const validItems = isArraySafe(items) ? (items as T[]) : [];
  return {
    items: validItems,
    total: Math.max(0, Math.floor(total)),
    page: Math.max(1, Math.floor(page)),
    pageSize,
    hasMore: validItems.length + (page - 1) * pageSize < total,
  };
}

/**
 * WRAPPER: Executa função e garante resultado seguro
 */

/**
 * Executa função list e garante retorno seguro
 * @example const produtos = await safeListCall(() => db.listProdutos())
 */
export async function safeListCall<T>(
  fn: () => Promise<T[] | undefined | null>,
  fallback: T[] = []
): Promise<T[]> {
  try {
    const result = await fn();
    return sanitizeList(result) || fallback;
  } catch (error) {
    console.error('[ServiceGuard] safeListCall erro:', error);
    return fallback;
  }
}

/**
 * Executa função single e garante retorno seguro
 * @example const produto = await safeGetCall(() => db.getProduto(id))
 */
export async function safeGetCall<T>(
  fn: () => Promise<T | undefined | null>,
  fallback: T | null = null
): Promise<T | null> {
  try {
    const result = await fn();
    return sanitizeGet(result) ?? fallback;
  } catch (error) {
    console.error('[ServiceGuard] safeGetCall erro:', error);
    return fallback;
  }
}

/**
 * Executa função create e garante { id: number }
 * @example const { id } = await safeCreateCall(() => db.createProduct(data))
 */
export async function safeCreateCall(
  fn: () => Promise<unknown>,
  defaultId: number = -1
): Promise<ServiceCreateResponse> {
  try {
    const result = await fn();
    return sanitizeCreate(result, defaultId);
  } catch (error) {
    console.error('[ServiceGuard] safeCreateCall erro:', error);
    return { id: defaultId };
  }
}

/**
 * LOGGER: Detecta e registra valores inválidos
 */

export interface SafetyLog {
  timestamp: string;
  type: 'undefined-returned' | 'null-returned' | 'invalid-type' | 'array-expected';
  service: string;
  method: string;
  expectedType: string;
  actualValue: string;
  stackTrace?: string;
}

const safetyLogs: SafetyLog[] = [];

/**
 * Registra violação de contrato
 */
export function logSafetyViolation(violation: Omit<SafetyLog, 'timestamp'>) {
  const log: SafetyLog = {
    timestamp: new Date().toISOString(),
    ...violation,
  };
  safetyLogs.push(log);
  
  console.error(`[⚠️  SAFETY VIOLATION] ${violation.service}.${violation.method}: ${violation.type}`);
  console.error(`   Expected: ${violation.expectedType}`);
  console.error(`   Got: ${violation.actualValue}`);
}

/**
 * Obter logs de segurança
 */
export function getSafetyLogs(): SafetyLog[] {
  return [...safetyLogs];
}

/**
 * Limpar logs
 */
export function clearSafetyLogs() {
  safetyLogs.length = 0;
}

/**
 * Exportar relatório de segurança
 */
export function generateSafetyReport(): string {
  const grouped = new Map<string, number>();
  
  for (const log of safetyLogs) {
    const key = `${log.service}.${log.method}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  
  let report = `\n${'='.repeat(60)}\n`;
  report += `📋 RELATÓRIO DE SEGURANÇA (${safetyLogs.length} violações)\n`;
  report += `${'='.repeat(60)}\n\n`;
  
  if (safetyLogs.length === 0) {
    report += `✅ Nenhuma violação detectada!\n`;
  } else {
    report += `Violações por serviço:\n`;
    grouped.forEach((count, key) => {
      report += `  • ${key}: ${count}x\n`;
    });
    
    report += `\nDetalhes:\n`;
    for (const log of safetyLogs.slice(-10)) {
      report += `  ${log.timestamp} | ${log.service}.${log.method}: ${log.type}\n`;
    }
  }
  
  report += `\n${'='.repeat(60)}\n`;
  return report;
}
