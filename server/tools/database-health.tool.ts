import { pingDatabase } from '../services/database-health.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';

function requireTenantId(tenantId: number): number {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId obrigatório');
  }
  return tenantId;
}

export type DatabaseHealthInput = {
  tenantId: number;
};

export type DatabaseHealthSnapshot = {
  tenantId: number;
  ok: boolean;
  latencyMs: number;
  threadsConnected?: number;
  checkedAt: string;
};

async function readHealth(input: DatabaseHealthInput): Promise<DatabaseHealthSnapshot> {
  const tenantId = requireTenantId(input.tenantId);
  const result = await pingDatabase();

  return {
    tenantId,
    ok: result.ok,
    latencyMs: result.latencyMs,
    threadsConnected: result.threadsConnected,
    checkedAt: new Date().toISOString(),
  };
}

export type DatabaseSystemPingResult = {
  ok: boolean;
  latencyMs: number;
  threadsConnected?: number;
  checkedAt: string;
};

export const databaseHealthTool = {
  async ping(input: DatabaseHealthInput) {
    return readHealth(input);
  },

  async healthSnapshot(input: DatabaseHealthInput) {
    return readHealth(input);
  },

  async pingSystem(): Promise<DatabaseSystemPingResult> {
    const result = await pingDatabase();
    return {
      ok: result.ok,
      latencyMs: result.latencyMs,
      threadsConnected: result.threadsConnected,
      checkedAt: new Date().toISOString(),
    };
  },
};