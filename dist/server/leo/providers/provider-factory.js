/**
 * AI Provider Factory
 *
 * Factory para criar e gerenciar provedores de IA
 */
import { createGroqProvider } from './groq-provider.js';
import { createGeminiProvider } from './gemini-provider.js';
import { ValidationError } from '../../_core/errors/typed-errors.js';
/**
 * Cria um provedor de IA baseado no tipo
 */
export function createAIProvider(type, config) {
    switch (type) {
        case 'groq':
            return createGroqProvider(config);
        case 'gemini':
            return createGeminiProvider(config);
        default:
            throw new ValidationError(`Unsupported provider type: ${type}`);
    }
}
/**
 * Obtém provedor pelo nome
 */
export function getProviderByName(name) {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('groq') || lowerName.includes('llama')) {
        return createGroqProvider();
    }
    if (lowerName.includes('gemini') || lowerName.includes('google')) {
        return createGeminiProvider();
    }
    throw new ValidationError(`Unknown provider: ${name}`);
}
/**
 * Lista todos os provedores disponíveis
 */
export function getAvailableProviders() {
    return ['groq', 'gemini'];
}
/**
 * Testa conexão com todos os provedores
 */
export async function testAllProviders() {
    const results = {};
    try {
        const groqProvider = createGroqProvider();
        results.groq = await groqProvider.testConnection();
    }
    catch (error) {
        results.groq = false;
    }
    try {
        const geminiProvider = createGeminiProvider();
        results.gemini = await geminiProvider.testConnection();
    }
    catch (error) {
        results.gemini = false;
    }
    return results;
}
