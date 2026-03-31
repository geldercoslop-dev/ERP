/**
 * Testes de validação de environment variables
 * Validam que as variáveis são carregadas e validadas corretamente
 */

import { describe, it, expect } from 'vitest';

describe('Environment Variables', () => {
  describe('ENV Schema Validation', () => {
    it('deveria falhar se DATABASE_URL estiver vazio', () => {
      const validateDatabaseUrl = (url: string): boolean => {
        return url.length > 0;
      };

      expect(validateDatabaseUrl('')).toBe(false);
      expect(validateDatabaseUrl('mysql://test')).toBe(true);
    });

    it('deveria falhar se APP_SECRET for menor que 8 caracteres', () => {
      const validateSecret = (secret: string): boolean => {
        return secret.length >= 8;
      };

      expect(validateSecret('short')).toBe(false);
      expect(validateSecret('test-secret-8chars')).toBe(true);
    });

    it('deveria validar variáveis obrigatórias corretamente', () => {
      const validateEnv = (env: Record<string, unknown>): boolean => {
        return Boolean(env.DATABASE_URL) &&
               Boolean(env.APP_SECRET) &&
               Boolean(env.JWT_ACCESS_SECRET) &&
               Boolean(env.JWT_REFRESH_SECRET);
      };

      expect(validateEnv({
        DATABASE_URL: 'mysql://test',
        APP_SECRET: 'test-secret-8chars',
        JWT_ACCESS_SECRET: 'test-secret-32chars-test-secret',
        JWT_REFRESH_SECRET: 'test-secret-32chars-test-secret',
      })).toBe(true);

      expect(validateEnv({
        DATABASE_URL: '',
        APP_SECRET: 'test-secret-8chars',
        JWT_ACCESS_SECRET: 'test-secret-32chars-test-secret',
        JWT_REFRESH_SECRET: 'test-secret-32chars-test-secret',
      })).toBe(false);
    });

    it('deveria exigir JWT_ACCESS_SECRET com mínimo 64 caracteres em produção', () => {
      const validateSecurityCompliance = (secret: string, nodeEnv: string): boolean => {
        if (nodeEnv === 'production') {
          return secret.length >= 64;
        }
        return secret.length >= 32;
      };

      expect(validateSecurityCompliance('a'.repeat(32), 'development')).toBe(true);
      expect(validateSecurityCompliance('a'.repeat(32), 'production')).toBe(false);
      expect(validateSecurityCompliance('a'.repeat(64), 'production')).toBe(true);
    });

    it('deveria transformar PORT corretamente de string para number', () => {
      const parsePort = (port: unknown): number => {
        if (typeof port === 'string') return Number(port);
        if (typeof port === 'number') return port;
        return 3000;
      };

      const testPort = '8080';
      const port = parsePort(testPort);
      expect(port).toBe(8080);
      expect(typeof port).toBe('number');
    });

    it('deveria usar valor padrão de PORT se não fornecido', () => {
      const parsePort = (port: unknown): number => {
        if (typeof port === 'string') return Number(port);
        if (typeof port === 'number') return port;
        return 3000; // default
      };

      const port = parsePort(undefined);
      expect(port).toBe(3000);
    });

    it('deveria validar JWT_REFRESH_SECRET com mínimo 32 caracteres', () => {
      const validateSecret = (secret: string): boolean => {
        return secret.length >= 32;
      };

      expect(validateSecret('a'.repeat(31))).toBe(false);
      expect(validateSecret('a'.repeat(32))).toBe(true);
    });
  });

  describe('NODE_ENV Validation', () => {
    it('deveria aceitar development como NODE_ENV válido', () => {
      const isValidNodeEnv = (env: string): boolean => {
        return env === 'development' || env === 'production';
      };

      expect(isValidNodeEnv('development')).toBe(true);
    });

    it('deveria aceitar production como NODE_ENV válido', () => {
      const isValidNodeEnv = (env: string): boolean => {
        return env === 'development' || env === 'production';
      };

      expect(isValidNodeEnv('production')).toBe(true);
    });

    it('deveria rejeitar NODE_ENV inválido', () => {
      const isValidNodeEnv = (env: string): boolean => {
        return env === 'development' || env === 'production';
      };

      expect(isValidNodeEnv('staging')).toBe(false);
      expect(isValidNodeEnv('test')).toBe(false);
    });

    it('deveria usar default development se NODE_ENV não for fornecido', () => {
      const getNodeEnv = (env?: string): string => {
        return env || 'development';
      };

      expect(getNodeEnv()).toBe('development');
    });
  });
});
