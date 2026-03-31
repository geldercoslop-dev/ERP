import { eventBus, ERP_EVENTS } from "../utils/eventBus";
import { leoDecisionEngine } from "./leoDecisionEngine";

/**
 * LeoListener: Escuta eventos do barramento global e os encaminha para o motor de decisão do LEO.
 * Atua como a "audição" do assistente inteligente.
 */
export class LeoListener {
  private static instance: LeoListener;
  private isListening = false;

  private constructor() {}

  static getInstance(): LeoListener {
    if (!LeoListener.instance) {
      LeoListener.instance = new LeoListener();
    }
    return LeoListener.instance;
  }

  start() {
    if (this.isListening) return;
    this.setupSubscriptions();
    this.isListening = true;
  }

  private setupSubscriptions() {
    // Escuta eventos de pedido
    eventBus.on(ERP_EVENTS.PEDIDO_CRIADO, (pedido) => {
      leoDecisionEngine.processEvent("pedido:criado", pedido);
    });

    eventBus.on(ERP_EVENTS.PEDIDO_ATUALIZADO, (pedido) => {
      leoDecisionEngine.processEvent("pedido:atualizado", pedido);
    });

    // Escuta eventos de estoque
    eventBus.on(ERP_EVENTS.ESTOQUE_BAIXO, (produtos) => {
      leoDecisionEngine.processEvent("estoque:baixo", produtos);
    });

    // Escuta eventos financeiros
    eventBus.on(ERP_EVENTS.PAGAMENTO_RECEBIDO, (pagamento) => {
      leoDecisionEngine.processEvent("pagamento:recebido", pagamento);
    });

    // Escuta notificações genéricas
    eventBus.on(ERP_EVENTS.NOTIFICACAO_RECEBIDA, (notificacao) => {
      leoDecisionEngine.processEvent("sistema:notificacao", notificacao);
    });
  }
}

export const leoListener = LeoListener.getInstance();
