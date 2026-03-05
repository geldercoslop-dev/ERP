import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
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
  const isLocal = isLocalRequest(req);
  const isSecure = isSecureRequest(req);

  // SameSite=None exige Secure=true; em localhost sem HTTPS o cookie é rejeitado.
  // Em ambiente local usamos Lax para o cookie ser aceito pelo navegador.
  const sameSite = isLocal && !isSecure ? ("lax" as const) : ("none" as const);
  const secure = isSecure;

  const options: Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> = {
    httpOnly: true,
    path: "/",
    sameSite,
    secure,
    domain: isLocal ? undefined : req.hostname,
  };

  return options;
}
