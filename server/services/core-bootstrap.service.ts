/**
 * Core Bootstrap Service
 * Operações críticas de inicialização do sistema (migrations, admin user, etc)
 */
import { ensureAdminUser } from '../db/index.js';

/**
 * Garante que usuário admin padrão existe (tenant 1)
 * Deve ser chamado apenas durante boot do sistema
 */
export async function ensureBootstrapAdminUser(tenantId: number = 1): Promise<void> {
  await ensureAdminUser(tenantId);
}

/**
 * Valida se o sistema foi inicializado com sucesso
 */
export async function checkBootstrapInitialization(): Promise<{ initialized: boolean; message: string }> {
  try {
    await ensureBootstrapAdminUser(1);
    return {
      initialized: true,
      message: 'Bootstrap initialization successful',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during bootstrap';
    return {
      initialized: false,
      message,
    };
  }
}
