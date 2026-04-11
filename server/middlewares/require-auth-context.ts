import type { NextFunction, Request, Response } from "express";
import { ValidationError } from '../_core/errors/typed-errors.js';
import { authenticateToken } from "./jwt-auth-middleware.js";
import type { JWTPayload } from "../security/jwt-auth.js";

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
    if (!req.user) {
      throw new ValidationError("Usuário não autenticado");
    }

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

  if (!req.user) {
    throw new ValidationError("Usuário não autenticado");
  }

  if (hasValidUserShape(req.user)) {
    finalize();
    return;
  }

  authenticateToken(req, res, () => {
    finalize();
  });
}
