// Teste rápido da validação de ambiente
import { validateEnv } from './server/_core/env-validator.js';

try {
  validateEnv(process.env);
  console.log('SUCCESS: Environment validation passed!');
} catch (error) {
  console.error('FAILED:', error.message);
  process.exit(1);
}
