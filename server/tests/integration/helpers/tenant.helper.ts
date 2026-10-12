/**
 * Fundação para FK física users/vendedores -> tenants (P24+).
 *
 * Testes inserem rows com tenantId arbitrário; `tenants` é master table e
 * futuras FKs exigem row pai. `ensureTenantExists` torna cada fixture
 * auto-suficiente: garante o pai antes do primeiro insert filho.
 *
 * Não cria nem assume FK — funciona no schema atual (sem references()).
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { tenants, users, vendedores } from "../../../../drizzle/schema.js";

type DbConn = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export interface EnsureTenantOptions {
  nomeEmpresa?: string;
  plano?: string;
}

/**
 * Garante que exista uma row em `tenants` com o id informado.
 *
 * - Idempotente e atômico: `ON DUPLICATE KEY UPDATE id = <id>` é no-op
 *   na row existente (não sobrescreve nome/plano do tenant real, ex.: id=1).
 * - Recebe tenantId explicitamente — nunca inventa id.
 * - Race-safe: vitest roda arquivos em workers paralelos; o upsert é atômico,
 *   sem janela SELECT→INSERT que geraria ER_DUP_ENTRY.
 */
export async function ensureTenantExists(
  conn: DbConn,
  tenantId: number,
  options?: EnsureTenantOptions
): Promise<number> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error(`ensureTenantExists: tenantId inválido (${tenantId})`);
  }

  await conn
    .insert(tenants)
    .values({
      id: tenantId,
      nomeEmpresa: options?.nomeEmpresa ?? `Test Tenant ${tenantId}`,
      plano: options?.plano ?? "test",
      status: "ACTIVE",
    })
    .onDuplicateKeyUpdate({ set: { id: tenantId } });

  return tenantId;
}

/**
 * Remove um tenant de teste — SOMENTE quando seguro.
 *
 * - Recusa tenantId 1 (tenant default real).
 * - Recusa deletar se ainda houver filhos em users/vendedores
 *   (ordem de cleanup: filhos primeiro, pai por último).
 * - Não usado nesta fase; preparado para P24D (pós-FK).
 */
export async function cleanupTestTenant(conn: DbConn, tenantId: number): Promise<void> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error(`cleanupTestTenant: tenantId inválido (${tenantId})`);
  }
  if (tenantId === 1) {
    throw new Error("cleanupTestTenant recusa deletar o tenant default (id=1)");
  }

  const childUsers = await conn
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .limit(1);
  const childVendedores = await conn
    .select({ id: vendedores.id })
    .from(vendedores)
    .where(eq(vendedores.tenantId, tenantId))
    .limit(1);

  if (childUsers.length > 0 || childVendedores.length > 0) {
    return;
  }

  await conn.delete(tenants).where(eq(tenants.id, tenantId));
}
