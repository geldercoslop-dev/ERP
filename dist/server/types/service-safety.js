/**
 * TIPOS GLOBAIS SEGUROS PARA SERVICES
 * Força contrato de retorno explícito e válido
 * Evita undefined, null inesperado
 */
/**
 * TYPE GUARDS: Validam tipo em runtime
 */
/**
 * Valida se valor é array seguro
 * @example if (isArraySafe(data)) { data.forEach(...) }
 */
export function isArraySafe(value) {
    return Array.isArray(value);
}
/**
 * Valida se é objeto com id:number
 */
export function hasId(value) {
    return value !== null &&
        typeof value === 'object' &&
        'id' in value &&
        typeof value.id === 'number';
}
/**
 * Valida se é array de objetos com id
 */
export function isArrayWithIds(value) {
    return Array.isArray(value) &&
        (value.length === 0 || value.every((item) => hasId(item)));
}
/**
 * Valida paginação
 */
export function isPaginated(value) {
    return value !== null &&
        typeof value === 'object' &&
        'items' in value &&
        'total' in value &&
        'page' in value &&
        Array.isArray(value.items) &&
        typeof value.total === 'number' &&
        typeof value.page === 'number';
}
/**
 * SANITIZADORES: Garante que função não retorna undefined
 */
/**
 * Sanitiza retorno de list: undefined/null vira []
 * @example return sanitizeList(dados)
 */
export function sanitizeList(value) {
    if (!isArraySafe(value)) {
        console.warn('[ServiceGuard] sanitizeList: valor não é array, retornando []');
        return [];
    }
    return value;
}
/**
 * Sanitiza retorno de create: valida { id: number }
 * @example return sanitizeCreate(result, defaultId)
 */
export function sanitizeCreate(value, defaultId = -1) {
    if (hasId(value)) {
        return { id: value.id };
    }
    console.warn('[ServiceGuard] sanitizeCreate: retorno inválido, usando ID padrão', defaultId);
    return { id: defaultId };
}
/**
 * Sanitiza retorno de single/get: valida tipo ou retorna null
 * @example return sanitizeGet(produto)
 */
export function sanitizeGet(value) {
    if (value === undefined || value === null) {
        return null;
    }
    return value;
}
/**
 * Sanitiza paginação
 * @example return sanitizePaginated(data, page)
 */
export function sanitizePaginated(items, total, page, pageSize = 50) {
    const validItems = isArraySafe(items) ? items : [];
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
export async function safeListCall(fn, fallback = []) {
    try {
        const result = await fn();
        return sanitizeList(result) || fallback;
    }
    catch (error) {
        console.error('[ServiceGuard] safeListCall erro:', error);
        return fallback;
    }
}
/**
 * Executa função single e garante retorno seguro
 * @example const produto = await safeGetCall(() => db.getProduto(id))
 */
export async function safeGetCall(fn, fallback = null) {
    try {
        const result = await fn();
        return sanitizeGet(result) ?? fallback;
    }
    catch (error) {
        console.error('[ServiceGuard] safeGetCall erro:', error);
        return fallback;
    }
}
/**
 * Executa função create e garante { id: number }
 * @example const { id } = await safeCreateCall(() => db.createProduct(data))
 */
export async function safeCreateCall(fn, defaultId = -1) {
    try {
        const result = await fn();
        return sanitizeCreate(result, defaultId);
    }
    catch (error) {
        console.error('[ServiceGuard] safeCreateCall erro:', error);
        return { id: defaultId };
    }
}
const safetyLogs = [];
/**
 * Registra violação de contrato
 */
export function logSafetyViolation(violation) {
    const log = {
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
export function getSafetyLogs() {
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
export function generateSafetyReport() {
    const grouped = new Map();
    for (const log of safetyLogs) {
        const key = `${log.service}.${log.method}`;
        grouped.set(key, (grouped.get(key) || 0) + 1);
    }
    let report = `\n${'='.repeat(60)}\n`;
    report += `📋 RELATÓRIO DE SEGURANÇA (${safetyLogs.length} violações)\n`;
    report += `${'='.repeat(60)}\n\n`;
    if (safetyLogs.length === 0) {
        report += `✅ Nenhuma violação detectada!\n`;
    }
    else {
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
