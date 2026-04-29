// Script de inicialização segura do administrador
// Wrapper para delegar lógica de aplicação para admin-init.service.ts

import { ensureInitialAdmin as ensureInitialAdminService } from "../services/admin-init.service.js";

/**
 * Cria usuário admin inicial se não existir
 * Delega para o service de aplicação
 */
export async function ensureInitialAdmin(tenantId: number): Promise<void> {
  return ensureInitialAdminService(tenantId);
}

export default {
  ensureInitialAdmin,
};
