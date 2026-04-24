import axios from "axios";
import { logger } from "../../utils/logger.js";
export class LLMConnector {
    static instance;
    defaultProvider = process.env.LEO_DEFAULT_MODEL || "gemini";
    constructor() { }
    static getInstance() {
        if (!LLMConnector.instance) {
            LLMConnector.instance = new LLMConnector();
        }
        return LLMConnector.instance;
    }
    /**
     * Envia um prompt para o modelo configurado
     */
    async chat(messages, options = {}) {
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
                    return { success: false, error: `Provider ${provider} não suportado` };
            }
        }
        catch (error) {
            logger.error({ message: `Erro ao chamar LLM (${provider})`, error: error?.message });
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    async callOpenAI(messages, options) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return { success: false, error: "OPENAI_API_KEY não configurada" };
        }
        try {
            const response = await axios.post("https://api.openai.com/v1/chat/completions", {
                model: options.model || "gpt-3.5-turbo",
                messages,
                temperature: options.temperature ?? 0.3,
                max_tokens: options.maxTokens,
            }, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
            });
            return { success: true, data: response.data.choices[0].message.content };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    async callGroq(messages, options) {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return { success: false, error: "GROQ_API_KEY não configurada" };
        }
        try {
            const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                model: options.model || "llama3-8b-8192",
                messages,
                temperature: options.temperature ?? 0.1,
                max_tokens: options.maxTokens,
            }, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
            });
            return { success: true, data: response.data.choices[0].message.content };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    async callGemini(messages, options) {
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return { success: false, error: "GEMINI_API_KEY não configurada" };
        }
        try {
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
                    contents[1].parts[0].text = `System: ${systemPrompt}\nUser: ${contents[1].parts[0].text}`;
                    contents.shift();
                }
                else {
                    // Se só tiver o system, transforma em user
                    contents[0].role = "user";
                }
            }
            const modelName = options.model || "gemini-pro";
            const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
                contents,
                generationConfig: {
                    temperature: options.temperature ?? 0.1,
                    maxOutputTokens: options.maxTokens,
                },
            });
            if (response.data.candidates && response.data.candidates[0].content) {
                return { success: true, data: response.data.candidates[0].content.parts[0].text };
            }
            else {
                return { success: false, error: "Resposta inválida do Gemini" };
            }
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}
