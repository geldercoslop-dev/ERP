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

type LogLevel = "SECURITY" | "ERROR" | "ACCESS" | "ALERT_ERROR" | "ALERT_WARN";
type AlertLevel = "ERROR" | "WARN";
type LogMetadata = Record<string, unknown>;

function formatLog(
  level: LogLevel,
  message: string,
  metadata: LogMetadata = {}
) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata,
  });
}

export const loggerStructured = {
  security(message: string, metadata: LogMetadata = {}) {
    const log = formatLog("SECURITY", message, metadata);
    fs.appendFileSync(logTypes.SECURITY, log + "\n");
    console.log(`[SECURITY] ${message}`, metadata);
  },

  error(message: string, metadata: LogMetadata = {}) {
    const log = formatLog("ERROR", message, metadata);
    fs.appendFileSync(logTypes.ERROR, log + "\n");
    console.error(`[ERROR] ${message}`, metadata);
  },

  access(
    method: string,
    pathValue: string,
    status: number,
    duration: number,
    metadata: LogMetadata = {}
  ) {
    const log = formatLog("ACCESS", `${method} ${pathValue}`, {
      status,
      durationMs: duration,
      ...metadata,
    });
    fs.appendFileSync(logTypes.ACCESS, log + "\n");
  },

  alert(level: AlertLevel, message: string, metadata: LogMetadata = {}) {
    const typeMap: Record<AlertLevel, keyof typeof logTypes> = {
      ERROR: "ERROR",
      WARN: "ERROR",
    };
    const type = typeMap[level] || "ERROR";
    const log = formatLog(`ALERT_${level}` as LogLevel, message, metadata);
    fs.appendFileSync(logTypes[type], log + "\n");
    console.warn(`[ALERT_${level}] ${message}`);
  },
};

export default loggerStructured;
