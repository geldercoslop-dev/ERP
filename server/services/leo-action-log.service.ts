import { insertLeoActionLog as insertLeoActionLogCore } from "../db/core.js";

export { insertLeoActionLogCore as insertLeoActionLog };

export async function insertLeoLegacyActionLog(params: {
  usuario: string;
  acao: string;
  entidade: string;
  dados?: string | null;
  resultado: string;
}): Promise<void> {
  const tenantMatch = params.usuario.match(/tenant:(\d+)/i);
  const tenantId = tenantMatch
    ? Number(tenantMatch[1])
    : null;
  if (!tenantId || !Number.isFinite(tenantId) || tenantId <= 0) return;
  try {
    await insertLeoActionLogCore({
      tenantId,
      usuario: params.usuario,
      acao: params.acao,
      entidade: params.entidade,
      dados: params.dados ?? null,
      resultado: params.resultado,
    });
  } catch {
    void 0;
  }
}
