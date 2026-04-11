import * as configuracoesService from "../../services/configuracoes.service.js";
import { ValidationError } from '../../_core/errors/typed-errors.js';

const PREFIX = "leo_memory_";


function key(tenantId: number, usuario: string, chave: string): string {
  return `${PREFIX}${tenantId}_${usuario}_${chave}`;
}

export async function getMemoria(usuario: string, chave: string, tenantId: number): Promise<string | null> {
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new ValidationError("tenantId obrigatório no contexto");
  }
  try {
    const valor = await configuracoesService.getConfig(key(tenantId, usuario, chave));
    return valor ?? null;
  } catch {
    return null;
  }
}


export async function setMemoria(usuario: string, chave: string, valor: string, tenantId: number): Promise<void> {
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new ValidationError("tenantId obrigatório no contexto");
  }
  try {
    await configuracoesService.setConfig(key(tenantId, usuario, chave), valor);
  } catch (e) {
    console.error("[LEO memory] Erro ao setMemoria:", (e as Error)?.message ?? e);
    throw e;
  }
}


export async function listarChavesMemoria(usuario: string, tenantId: number): Promise<string[]> {
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new ValidationError("tenantId obrigatório no contexto");
  }
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


export async function removerMemoria(usuario: string, chaveMemoria: string, tenantId: number): Promise<void> {
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new ValidationError("tenantId obrigatório no contexto");
  }
  try {
    await configuracoesService.deleteConfigByChave(key(tenantId, usuario, chaveMemoria));
  } catch (e) {
    console.error("[LEO memory] Erro ao removerMemoria:", (e as Error)?.message ?? e);
    throw e;
  }
}
