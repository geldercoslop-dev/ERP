/**
 * Rotas usadas por probes (Docker/K8s). Não aplicar timeout global agressivo —
 * evita corrida com o handler que já devolve 503 quando DB/Redis falham.
 */
export function isHealthProbePath(rawUrl) {
    const p = (rawUrl.split("?")[0] || "/").replace(/\/+$/, "") || "/";
    return p === "/api/health";
}
