/**
 * Event Bus do Sistema
 * 
 * Centraliza eventos do ERP e permite que o LEO reaja de forma orientada a eventos
 */

import { EventEmitter } from 'events';

export interface SystemEvent {
  type: 'pedido_criado' | 'pedido_atualizado' | 'produto_cadastrado' | 'estoque_baixo' | 'cliente_cadastrado' | 'venda_realizada' | 'login_usuario' | 'logout_usuario';
  timestamp: Date;
  data: any;
  userId?: number;
  entity?: string;
}

export class EventBus extends EventEmitter {
  private static instance: EventBus;
  
  private constructor() {
    super();
    if (EventBus.instance) {
      throw new Error('EventBus é um singleton');
    }
    EventBus.instance = this;
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Publica um evento do sistema
   */
  public publish(event: SystemEvent): void {
    this.emit(event.type, event);
  }

  /**
   * Se inscreve para ouvir eventos específicos
   */
  public on(eventType: SystemEvent['type'], listener: (event: SystemEvent) => void): this {
    return super.on(eventType, listener);
  }

  /**
   * Remove um listener
   */
  public off(eventType: SystemEvent['type'], listener: (event: SystemEvent) => void): this {
    return super.off(eventType, listener);
  }
}

// Exportar instância singleton
export const eventBus = EventBus.getInstance();
