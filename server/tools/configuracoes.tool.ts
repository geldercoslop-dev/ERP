/**
 * Configuracoes Tool - Interface para operações de configuração
 * 
 * Esta tool encapsula o acesso ao configuracoesService, garantindo que
 * toda execução passe pela tool layer e não diretamente pelo LEO.
 */

import * as configuracoesService from "../services/configuracoes.service.js";
import { ValidationError } from '../_core/errors/typed-errors.js';

export interface GetConfigInput {
  tenantId: number;
  usuario: string;
  chave: string;
}

export interface SetConfigInput {
  tenantId: number;
  usuario: string;
  chave: string;
  valor: string;
}

export interface ListConfigKeysInput {
  tenantId: number;
  usuario: string;
  pattern: string;
}

export interface DeleteConfigInput {
  tenantId: number;
  usuario: string;
  chave: string;
}

export async function getConfig(input: GetConfigInput): Promise<string | null> {
  const { tenantId, usuario, chave } = input;
  
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new ValidationError("tenantId obrigatório");
  }
  
  try {
    const valor = await configuracoesService.getConfig(chave);
    return valor ?? null;
  } catch {
    return null;
  }
}

export async function setConfig(input: SetConfigInput): Promise<void> {
  const { tenantId, usuario, chave, valor } = input;
  
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new ValidationError("tenantId obrigatório");
  }
  
  try {
    await configuracoesService.setConfig(chave, valor);
  } catch (e) {
    console.error("[ConfiguracoesTool] Erro ao setConfig:", (e as Error)?.message ?? e);
    throw e;
  }
}

export async function listConfigKeysLike(input: ListConfigKeysInput): Promise<string[]> {
  const { tenantId, usuario, pattern } = input;
  
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new ValidationError("tenantId obrigatório");
  }
  
  try {
    const chaves = await configuracoesService.listConfigKeysLike(pattern);
    return chaves;
  } catch (e) {
    console.error("[ConfiguracoesTool] Erro ao listConfigKeysLike:", (e as Error)?.message ?? e);
    return [];
  }
}

export async function deleteConfigByChave(input: DeleteConfigInput): Promise<void> {
  const { tenantId, usuario, chave } = input;
  
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new ValidationError("tenantId obrigatório");
  }
  
  try {
    await configuracoesService.deleteConfigByChave(chave);
  } catch (e) {
    console.error("[ConfiguracoesTool] Erro ao deleteConfigByChave:", (e as Error)?.message ?? e);
    throw e;
  }
}

export const configuracoesTool = {
  getConfig,
  setConfig,
  listConfigKeysLike,
  deleteConfigByChave,
};
