// Guard central forte para bloquear acesso ao DB fora de SERVICES
import { InfrastructureError } from './errors/typed-errors.js';

/**
 * Lança erro se tentativa de acesso ao DB partir de LEO ou TOOLS.
 * @param kind descrição do acesso (ex: 'mysql', 'drizzle', 'db', etc)
 */
export function assertNoDirectDbAccess(kind: string): void {
  const stack = new Error().stack || '';
  // Checa se a stack envolve /leo/ ou /tools/ (exceto /services/)
  const isFromLeoOrTools = /[\\/]leo[\\/]|[\\/]tools[\\/]/i.test(stack) && !/[\\/]services[\\/]/i.test(stack);
  if (isFromLeoOrTools) {
    throw new InfrastructureError(`[ARCH_VIOLATION] Direct DB access outside SERVICES: ${kind}\nStack: ${stack}`);
  }
}
