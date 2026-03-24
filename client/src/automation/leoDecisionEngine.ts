import { eventBus } from "@/utils/eventBus";

export interface LeoInsight {
  id: string;
  title: string;
  message: string;
  category: "operacional" | "estoque" | "financeiro" | "vendas";
  priority: "low" | "medium" | "high";
  actionLabel?: string;
  actionHref?: string;
  createdAt: number;
}

/**
 * LeoDecisionEngine: O "cérebro" do assistente LEO no frontend.
 * Analisa eventos brutos e gera insights estruturados para o usuário.
 */
export class LeoDecisionEngine {
  private static instance: LeoDecisionEngine;
  private insights: LeoInsight[] = [];

  private constructor() {}

  static getInstance(): LeoDecisionEngine {
    if (!LeoDecisionEngine.instance) {
      LeoDecisionEngine.instance = new LeoDecisionEngine();
    }
    return LeoDecisionEngine.instance;
  }

  processEvent(type: string, data: any) {
    switch (type) {
      case "pedido:criado":
        this.analyzeNewOrder(data);
        break;
      case "estoque:baixo":
        this.analyzeLowStock(data);
        break;
      case "pagamento:recebido":
        this.analyzePayment(data);
        break;
      case "pedido:atualizado":
        this.analyzeOrderUpdate(data);
        break;
    }
  }

  private analyzeNewOrder(pedido: any) {
    // Pedido grande -> Sugerir agrupamento
    if (pedido?.total > 2000) {
      this.addInsight({
        id: `leo-order-${pedido.id}`,
        title: "Pedido de Alto Valor",
        message: `O pedido #${pedido.numero} de R$ ${pedido.total.toFixed(2)} foi criado. Recomendo priorizar a conferência para garantir a entrega rápida.`,
        category: "vendas",
        priority: "high",
        actionLabel: "Ir para Conferência",
        actionHref: "/conferencia"
      });
    }
  }

  private analyzeLowStock(produtos: any[]) {
    const list = Array.isArray(produtos) ? produtos : [produtos];
    if (list.length > 0) {
      this.addInsight({
        id: `leo-stock-${Date.now()}`,
        title: "Reposição Necessária",
        message: `Detectei ${list.length} produtos com estoque crítico. Recomendo gerar um pedido de compra para evitar falta de mercadoria.`,
        category: "estoque",
        priority: "high",
        actionLabel: "Ver Estoque",
        actionHref: "/estoque?filtro=baixo"
      });

      // Nova recomendação: Reposição
      eventBus.emit("suggestion:new", {
        id: `suggest-repo-${Date.now()}`,
        title: "Sugerir Reposição",
        message: `O produto ${list[0]?.descricao || 'crítico'} está acabando. Deseja criar pedido de reposição?`,
        type: "estoque",
        actionLabel: "Repor Agora",
        actionHref: "/estoque"
      });
    }
  }

  private analyzePayment(pagamento: any) {
    this.addInsight({
      id: `leo-pay-${Date.now()}`,
      title: "Fluxo de Caixa",
      message: `Recebimento de R$ ${pagamento?.valor?.toFixed(2)} confirmado. O saldo do dia está crescendo positivamente.`,
      category: "financeiro",
      priority: "low"
    });
  }

  private analyzeOrderUpdate(pedido: any) {
    if (pedido?.status === "ENTREGUE") {
      this.addInsight({
        id: `leo-delivered-${pedido.id}`,
        title: "Meta de Entrega",
        message: `Pedido #${pedido.numero} finalizado. Excelente trabalho da logística!`,
        category: "operacional",
        priority: "low"
      });
    }

    // Sugestão de promoção para produtos parados (simulado ao atualizar pedido)
    if (pedido?.total < 50) {
      eventBus.emit("suggestion:new", {
        id: `suggest-promo-${pedido.id}`,
        title: "Sugerir Promoção",
        message: `O produto deste pedido tem baixo giro. Que tal uma promoção relâmpago?`,
        type: "vendas",
        actionLabel: "Criar Promoção",
        actionHref: "/promocoes"
      });
    }
  }

  private addInsight(insight: Omit<LeoInsight, "createdAt">) {
    const newInsight: LeoInsight = {
      ...insight,
      createdAt: Date.now()
    };
    
    // Evitar duplicatas por ID
    if (this.insights.find(i => i.id === newInsight.id)) return;

    this.insights = [newInsight, ...this.insights].slice(0, 10);
    eventBus.emit("leo:insight", newInsight);
  }

  getInsights() {
    return this.insights;
  }
}

export const leoDecisionEngine = LeoDecisionEngine.getInstance();
