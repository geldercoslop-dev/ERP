/**
 * Tipos compartilhados para as tools do LEO.
 * Todas as tools recebem contexto autenticado (tenantId, userId, role).
 */

import type { z } from "zod";
import type { SecureRole } from "../../_core/secure-context";

export type LeoToolContext = {
  tenantId: number;
  userId?: number;
  userRole?: string;
  vendedorId?: number;
  /** Papel canônico (obrigatório quando o executor preenche). */
  role: SecureRole;
};

/** Resposta padronizada da IA / execução de tool. */
export type LeoToolResponse = {
  success: boolean;
  message: string;
  data?: unknown;
  meta?: Record<string, unknown>;
};

export type LeoToolDefinition<TInput = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<TInput>;
  execute: (input: TInput, context: LeoToolContext) => Promise<LeoToolResponse>;
};
