import { createLogger } from "../infra/structured-logger.js";
import { checkDatabasePoolHealth } from "../config/database.js";
import type { HealthIssue } from "./health-rules.engine.js";

const logger = createLogger("auto-heal");

export type HealResult = {
  ok: boolean;
  detail: string;
};

/** Sem ações destrutivas: apenas log, verificação real de conexão e sugestões. */
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
      logger.info("[auto-heal] db-down: verificando conexão com banco de dados", {
        metadata: { issueType: issue.type, level: issue.level },
      });
      const isHealthy = await checkDatabasePoolHealth();
      if (isHealthy) {
        logger.info("[auto-heal] db-down: conexão restabelecida", {
          metadata: { issueType: issue.type, level: issue.level },
        });
        return { ok: true, detail: "database connection verified" };
      }
      logger.error("[auto-heal] db-down: falha na verificação de conexão", {
        metadata: { issueType: issue.type, level: issue.level },
      });
      return { ok: false, detail: "database reconnection failed" };

    case "high-response-time":
      logger.warn(
        "[auto-heal] high-response-time: degradar comportamento suave — apenas registo (sem alterar TTL real)",
        { metadata: { issueType: issue.type, level: issue.level } }
      );
      return { ok: true, detail: "log degrade" };
  }
}
