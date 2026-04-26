/**
 * RUNTIME CONTEXT DETECTOR
 * 
 * Detecta o contexto de execução (development, production, CI)
 * para permitir validações de infraestrutura context-aware.
 * 
 * PRINCÍPIO:
 * - Produção = rigor máximo (fail-hard)
 * - Desenvolvimento = flexível (fail-soft)
 * - CI/Pre-commit = híbrido inteligente
 */

export type RuntimeContext = 'development' | 'production' | 'ci';

/**
 * Detecta o contexto de execução atual
 * 
 * Lógica de detecção:
 * 1. Se NODE_ENV=production → production
 * 2. Se CI=true → ci
 * 3. Se NODE_ENV=development → development
 * 4. Fallback seguro → development
 * 
 * @returns RuntimeContext detectado
 */
export function detectRuntimeContext(): RuntimeContext {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true' || process.env.GITLAB_CI === 'true';

  // Production: fail-hard para tudo
  if (nodeEnv === 'production') {
    return 'production';
  }

  // CI: ambiente de integração contínua
  if (isCI) {
    return 'ci';
  }

  // Development: fail-soft para permitir evolução
  if (nodeEnv === 'development' || !nodeEnv) {
    return 'development';
  }

  // Fallback seguro: assume development se não conseguir determinar
  return 'development';
}

/**
 * Verifica se está em modo de desenvolvimento
 */
export function isDevelopment(): boolean {
  return detectRuntimeContext() === 'development';
}

/**
 * Verifica se está em modo de produção
 */
export function isProduction(): boolean {
  return detectRuntimeContext() === 'production';
}

/**
 * Verifica se está em ambiente de CI
 */
export function isCI(): boolean {
  return detectRuntimeContext() === 'ci';
}

/**
 * Obtém informações detalhadas do contexto
 */
export function getContextInfo(): {
  context: RuntimeContext;
  nodeEnv: string;
  isCI: boolean;
  description: string;
} {
  const context = detectRuntimeContext();
  const nodeEnv = process.env.NODE_ENV || 'undefined';
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true' || process.env.GITLAB_CI === 'true';

  const descriptions: Record<RuntimeContext, string> = {
    development: 'Desenvolvimento local - validações flexíveis (fail-soft)',
    production: 'Produção - validações rigorosas (fail-hard)',
    ci: 'CI/CD - validações híbridas inteligentes',
  };

  return {
    context,
    nodeEnv,
    isCI,
    description: descriptions[context],
  };
}
