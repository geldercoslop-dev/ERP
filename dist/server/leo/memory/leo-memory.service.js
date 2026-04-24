import * as configuracoesService from "../../services/configuracoes.service.js";
import { ValidationError } from '../../_core/errors/typed-errors.js';
const PREFIX = "leo_memory_";
function key(tenantId, usuario, chave) {
    return `${PREFIX}${tenantId}_${usuario}_${chave}`;
}
export async function getMemoria(usuario, chave, tenantId) {
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
        throw new ValidationError("tenantId obrigatório no contexto");
    }
    try {
        const valor = await configuracoesService.getConfig(key(tenantId, usuario, chave));
        return valor ?? null;
    }
    catch {
        return null;
    }
}
export async function setMemoria(usuario, chave, valor, tenantId) {
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
        throw new ValidationError("tenantId obrigatório no contexto");
    }
    try {
        await configuracoesService.setConfig(key(tenantId, usuario, chave), valor);
    }
    catch (e) {
        console.error("[LEO memory] Erro ao setMemoria:", e?.message ?? e);
        throw e;
    }
}
export async function listarChavesMemoria(usuario, tenantId) {
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
        throw new ValidationError("tenantId obrigatório no contexto");
    }
    try {
        const pattern = `${PREFIX}${tenantId}_${usuario}_%`;
        const chaves = await configuracoesService.listConfigKeysLike(pattern);
        const prefix = `${PREFIX}${tenantId}_${usuario}_`;
        return chaves.map((c) => c.replace(prefix, ""));
    }
    catch (e) {
        console.error("[LEO memory] Erro ao listarChavesMemoria:", e?.message ?? e);
        return [];
    }
}
export async function removerMemoria(usuario, chaveMemoria, tenantId) {
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
        throw new ValidationError("tenantId obrigatório no contexto");
    }
    try {
        await configuracoesService.deleteConfigByChave(key(tenantId, usuario, chaveMemoria));
    }
    catch (e) {
        console.error("[LEO memory] Erro ao removerMemoria:", e?.message ?? e);
        throw e;
    }
}
