import { toolRegistry } from './tool-registry';

export type PromptPayload = Record<string, unknown>;

export interface PromptContext {
  tenantId: number;
  userRole?: string;
  userId?: number;
  vendedorId?: number;
  previousMessages?: Array<{ role: string; content: string }>;
  systemContext?: PromptPayload;
}

function jsonSchemaPropertyType(schema: unknown): string {
  if (schema !== null && typeof schema === "object" && "type" in schema) {
    const t = (schema as { type?: unknown }).type;
    return typeof t === "string" ? t : "desconhecido";
  }
  return "desconhecido";
}

export class PromptBuilder {
  buildSystemPrompt(context: PromptContext): string {
    const availableTools = toolRegistry.getToolsSchema();
    
    return `Você é o LEO, um assistente de IA especializado em ERP (Enterprise Resource Planning) para ajudar usuários a gerenciar negócios de forma eficiente.

## SUA PERSONALIDADE:
- Profissional, mas amigável e acessível
- Prático e focado em soluções
- Sempre busca ajudar com ações concretas
- Explica coisas complexas de forma simples

## CONTEXTO ATUAL:
- Tenant ID: ${context.tenantId}
- Role do usuário: ${context.userRole || 'desconhecido'}
- ID do usuário: ${context.userId || 'desconhecido'}
- ID do vendedor: ${context.vendedorId || 'não aplicável'}

## FERRAMENTAS DISPONÍVEIS:
Você tem acesso às seguintes ferramentas para executar ações reais no ERP:

${this.formatToolsForPrompt(availableTools)}

## REGRAS IMPORTANTES:
1. **Sempre** use as ferramentas quando o usuário pedir para realizar ações no sistema
2. **Nunca** invente dados - use as ferramentas para buscar informações reais
3. **Sempre** confirme dados críticos antes de executar operações irreversíveis
4. **Explique** o que está fazendo e por que
5. **Seja claro** sobre os resultados obtidos
6. **Multi-tenant**: Todas as operações são automaticamente filtradas pelo tenantId

## MELHORES PRÁTICAS:
- Para buscar informações: use as ferramentas de busca/listagem
- Para criar/modificar: confirme os dados antes de executar
- Para análises: busque os dados primeiro, depois analise
- Se uma tool falhar, explique o erro e sugira alternativas
- Mantenha as respostas concisas mas informativas

## EXEMPLOS DE INTERAÇÃO:

Usuário: "Quero ver os clientes"
LEO: "Vou buscar a lista de clientes para você." [executar buscar_cliente]

Usuário: "Qual o estoque do produto 123?"
LEO: "Vou verificar o estoque do produto 123." [executar buscarProduto]

Usuário: "Crie um pedido para o cliente João"
LEO: "Para criar o pedido, preciso do ID do cliente e dos produtos. Vou buscar os dados do cliente João primeiro." [executar buscar_cliente]

## LINGUAGEM:
- Responda sempre em português brasileiro
- Use formatação markdown para organizar informações
- Seja proativo e sugira próximas ações quando apropriado

Estou pronto para ajudar! Como posso auxiliar você hoje?`;
  }

  buildUserPrompt(message: string, context: PromptContext): string {
    let prompt = `Mensagem do usuário: ${message}`;

    if (context.previousMessages && context.previousMessages.length > 0) {
      prompt += `\n\n## CONVERSAS ANTERIORES (Recentes):\n`;
      context.previousMessages.slice(-5).forEach(msg => {
        prompt += `${msg.role}: ${msg.content}\n`;
      });
    }

    if (context.systemContext) {
      prompt += `\n\n## CONTEXTO ADICIONAL:\n${JSON.stringify(context.systemContext, null, 2)}`;
    }

    return prompt;
  }

  private formatToolsForPrompt(tools: Record<string, unknown>[]): string {
    let formatted = '';
    
    tools.forEach((tool: Record<string, unknown>) => {
      const toolTyped = tool as { name: string; description: string; input_schema: { properties?: Record<string, unknown>; required?: string[] } };
      formatted += `\n### ${toolTyped.name}\n`;
      formatted += `**Descrição:** ${toolTyped.description}\n`;
      
      if (toolTyped.input_schema.properties && Object.keys(toolTyped.input_schema.properties).length > 0) {
        formatted += `**Parâmetros:**\n`;
        Object.entries(toolTyped.input_schema.properties).forEach(([key, schema]) => {
          const required = toolTyped.input_schema.required?.includes(key) ? ' (obrigatório)' : ' (opcional)';
          formatted += `- \`${key}\`${required}: ${jsonSchemaPropertyType(schema)}\n`;
        });
      } else {
        formatted += `**Parâmetros:** Nenhum\n`;
      }
      formatted += '\n';
    });

    return formatted;
  }

  buildToolCallPrompt(toolCalls: Array<{ toolName: string; input: unknown; reasoning?: string }>): string {
    let prompt = '\n## EXECUTANDO FERRAMENTAS:\n\n';
    
    toolCalls.forEach((call, index) => {
      prompt += `### ${index + 1}. ${call.toolName}\n`;
      if (call.reasoning) {
        prompt += `**Motivo:** ${call.reasoning}\n`;
      }
      prompt += `**Parâmetros:** \`${JSON.stringify(call.input, null, 2)}\`\n\n`;
    });

    return prompt;
  }

  buildErrorPrompt(error: string, toolName?: string): string {
    let prompt = '\n## ERRO ENCONTRADO:\n\n';
    
    if (toolName) {
      prompt += `**Ferramenta:** ${toolName}\n`;
    }
    
    prompt += `**Erro:** ${error}\n\n`;
    prompt += `**Ação sugerida:** Verifique os parâmetros e tente novamente, ou contate o suporte se o erro persistir.\n`;

    return prompt;
  }

  buildSuccessPrompt(results: Record<string, unknown>[], toolNames: string[]): string {
    let prompt = '\n## RESULTADOS OBTIDOS:\n\n';
    
    results.forEach((result, index) => {
      const toolName = toolNames[index];
      prompt += `### ${index + 1}. ${toolName}\n`;
      prompt += `**Status:** ✅ Sucesso\n`;
      prompt += `**Resumo:** ${this.summarizeResult(result)}\n\n`;
    });

    return prompt;
  }

  private summarizeResult(result: unknown): string {
    if (result === null || result === undefined) {
      return 'Nenhum resultado';
    }

    if (typeof result === 'string') {
      return result.length > 100 ? result.substring(0, 100) + '...' : result;
    }

    if (Array.isArray(result)) {
      return `${result.length} itens encontrados`;
    }

    if (typeof result === 'object') {
      const obj = result as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.includes('items') && Array.isArray(obj.items)) {
        const items = obj.items as unknown[];
        const total = obj.total;
        return `${items.length} itens encontrados${total != null ? ` (total: ${String(total)})` : ''}`;
      }
      return `Objeto com propriedades: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`;
    }

    return String(result);
  }
}

export const promptBuilder = new PromptBuilder();
