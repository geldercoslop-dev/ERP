import axios from "axios";
import { logger } from "../../utils/logger.js";

export type LLMProvider = "openai" | "groq" | "gemini";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: LLMProvider;
}

export class LLMConnector {
  private static instance: LLMConnector;
  private defaultProvider: LLMProvider = (process.env.LEO_DEFAULT_MODEL as LLMProvider) || "gemini";

  private constructor() {}

  public static getInstance(): LLMConnector {
    if (!LLMConnector.instance) {
      LLMConnector.instance = new LLMConnector();
    }
    return LLMConnector.instance;
  }

  /**
   * Envia um prompt para o modelo configurado
   */
  public async chat(messages: LLMMessage[], options: LLMOptions = {}): Promise<string> {
    const provider = options.provider || this.defaultProvider;
    
    try {
      switch (provider) {
        case "openai":
          return await this.callOpenAI(messages, options);
        case "groq":
          return await this.callGroq(messages, options);
        case "gemini":
          return await this.callGemini(messages, options);
        default:
          throw new Error(`Provider ${provider} não suportado`);
      }
    } catch (error) {
      logger.error({ message: `Erro ao chamar LLM (${provider})`, error: (error as Error)?.message } as Record<string, unknown>);
      throw error;
    }
  }

  private async callOpenAI(messages: LLMMessage[], options: LLMOptions): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: options.model || "gpt-3.5-turbo",
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  }

  private async callGroq(messages: LLMMessage[], options: LLMOptions): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada");

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: options.model || "llama3-8b-8192",
        messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  }

  private async callGemini(messages: LLMMessage[], options: LLMOptions): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

    // Formata mensagens para o formato do Gemini
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    // O Gemini não suporta 'system' diretamente no array de contents da mesma forma
    // Para simplificar, vamos concatenar o system prompt na primeira mensagem do usuário se existir
    if (messages[0].role === "system") {
      const systemPrompt = messages[0].content;
      if (contents.length > 1 && contents[1].role === "user") {
        contents[1].parts[0].text = `System: ${systemPrompt}\n\nUser: ${contents[1].parts[0].text}`;
        contents.shift();
      } else {
        // Se só tiver o system, transforma em user
        contents[0].role = "user";
      }
    }

    const modelName = options.model || "gemini-pro";
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.1,
          maxOutputTokens: options.maxTokens,
        },
      }
    );

    if (response.data.candidates && response.data.candidates[0].content) {
      return response.data.candidates[0].content.parts[0].text;
    }
    
    throw new Error("Resposta inválida do Gemini");
  }
}
