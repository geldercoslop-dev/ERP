import { createLogger } from "../infra/structured-logger";
import { sendAlert } from "./alert.service";
import { sendWhatsApp, sendEmail } from "./notification.service";
import { evaluateHealth, type HealthEvaluationInput, type HealthIssue } from "./health-rules.engine";
import { executeAction } from "./auto-heal.service";
import { decideAction } from "./leo-operator.service";

const logger = createLogger("operational-health");
const DEBOUNCE_MS = 60_000;
const lastEmitted = new Map<string, number>();

function debounceKey(issue: HealthIssue): string {
  return `${issue.type}:${issue.level}`;
}

/**
 * Ciclo completo: regras → decisão LEO operacional → alerta/notificação/auto-heal (com debounce por tipo+nível).
 */
export async function runOperationalHealthPipeline(data: HealthEvaluationInput): Promise<void> {
  const issues = evaluateHealth(data);
  if (issues.length === 0) {
    return;
  }

  const now = Date.now();
  const actionable = issues.filter((issue) => {
    const key = debounceKey(issue);
    const prev = lastEmitted.get(key) ?? 0;
    return now - prev >= DEBOUNCE_MS;
  });

  if (actionable.length === 0) {
    return;
  }

  /** Decisão alinhada ao que vai ser tratado neste ciclo (já passou debounce). */
  const decision = decideAction(actionable);
  logger.info("[LEO-OPERATOR] decideAction", {
    payload: {
      priority: decision.priority,
      focusIssueTypes: decision.focusIssueTypes,
      rationale: decision.rationale,
      nextSteps: decision.nextSteps,
      actionableCount: actionable.length,
      totalEvaluated: issues.length,
    },
  });

  for (const issue of actionable) {
    lastEmitted.set(debounceKey(issue), now);

    const message = `[${issue.level.toUpperCase()}] ${issue.type} | mem=${data.memoryPercent.toFixed(1)}% dbOk=${data.dbOk} responseMs=${data.responseTimeMs}`;

    sendAlert({
      level: issue.level,
      message,
      timestamp: now,
    });

    const externalMsg = `[ERP Health] ${message}`;
    await Promise.all([sendWhatsApp(externalMsg), sendEmail(externalMsg)]);

    await executeAction(issue);
  }
}

/** Não bloqueia o request HTTP; falhas ficam só em log. */
export function scheduleOperationalHealthCheck(data: HealthEvaluationInput): void {
  void runOperationalHealthPipeline(data).catch((e) => {
    logger.error(
      "operational health pipeline failed",
      e instanceof Error ? e : new Error(String(e))
    );
  });
}
