import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { publicProcedure, router } from '../../server/_core/trpc';

// Mock do contexto
const createMockContext = () => ({
  user: { id: 1, role: 'user' },
  tenantId: Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99),
  req: {
    requestId: 'test-request-id',
    startTime: Date.now(),
  },
});

describe('Router Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Zod Input Validation', () => {
    it('deve validar input com sucesso', async () => {
      const testSchema = z.object({
        name: z.string().min(1),
        age: z.number().min(0),
      });

      const testRouter = router({
        testEndpoint: publicProcedure
          .input(testSchema)
          .query(({ input }) => {
            return { success: true, data: input };
          }),
      });

      const mockCaller = testRouter.createCaller(createMockContext());
      const result = await mockCaller.testEndpoint({ name: 'Test', age: 25 });

      expect(result).toEqual({
        success: true,
        data: { name: 'Test', age: 25 },
      });
    });

    it('deve lançar erro de validação para input inválido', async () => {
      const testSchema = z.object({
        name: z.string().min(1),
        age: z.number().min(0),
      });

      const testRouter = router({
        testEndpoint: publicProcedure
          .input(testSchema)
          .query(({ input }) => {
            return { success: true, data: input };
          }),
      });

      const mockCaller = testRouter.createCaller(createMockContext());

      await expect(mockCaller.testEndpoint({ name: '', age: -5 }))
        .rejects.toThrow();
    });

    it('deve validar input opcional corretamente', async () => {
      const testSchema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const testRouter = router({
        testEndpoint: publicProcedure
          .input(testSchema)
          .query(({ input }) => {
            return { success: true, data: input };
          }),
      });

      const mockCaller = testRouter.createCaller(createMockContext());
      const result = await mockCaller.testEndpoint({ required: 'test' });

      expect(result).toEqual({
        success: true,
        data: { required: 'test', optional: undefined },
      });
    });
  });

  describe('Error Handling', () => {
    it('deve lidar com erros de negócio', async () => {
      const testRouter = router({
        errorEndpoint: publicProcedure
          .input(z.object({ id: z.number() }))
          .mutation(async ({ input }) => {
            if (input.id === 999) {
              throw new Error('Recurso não encontrado');
            }
            return { success: true, id: input.id };
          }),
      });

      const mockCaller = testRouter.createCaller(createMockContext());

      // Teste de sucesso
      const successResult = await mockCaller.errorEndpoint({ id: 1 });
      expect(successResult).toEqual({ success: true, id: 1 });

      // Teste de erro
      await expect(mockCaller.errorEndpoint({ id: 999 }))
        .rejects.toThrow('Recurso não encontrado');
    });

    it('deve validar parâmetros obrigatórios', async () => {
      const testRouter = router({
        validateEndpoint: publicProcedure
          .input(z.object({
            email: z.string().email(),
            password: z.string().min(6),
          }))
          .mutation(async ({ input }) => {
            return { success: true, user: input.email };
          }),
      });

      const mockCaller = testRouter.createCaller(createMockContext());

      // Email inválido
      await expect(mockCaller.validateEndpoint({ 
        email: 'invalid-email', 
        password: '123456' 
      })).rejects.toThrow();

      // Senha curta
      await expect(mockCaller.validateEndpoint({ 
        email: 'test@example.com', 
        password: '123' 
      })).rejects.toThrow();

      // Válido
      const result = await mockCaller.validateEndpoint({ 
        email: 'test@example.com', 
        password: '123456' 
      });
      expect(result).toEqual({ success: true, user: 'test@example.com' });
    });
  });

  describe('Response Structure', () => {
    it('deve retornar resposta estruturada', async () => {
      const testRouter = router({
        structuredEndpoint: publicProcedure
          .input(z.object({ query: z.string() }))
          .query(async ({ input }) => {
            return {
              success: true,
              data: { result: input.query.toUpperCase() },
              timestamp: new Date().toISOString(),
            };
          }),
      });

      const mockCaller = testRouter.createCaller(createMockContext());
      const result = await mockCaller.structuredEndpoint({ query: 'test' });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('timestamp');
      expect(result.data.result).toBe('TEST');
    });
  });
});
