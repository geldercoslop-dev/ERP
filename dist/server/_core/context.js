import cookie from "cookie";
import { resolveSessionPrincipal } from "../services/context-auth.service.js";
export async function createContext(opts) {
    console.log("🔥 CONTEXT EXECUTADO", opts.req.originalUrl ?? opts.req.url);
    let user = null;
    let vendedor = null;
    let isImpersonating = false;
    let tenantId = null;
    const session = {
        origin: "none",
        tokenPresent: false,
        tokenKind: "unknown",
    };
    try {
        const rawCookie = opts.req.headers.cookie;
        const parsed = rawCookie ? cookie.parse(rawCookie) : {};
        const adminSessionToken = parsed.admin_session;
        const cookieToken = (parsed.session_token || parsed.session || parsed.auth_token);
        const cookieName = parsed.session_token != null
            ? "session_token"
            : parsed.session != null
                ? "session"
                : parsed.auth_token != null
                    ? "auth_token"
                    : undefined;
        const rawX = opts.req.headers["x-session-token"];
        const rawAuth = opts.req.headers.authorization;
        const headerToken = (Array.isArray(rawX) ? rawX[0] : rawX)?.trim();
        const authToken = (typeof rawAuth === "string"
            ? rawAuth.replace(/^\s*Bearer\s+/i, "").trim()
            : "") || undefined;
        const token = (typeof cookieToken === "string" && cookieToken ? cookieToken : undefined) ||
            (headerToken || undefined) ||
            (authToken || undefined);
        session.tokenPresent = Boolean((typeof cookieToken === "string" && cookieToken) ||
            (typeof headerToken === "string" && headerToken) ||
            (typeof authToken === "string" && authToken));
        // Origem efetiva: a primeira fonte válida na ordem em que token é decidido acima.
        if (typeof cookieToken === "string" && cookieToken) {
            session.origin = "cookie";
            session.cookieName = cookieName;
        }
        else if (typeof headerToken === "string" && headerToken) {
            session.origin = "header";
        }
        else if (typeof authToken === "string" && authToken) {
            session.origin = "bearer";
        }
        else {
            session.origin = "none";
        }
        const resolvedSession = await resolveSessionPrincipal(token, adminSessionToken);
        user = resolvedSession.user;
        vendedor = resolvedSession.vendedor;
        tenantId = resolvedSession.tenantId;
        isImpersonating = resolvedSession.isImpersonating;
        session.tokenKind = resolvedSession.tokenKind;
        if (resolvedSession.shouldClearSession) {
            const cookieNames = ["session_token", "session", "auth_token"];
            cookieNames.forEach(name => {
                opts.res.clearCookie(name, { path: "/" });
                opts.res.clearCookie(name, { path: "/", domain: "localhost" });
            });
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[createContext] Erro ao processar contexto:", msg);
        if (err instanceof Error && err.stack)
            console.error("[createContext] Stack:", err.stack);
        user = null;
        session.origin = "none";
        session.cookieName = undefined;
        session.tokenKind = "unknown";
        // Limpa cookies em caso de erro para não travar o usuário
        try {
            const cookieNames = ["session_token", "session", "auth_token"];
            cookieNames.forEach(name => {
                opts.res.clearCookie(name, { path: "/" });
                opts.res.clearCookie(name, { path: "/", domain: "localhost" });
            });
        }
        catch (err) {
            console.error("[createContext] clearCookie failed:", err);
        }
    }
    if (!user && process.env.NODE_ENV !== "production") {
        const rawCookie = opts.req.headers.cookie;
        const names = rawCookie ? Object.keys(cookie.parse(rawCookie)) : [];
        const hasSession = names.some((n) => n === "session_token" || n === "session" || n === "auth_token");
        const hasSessionHeader = !!opts.req.headers["x-session-token"];
        const host = opts.req.headers.host || opts.req.hostname || "";
        console.log("[createContext] Requisição sem sessão válida.", {
            hasCookie: !!rawCookie,
            hasSessionCookie: hasSession,
            hasSessionHeader,
            host,
            dica: hasSessionHeader ? "Header X-Session-Token veio mas valor pode ser inválido." : "Faça login na mesma URL (ex.: http://localhost:3000). O token é salvo em sessionStorage e enviado no header X-Session-Token.",
        });
    }
    return {
        req: opts.req,
        res: opts.res,
        user,
        tenantId,
        vendedor,
        isImpersonating,
        session,
    };
}
