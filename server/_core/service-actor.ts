/**
 * Ator de serviço — obrigatório em leituras/listagens sensíveis.
 * admin: visão do tenant inteiro; vendedor: apenas vínculos próprios / pedidos próprios.
 */
import type { TrpcContext } from "./context.js";
import { ValidationError, InfrastructureError } from "./errors/typed-errors.js";

export type ServiceActorRole = "admin" | "vendedor";

export type ServiceActor = {
  role: ServiceActorRole;
  userId?: number; // Adicionado para hardening de ownership
  /** Obrigatório quando role === "vendedor". */
  vendedorId?: number;
};

/** Ator administrativo (visão completa do tenant). */
export const ADMIN_ACTOR: ServiceActor = { role: "admin" };

export function assertVendedorActor(actor: ServiceActor): asserts actor is ServiceActor & { vendedorId: number } {
  if (actor.role !== "vendedor") return;
  if (!actor.vendedorId || !Number.isInteger(actor.vendedorId) || actor.vendedorId <= 0) {
    throw new ValidationError("vendedorId obrigatório e válido para papel vendedor");
  }
}

/**
 * Resolve vendedor a partir do contexto tRPC (mesma regra que routers: ctx.vendedor → userId → id legado).
 * `userId` no ator é sempre o `users.id` dono da carteira (alinha a `clientes.userId`), não o id da linha em `vendedores`.
 */
export async function resolveServiceActor(ctx: Pick<TrpcContext, "user" | "vendedor" | "tenantId">): Promise<ServiceActor> {
  if (!ctx.user) {
    throw new ValidationError("Usuário não autenticado");
  }
  if (ctx.user.role === "admin") {
    return { role: "admin", userId: ctx.user.id };
  }
  if (!ctx.tenantId || ctx.tenantId <= 0) {
    throw new ValidationError("tenantId obrigatório para resolver actor de serviço");
  }
  const tenantId = String(ctx.tenantId);
  const db = await import("../db/index.js");
  const v =
    ctx.vendedor ??
    (await db.getVendedorByUserId(ctx.user.id)) ??
    (await db.getVendedorById(ctx.user.id));
  if (!v) {
    throw new InfrastructureError("Não foi possível resolver o vendedor para este usuário");
  }
  let ownerUserId: number | undefined;
  if (v.userId != null && v.userId > 0) {
    ownerUserId = v.userId;
  } else {
    ownerUserId = ctx.user.id;
  }
  if (ownerUserId == null || ownerUserId <= 0) {
    throw new InfrastructureError("Vendedor sem user_id vinculado para ownership de cliente");
  }
  return { role: "vendedor", userId: ownerUserId, vendedorId: v.id };
}

/** Papel string usado em permissões de tools ("admin" | "vendedor"). */
export function leoRoleFromActor(actor: ServiceActor): "admin" | "vendedor" {
  return actor.role === "admin" ? "admin" : "vendedor";
}

/**
 * Monta ServiceActor a partir do contexto já preenchido pelo ActionExecutor.
 * @throws se contexto incompleto para escopo vendedor
 */
export function serviceActorFromLeoExecutionContext(ctx: {
  userRole?: string;
  vendedorId?: number;
}): ServiceActor {
  const role = (ctx.userRole || "").toLowerCase();
  if (role === "admin") {
    return { role: "admin" };
  }
  const vid = ctx.vendedorId;
  if (!vid || !Number.isInteger(vid) || vid <= 0) {
    throw new ValidationError("Contexto LEO incompleto: userRole/vendedorId obrigatórios para vendedor");
  }
  return { role: "vendedor", vendedorId: vid };
}

/** Escopo financeiro: null = admin (sem filtro por vendedor); número = obrigatório em queries. */
export function financeScopeVendedorId(actor: ServiceActor): number | null {
  if (actor.role === "admin") return null;
  assertVendedorActor(actor);
  return actor.vendedorId;
}

/**
 * Actor a partir do contexto runtime do LEO (ações/consultas).
 * @throws se não-admin sem vendedorId válido
 */
export function actorFromLeoRuntimeContext(ctx: {
  usuario?: { role?: string; vendedorId?: number };
}): ServiceActor {
  const r = (ctx.usuario?.role || "").toLowerCase();
  if (r === "admin") return ADMIN_ACTOR;
  const vid = ctx.usuario?.vendedorId;
  if (vid != null && Number.isInteger(vid) && vid > 0) {
    return { role: "vendedor", vendedorId: vid };
  }
  throw new ValidationError("Contexto LEO incompleto: vendedorId obrigatório para consulta financeira como não-admin");
}
