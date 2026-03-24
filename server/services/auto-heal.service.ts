import { createLogger } from "../infra/structured-logger";
import type { HealthIssue } from "./health-rules.engine";

const logger = createLogger("auto-heal");

export type HealResult = {
  ok: boolean;
  detail: string;
};

/** Sem ações destrutivas: apenas log, mock reconnect e sugestões. */
export async function executeAction(issue: HealthIssue): Promise<HealResult> {
  switch (issue.type) {
    case "memory-high":
      logger.warn(
        "[auto-heal] memory-high: monitorar RSS/heap; considerar escalar ou revisar leaks (sugestão apenas)",
        { metadata: { issueType: issue.type, level: issue.level } }
      );
      return { ok: true, detail: "log + suggestion" };

    case "memory-critical":
      logger.error(
        "[auto-heal] memory-critical: condição grave — revisão humana recomendada (nenhuma ação agressiva executada)",
        { metadata: { issueType: issue.type, level: issue.level } }
      );
      return { ok: true, detail: "escalation log only" };

    case "db-down":
      logger.info("[auto-heal] db-down: tentativa de reconnect (mock)", {
        metadata: { issueType: issue.type, level: issue.level },
      });
      await mockReconnect();
      return { ok: true, detail: "mock reconnect" };

    case "high-response-time":
      logger.warn(
        "[auto-heal] high-response-time: degradar comportamento suave — apenas registo (sem alterar TTL real)",
        { metadata: { issueType: issue.type, level: issue.level } }
      );
      return { ok: true, detail: "log degrade (mock)" };
  }
}

async function mockReconnect(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}
