/**
 * Motor de alertas operacionais.
 * Gera lista de alertas para pedido parado, carga atrasada, entrega pendente, financeiro pendente e estoque baixo.
 */
import * as db from "../../db/index.js";
import { inArray } from "drizzle-orm";
import { CargaStatus, ContaReceberStatus, PedidoStatus } from "../../shared/domain-status.js";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../../_core/service-entry-guard.js";
import { assertTenantId, assertDbConnection } from "../../_core/errors/assertions.js";

export type AlertaOperacional = {
  tipo: string;
  mensagem: string;
  entidade: { tipo: string; id: number; numero?: number } | null;
  data: Date;
};

/** Limite de estoque para considerar "estoque baixo" (produto sem campo estoqueMinimo no schema). */
const ESTOQUE_MINIMO_ALERTA = 5;

/**
 * Gera todos os alertas operacionais.
 * Respeita vendedor quando informado (apenas pedidos/cargas do vendedor); admin vê todos.
 */
export async function gerarAlertasOperacionais(
  tenantId: number,
  vendedorId?: number | null
): Promise<AlertaOperacional[]> {
  return await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
    assertTenantId(tenantId);
    const conn = await db.getDb();
    assertDbConnection(conn);

  const alertas: AlertaOperacional[] = [];
  const pedidoWhereVendedor =
    vendedorId != null ? db.eq(db.pedidos.vendedorId, vendedorId) : undefined;

  // 1) Pedido parado: gerado há mais de 24h e não conferido
  const pedidosParados = await conn
    .select({
      id: db.pedidos.id,
      numero: db.pedidos.numero,
      createdAt: db.pedidos.createdAt,
    })
    .from(db.pedidos)
    .where(
      pedidoWhereVendedor
        ? db.and(
            db.eq(db.pedidos.tenantId, tenantId),
            inArray(db.pedidos.status, [PedidoStatus.GERADO, PedidoStatus.PENDENTE_ESTOQUE]),
            db.sql`${db.pedidos.createdAt} < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
            pedidoWhereVendedor
          )
        : db.and(
            db.eq(db.pedidos.tenantId, tenantId),
            inArray(db.pedidos.status, [PedidoStatus.GERADO, PedidoStatus.PENDENTE_ESTOQUE]),
            db.sql`${db.pedidos.createdAt} < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
          )
    );
  for (const p of pedidosParados) {
    alertas.push({
      tipo: "pedido_parado",
      mensagem: `Pedido #${p.numero} gerado há mais de 24h sem conferência`,
      entidade: { tipo: "pedido", id: p.id, numero: p.numero ?? undefined },
      data: p.createdAt ?? new Date(),
    });
  }

  // 2) Carga atrasada: criada e não enviada (status ABERTA) após 12h
  const cargasAtrasadas = await conn
    .select({
      id: db.cargas.id,
      numero: db.cargas.numero,
      createdAt: db.cargas.createdAt,
    })
    .from(db.cargas)
    .where(
      db.and(
        db.eq(db.cargas.tenantId, tenantId),
        db.eq(db.cargas.status, CargaStatus.ABERTA),
        db.sql`${db.cargas.createdAt} < DATE_SUB(NOW(), INTERVAL 12 HOUR)`
      )
    );
  for (const c of cargasAtrasadas) {
    alertas.push({
      tipo: "carga_atrasada",
      mensagem: `Carga #${c.numero} aberta há mais de 12h sem envio para rota`,
      entidade: { tipo: "carga", id: c.id, numero: c.numero ?? undefined },
      data: c.createdAt ?? new Date(),
    });
  }

  // 3) Entrega pendente: pedido EM_ROTA há mais de 48h
  const emRotaPendentes = await conn
    .select({
      id: db.pedidos.id,
      numero: db.pedidos.numero,
      updatedAt: db.pedidos.updatedAt,
    })
    .from(db.pedidos)
    .where(
      pedidoWhereVendedor
        ? db.and(
            db.eq(db.pedidos.tenantId, tenantId),
            db.eq(db.pedidos.status, PedidoStatus.EM_ROTA),
            db.sql`${db.pedidos.updatedAt} < DATE_SUB(NOW(), INTERVAL 48 HOUR)`,
            pedidoWhereVendedor
          )
        : db.and(
            db.eq(db.pedidos.tenantId, tenantId),
            db.eq(db.pedidos.status, PedidoStatus.EM_ROTA),
            db.sql`${db.pedidos.updatedAt} < DATE_SUB(NOW(), INTERVAL 48 HOUR)`
          )
    );
  for (const p of emRotaPendentes) {
    alertas.push({
      tipo: "entrega_pendente",
      mensagem: `Pedido #${p.numero} em rota há mais de 48h`,
      entidade: { tipo: "pedido", id: p.id, numero: p.numero ?? undefined },
      data: p.updatedAt ?? new Date(),
    });
  }

  // 4) Financeiro pendente: pedido ENTREGUE mas com conta a receber PENDENTE
  const pedidosEntregues = await conn
    .select({
      id: db.pedidos.id,
      numero: db.pedidos.numero,
      updatedAt: db.pedidos.updatedAt,
    })
    .from(db.pedidos)
    .innerJoin(db.contasReceber, db.eq(db.contasReceber.pedidoNumero, db.pedidos.numero))
    .where(
      pedidoWhereVendedor
        ? db.and(
            db.eq(db.pedidos.tenantId, tenantId),
            db.eq(db.contasReceber.tenantId, tenantId),
            db.eq(db.pedidos.status, PedidoStatus.ENTREGUE),
            db.eq(db.contasReceber.status, ContaReceberStatus.PENDENTE),
            pedidoWhereVendedor
          )
        : db.and(
            db.eq(db.pedidos.tenantId, tenantId),
            db.eq(db.contasReceber.tenantId, tenantId),
            db.eq(db.pedidos.status, PedidoStatus.ENTREGUE),
            db.eq(db.contasReceber.status, ContaReceberStatus.PENDENTE)
          )
    );
  const seenFinanceiro = new Set<number>();
  for (const p of pedidosEntregues) {
    if (seenFinanceiro.has(p.id)) continue;
    seenFinanceiro.add(p.id);
    alertas.push({
      tipo: "financeiro_pendente",
      mensagem: `Pedido #${p.numero} entregue mas ainda com valor a receber`,
      entidade: { tipo: "pedido", id: p.id, numero: p.numero ?? undefined },
      data: p.updatedAt ?? new Date(),
    });
  }

  // 5) Estoque baixo: produto com estoque <= ESTOQUE_MINIMO_ALERTA
  const produtosBaixo = await conn
    .select({
      id: db.produtos.id,
      descricao: db.produtos.descricao,
      estoque: db.produtos.estoque,
    })
    .from(db.produtos)
    .where(
      db.and(
        db.eq(db.produtos.tenantId, tenantId),
        db.eq(db.produtos.ativo, true),
        db.sql`${db.produtos.estoque} <= ${ESTOQUE_MINIMO_ALERTA}`
      )
    );
  for (const prod of produtosBaixo) {
    alertas.push({
      tipo: "estoque_baixo",
      mensagem: `Produto "${String(prod.descricao).slice(0, 50)}" (id ${prod.id}) com estoque ${prod.estoque ?? 0}`,
      entidade: { tipo: "produto", id: prod.id },
      data: new Date(),
    });
  }

  return alertas;
  });
}
