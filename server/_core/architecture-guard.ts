import { InfrastructureError } from './errors/typed-errors.js';

const forbidden = [
  'drizzle',
  'mysql',
  'database',
  'connection',
  'execute',
  'query'
];

export function assertNoDbAccess(modulePath: string) {
  if (modulePath.includes('/leo/')) {
    forbidden.forEach(f => {
      if (modulePath.includes(f)) {
        console.error('[SECURITY]', `[ARCH VIOLATION] LEO cannot access DB: ${modulePath}`);
        throw new InfrastructureError(`[ARCH VIOLATION] LEO cannot access DB: ${modulePath}`);
      }
    });
  }
}
