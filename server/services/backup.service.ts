/**
 * Serviço de backup completo - exporta dados das tabelas principais para ZIP.
 * Usado por backup.ts e infra/backup.
 */

import { getDb } from "../db/core.js";
import * as schema from "../../drizzle/schema.ts";
import { eq } from "drizzle-orm";

export type BackupData = {
  dataBackup: string;
  produtos: unknown[];
  clientes: unknown[];
  vendedores: unknown[];
  pedidos: unknown[];
  cores: unknown[];
  fornecedores: unknown[];
  planoContas: unknown[];
  contasFixas: unknown[];
  contasPagar: unknown[];
  contasReceber: unknown[];
  comissoes: unknown[];
  cargas: unknown[];
};

function parseTenantId(tenantId: string): { success: boolean; data?: number; error?: string } {
  const parsed = Number(tenantId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { success: false, error: "TENANT_ID_REQUIRED: tenantId deve ser inteiro positivo" };
  }
  return { success: true, data: parsed };
}

export async function gerarBackupCompleto(tenantId: string): Promise<{ success: boolean; data?: BackupData; error?: string }> {
  const tenantIdResult = parseTenantId(tenantId);
  if (!tenantIdResult.success) {
    return { success: false, error: tenantIdResult.error };
  }
  
  const tenantIdNum = tenantIdResult.data!;
  const db = await getDb();
  try {
    const [
      produtos,
      clientes,
      vendedores,
      pedidos,
      cores,
      planoContas,
      contasFixas,
      contasPagar,
      contasReceber,
      comissoes,
      cargas,
    ] = await Promise.all([
      db.select().from(schema.produtos), // sem tenantId no schema atual
      db.select().from(schema.clientes), // sem tenantId no schema atual
      db.select().from(schema.vendedores).where(eq(schema.vendedores.tenantId, tenantIdNum)),
      db.select().from(schema.pedidos), // sem tenantId no schema atual
      db.select().from(schema.cores), // sem tenantId no schema atual
      db.select().from(schema.planoContas), // sem tenantId no schema atual
      db.select().from(schema.contasFixas), // sem tenantId no schema atual
      db.select().from(schema.contasPagar), // sem tenantId no schema atual
      db.select().from(schema.contasReceber), // sem tenantId no schema atual
      db.select().from(schema.comissoes), // sem tenantId no schema atual
      db.select().from(schema.cargas), // sem tenantId no schema atual
    ]);

    return {
      success: true,
      data: {
        dataBackup: new Date().toISOString(),
        produtos,
        clientes,
        vendedores,
        pedidos,
        cores,
        fornecedores: [], // tabela não existe no schema atual
        planoContas,
        contasFixas,
        contasPagar,
        contasReceber,
        comissoes,
        cargas,
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
