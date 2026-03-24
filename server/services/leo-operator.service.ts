import type { HealthIssue } from "./health-rules.engine";

export type OperatorPriority = "low" | "medium" | "high";

export type OperatorDecision = {
  priority: OperatorPriority;
  focusIssueTypes: string[];
  rationale: string;
  nextSteps: string[];
};

/**
 * Camada de decisão operacional (regras simples, sem LLM).
 * Prioriza incidentes críticos e volume de sinais.
 */
export function decideAction(issues: HealthIssue[]): OperatorDecision {
  if (issues.length === 0) {
    return {
      priority: "low",
      focusIssueTypes: [],
      rationale: "Nenhuma anomalia detetada no ciclo atual.",
      nextSteps: ["Manter monitorização periódica."],
    };
  }

  const hasCritical = issues.some((i) => i.level === "critical");
  const priority: OperatorPriority = hasCritical
    ? "high"
    : issues.length >= 2
      ? "medium"
      : "low";

  const focusIssueTypes = [...new Set(issues.map((i) => i.type))];

  return {
    priority,
    focusIssueTypes,
    rationale: hasCritical
      ? "Existem condições críticas (ex.: DB ou memória extrema) — prioridade máxima."
      : "Degradação leve ou isolada; acompanhar tendência antes de escalar.",
    nextSteps: issues.map((i) => `Tratar ${i.type} (nível ${i.level})`),
  };
}
