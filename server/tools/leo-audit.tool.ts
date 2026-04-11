import { insertLeoLegacyActionLog } from '../services/leo-action-log.service.js';
import { logAction } from '../services/ai/leo-action-logger.js';
import { ValidationError } from '../_core/errors/typed-errors.js';

function requireTenantId(tenantId: number): number {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId obrigatório');
  }
  return tenantId;
}

function serializeAuditData(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildLegacyUsuario(tenantId: number, usuario?: string): string {
  const tenantToken = `tenant:${tenantId}`;
  if (!usuario) {
    return tenantToken;
  }
  return usuario.includes('tenant:') ? usuario : `${tenantToken}:${usuario}`;
}

export type LeoAuditLegacyInput = {
  tenantId: number;
  usuario?: string;
  acao: string;
  entidade: string;
  dados?: unknown;
  resultado: string;
};

export type LeoAuditExecutionInput = {
  tenantId: number;
  userId?: number;
  tool: string;
  input: unknown;
  result: unknown;
  success: boolean;
  executionTime: number;
};

export type LeoAuditResult = {
  success: boolean;
};

async function logToolExecution(input: LeoAuditExecutionInput): Promise<LeoAuditResult> {
  const tenantId = requireTenantId(input.tenantId);
  await logAction({
    tool: input.tool,
    input: input.input,
    result: input.result,
    success: input.success,
    executionTime: input.executionTime,
    ctx: {
      tenantId,
      userId: input.userId,
    },
  });

  return { success: true };
}

export const leoAuditTool = {
  async logLegacy(input: LeoAuditLegacyInput): Promise<LeoAuditResult> {
    const tenantId = requireTenantId(input.tenantId);
    await insertLeoLegacyActionLog({
      usuario: buildLegacyUsuario(tenantId, input.usuario),
      acao: input.acao,
      entidade: input.entidade,
      dados: serializeAuditData(input.dados),
      resultado: input.resultado,
    });

    return { success: true };
  },

  async logExecution(input: LeoAuditExecutionInput): Promise<LeoAuditResult> {
    return logToolExecution(input);
  },

  async logToolResult(input: LeoAuditExecutionInput): Promise<LeoAuditResult> {
    return logToolExecution(input);
  },
};