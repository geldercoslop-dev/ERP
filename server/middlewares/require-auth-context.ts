import type { NextFunction, Request, Response } from "express";
import { authenticateToken } from "./jwt-auth-middleware";
import type { JWTPayload } from "../security/jwt-auth";

const VALID_ROLES = new Set<JWTPayload["role"]>(["admin", "operator", "user"]);

function hasValidUserShape(user: unknown): user is JWTPayload {
  if (!user || typeof user !== "object") return false;
  const candidate = user as Partial<JWTPayload>;
  return (
    Number.isInteger(candidate.userId) &&
    Number(candidate.userId) > 0 &&
    Number.isInteger(candidate.tenantId) &&
    Number(candidate.tenantId) > 0 &&
    typeof candidate.role === "string" &&
    VALID_ROLES.has(candidate.role as JWTPayload["role"])
  );
}

export function requireAuthContext(req: Request, res: Response, next: NextFunction): void {
  const finalize = () => {
    if (!hasValidUserShape(req.user)) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Contexto de autenticação inválido",
        code: "AUTH_CONTEXT_INVALID",
      });
      return;
    }
    next();
  };

  if (hasValidUserShape(req.user)) {
    finalize();
    return;
  }

  authenticateToken(req, res, () => {
    finalize();
  });
}
