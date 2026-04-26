/**
 * Core Bootstrap Service
 * Operacoes criticas de inicializacao do sistema (migrations, admin user, etc)
 */
import bcrypt from 'bcryptjs';
import {
  ensureAdminUser,
  findOrCreateUserByOpenId,
  getVendedorByUserId,
  createVendedor,
  updateVendedorSenha,
  upsertUser,
} from '../db/index.js';
import { InfrastructureError } from '../_core/errors/typed-errors.js';

/**
 * Garante que usuario admin padrao existe (tenant 1)
 * Deve ser chamado apenas durante boot do sistema
 */
export async function ensureBootstrapAdminUser(tenantId: number = 1): Promise<void> {
  for (let i = 1; i <= 3; i++) {
    try {
      await ensureAdminUser(tenantId);
      return;
    } catch (e) {
      console.error('[ADMIN RETRY]', i, e);
      if (i === 3) {
        console.error('[FATAL] ADMIN BOOTSTRAP FAILED');
        throw new InfrastructureError('ADMIN_BOOTSTRAP_FAILED');
      }
    }
  }
}

/**
 * Seed fixo para fluxo de carga k6 (controlado por K6_MODE)
 */
export async function ensureBootstrapK6User(tenantId: number = 1): Promise<void> {
  const email = 'k6@test.com';
  const senha = 'k6test123';

  const user = await findOrCreateUserByOpenId(tenantId, email, 'k6 load user');
  await upsertUser(tenantId, {
    ...user,
    email,
    openId: email,
    role: 'user',
    updatedAt: new Date(),
  });

  let vendedor = await getVendedorByUserId(user.id);
  if (!vendedor) {
    const now = new Date();
    const created = await createVendedor({
      tenantId,
      userId: user.id,
      nome: 'k6 load user',
      email,
      senha: null,
      telefone: null,
      admin: false,
      ativo: true,
      createdAt: now,
      updatedAt: now,
    });
    vendedor = await getVendedorByUserId(user.id);
    if (!vendedor) {
      throw new InfrastructureError(`K6_USER_CREATE_FAILED:${created.id}`);
    }
  }

  const hashed = await bcrypt.hash(senha, 10);
  await updateVendedorSenha(vendedor.id, hashed);
}

/**
 * Valida se o sistema foi inicializado com sucesso
 */
export async function checkBootstrapInitialization(): Promise<{ initialized: boolean; message: string }> {
  try {
    await ensureBootstrapAdminUser(1);
    if (process.env.K6_MODE === 'true') {
      await ensureBootstrapK6User(1);
    }
    return {
      initialized: true,
      message: 'Bootstrap initialization successful',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during bootstrap';
    throw new InfrastructureError(message);
  }
}
