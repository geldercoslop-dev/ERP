import { InfrastructureError } from '../../_core/errors/typed-errors.js';
export function assertNoDirectDbAccess(context) {
    if (context === 'LEO') {
        console.error('[SECURITY]', '[ARCH_VIOLATION] LEO cannot access DB directly');
        throw new InfrastructureError('[ARCH_VIOLATION] LEO cannot access DB directly');
    }
}
