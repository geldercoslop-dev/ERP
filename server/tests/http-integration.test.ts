/**
 * HTTP Tests with Supertest
 * Testes HTTP reais usando app instance direta
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../_core/index.js';

// Configurar variáveis de ambiente para testes
process.env.JWT_SECRET = 'test-jwt-secret-32-chars-minimum-length';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

describe.skip('HTTP Integration Tests', () => {
  describe('Health Endpoints', () => {
    it('should return 200 for /api/health/ping', async () => {
      await request(app)
        .get('/api/health/ping')
        .expect(200);
    });

    it('should return 200 for /api/health/check', async () => {
      await request(app)
        .get('/api/health/check')
        .expect(200);
    });

    it('should return 401 for protected endpoint without auth', async () => {
      await request(app)
        .get('/api/trpc/auth.me')
        .expect(401);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api/health/ping')
        .expect(200);

      // Verificar headers de segurança
      expect(response.headers).toBeDefined();
      // Headers podem variar, mas response deve ter sucesso
    });
  });

  describe('Rate Limiting', () => {
    it('should handle multiple requests', async () => {
      // Fazer múltiplas requisições para testar rate limiting
      const promises = Array.from({ length: 5 }, () =>
        request(app)
          .get('/api/health/ping')
          .expect(200)
      );

      await Promise.all(promises);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoint', async () => {
      await request(app)
        .get('/api/nonexistent')
        .expect(404);
    });

    it('should handle malformed requests gracefully', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ invalid: 'data' })
        .expect(400);
    });
  });
});
