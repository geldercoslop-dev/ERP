import * as db from "../db/index";
import { eq, and, sql } from "drizzle-orm";
import { produtos } from "../../drizzle/schema";
import { isRecord } from "../_core/type-guards";

/** Primeiro conjunto de linhas retornado por `db.execute` (driver MySQL: [rows, fields]). */
function mysqlFirstRowset(result: unknown): unknown[] {
  if (!Array.isArray(result) || result.length === 0) return [];
  const first = result[0];
  return Array.isArray(first) ? first : [];
}

export type ProblemaDiagnostico = {
  tipo: string;
  idReferencia: string | number;
  descricao: string;
  nivel: 'aviso' | 'erro' | 'critico';
};

/**
 * Serviço de diagnósticos e manutenção do sistema.
 */

export async function runDiagnosticoConsistencia(tenantId: number): Promise<ProblemaDiagnostico[]> {
  const dbConn = await db.getDb();
  if (!dbConn) return [];

  const problemas: ProblemaDiagnostico[] = [];

  try {
    // 1. Pedidos sem itens
    const pedidosSemItens = await dbConn.execute(sql`
      SELECT p.id, p.numero 
      FROM pedidos p 
      LEFT JOIN itens_pedido i ON p.id = i.pedidoId 
      WHERE p.tenantId = ${tenantId} AND i.id IS NULL
    `);
    
    for (const raw of mysqlFirstRowset(pedidosSemItens)) {
      if (!isRecord(raw)) continue;
      const id = Number(raw["id"]);
      const numero = raw["numero"];
      if (!Number.isFinite(id)) continue;
      problemas.push({
        tipo: 'PEDIDO_VAZIO',
        idReferencia: id,
        descricao: `Pedido #${String(numero ?? "")} não possui itens cadastrados.`,
        nivel: 'aviso'
      });
    }

    // 2. Divergência de total de pedido
    const divergenciasTotal = await dbConn.execute(sql`
      SELECT p.id, p.numero, p.total as totalPedido, SUM(i.total) as totalItens
      FROM pedidos p
      JOIN itens_pedido i ON p.id = i.pedidoId
      WHERE p.tenantId = ${tenantId}
      GROUP BY p.id
      HAVING ABS(p.total - SUM(i.total)) > 0.05
    `);

    for (const raw of mysqlFirstRowset(divergenciasTotal)) {
      if (!isRecord(raw)) continue;
      const id = Number(raw["id"]);
      const numero = raw["numero"];
      const totalPedido = raw["totalPedido"];
      const totalItens = raw["totalItens"];
      if (!Number.isFinite(id)) continue;
      problemas.push({
        tipo: 'DIVERGENCIA_TOTAL',
        idReferencia: id,
        descricao: `Pedido #${String(numero ?? "")} com total diverge dos itens (Pedido: ${String(totalPedido ?? "")}, Itens: ${String(totalItens ?? "")}).`,
        nivel: 'erro'
      });
    }

    // 3. Estoque negativo
    const estoqueNegativo = await dbConn.select({ id: produtos.id, descricao: produtos.descricao, estoque: produtos.estoque })
      .from(produtos)
      .where(and(eq(produtos.tenantId, tenantId), sql`${produtos.estoque} < 0`));

    for (const p of estoqueNegativo) {
      problemas.push({
        tipo: 'ESTOQUE_NEGATIVO',
        idReferencia: p.id,
        descricao: `Produto "${p.descricao}" com estoque negativo (${p.estoque}).`,
        nivel: 'aviso'
      });
    }

  } catch (error) {
    console.error("[SystemService] Erro ao rodar diagnóstico:", error);
  }

  return problemas;
}
