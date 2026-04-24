/**
 * Middleware Express: exige que a requisição seja de um usuário admin.
 * Usado para rotas REST sensíveis (ex.: /api/backup/download).
 * Usa apenas JWT do header Authorization.
 */
import { Request, Response, NextFunction } from "express";
import { jwtAuth } from "../security/jwt-auth.js";

function getToken(req: Request): string | undefined {
  const rawAuth = req.headers.authorization;
  const authToken =
    (typeof rawAuth === "string" ? rawAuth.replace(/^\s*Bearer\s+/i, "").trim() : "") || undefined;
  return authToken;
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Não autorizado", message: "Token JWT necessário." });
    return;
  }
  try {
    const payload = jwtAuth.verifyAccessToken(token);
    if (
      payload.role === "admin" &&
      Number.isInteger(payload.userId) &&
      payload.userId > 0 &&
      Number.isInteger(payload.tenantId) &&
      payload.tenantId > 0
    ) {
      (req as Request & { adminTenantId?: number }).adminTenantId = payload.tenantId;
      next();
      return;
    }
    res.status(403).json({ error: "Acesso negado", message: "Apenas administradores." });
  } catch {
    res.status(401).json({ error: "Não autorizado", message: "Token inválido ou expirado." });
  }
}
