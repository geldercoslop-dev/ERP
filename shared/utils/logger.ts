export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
};

function toJsonLine(entry: LogEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

export function log(entry: LogEntry): void {
  const line = toJsonLine(entry);
  if (entry.level === "error") {
    process.stderr.write(line);
    return;
  }

  process.stdout.write(line);
}

export function logMessage(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  log({
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  });
}
