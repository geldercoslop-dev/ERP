/**
 * Avalia métricas e devolve lista de problemas detetados.
 */
export function evaluateHealth(data) {
    const issues = [];
    if (data.memoryPercent > 95) {
        issues.push({ type: "memory-critical", level: "critical" });
    }
    else if (data.memoryPercent > 85) {
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
