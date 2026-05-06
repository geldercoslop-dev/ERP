import { leoLogManager } from "../leo/utils/leo-log-manager.js";
import { insertAuditLog, type AuditLogData } from "./audit-service.js";

export type LeoActionLogParams = {
  tenantId?: number;
  usuario: string;
  acao: string;
  entidade: string;
  dados?: string | null;
  resultado: string;
  audit?: {
    entity: string;
    entityId: string;
    action?: string;
    payloadJson?: string;
  };
};

/**
 * Registra log de ação do LEO.
 * Decisões de destino (Audit vs Arquivo) são centralizadas aqui.
 * Fail-soft: erros de log não derrubam o processo principal.
 */
export async function insertLeoActionLog(params: LeoActionLogParams): Promise<void> {
  const { tenantId, usuario, acao, entidade, dados, resultado, audit } = params;

  try {
    // 1. Sempre gravar no log operacional (arquivo) - FAIL-SOFT
    try {
      leoLogManager.writeLog({
        timestamp: new Date(),
        level: resultado.toUpperCase().includes('ERRO') || resultado.toUpperCase().includes('FALHA') ? 'ERROR' : 'INFO',
        module: 'LEO-ACTION',
        message: `${acao} em ${entidade}`,
        data: { usuario, dados, resultado },
        traceId: `tenant:${tenantId}`
      });
    } catch {
      // Silêncio absoluto em caso de erro no log operacional
    }

    // 2. Gravar em Auditoria Real (Banco) apenas se houver metadado explícito e seguro
    if (tenantId && tenantId > 0 && audit && audit.entity && audit.entityId) {
      const auditData: AuditLogData = {
        tenantId,
        action: audit.action || acao,
        entity: audit.entity,
        entityId: audit.entityId,
        payloadJson: audit.payloadJson || JSON.stringify({ usuario, dados, resultado }),
      };

      await insertAuditLog(auditData);
    }
  } catch {
    // Fail-soft global: log nunca trava o fluxo principal
  }
}

export async function insertLeoLegacyActionLog(params: {
  usuario: string;
  acao: string;
  entidade: string;
  dados?: string | null;
  resultado: string;
}): Promise<void> {
  const tenantMatch = params.usuario.match(/tenant:(\d+)/i);
  const tenantId = tenantMatch
    ? Number(tenantMatch[1])
    : null;
  
  // Legacy vai apenas para log operacional (arquivo), pois não envia objeto 'audit'
  await insertLeoActionLog({
    tenantId: tenantId && Number.isFinite(tenantId) && tenantId > 0 ? tenantId : undefined,
    usuario: params.usuario,
    acao: params.acao,
    entidade: params.entidade,
    dados: params.dados ?? null,
    resultado: params.resultado,
  });
}
