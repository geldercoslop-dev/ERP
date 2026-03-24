import * as configuracoesService from "../../services/configuracoes.service";

const PREFIX = "leo_memory_";
function getDefaultTenantId(): number {
  const tenantId = Number(process.env.DEFAULT_TENANT_ID || process.env.TENANT_ID || 0);
  if (!tenantId || tenantId <= 0) {
    throw new Error("Tenant ID obrigatório para memória do LEO");
  }
  return tenantId;
}

function key(tenantId: number, usuario: string, chave: string): string {
  return `${PREFIX}${tenantId}_${usuario}_${chave}`;
}

export async function getMemoria(usuario: string, chave: string, tenantId: number = getDefaultTenantId()): Promise<string | null> {
  try {
    const valor = await configuracoesService.getConfig(key(tenantId, usuario, chave));
    return valor ?? null;
  } catch {
    return null;
  }
}

export async function setMemoria(usuario: string, chave: string, valor: string, tenantId: number = getDefaultTenantId()): Promise<void> {
  try {
    await configuracoesService.setConfig(key(tenantId, usuario, chave), valor);
  } catch (e) {
    console.error("[LEO memory] Erro ao setMemoria:", (e as Error)?.message ?? e);
    throw e;
  }
}

export async function listarChavesMemoria(usuario: string, tenantId: number = getDefaultTenantId()): Promise<string[]> {
  try {
    const pattern = `${PREFIX}${tenantId}_${usuario}_%`;
    const chaves = await configuracoesService.listConfigKeysLike(pattern);
    const prefix = `${PREFIX}${tenantId}_${usuario}_`;
    return chaves.map((c) => c.replace(prefix, ""));
  } catch (e) {
    console.error("[LEO memory] Erro ao listarChavesMemoria:", (e as Error)?.message ?? e);
    return [];
  }
}

export async function removerMemoria(usuario: string, chaveMemoria: string, tenantId: number = getDefaultTenantId()): Promise<void> {
  try {
    await configuracoesService.deleteConfigByChave(key(tenantId, usuario, chaveMemoria));
  } catch (e) {
    console.error("[LEO memory] Erro ao removerMemoria:", (e as Error)?.message ?? e);
    throw e;
  }
}
