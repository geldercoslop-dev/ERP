/**
 * Event Bus do Sistema
 *
 * Centraliza eventos do ERP e permite que consumidores reajam de forma orientada a eventos
 */
import { EventEmitter } from 'events';
import { InfrastructureError } from './errors/typed-errors.js';
export class EventBus extends EventEmitter {
    static instance;
    constructor() {
        super();
        if (EventBus.instance) {
            throw new InfrastructureError('EventBus é um singleton');
        }
        EventBus.instance = this;
    }
    static getInstance() {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }
    /**
     * Publica um evento do sistema
     */
    publish(event) {
        this.emit(event.type, event);
    }
    /**
     * Se inscreve para ouvir eventos específicos
     */
    on(eventType, listener) {
        return super.on(eventType, listener);
    }
    /**
     * Remove um listener
     */
    off(eventType, listener) {
        return super.off(eventType, listener);
    }
}
// Exportar instância singleton
export const eventBus = EventBus.getInstance();
