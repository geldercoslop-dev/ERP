/**
 * Validação centralizada de ownership (RBAC).
 * Cliente: fonte de verdade é `cliente_vendedores` (vínculo principal).
 * Pedido: valida via `pedidos.clienteId` → cliente_vendedores → vendedor.userId.
 */
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context.js";
import { getVendedorById, getUserById } from "../services/users.service.js";
import { getPedidoById } from "../services/orders.service.js";
import { getContaReceberByIdForTenant, getBoletoById } from "../services/finance.service.js";
import { getClienteOwnershipRowById } from "../services/clientes.service.js";

export type OwnershipContext = {
  user: { id: number; role: string } | null;
};

export type OwnableEntity = "pedido" | "conta_receber" | "boleto" | "cliente";

export type OwnershipTrpcContext = Pick<TrpcContext, "user" | "vendedor" | "tenantId">;

function getOptionalNumberField(source: unknown, field: string): number | null {
  if (source == null || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[field];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

/**
 * Resolve o `users.id` dono da carteira para comparar com vendedor.userId.
 * Não usar para admin (admin não passa por ownership de cliente).
 */
export async function resolveOwnerUserId(ctx: Pick<TrpcContext, "user" | "vendedor">): Promise<number> {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão necessária." });
  }
  if (ctx.user.role === "admin") {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "resolveOwnerUserId não aplicável a admin." });
  }
  if (ctx.vendedor?.userId != null && ctx.vendedor.userId > 0) {
    return ctx.vendedor.userId;
  }
  const tenantId = (ctx.user as TrpcContext["user"])?.tenantId;
  if (!tenantId || tenantId <= 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "tenantId ausente no contexto." });
  }
  const vByPk = await getVendedorById(ctx.user.id);
  if (vByPk?.userId != null && vByPk.userId > 0) {
    return vByPk.userId;
  }
  const u = await getUserById(ctx.user.id);
  if (u) {
    return ctx.user.id;
  }
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Conta sem user_id vinculado para ownership de cliente/pedido.",
  });
}

/**
 * Se ctx.user for admin, não faz nada.
 * Se for vendedor, verifica ownership conforme entidade; caso contrário lança FORBIDDEN ou NOT_FOUND.
 */
export async function assertOwnership(
  ctx: OwnershipTrpcContext,
  entity: OwnableEntity,
  entityId: number
): Promise<void> {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão necessária." });
  }
  if (ctx.user.role === "admin") {
    return;
  }

  switch (entity) {
    case "pedido": {
      if (!ctx.tenantId || ctx.tenantId <= 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "tenantId ausente no contexto." });
      }
      const pedido = await getPedidoById(ctx.tenantId, entityId);
      if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      const clienteRow = await getClienteOwnershipRowById(ctx.tenantId, pedido.clienteId);
      if (!clienteRow) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
      if (ctx.tenantId != null && clienteRow.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
      }
      const ownerUid = await resolveOwnerUserId(ctx);
      if (clienteRow.userId == null || clienteRow.userId !== ownerUid) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
      }
      return;
    }
    case "conta_receber": {
      if (!ctx.tenantId || ctx.tenantId <= 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "tenantId ausente no contexto." });
      }
      const conta = await getContaReceberByIdForTenant(ctx.tenantId, entityId);
      if (!conta) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada." });
      const vendedorId = getOptionalNumberField(conta, "vendedorId");
      if (vendedorId == null || vendedorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
      }
      return;
    }
    case "boleto": {
      if (!ctx.tenantId || ctx.tenantId <= 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "tenantId ausente no contexto." });
      }
      const boleto = await getBoletoById(ctx.tenantId, entityId);
      if (!boleto) throw new TRPCError({ code: "NOT_FOUND", message: "Boleto não encontrado." });
      const vendedorId = getOptionalNumberField(boleto, "vendedorId");
      if (vendedorId == null || vendedorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
      }
      return;
    }
    case "cliente": {
      if (!ctx.tenantId || ctx.tenantId <= 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "tenantId ausente no contexto." });
      }
      const row = await getClienteOwnershipRowById(ctx.tenantId, entityId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
      if (ctx.tenantId != null && row.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
      }
      const ownerUid = await resolveOwnerUserId(ctx);
      if (row.userId == null || row.userId !== ownerUid) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
      }
      return;
    }
    default: {
      const _: never = entity;
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Entidade desconhecida." });
    }
  }
}
