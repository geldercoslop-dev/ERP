/**
 * AI Provider Factory
 * 
 * Factory para criar e gerenciar provedores de IA
 */

import { GroqProvider, createGroqProvider, type GroqConfig } from './groq-provider.js';
import { GeminiProvider, createGeminiProvider, type GeminiConfig } from './gemini-provider.js';

export type AIProvider = GroqProvider | GeminiProvider;

export interface ProviderConfig {
  type: 'groq' | 'gemini';
  config?: Partial<GroqConfig | GeminiConfig>;
}

/**
 * Cria um provedor de IA baseado no tipo
 */
export function createAIProvider(type: 'groq' | 'gemini', config?: Partial<GroqConfig | GeminiConfig>): AIProvider {
  switch (type) {
    case 'groq':
      return createGroqProvider(config as Partial<GroqConfig>);
    case 'gemini':
      return createGeminiProvider(config as Partial<GeminiConfig>);
    default:
      throw new Error(`Unsupported provider type: ${type}`);
  }
}

/**
 * Obtém provedor pelo nome
 */
export function getProviderByName(name: string): AIProvider {
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('groq') || lowerName.includes('llama')) {
    return createGroqProvider();
  }
  
  if (lowerName.includes('gemini') || lowerName.includes('google')) {
    return createGeminiProvider();
  }
  
  throw new Error(`Unknown provider: ${name}`);
}

/**
 * Lista todos os provedores disponíveis
 */
export function getAvailableProviders(): string[] {
  return ['groq', 'gemini'];
}

/**
 * Testa conexão com todos os provedores
 */
export async function testAllProviders(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  
  try {
    const groqProvider = createGroqProvider();
    results.groq = await groqProvider.testConnection();
  } catch (error) {
    results.groq = false;
  }
  
  try {
    const geminiProvider = createGeminiProvider();
    results.gemini = await geminiProvider.testConnection();
  } catch (error) {
    results.gemini = false;
  }
  
  return results;
}
