/**
 * Interpretação inteligente de perguntas do usuário.
 * Tenta LLM (quando disponível); se não identificar intenção, usa regras do query-engine.
 */
import { identificarIntencao, type EntidadesExtraidas } from "./query-engine.js";
import { LLMConnector, type LLMMessage } from "./llm-connector.js";
import { logger } from "../../utils/logger.js";

export type LeoIntent =
  | "consultar_pedido"
  | "consultar_cliente"
  | "consultar_financeiro"
  | "listar_boletos"
  | "registrar_pagamento"
  | "dar_baixa_pedido"
  | "gerar_relatorio"
  | "consultar_estoque"
  | "status_sistema"
  | "desconhecido";

/** Formato de tool call: o LLM pode devolver isso em vez de só intent + entities. */
export type ToolCallInterpretacao = { tool: string; input: Record<string, unknown> };

export type Interpretacao = {
  intent: LeoIntent;
  entities: EntidadesExtraidas;
  explanation?: string;
  /** Se preenchido, usar diretamente para ActionExecutor (tool + input). */
  toolCall?: ToolCallInterpretacao;
};

/** Mapeia intenções do query-engine para intenções padronizadas do LEO. */
const MAP_INTENT: Record<string, LeoIntent> = {
  pedido_por_numero: "consultar_pedido",
  pedido_por_cliente: "consultar_cliente",
  valor_pedido: "consultar_pedido",
  vendas_hoje: "consultar_financeiro",
  vendas_mes: "consultar_financeiro",
  produto_mais_vendido: "consultar_estoque",
  produtos_vendidos_periodo: "consultar_estoque",
  estoque_produto: "consultar_estoque",
  lista_estoque: "consultar_estoque",
  estoque_baixo: "consultar_estoque",
  financeiro_hoje: "consultar_financeiro",
  pagamentos_hoje: "consultar_financeiro",
  recebimentos_hoje: "consultar_financeiro",
  contas_receber: "consultar_financeiro",
  contas_pagar: "consultar_financeiro",
  vendedores: "consultar_cliente",
  clientes: "consultar_cliente",
  clientes_ativos: "consultar_cliente",
  pedidos_em_rota: "consultar_pedido",
  pedidos_atrasados: "consultar_pedido",
  ranking_produtos: "consultar_estoque",
  ranking_clientes: "consultar_cliente",
  relatorio_pdf_estoque: "gerar_relatorio",
  relatorio_pdf_vendas: "gerar_relatorio",
  relatorio_pdf_clientes: "gerar_relatorio",
  relatorio_pdf_produtos: "gerar_relatorio",
  cliente_devedor: "consultar_financeiro",
  boletos_cliente: "listar_boletos",
  recebimentos_periodo: "consultar_financeiro",
  status_sistema: "status_sistema",
};

const SYSTEM_PROMPT = `Você é o LEO, assistente inteligente do ERP. Sua tarefa é interpretar a pergunta do usuário e extrair a intenção e as entidades no formato JSON.

Intenções possíveis:
- consultar_pedido: buscar detalhes de um pedido (precisa de numeroPedido)
- consultar_cliente: buscar informações de clientes (precisa de nomeCliente)
- consultar_financeiro: vendas, faturamento, contas (pode ter periodo: hoje, ontem, semana, mes)
- listar_boletos: boletos pendentes de um cliente (precisa de nomeCliente)
- consultar_estoque: estoque de produtos (pode ter nomeProduto)
- status_sistema: saúde e performance do servidor
- dar_baixa_pedido: marcar pedido como pago (precisa de numeroPedido)
- gerar_relatorio: exportar PDF (tipoRelatorio: estoque, vendas, clientes, produtos)

Responda APENAS o JSON no formato:
{
  "intent": "intencao_identificada",
  "entities": {
    "numeroPedido": 123,
    "nomeCliente": "João Silva",
    "periodo": "hoje",
    ...
  },
  "explanation": "Breve explicação do que entendi"
}`;

/**
 * Tenta interpretar via LLM real.
 */
async function interpretarComLLM(texto: string): Promise<Interpretacao | null> {
  const connector = LLMConnector.getInstance();
  
  const messages: LLMMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: texto }
  ];

  try {
    const response = await connector.chat(messages, { 
      temperature: 0.1,
      provider: (process.env.LEO_FAST_MODEL ?? "groq") as "groq" | "openai"
    });

    if (!response.success || !response.data) {
      return null;
    }

    // Tenta extrair o JSON da resposta (alguns modelos podem colocar texto em volta)
    const jsonMatch = response.data.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const base = {
        intent: (parsed.intent as LeoIntent) ?? "desconhecido",
        entities: (parsed.entities as EntidadesExtraidas) || {},
        explanation: parsed.explanation,
      };
      // Formato tool call opcional: { tool, input } para uso direto no ActionExecutor
      if (parsed.tool && typeof parsed.tool === "string" && parsed.input && typeof parsed.input === "object") {
        (base as Interpretacao).toolCall = { tool: parsed.tool, input: parsed.input };
      }
      return base as Interpretacao;
    }
    return null;
  } catch (error) {
    logger.error({ message: "[LEO llm-interpreter] Erro ao chamar LLM", error: (error as Error)?.message } as Record<string, unknown>);
    return null;
  }
}

/**
 * Interpreta a pergunta do usuário.
 * 1) Tenta LLM; 2) Se não houver resultado, usa query-engine (regras).
 */
export async function interpretar(pergunta: string): Promise<Interpretacao> {
  const texto = pergunta.trim();
  try {
    const llmResult = await interpretarComLLM(texto);
    if (llmResult != null) return llmResult;
  } catch (e) {
    console.warn("[LEO llm-interpreter] LLM indisponível, usando query-engine:", (e as Error)?.message ?? e);
  }
  try {
    const { intencao, entidades } = identificarIntencao(pergunta);
    const intent: LeoIntent = MAP_INTENT[intencao] ?? "desconhecido";
    return { intent, entities: entidades };
  } catch (e) {
    console.error("[LEO llm-interpreter] Erro ao identificar intenção:", (e as Error)?.message ?? e);
    return { intent: "desconhecido", entities: {} };
  }
}
