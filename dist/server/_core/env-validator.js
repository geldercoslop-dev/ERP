/**
 * Environment Validator
 * Garante que todos os secrets tenham comprimento mínimo obrigatório
 */
export const ENV_SECRET_MIN_LENGTH = 128;
/**
** STRICT VALIDATION: 128 chars minimum for ALL secrets
** NO BYPASSES, NO FALLBACKS - process.exit(1) on failure
**/
export function validateEnv(env) {
    const secretKeys = ['APP_SECRET', 'JWT_SECRET', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
    const errors = [];
    secretKeys.forEach(key => {
        const value = env[key];
        const realLength = (value || '').length;
        if (!value) {
            errors.push(`${key} NOT SET`);
        }
        else if (realLength < ENV_SECRET_MIN_LENGTH) {
            errors.push(`${key} = ${realLength} chars (REQUIRED: >= ${ENV_SECRET_MIN_LENGTH})`);
        }
    });
    if (errors.length > 0) {
        console.error('[ENV_FATAL] Secret validation FAILED:');
        errors.forEach(err => console.error(`  - ${err}`));
        console.error('[ENV_FATAL] Exiting with process.exit(1)');
        process.exit(1); // FAIL HARD - no bypass
    }
}
