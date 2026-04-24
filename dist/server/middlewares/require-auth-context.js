import { ValidationError } from '../_core/errors/typed-errors.js';
import { authenticateToken } from "./jwt-auth-middleware.js";
const VALID_ROLES = new Set(["admin", "operator", "user"]);
function hasValidUserShape(user) {
    if (!user || typeof user !== "object")
        return false;
    const candidate = user;
    return (Number.isInteger(candidate.userId) &&
        Number(candidate.userId) > 0 &&
        Number.isInteger(candidate.tenantId) &&
        Number(candidate.tenantId) > 0 &&
        typeof candidate.role === "string" &&
        VALID_ROLES.has(candidate.role));
}
export function requireAuthContext(req, res, next) {
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
