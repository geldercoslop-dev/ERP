import fs from "fs";

const MYSQL_SERVICE_ALIASES = new Set(["vendas-mysql", "mysql", "db", "mariadb"]);
const REDIS_SERVICE_ALIASES = new Set(["vendas-redis", "redis"]);

function isContainerRuntime(): boolean {
  if (process.env.KUBERNETES_SERVICE_HOST) return true;
  if (process.env.DOCKER_ENV === "1") return true;
  if (process.env.CONTAINER === "docker") return true;

  try {
    return fs.existsSync("/.dockerenv");
  } catch {
    return false;
  }
}

export function resolveRuntimeServiceHost(host: string, service: "mysql" | "redis"): string {
  const normalized = (host || "").trim().toLowerCase();
  if (!normalized) return host;

  const fallbackEnabled = process.env.ENABLE_LOCAL_DNS_FALLBACK !== "false";
  if (!fallbackEnabled || isContainerRuntime()) {
    return host;
  }

  const aliases = service === "mysql" ? MYSQL_SERVICE_ALIASES : REDIS_SERVICE_ALIASES;
  if (!aliases.has(normalized)) {
    return host;
  }

  return process.env.LOCALHOST_SERVICE_FALLBACK_HOST || "127.0.0.1";
}
