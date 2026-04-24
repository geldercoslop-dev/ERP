import { InfrastructureError } from './errors/typed-errors.js';
const forbidden = [
    'drizzle',
    'mysql',
    'database',
    'connection',
    'execute',
    'query'
];
export function assertNoDbAccess(modulePath) {
    // Whitelist explícita: apenas /services/ pode acessar DB
    const isFromAuthorizedServices = /[\\/]services[\\/]/i.test(modulePath);
    if (!isFromAuthorizedServices) {
        forbidden.forEach(f => {
            if (modulePath.includes(f)) {
                console.error('[SECURITY]', `[ARCH VIOLATION] Unauthorized layer cannot access DB: ${modulePath}`);
                throw new InfrastructureError(`[ARCH VIOLATION] Unauthorized layer cannot access DB: ${modulePath}`);
            }
        });
    }
}
