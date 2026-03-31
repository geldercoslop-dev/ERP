/**
 * Tools de analytics do LEO (relatórios, dashboards).
 * Expandir conforme necessidade — manter apenas chamadas a services.
 */
import type { LeoToolDefinition } from "../types.js";

const analyticsTools: LeoToolDefinition<unknown>[] = [];

export const analyticsToolList = analyticsTools;
