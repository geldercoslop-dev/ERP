/**
 * Middleware Express: exige que a requisição seja de um usuário admin.
 * Usado para rotas REST sensíveis (ex.: /api/backup/download).
 * Reutiliza a mesma lógica de resolução de sessão do createContext (cookie/header).
 */
import { Request, Response, NextFunction } from "express";
import cookie from "cookie";
import { jwtAuth } from "../security/jwt-auth";

function getToken(req: Request): string | undefined {
  const rawCookie = req.headers.cookie;
  const parsed = rawCookie ? cookie.parse(rawCookie) : {};
  const cookieToken = (parsed.session_token || parsed.session || parsed.auth_token) as string | undefined;
  const rawX = req.headers["x-session-token"];
  const rawAuth = req.headers.authorization;
  const headerToken = (Array.isArray(rawX) ? rawX[0] : (rawX as string | undefined))?.trim();
  const authToken =
    (typeof rawAuth === "string" ? rawAuth.replace(/^\s*Bearer\s+/i, "").trim() : "") || undefined;
  return (
    (typeof cookieToken === "string" && cookieToken ? cookieToken : undefined) ||
    headerToken ||
    authToken
  );
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Não autorizado", message: "Sessão necessária." });
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
      next();
      return;
    }
    res.status(403).json({ error: "Acesso negado", message: "Apenas administradores." });
  } catch {
    res.status(401).json({ error: "Não autorizado", message: "Token inválido ou expirado." });
  }
}
