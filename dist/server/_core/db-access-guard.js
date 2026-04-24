// Guard central forte para bloquear acesso ao DB fora de SERVICES
import { InfrastructureError } from './errors/typed-errors.js';
import { getServiceInvocationStore } from './service-entry-guard.js';
import { isValidServiceContext } from '../runtime/service-invocation.js';
/**
 * Lança erro se tentativa de acesso ao DB fora de SERVICES.
 * @param kind descrição do acesso (ex: 'mysql', 'drizzle', 'db', etc)
 */
export function assertNoDirectDbAccess(kind) {
    const store = getServiceInvocationStore();
    if (!isValidServiceContext(store)) {
        throw new InfrastructureError("[ARCH_VIOLATION] Invalid service context");
    }
}
