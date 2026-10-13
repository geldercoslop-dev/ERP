import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import cookie from "cookie";
import type { Vendedor } from "../db/index.js";
import type { UserWithTenant } from "../types/schema-extended.js";
import { jwtAuth } from "../security/jwt-auth.js";
import { COOKIE_NAME, ADMIN_SESSION_COOKIE } from "../../shared/const.js";
import * as usersService from "../services/users.service.js";
import { isAccessSessionValid } from "./session.service.js";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: UserWithTenant | null;
  /** Tenant atual (quando autenticado em ambiente multi-tenant). */
  tenantId: number | null;
  /** Preenchido quando a identidade efetiva tem vendedor vinculado e revalidado. */
  vendedor: Vendedor | null;
  /** True quando admin está impersonando vendedor (admin_session JWT validado + revalidado no DB). */
  isImpersonating: boolean;
};

/**
 * Identidade revalidada: JWT assinado prova emissão pelo servidor;
 * o banco prova que a identidade ainda é válida AGORA.
 * O payload NUNCA é autoridade — user/tenant/role/vendedor vêm do DB.
 */
type ResolvedIdentity = {
  user: UserWithTenant;
  tenantId: number;
  vendedor: Vendedor | null;
};

/**
 * Revalida uma credencial JWT contra o banco (fail-closed).
 * - user.id == jwt.userId E user.tenantId == jwt.tenantId (filtro tenant+id no DB)
 * - role efetiva vem SEMPRE do estado atual do banco (nunca do claim)
 * - se o JWT carrega vendedorId: vendedor tenant-safe, vínculo userId e ativo==true
 * Qualquer divergência → null (sem fallback).
 */
async function revalidateJwtIdentity(token: string): Promise<ResolvedIdentity | null> {
  let payload;
  try {
    payload = jwtAuth.verifyAccessToken(token);
  } catch {
    return null; // assinatura inválida, expirado, malformado, formato legado (u:/v:/literais)
  }

  if (!Number.isInteger(payload.userId) || payload.userId <= 0) return null;
  if (!Number.isInteger(payload.tenantId) || payload.tenantId <= 0) return null;
  if (typeof payload.sessionId !== "string" || !payload.sessionId) return null;

  // AUTH-H5: sessão persistida obrigatória — access token só vale enquanto a
  // sessão existir em auth_sessions, não estiver revogada, estiver dentro da
  // janela de refresh e bater tenant/user/vendedor com o payload. Logout e
  // revogação derrubam o access imediatamente.
  const sessionOk = await isAccessSessionValid({
    sessionId: payload.sessionId,
    tenantId: payload.tenantId,
    userId: payload.userId,
    vendedorId: typeof payload.vendedorId === "number" ? payload.vendedorId : null,
  });
  if (!sessionOk) return null;

  // User REAL no banco — tenant-first: id+tenant juntos (mismatch → null)
  const user = await usersService.getUserById(payload.userId, payload.tenantId);
  if (!user || user.tenantId !== payload.tenantId) return null;

  // Token de vendedor: vendedorId obrigatoriamente presente → revalidar vínculo completo
  let vendedor: Vendedor | null = null;
  if (typeof payload.vendedorId === "number") {
    const v = await usersService.getVendedorById(payload.vendedorId, payload.tenantId);
    if (!v) return null;
    if (v.tenantId !== payload.tenantId) return null;
    if (v.userId == null || v.userId !== user.id) return null;
    if (v.ativo !== true) return null;
    vendedor = v;
  }

  // P23-R-10B-FIX2: vendedores.admin é autoridade legítima pré-R10B.
  // Prova: buildUserFromVendedor (commit 7fd418433) mapeava v.admin→role 'admin'
  // para sessões 'v:'. Restaurado tenant-scoped: o vendedor acima já foi
  // revalidado (tenant + vínculo userId + ativo) — role vem do DB, nunca do claim.
  const effectiveUser: UserWithTenant =
    vendedor !== null && vendedor.admin === true
      ? { ...user, role: "admin" }
      : user;

  return { user: effectiveUser, tenantId: user.tenantId, vendedor };
}

/** Lê um header que pode vir como string ou string[] (Express/undici). */
function headerValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0].trim();
  return null;
}

