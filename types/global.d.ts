/**
 * Declarações globais mínimas e seguras
 * Apenas o essencial sem conflitos
 */

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      [key: string]: string | undefined
    }
  }
}
