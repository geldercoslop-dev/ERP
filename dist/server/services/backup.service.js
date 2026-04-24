/**
 * Serviço de backup completo - exporta dados das tabelas principais para ZIP.
 * Usado por backup.ts e infra/backup.
 */
import { getDb } from "../db/core.js";
import * as schema from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
function parseTenantId(tenantId) {
    const parsed = Number(tenantId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return { success: false, error: "TENANT_ID_REQUIRED: tenantId deve ser inteiro positivo" };
    }
    return { success: true, data: parsed };
}
export async function gerarBackupCompleto(tenantId) {
    const tenantIdResult = parseTenantId(tenantId);
    if (!tenantIdResult.success) {
        return { success: false, error: tenantIdResult.error };
    }
    const tenantIdNum = tenantIdResult.data;
    const db = await getDb();
    try {
        const [produtos, clientes, vendedores, pedidos, cores, planoContas, contasFixas, contasPagar, contasReceber, comissoes, cargas,] = await Promise.all([
            db.select().from(schema.produtos).where(eq(schema.produtos.tenantId, tenantIdNum)),
            db.select().from(schema.clientes).where(eq(schema.clientes.tenantId, tenantIdNum)),
            db.select().from(schema.vendedores).where(eq(schema.vendedores.tenantId, tenantIdNum)),
            db.select().from(schema.pedidos).where(eq(schema.pedidos.tenantId, tenantIdNum)),
            db.select().from(schema.cores).where(eq(schema.cores.tenantId, tenantIdNum)),
            db.select().from(schema.planoContas).where(eq(schema.planoContas.tenantId, tenantIdNum)),
            db.select().from(schema.contasFixas).where(eq(schema.contasFixas.tenantId, tenantIdNum)),
            db.select().from(schema.contasPagar).where(eq(schema.contasPagar.tenantId, tenantIdNum)),
            db.select().from(schema.contasReceber).where(eq(schema.contasReceber.tenantId, tenantIdNum)),
            db.select().from(schema.comissoes).where(eq(schema.comissoes.tenantId, tenantIdNum)),
            db.select().from(schema.cargas).where(eq(schema.cargas.tenantId, tenantIdNum)),
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
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
