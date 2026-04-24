import { createLogger } from "../infra/structured-logger.js";
const MAX_HISTORY = 200;
const history = [];
const logger = createLogger("alert-service");
/**
 * Regista alerta operacional: log estruturado + histórico em memória (anel limitado).
 */
export function sendAlert(event) {
    const payload = {
        ...event,
        timestamp: event.timestamp ?? Date.now(),
    };
    if (payload.level === "critical") {
        logger.error(payload.message, {
            payload: {
                alertLevel: payload.level,
                alertTimestamp: payload.timestamp,
            },
        });
    }
    else {
        logger.warn(payload.message, {
            payload: {
                alertLevel: payload.level,
                alertTimestamp: payload.timestamp,
            },
        });
    }
    history.push(payload);
    if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
    }
}
export function getAlertHistory() {
    return [...history];
}
export function clearAlertHistoryForTests() {
    if (process.env.NODE_ENV === "test") {
        history.length = 0;
    }
}
