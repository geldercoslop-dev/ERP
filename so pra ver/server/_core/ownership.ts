/**
 * Validação centralizada de ownership (RBAC).
 * Uso: em procedures protected que acessam recurso por id;
 * garante que vendedor só acessa recursos próprios (pedido, conta a receber, boleto, cliente).
 */
import { TRPCError } from "@trpc/server";
import * as db from "../db";

export type OwnershipContext = {
  user: { id: number; role: string } | null;
};

export type OwnableEntity = "pedido" | "conta_receber" | "boleto" | "cliente";

/**
 * Se ctx.user for admin, não faz nada.
 * Se for vendedor, verifica se o recurso pertence ao vendedor; caso contrário lança FORBIDDEN ou NOT_FOUND.
 */
export async function assertOwnership(
  ctx: OwnershipContext,
  entity: OwnableEntity,
  entityId: number
): Promise<void> {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão necessária." });
  }
  if (ctx.user.role === "admin") {
    return;
  }
  const vendedorId = ctx.user.id;

  switch (entity) {
    case "pedido": {
      const pedido = await db.getPedidoById(entityId);
      if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      if (pedido.vendedorId !== vendedorId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
      }
      return;
    }
    case "conta_receber": {
      const conta = await db.getContaReceberById(entityId);
      if (!conta) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada." });
      if (conta.vendedorId === null || conta.vendedorId !== vendedorId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
      }
      return;
    }
    case "boleto": {
      const boleto = await db.getBoletoById(entityId);
      if (!boleto) throw new TRPCError({ code: "NOT_FOUND", message: "Boleto não encontrado." });
      if (boleto.vendedorId !== vendedorId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
      }
      return;
    }
    case "cliente": {
      const pertence = await db.clienteTemPedidoDoVendedor(entityId, vendedorId);
      if (!pertence) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cliente não pertence ao seu portfólio." });
      }
      return;
    }
    default: {
      const _: never = entity;
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Entidade desconhecida." });
    }
  }
}
