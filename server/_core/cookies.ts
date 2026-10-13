import type { CookieOptions, Request } from "express";

/** AUTH-H5: nome canônico do cookie httpOnly de refresh token (cookie-only, nunca body/localStorage). */
export const REFRESH_COOKIE_NAME = "refresh_token";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers?.["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

function isLocalRequest(req: Request) {
  const hostname = req.hostname || "";
  return LOCAL_HOSTS.has(hostname) || isIpAddress(hostname);
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const nodeEnv = process.env.NODE_ENV;
  const isLocal = isLocalRequest(req);
  const isSecure = isSecureRequest(req);

  // SameSite=None exige Secure=true; em localhost sem HTTPS o cookie é rejeitado.
  // Em localhost (produção ou dev) usamos sameSite=lax e secure=false para login funcionar.
  // Produção: manter cookies em modo mais permissivo (lax) para HTTPS.
  const sameSite =
    nodeEnv === "production"
      ? ("lax" as const)
      : isLocal && !isSecure
        ? ("lax" as const)
        : ("none" as const);
  const secure = isLocal ? false : isSecure;

  const options: Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> = {
    httpOnly: true,
    path: "/",
    sameSite,
    secure,
    domain: isLocal ? undefined : req.hostname,
  };

  return options;
}

/**
 * AUTH-H5: opções do cookie refresh_token — mesma política de
 * httpOnly/sameSite/secure/path do cookie de sessão, com maxAge da janela
 * de refresh (JWT_REFRESH_EXPIRY, default 7d quando ausente).
 * O refresh token só trafega neste cookie httpOnly — nunca em body ou
 * localStorage.
 */
export function getRefreshCookieOptions(
  req: Request,
  maxAgeMs: number
): CookieOptions {
  return { ...getSessionCookieOptions(req), maxAge: maxAgeMs };
}
