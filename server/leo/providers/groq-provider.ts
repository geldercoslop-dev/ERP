/**
 * Groq AI Provider
 * 
 * Integração com Groq API usando modelo llama-3.3-70b-versatile
 */

import { z } from 'zod';

// Schema para resposta da API Groq
const GroqResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    message: z.object({
      role: z.string(),
      content: z.string(),
    }),
    finish_reason: z.string(),
  })),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

export interface GroqConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface GroqResponse {
  content: string;
  toolCalls?: Array<GroqToolCall>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  processingTime: number;
}

export interface GroqToolCall {
  toolName: string;
  input: Record<string, unknown>;
  reasoning: string;
}

export interface GroqToolDef {
  name?: string;
  description?: string;
  inputSchema?: unknown;
}

export class GroqProvider {
  private config: GroqConfig;
  private baseUrl = 'https://api.groq.com/openai/v1';

  constructor(config: GroqConfig) {
    this.config = {
      ...config,
      maxTokens: config.maxTokens || 4000,
      temperature: config.temperature || 0.7,
      topP: config.topP || 0.9,
    };
  }

  /**
   * Gera resposta usando Groq API
   */
  async generateResponse(prompt: string, tools?: GroqToolDef[]): Promise<GroqResponse> {
    const startTime = Date.now();

    try {
      // Preparar payload para API
      const payload: Record<string, unknown> = {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'Você é o LEO, um assistente de IA especializado em ERP e automação. Responda de forma clara e objetiva.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        top_p: this.config.topP,
      };

      // Adicionar tools se disponíveis
      if (tools && tools.length > 0) {
        payload.tools = tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          }
        }));
        payload.tool_choice = 'auto';
      }

      // Fazer requisição para API Groq
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const validatedData = GroqResponseSchema.parse(data);

      // Extrair conteúdo e tool calls
      const choice = validatedData.choices[0];
      const content = choice.message.content;
      const toolCalls = this.extractToolCalls(choice.message.content, tools);

      const processingTime = Date.now() - startTime;

      return {
        content,
        toolCalls,
        usage: {
          promptTokens: validatedData.usage.prompt_tokens,
          completionTokens: validatedData.usage.completion_tokens,
          totalTokens: validatedData.usage.total_tokens,
        },
        model: validatedData.model,
        processingTime,
      };

    } catch (error) {
      console.error('Groq Provider Error:', error);
      throw new Error(`Falha na comunicação com Groq: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Extrai tool calls da resposta do modelo
   */
  private extractToolCalls(
    content: string,
    tools?: GroqToolDef[]
  ): GroqToolCall[] {
    // Implementação simplificada - em produção, usar parsing mais robusto
    const toolCalls: GroqToolCall[] = [];

    if (!tools || tools.length === 0) {
      return toolCalls;
    }

    // Detectar padrões de tool calls no conteúdo
    const toolCallPattern = /TOOL_CALL:\s*(\w+)\s*\(([^)]*)\)/g;
    const matches = Array.from(content.matchAll(toolCallPattern));

    for (const match of matches) {
      const toolName = match[1];
      const paramsStr = match[2];

      // Verificar se tool existe
      const tool = tools.find(t => t.name === toolName);
      if (tool) {
        try {
          // Parse dos parâmetros (implementação simplificada)
          const params = this.parseToolParameters(paramsStr);
          
          toolCalls.push({
            toolName,
            input: params,
            reasoning: `Detectado necessidade de usar ${toolName}`
          });
        } catch (parseError) {
          console.warn(`Failed to parse tool call for ${toolName}:`, parseError);
        }
      }
    }

    return toolCalls;
  }

  /**
   * Parse de parâmetros de tool call (implementação simplificada)
   */
  private parseToolParameters(paramsStr: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    
    // Padrão simples para chave=valor
    const paramPattern = /(\w+)\s*=\s*["']?([^"'\s,]+)["']?/g;
    const matches = Array.from(paramsStr.matchAll(paramPattern));

    for (const match of matches) {
      const key = match[1];
      const value = match[2];
      
      // Tentar converter para número
      const numValue = Number(value);
      params[key] = Number.isNaN(numValue) ? value : numValue;
    }

    return params;
  }

  /**
   * Testa conexão com Groq API
   */
  async testConnection(): Promise<boolean> {
    try {
      const testResponse = await this.generateResponse('Test connection');
      return testResponse.content.length > 0;
    } catch (error) {
      console.error('Groq connection test failed:', error);
      return false;
    }
  }

  /**
   * Obtém informações do modelo
   */
  getModelInfo() {
    return {
      provider: 'Groq',
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };
  }
}

/**
 * Factory function para criar instância do Groq Provider
 */
export function createGroqProvider(config?: Partial<GroqConfig>): GroqProvider {
  const apiKey = config?.apiKey || process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    throw new Error('Groq API key is required. Set GROQ_API_KEY environment variable or pass apiKey in config.');
  }

  return new GroqProvider({
    apiKey,
    model: config?.model || 'llama-3.3-70b-versatile',
    ...config,
  });
}

/**
 * Função de conveniência para gerar resposta
 */
export async function generateGroqResponse(prompt: string, tools?: any[]): Promise<GroqResponse> {
  const provider = createGroqProvider();
  return provider.generateResponse(prompt, tools);
}
