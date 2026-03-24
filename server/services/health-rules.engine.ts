export type HealthIssueLevel = "warn" | "critical";

/** Tipos estáveis para debounce e auto-heal */
export type HealthIssueType =
  | "memory-high"
  | "memory-critical"
  | "db-down"
  | "high-response-time";

export type HealthIssue = {
  type: HealthIssueType;
  level: HealthIssueLevel;
};

export type HealthEvaluationInput = {
  /** Percentagem aproximada de RSS vs memória total do SO */
  memoryPercent: number;
  dbOk: boolean;
  responseTimeMs: number;
};

/**
 * Avalia métricas e devolve lista de problemas detetados.
 */
export function evaluateHealth(data: HealthEvaluationInput): HealthIssue[] {
  const issues: HealthIssue[] = [];

  if (data.memoryPercent > 95) {
    issues.push({ type: "memory-critical", level: "critical" });
  } else if (data.memoryPercent > 85) {
    issues.push({ type: "memory-high", level: "warn" });
  }

  if (!data.dbOk) {
    issues.push({ type: "db-down", level: "critical" });
  }

  if (data.responseTimeMs > 1500) {
    issues.push({ type: "high-response-time", level: "warn" });
  }

  return issues;
}
