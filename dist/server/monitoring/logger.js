/**
 * Logger estruturado com separação de logs por tipo
 * SECURITY.log | ERROR.log | ACCESS.log
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, "..", "..", "logs");
// Criar diretório de logs se não existir
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}
const logTypes = {
    SECURITY: path.join(logsDir, "SECURITY.log"),
    ERROR: path.join(logsDir, "ERROR.log"),
    ACCESS: path.join(logsDir, "ACCESS.log"),
};
function formatLog(level, message, metadata = {}) {
    return JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...metadata,
    });
}
export const loggerStructured = {
    security(message, metadata = {}) {
        const log = formatLog("SECURITY", message, metadata);
        fs.appendFileSync(logTypes.SECURITY, log + "\n");
        console.log(`[SECURITY] ${message}`, metadata);
    },
    error(message, metadata = {}) {
        const log = formatLog("ERROR", message, metadata);
        fs.appendFileSync(logTypes.ERROR, log + "\n");
        console.error(`[ERROR] ${message}`, metadata);
    },
    access(method, pathValue, status, duration, metadata = {}) {
        const log = formatLog("ACCESS", `${method} ${pathValue}`, {
            status,
            durationMs: duration,
            ...metadata,
        });
        fs.appendFileSync(logTypes.ACCESS, log + "\n");
    },
    alert(level, message, metadata = {}) {
        const typeMap = {
            ERROR: "ERROR",
            WARN: "ERROR",
        };
        const type = typeMap[level] || "ERROR";
        const log = formatLog(`ALERT_${level}`, message, metadata);
        fs.appendFileSync(logTypes[type], log + "\n");
        console.warn(`[ALERT_${level}] ${message}`);
    },
};
export default loggerStructured;
