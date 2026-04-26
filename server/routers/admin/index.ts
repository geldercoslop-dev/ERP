import { publicProcedure, router } from '../../_core/trpc.js';
import { collectSystemHealth, collectHealthCheck, collectSystemMetrics } from './system-health.js';
import { leoExecutionAdapter } from '../../monitoring/leo-execution-adapter.js';
import { z } from 'zod';

export const adminRouter = router({
  health: publicProcedure.query(async () => collectSystemHealth()),
  check: publicProcedure.query(async () => collectHealthCheck()),
  metrics: publicProcedure.query(async () => collectSystemMetrics()),
  
  // Observabilidade de execuções do LEO
  leoExecution: {
    records: publicProcedure
      .input(z.object({
        limit: z.number().optional().default(50),
        status: z.enum(['started', 'completed', 'failed', 'blocked']).optional(),
        tenantId: z.number().optional(),
        origin: z.string().optional(),
        actor: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return leoExecutionAdapter.getExecutionRecords(input);
      }),
    
    stats: publicProcedure.query(async () => {
      return leoExecutionAdapter.getExecutionStats();
    }),
  },
});
