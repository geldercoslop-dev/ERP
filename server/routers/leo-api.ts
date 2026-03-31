/**
 * Router API do LEO
 * 
 * Endpoints para interação com o agente LEO:
 * - /leo/ask - Perguntas e respostas
 * - /leo/status - Status do agente
 */

import { router, publicProcedure, protectedProcedure } from '../_core/trpc.js';
import { z } from 'zod';
import { leoLongMemory } from '../leo/memory/leo-long-memory.js';
import { requireTenant } from '../_core/tenant.js';
import { askLeoQuestion, getLeoStatusSummary } from '../services/leo.service.js';
import { createLogger } from '../infra/structured-logger.js';

const logger = createLogger("leo-api-router");

/**
 * Schema para perguntas ao LEO
 */
const askQuestionSchema = z.object({
  question: z.string().min(1),
  context: z.string().optional(),
});

/**
 * Schema para status do LEO
 */
const statusSchema = z.object({
  detailed: z.boolean().default(false),
});

/**
 * Router principal do LEO
 */
export const leoApiRouter = router({
  // Endpoint para fazer perguntas ao LEO
  ask: protectedProcedure
    .input(askQuestionSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        logger.info("leo_question_received", {
          tenantId,
          metadata: { question: input.question },
        });
        
        const { answer, processingTime } = await askLeoQuestion(
          tenantId,
          input.question,
          input.context
        );
        
        return {
          success: true,
          question: input.question,
          answer,
          processingTime,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        logger.error("leo_question_failed", error instanceof Error ? error : String(error));
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erro ao processar pergunta',
          question: input.question
        };
      }
    }),

  // Endpoint para status do LEO
  status: protectedProcedure
    .input(statusSchema)
    .query(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        logger.info("leo_status_requested", {
          tenantId,
          metadata: { detailed: input.detailed },
        });
        
        return await getLeoStatusSummary(tenantId, input.detailed);

      } catch (error) {
        logger.error("leo_status_failed", error instanceof Error ? error : String(error));
        
        return {
          online: false,
          error: error instanceof Error ? error.message : 'Erro ao obter status',
          timestamp: new Date().toISOString(),
          success: false
        };
      }
    }),

  // Endpoint para obter memórias recentes
  memories: publicProcedure
    .input(z.object({
      type: z.enum(['event', 'decision', 'insight', 'pattern', 'alert', 'strategy']).optional(),
      limit: z.number().default(10)
    }))
    .query(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const memories = input.type 
          ? await leoLongMemory.getMemoriesByType(tenantId, input.type, input.limit)
          : await leoLongMemory.getRecentMemories(tenantId, input.limit);

        return {
          success: true,
          memories,
          count: memories.length
        };

      } catch (error) {
        logger.error("leo_memories_failed", error instanceof Error ? error : String(error));
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erro ao obter memórias',
          memories: []
        };
      }
    }),

  // Endpoint para buscar insights críticos
  insights: publicProcedure
    .input(z.object({
      limit: z.number().default(5)
    }))
    .query(async ({ input }) => {
      try {
        const insights = await leoLongMemory.getCriticalInsights(input.limit);

        return {
          success: true,
          insights,
          count: insights.length
        };

      } catch (error) {
        logger.error("leo_insights_failed", error instanceof Error ? error : String(error));
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erro ao obter insights',
          insights: []
        };
      }
    })
});
