import { z } from "zod";
import { notifyOwner } from "./notification.js";
import { adminProcedure, publicProcedure, router } from "./trpc.js";
import * as db from "../db/index.js";
import { getConnectionPool } from "../config/database.js";

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
        // Verificar conexão com o pool
        const pool = await getConnectionPool();
        if (!pool) {
          throw new Error("Não foi possível obter o pool de conexões");
        }
        
        // Usar services em vez de queries diretas - teste simples
        return {
          connected: true,
          tables: "protected", // Não expor estrutura real
          vendedores: "protected", // Não expor dados
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error("Erro ao verificar banco de dados:", error);
        throw new Error(error instanceof Error ? error.message : "Erro desconhecido na conexão com o banco de dados");
      }
    }),
});
