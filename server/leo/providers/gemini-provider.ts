/**
 * Gemini AI Provider
 * 
 * Integração com Google Gemini API usando modelo gemini-1.5-flash
 */

import { z } from 'zod';
import { ValidationError, InfrastructureError } from '../../_core/errors/typed-errors.js';

// Schema para resposta da API Gemini
const GeminiResponseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({
      parts: z.array(z.object({
        text: z.string().optional(),
        functionCall: z.object({
          name: z.string(),
          args: z.record(z.string(), z.unknown()),
        }).optional(),
      })),
      role: z.string(),
    }),
    finishReason: z.enum(['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER']),
    index: z.number(),
    safetyRatings: z.array(z.object({
      category: z.string(),
      probability: z.string(),
    })),
  })),
  usageMetadata: z.object({
    promptTokenCount: z.number(),
    candidatesTokenCount: z.number(),
    totalTokenCount: z.number(),
  }),
  modelVersion: z.string(),
});

export interface GeminiConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
}

export interface GeminiResponse {
  content: string;
  toolCalls?: Array<{
    toolName: string;
    input: Record<string, unknown>;
    reasoning: string;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  processingTime: number;
}

export interface GeminiToolDef {
  name?: string;
  description?: string;
  inputSchema?: unknown;
}

export class GeminiProvider {
  private config: GeminiConfig;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(config: GeminiConfig) {
    this.config = {
      ...config,
      maxTokens: config.maxTokens || 8192,
      temperature: config.temperature || 0.7,
      topP: config.topP || 0.9,
      topK: config.topK || 40,
    };
  }

  /**
   * Gera resposta usando Gemini API
   */
  async generateResponse(prompt: string, tools?: GeminiToolDef[]): Promise<GeminiResponse> {
    const startTime = Date.now();

    try {
      // Preparar payload para API
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
        {
          role: 'user',
          parts: [
            {
              text: `Você é o LEO, um assistente de IA especializado em ERP e automação. Responda de forma clara e objetiva.\n\n${prompt}`
            }
          ]
        }
      ];

      // Preparar tools se disponíveis
      let toolsDeclaration: Array<{
        functionDeclaration: {
          name?: string;
          description?: string;
          parameters?: unknown;
        };
      }> = [];
      if (tools && tools.length > 0) {
        toolsDeclaration = tools.map(tool => ({
          functionDeclaration: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          }
        }));
      }

      // Fazer requisição para API Gemini
      const url = `${this.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
      
      const payload: Record<string, unknown> = {
        contents,
        generationConfig: {
          maxOutputTokens: this.config.maxTokens,
          temperature: this.config.temperature,
          topP: this.config.topP,
          topK: this.config.topK,
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ]
      };

      if (toolsDeclaration.length > 0) {
        payload.tools = toolsDeclaration;
        payload.toolConfig = {
          functionCallingConfig: {
            mode: 'AUTO'
          }
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new InfrastructureError(`Gemini API error: ${response.status} ${response.statusText} - ${errorData}`);
      }

      const data = await response.json();
      const validatedData = GeminiResponseSchema.parse(data);

      // Extrair conteúdo e tool calls
      const candidate = validatedData.candidates[0];
      if (!candidate) {
        throw new InfrastructureError('No candidates returned from Gemini API');
      }
      const parts = candidate.content.parts;
      
      let content = '';
      const toolCalls: NonNullable<GeminiResponse['toolCalls']> = [];

      for (const part of parts) {
        if (part.text) {
          content += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            toolName: part.functionCall.name,
            input: part.functionCall.args,
            reasoning: `Modelo detectou necessidade de usar ${part.functionCall.name}`
          });
        }
      }

      const processingTime = Date.now() - startTime;

      return {
        content,
        toolCalls,
        usage: {
          promptTokens: validatedData.usageMetadata.promptTokenCount,
          completionTokens: validatedData.usageMetadata.candidatesTokenCount,
          totalTokens: validatedData.usageMetadata.totalTokenCount,
        },
        model: validatedData.modelVersion,
        processingTime,
      };

    } catch (error) {
      console.error('Gemini Provider Error:', error);
      throw new InfrastructureError(`Falha na comunicação com Gemini: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Testa conexão com Gemini API
   */
  async testConnection(): Promise<boolean> {
    try {
      const testResponse = await this.generateResponse('Test connection');
      return testResponse.content.length > 0;
    } catch (error) {
      console.error('Gemini connection test failed:', error);
      return false;
    }
  }

  /**
   * Obtém informações do modelo
   */
  getModelInfo() {
    return {
      provider: 'Google Gemini',
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      topP: this.config.topP,
      topK: this.config.topK,
    };
  }

  /**
   * Streaming response (para respostas longas)
   */
  async *generateStreamingResponse(prompt: string, tools?: GeminiToolDef[]): AsyncGenerator<string, void, unknown> {
    // Implementação de streaming para Gemini
    // Em produção, usar Server-Sent Events ou WebSocket
    const response = await this.generateResponse(prompt, tools);
    
    // Simular streaming dividindo o conteúdo
    const words = response.content.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield words[i] + (i < words.length - 1 ? ' ' : '');
      await new Promise(resolve => setTimeout(resolve, 50)); // Simular delay
    }
  }
}

/**
 * Factory function para criar instância do Gemini Provider
 */
export function createGeminiProvider(config?: Partial<GeminiConfig>): GeminiProvider {
  const apiKey = config?.apiKey || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new ValidationError('Gemini API key is required. Set GEMINI_API_KEY environment variable or pass apiKey in config.');
  }

  return new GeminiProvider({
    apiKey,
    model: config?.model || 'gemini-1.5-flash',
    ...config,
  });
}

/**
 * Função de conveniência para gerar resposta
 */
export async function generateGeminiResponse(prompt: string, tools?: GeminiToolDef[]): Promise<GeminiResponse> {
  const provider = createGeminiProvider();
  return provider.generateResponse(prompt, tools);
}