/** Extrai "Bearer <token>" do header Authorization. */
function bearerToken(req: CreateExpressContextOptions["req"]): string | null {
  const raw = headerValue(req.headers.authorization);
  if (!raw) return null;
  const m = raw.match(/^\s*Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Candidatos de credencial de sessão, na ordem de precedência:
 * cookies httpOnly de sessão (definidos pelo servidor) → Bearer → x-session-token.
 * Todos os candidatos carregam o MESMO JWT no fluxo real do client.
 * Formatos legados (u:<id>, v:<id>, v:<tenant>:<id>, literais) falham na
 * verificação de assinatura — nunca autenticam.
 */
function sessionTokenCandidates(req: CreateExpressContextOptions["req"]): string[] {
  const candidates: string[] = [];
  try {
    const rawCookie = req.headers.cookie;
    const parsed = typeof rawCookie === "string" && rawCookie ? cookie.parse(rawCookie) : {};
    for (const name of ["session", COOKIE_NAME]) {
      const v = parsed[name];
      if (typeof v === "string" && v.trim()) candidates.push(v.trim());
    }
  } catch {
    /* cookie malformado não derruba a resolução */
  }
  const bearer = bearerToken(req);
  if (bearer) candidates.push(bearer);
  const xs = headerValue(req.headers["x-session-token"]);
  if (xs) candidates.push(xs);
  return candidates;
}

/** Valor cru do cookie admin_session (null se ausente). */
function adminSessionCookieValue(req: CreateExpressContextOptions["req"]): string | null {
  try {
    const rawCookie = req.headers.cookie;
    const parsed = typeof rawCookie === "string" && rawCookie ? cookie.parse(rawCookie) : {};
    const v = parsed[ADMIN_SESSION_COOKIE];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: UserWithTenant | null = null;
  let vendedor: Vendedor | null = null;
  let isImpersonating = false;
  let tenantId: number | null = null;

  try {
    const req = opts.req;

    // 1) admin_session: presença do cookie NÃO define impersonation.
    //    É obrigatório: verificar assinatura + expiração e revalidar o admin no DB.
    const adminToken = adminSessionCookieValue(req);
    const adminIdentity = adminToken ? await revalidateJwtIdentity(adminToken) : null;
    // Cookie presente mas JWT inválido/expirado OU admin perdeu role no DB → não impersona
    const adminSessionValid =
      adminIdentity !== null && adminIdentity.user.role === "admin";

    // 2) Identidade efetiva: primeiro candidato válido (cookie de sessão primeiro).
    let identity: ResolvedIdentity | null = null;
    for (const candidate of sessionTokenCandidates(req)) {
      identity = await revalidateJwtIdentity(candidate);
      if (identity) break;
    }

    if (adminSessionValid && adminIdentity) {
      // Sessão efetiva DEVE ser um JWT de vendedor do mesmo tenant do admin.
      // Mesmo user sem vendedor → não é impersonation; divergência → fail-closed.
      const samePrincipal =
        identity !== null &&
        identity.user.id === adminIdentity.user.id &&
        identity.vendedor === null;

      const isImpersonationIdentity =
        identity !== null &&
        identity.vendedor !== null &&
        identity.tenantId === adminIdentity.tenantId;

      if (isImpersonationIdentity && identity) {
        user = identity.user;
        tenantId = identity.tenantId;
        vendedor = identity.vendedor;
        isImpersonating = true;
      } else if (samePrincipal && identity) {
        user = identity.user;
        tenantId = identity.tenantId;
      } else {
        // P23-R-10B-FIX2: admin_session NÃO autentica sozinho.
        // Sessão efetiva ausente/inválida ou sinais mistos → fail closed total.
        // admin_session é SOMENTE credencial de restauração (auth.stopImpersonation).
        user = null;
        tenantId = null;
        vendedor = null;
        isImpersonating = false;
      }
    } else if (identity) {
      user = identity.user;
      tenantId = identity.tenantId;
      vendedor = identity.vendedor;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[createContext] Erro ao resolver sessão:", msg);
    user = null;
    tenantId = null;
    vendedor = null;
    isImpersonating = false;
  }

  if (!user && process.env.NODE_ENV !== "production") {
    const hasAuthHeader = !!opts.req.headers.authorization;
    const hasCookieHeader = typeof opts.req.headers.cookie === "string" && opts.req.headers.cookie.length > 0;
    console.log("[createContext] Requisição sem sessão válida.", {
      hasAuthHeader,
      hasCookieHeader,
      dica: "Envie JWT assinado no cookie de sessão ou no header Authorization: Bearer <token>.",
    });
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    tenantId,
    vendedor,
    isImpersonating,
  };
}
