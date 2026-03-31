/**
 * Serviço de limpeza de screenshots antigos do LEO
 * Implementação centralizada da função limparScreenshotsAntigos
 */

import leoScreen from '../leo/perception/leo-screen.js';

// Re-exportar a função para uso externo
export const limparScreenshotsAntigos = () => {
  console.log('[LEO Screen Service] limparScreenshotsAntigos called (stub mode)');
  return Promise.resolve();
};

// Implementação da função (caso necessário)
export const limparScreenshotsAntigosService = limparScreenshotsAntigos;
