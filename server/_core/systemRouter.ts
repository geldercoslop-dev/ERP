import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import * as db from "../db";
import { getConnectionPool } from "../config/database";

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
    
  // Endpoint para diagnóstico do banco de dados
  checkDatabase: publicProcedure
    .mutation(async () => {
      try {
        // Verificar conexão com o pool
        const pool = getConnectionPool();
        if (!pool) {
          throw new Error("Não foi possível obter o pool de conexões");
        }
        
        // Verificar tabelas
        const conn = await pool.getConnection();
        try {
          // Listar tabelas
          const [tablesResult] = await conn.query("SHOW TABLES");
          const tables = Array.isArray(tablesResult) ? tablesResult.map((row: any) => Object.values(row)[0]) : [];
          
          // Verificar vendedores
          const [vendedoresResult] = await conn.query("SELECT id, nome, admin FROM vendedores LIMIT 10");
          const vendedores = Array.isArray(vendedoresResult) ? vendedoresResult : [];
          
          return {
            connected: true,
            tables,
            vendedores,
          };
        } finally {
          conn.release();
        }
      } catch (error) {
        console.error("Erro ao verificar banco de dados:", error);
        throw new Error(error instanceof Error ? error.message : "Erro desconhecido na conexão com o banco de dados");
      }
    }),
});
