import { publicProcedure, router } from '../../_core/trpc.js';
import { collectSystemHealth, collectHealthCheck, collectSystemMetrics } from './system-health.js';
export const adminRouter = router({
    health: publicProcedure.query(async () => collectSystemHealth()),
    check: publicProcedure.query(async () => collectHealthCheck()),
    metrics: publicProcedure.query(async () => collectSystemMetrics()),
});
