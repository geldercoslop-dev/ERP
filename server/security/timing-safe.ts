import * as crypto from 'crypto';

/**
 * Funções de comparação segura contra timing attacks
 */

/**
 * Comparação em tempo constante para strings
 * Previne timing attacks em comparações sensíveis
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Comparação em tempo constante para buffers
 */
export function constantTimeCompareBuffer(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

/**
 * Função segura para comparação de senhas em texto plano
 * (para migração ou casos especiais onde bcrypt não pode ser usado)
 */
export function safePasswordCompare(plainPassword: string, storedPassword: string): boolean {
  // Se a senha armazenada tem hash, usar bcrypt
  if (storedPassword.startsWith('$2') || storedPassword.startsWith('$2a') || storedPassword.startsWith('$2b')) {
    // Delegar para bcrypt (já é timing-safe)
    return false; // Indica que deve usar bcrypt.compare
  }

  // Para senhas em texto plano (migração), usar comparação em tempo constante
  return constantTimeCompare(plainPassword, storedPassword);
}

/**
 * Gera hash seguro para senhas
 */
export async function secureHash(password: string, saltRounds: number = 12): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verifica senha com fallback seguro
 */
export async function secureVerify(password: string, hash: string): Promise<boolean> {
  // Se é hash bcrypt, usar bcrypt.compare
  if (hash.startsWith('$2') || hash.startsWith('$2a') || hash.startsWith('$2b')) {
    const bcrypt = await import('bcryptjs');
    return bcrypt.compare(password, hash);
  }

  // Fallback para texto plano (apenas para migração)
  console.warn('[Security] Plain text password detected - consider migrating to bcrypt');
  return constantTimeCompare(password, hash);
}

/**
 * Mascara string para logs (mantém comprimento)
 */
export function maskString(str: string, visibleChars: number = 2): string {
  if (str.length <= visibleChars) {
    return '*'.repeat(str.length);
  }
  
  const start = str.substring(0, visibleChars);
  const end = str.substring(str.length - visibleChars);
  const middle = '*'.repeat(str.length - (visibleChars * 2));
  
  return start + middle + end;
}

/**
 * Mascara email para logs
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return maskString(email);
  
  const maskedLocal = local.length > 2 
    ? local.substring(0, 2) + '*'.repeat(local.length - 2)
    : '*'.repeat(local.length);
    
  return `${maskedLocal}@${domain}`;
}

export default {
  constantTimeCompare,
  constantTimeCompareBuffer,
  safePasswordCompare,
  secureHash,
  secureVerify,
  maskString,
  maskEmail
};
