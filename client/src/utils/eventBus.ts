type Handler = (data?: any) => void;

/**
 * EventBus: Barramento de eventos global para o client.
 * Permite comunicação desacoplada entre componentes e módulos de automação.
 */
class EventBus {
  private events: Record<string, Handler[]> = {};

  on(event: string, handler: Handler) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(h => h !== handler);
  }

  emit(event: string, data?: any) {
    if (!this.events[event]) return;
    this.events[event].forEach(handler => handler(data));
  }
}

export const eventBus = new EventBus();

// Definição de eventos comuns do sistema para facilitar o uso
export const ERP_EVENTS = {
  PEDIDO_CRIADO: "pedido:criado",
  PEDIDO_ATUALIZADO: "pedido:atualizado",
  ESTOQUE_BAIXO: "estoque:baixo",
  PAGAMENTO_RECEBIDO: "pagamento:recebido",
  CLIENTE_CRIADO: "cliente:criado",
  CARGA_CRIADA: "carga:criada",
  NOTIFICACAO_RECEBIDA: "notificacao:recebida",
};
