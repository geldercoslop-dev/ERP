/**
 * Event Engine simplificado — LEO reage a eventos do ERP.
 * emitEvent + handlers simples; sem filas complexas.
 */

import { logger } from "../../utils/logger";

type EventHandler = (data: unknown) => void | Promise<void>;

const handlers = new Map<string, EventHandler[]>();

/**
 * Registra um handler para um evento. Nomes sugeridos: pedidoCriado, estoqueBaixo, clienteNovo.
 */
export function onEvent(eventName: string, handler: EventHandler): void {
  const list = handlers.get(eventName) ?? [];
  list.push(handler);
  handlers.set(eventName, list);
}

/**
 * Emite um evento; chama todos os handlers registrados (não bloqueia em erro).
 */
export function emitEvent(eventName: string, data: unknown): void {
  const list = handlers.get(eventName);
  if (!list?.length) return;
  for (const fn of list) {
    try {
      const out = fn(data);
      if (out && typeof (out as Promise<void>).catch === "function") {
        (out as Promise<void>).catch((err) => {
          logger.warn({ message: "LEO event handler rejeitou", eventName, err: String(err) } as Record<string, unknown>);
        });
      }
    } catch (err) {
      logger.warn({ message: "LEO event handler falhou", eventName, err: String(err) } as Record<string, unknown>);
    }
  }
}
