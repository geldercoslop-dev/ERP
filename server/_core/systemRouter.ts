import { z } from "zod";
import { notifyOwner } from "./notification.js";
import { adminProcedure, publicProcedure, router } from "./trpc.js";
import { checkProtectedDatabaseConnection } from "../services/system-db-check.service.js";
import { InfrastructureError } from "./errors/typed-errors.js";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
    
  // Endpoint para diagnóstico do banco de dados (PROTEGIDO)
  checkDatabase: adminProcedure
    .mutation(async () => {
      try {
        return await checkProtectedDatabaseConnection();
      } catch (error) {
        console.error("Erro ao verificar banco de dados:", error);
        throw new InfrastructureError(error instanceof Error ? error.message : "Erro desconhecido na conexão com o banco de dados");
      }
    }),
});
