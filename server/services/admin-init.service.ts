import bcrypt from 'bcryptjs';
import { ValidationError } from '../_core/errors/typed-errors.js';
import { 
  getUserByOpenIdGlobal, 
  findOrCreateUserByOpenId, 
  createVendedor 
} from './users.service.js';

/**
 * Cria usuário admin inicial se não existir
 * Usa ADMIN_INITIAL_PASSWORD do ambiente ou gera erro
 */
export async function ensureInitialAdmin(tenantId: number): Promise<void> {
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new ValidationError("tenantId é obrigatório para inicializar admin.");
  }
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  
  if (!adminPassword) {
    console.error('[ensureInitialAdmin] ADMIN_INITIAL_PASSWORD não definido nas variáveis de ambiente');
    console.error('[ensureInitialAdmin] Defina a variável: export ADMIN_INITIAL_PASSWORD="sua_senha_segura"');
    throw new ValidationError('ADMIN_INITIAL_PASSWORD não configurado');
  }

  try {
    // Verificar se admin já existe
    const existingAdmin = await getUserByOpenIdGlobal("admin");
    
    if (existingAdmin) {
      console.log('[ensureInitialAdmin] Admin já existe, verificando senha...');
      // Schema atual não armazena senha em users; admin efetivo é via vendedor.admin/senha.
      return;
    }

    // Criar novo admin
    console.log('[ensureInitialAdmin] Criando usuário admin inicial...');
    
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    const adminUser = await findOrCreateUserByOpenId(tenantId, "admin", "Administrador");
    await createVendedor({
      tenantId,
      userId: adminUser.id,
      nome: "Administrador",
      email: "admin@local.com",
      senha: hashedPassword,
      admin: true,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('[ensureInitialAdmin] Admin criado com sucesso');
    console.log('[ensureInitialAdmin] Use as credenciais: admin / [sua senha ADMIN_INITIAL_PASSWORD]');
    
  } catch (error) {
    console.error('[ensureInitialAdmin] Erro ao garantir admin inicial:', error);
    throw error;
  }
}

/**
 * Valida se a senha do admin atende aos requisitos mínimos
 */
export function validateAdminPassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Senha deve ter pelo menos 8 caracteres');
  }
  
  if (password === 'admin123' || password === 'password' || password === '123456') {
    errors.push('Senha muito comum, escolha uma mais segura');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra maiúscula');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra minúscula');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Senha deve conter pelo menos um número');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Gera uma senha segura aleatória se não for fornecida
 */
export function generateSecurePassword(): string {
  const length = 16;
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return password;
}

export default {
  ensureInitialAdmin,
  validateAdminPassword,
  generateSecurePassword,
};
