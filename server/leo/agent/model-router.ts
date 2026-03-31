/**
 * Model Router - Seleção inteligente de provedores de IA
 * 
 * Seleciona automaticamente entre Groq e Gemini baseado no conteúdo
 */

import type { AIProvider } from '../providers/index.js';
import { createGroqProvider, createGeminiProvider } from '../providers/index.js';

export interface ModelRequest {
  prompt: string;
  context?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  tools?: Record<string, unknown>[];
}

export interface ModelResponse {
  content: string;
  toolCalls?: Array<{
    toolName: string;
    input: Record<string, unknown>;
    reasoning?: string;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider: string;
  model: string;
  processingTime: number;
}

export interface ModelConfig {
  defaultProvider: 'groq' | 'gemini' | 'auto';
  groqConfig?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  geminiConfig?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  selectionCriteria?: {
    maxLengthForGroq?: number;
    minComplexityForGemini?: number;
  };
}

export class ModelRouter {
  private config: ModelConfig;
  private groqProvider: AIProvider | undefined;
  private geminiProvider: AIProvider | undefined;

  constructor(config?: Partial<ModelConfig>) {
    this.config = {
      defaultProvider: 'auto',
      selectionCriteria: {
        maxLengthForGroq: 2000,
        minComplexityForGemini: 3,
      },
      ...config
    };

    // Inicializar providers
    this.initializeProviders();
  }

  private async initializeProviders() {
    try {
      this.groqProvider = createGroqProvider(this.config.groqConfig);
      this.geminiProvider = createGeminiProvider(this.config.geminiConfig);
    } catch (error) {
      console.warn('Failed to initialize AI providers:', error);
    }
  }

  /**
   * Obtém resposta usando seleção inteligente de provedor
   * COM TRATAMENTO ROBUSTO DE ERROS
   */
  async getResponse(request: ModelRequest): Promise<ModelResponse> {
    try {
      const provider = this.selectProvider(request);
      if (!provider) {
        console.warn('Nenhum provider disponível, usando mock response');
        return this.getMockResponse(request);
      }
      
      const response = await provider.generateResponse(request.prompt, request.tools);
      
      return {
        content: response.content,
        toolCalls: response.toolCalls,
        usage: response.usage,
        provider: this.getProviderName(provider),
        model: response.model,
        processingTime: response.processingTime || 0,
      };
    } catch (error) {
      console.error('Erro crítico no ModelRouter:', error);
      
      // Fallback seguro que não quebra o fluxo de segurança
      return this.getMockResponse(request);
    }
  }

  /**
   * Seleciona o provedor ideal baseado no conteúdo
   */
  private selectProvider(request: ModelRequest): AIProvider | undefined {
    if (this.config.defaultProvider !== 'auto') {
      return this.config.defaultProvider === 'groq' ? this.groqProvider : this.geminiProvider;
    }

    const prompt = request.prompt;
    const complexity = this.analyzeComplexity(prompt);
    const length = prompt.length;

    // Critérios de seleção
    if (length <= (this.config.selectionCriteria?.maxLengthForGroq || 2000) && complexity <= 2) {
      // Comandos curtos e simples → Groq (mais rápido)
      return this.groqProvider;
    } else if (complexity >= (this.config.selectionCriteria?.minComplexityForGemini || 3)) {
      // Reasoning complexo → Gemini (mais capaz)
      return this.geminiProvider;
    } else {
      // Padrão: Groq para velocidade
      return this.groqProvider;
    }
  }

  /**
   * Analisa complexidade do prompt
   */
  private analyzeComplexity(prompt: string): number {
    let complexity = 0;

    // Comprimento
    if (prompt.length > 1000) complexity += 1;
    if (prompt.length > 5000) complexity += 1;

    // Indicadores de reasoning complexo
    const complexPatterns = [
      /analise|analise|compare|compare|explique|explique/i,
      /por que|why|como funciona|how does/i,
      /estratégia|strategy|plano|plan/i,
      /multi step|multiple steps|várias etapas/i,
      /if.*then|se.*então|caso.*então/i,
    ];

    complexPatterns.forEach(pattern => {
      if (pattern.test(prompt)) complexity += 1;
    });

    // Número de tools potenciais
    const toolKeywords = ['cliente', 'produto', 'pedido', 'financeiro', 'carga', 'entrega'];
    const toolCount = toolKeywords.filter(keyword => prompt.toLowerCase().includes(keyword)).length;
    if (toolCount > 2) complexity += 1;

    return Math.min(complexity, 5); // Max 5
  }

  /**
   * Fallback para outro provider em caso de erro
   */
  private async getFallbackResponse(request: ModelRequest, failedProvider: AIProvider): Promise<ModelResponse> {
    const fallbackProvider = failedProvider === this.groqProvider ? this.geminiProvider : this.groqProvider;
    if (!fallbackProvider) {
      return this.getMockResponse(request);
    }
    try {
      console.log(`Using fallback provider: ${this.getProviderName(fallbackProvider)}`);
      const response = await fallbackProvider.generateResponse(request.prompt, request.tools);
      
      return {
        content: response.content,
        toolCalls: response.toolCalls,
        usage: response.usage,
        provider: this.getProviderName(fallbackProvider),
        model: response.model,
        processingTime: response.processingTime || 0,
      };
    } catch (fallbackError) {
      console.error('Fallback provider also failed:', fallbackError);
      
      // Último recurso: mock response
      return this.getMockResponse(request);
    }
  }

  /**
   * Mock response como último recurso
   */
  private getMockResponse(request: ModelRequest): ModelResponse {
    return {
      content: 'Desculpe, estou com dificuldades para processar sua solicitação no momento. Por favor, tente novamente mais tarde.',
      toolCalls: [],
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      provider: 'mock',
      model: 'fallback',
      processingTime: 0,
    };
  }

  /**
   * Obtém nome do provider
   */
  private getProviderName(provider: AIProvider | undefined): string {
    if (provider === this.groqProvider) return 'groq';
    if (provider === this.geminiProvider) return 'gemini';
    return 'unknown';
  }

  /**
   * Atualiza configuração
   */
  updateConfig(newConfig: Partial<ModelConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.initializeProviders(); // Re-inicializar com nova config
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): ModelConfig {
    return { ...this.config };
  }

  /**
   * Testa todos os providers
   */
  async testProviders(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    if (this.groqProvider) {
      try {
        await this.groqProvider.testConnection();
        results.groq = true;
      } catch {
        results.groq = false;
      }
    } else {
      results.groq = false;
    }
    
    if (this.geminiProvider) {
      try {
        await this.geminiProvider.testConnection();
        results.gemini = true;
      } catch {
        results.gemini = false;
      }
    } else {
      results.gemini = false;
    }
    
    return results;
  }

  /**
   * Obtém estatísticas de uso
   */
  getUsageStats(): {
    groqUsage: number;
    geminiUsage: number;
    totalRequests: number;
    fallbackRate: number;
  } {
    // TODO: Implementar tracking de uso
    return {
      groqUsage: 0,
      geminiUsage: 0,
      totalRequests: 0,
      fallbackRate: 0,
    };
  }
}

// Export singleton
export const modelRouter = new ModelRouter();
