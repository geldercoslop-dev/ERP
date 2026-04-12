/**
 * tenant-guard.ts
 * Helper isolado para validação de tenant (FASE 3 - Multi-tenant Hard Guard)
 * 
 * Regra: Funções críticas (create/update/delete) DEVEM chamar assertTenant()
 * ou receber tenantId como parâmetro nominado (não implícito via payload)
 */

/**
 * Valida e retorna tenantId se válido, senão lança erro.
 * 
 * @param tenantId - tenant id para validar
 * @returns tenantId validado
 * @throws Error se tenantId for undefined, null, ou 0
 */
export function assertTenant(tenantId: string | number | undefined): string | number {
  if (!tenantId) {
    throw new Error(
      "Tenant obrigatório: operação requer tenantId válido. " +
      "Não há fallback padrão. Verifique o contexto de requisição."
    );
  }
  return tenantId;
}

/**
 * Variante que retorna boolean (para checks silenciosos em filters, etc)
 * @param tenantId - tenant id para validar
 * @returns true se válido, false senão
 */
export function hasTenant(tenantId: string | number | undefined): boolean {
  return Boolean(tenantId);
}
