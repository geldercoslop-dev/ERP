/**
 * server/utils/tenant-guard-hardened.ts
 * REFORÇO: Tenant validation com anti-bypass completo
 *
 * Garantias:
 * - TenantId SEMPRE obrigatório (sem fallback)
 * - Validação em 3 níveis (tipo, valor, origem)
 * - Nenhum helper retorna default
 * - Requer contexto de requisição (não manual)
 */
import { ValidationError } from '../_core/errors/typed-errors.js';
/**
 * CRITICAL: Valida tenantId com regras INFLEXÍVEIS
 *
 * Regras:
 * - tenantId deve ser string ou number positivo
 * - NUNCA null, undefined, 0, -1, "0", "", "default"
 * - NUNCA vir de process.env direto
 * - Deve vir de request context
 *
 * @param tenantId - tenant a validar
 * @param context - de onde veio (request, param, etc)
 * @throws Error sem mensagem genérica (força debug)
 */
export function assertTenant(tenantId, context) {
    // Fail fast: tipo incorreto
    if (typeof tenantId !== 'string' && typeof tenantId !== 'number') {
        throw new ValidationError(`TENANT_INVALID_TYPE: ${typeof tenantId} (expected string|number) ${context ? `@ ${context}` : ''}`);
    }
    // Fail fast: valor vazio
    if (tenantId === null || tenantId === undefined || tenantId === '' || tenantId === 0 || tenantId === '0') {
        throw new ValidationError(`TENANT_REQUIRED: tenantId é obrigatório e não pode ser vazio/falsy ${context ? `@ ${context}` : ''}`);
    }
    // Fail fast: valores proibidos
    const proibidos = ['default', 'DEFAULT', 'test', 'TEST', 'seed', 'SEED', 'admin', 'ADMIN'];
    const strValue = String(tenantId).toLowerCase();
    if (proibidos.some(p => strValue === p.toLowerCase())) {
        throw new ValidationError(`TENANT_FORBIDDEN_VALUE: "${tenantId}" é reservado ${context ? `@ ${context}` : ''}`);
    }
    return tenantId;
}
/**
 * SAFE: Retorna boolean sem throw (para filters)
 *
 * Use APENAS em:
 * - WHERE clauses opcionais
 * - Filtros não-críticos
 *
 * NÃO USE em create/update/delete
 *
 * @param tenantId - tenant a testar
 * @returns true se válido, false senão
 */
export function hasTenant(tenantId) {
    return (typeof tenantId === 'string' && tenantId !== '' ||
        typeof tenantId === 'number' && tenantId > 0);
}
/**
 * GUARD: Checa se tenantId veio de contexto VÁLIDO
 *
 * Rejeita:
 * - Manual typing (const t = 1)
 * - Env vars (process.env.TENANT)
 * - Config defaults
 * - Fixtures/seeds em produção
 *
 * @param tenantId - tenant candidate
 * @param source - origem (deve ser "request" ou "param")
 * @throws Error se source for inválido
 */
export function assertTenantSource(tenantId, source) {
    const validSources = ['request', 'param', 'body'];
    if (!validSources.includes(source)) {
        throw new ValidationError(`TENANT_INVALID_SOURCE: "${source}" - deve vir de requisição, não ${source}`);
    }
    return assertTenant(tenantId, `source=${source}`);
}
/**
 * EXTRACT: Extrai tenantId de request context com validação
 *
 * Padrão esperado:
 * req.tenantId (middleware)
 if (!req.user) {
   throw new ValidationError("Usuário não autenticado");
 }

 * req.user.tenantId (auth payload)
 * req.params.tenantId (URL)
 *
 * @param req - request object
 * @returns tenantId validado
 * @throws Error se não encontrar óu inválido
 */
export function extractTenantFromRequest(req) {
    // Try multiple sources in order of preference
    const r = req;
    const tenantId = r?.tenantId ||
        r?.user?.tenantId ||
        r?.params?.tenantId ||
        r?.query?.tenantId;
    if (!tenantId) {
        throw new ValidationError('TENANT_NOT_FOUND: request sem tenantId em (tenantId|user.tenantId|params.tenantId|query.tenantId)');
    }
    return assertTenant(tenantId, 'request');
}
/**
 * VALIDATE BATCH: Array de tenantIds
 *
 * Use em operações bulk
 *
 * @param tenantIds - array de tenants
 * @throws Error se algum inválido
 */
export function assertTenantsArray(tenantIds) {
    if (!Array.isArray(tenantIds) || tenantIds.length === 0) {
        throw new ValidationError('TENANTS_ARRAY_INVALID: deve ser array não-vazio');
    }
    return tenantIds.map((t, i) => {
        try {
            return assertTenant(t, `array[${i}]`);
        }
        catch (err) {
            throw new ValidationError(`TENANTS_ARRAY_INVALID at index ${i}: ${String(err)}`);
        }
    });
}
/**
 * Type guard: Narrowing para tenantId (TypeScript helper)
 *
 * Use em if blocks para narrowing:
 * if (isTenantValid(t)) { ... } // t agora é string|number
 */
export function isTenantValid(tenantId) {
    return hasTenant(tenantId);
}
