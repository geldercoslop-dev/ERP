/**
 * Event Engine simplificado — LEO reage a eventos do ERP.
 * emitEvent + handlers simples; sem filas complexas.
 */
import { logger } from "../../utils/logger.js";
const handlers = new Map();
/**
 * Registra um handler para um evento. Nomes sugeridos: pedidoCriado, estoqueBaixo, clienteNovo.
 */
export function onEvent(eventName, handler) {
    const list = handlers.get(eventName) ?? [];
    list.push(handler);
    handlers.set(eventName, list);
}
/**
 * Emite um evento; chama todos os handlers registrados (não bloqueia em erro).
 */
export function emitEvent(eventName, data) {
    const list = handlers.get(eventName);
    if (!list?.length)
        return;
    for (const fn of list) {
        try {
            const out = fn(data);
            if (out && typeof out.catch === "function") {
                out.catch((err) => {
                    logger.warn({ message: "LEO event handler rejeitou", eventName, err: String(err) });
                });
            }
        }
        catch (err) {
            logger.warn({ message: "LEO event handler falhou", eventName, err: String(err) });
        }
    }
}
