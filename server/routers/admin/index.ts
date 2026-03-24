import { publicProcedure, router } from '../../_core/trpc';
import { collectSystemHealth, collectHealthCheck, collectSystemMetrics } from './system-health';
import { z } from 'zod';

export const adminRouter = router({
  health: publicProcedure.query(async () => collectSystemHealth()),
  check: publicProcedure.query(async () => collectHealthCheck()),
  metrics: publicProcedure.query(async () => collectSystemMetrics()),
});
