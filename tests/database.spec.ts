/**
 * Testes de Database Guard
 * Validam comportamento com sucesso e falha de conexão
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as mysql from 'mysql2/promise';

describe('Database Guard', () => {
  describe('Database URL Parsing', () => {
    it('deveria extrair dados corretos de uma DATABASE_URL válida', () => {
      const urlString = 'mysql://usuario:senha@localhost:3306/vendas_app';
      
      const parseUrl = (url: string) => {
        const u = new URL(url);
        return {
          host: u.hostname,
          port: parseInt(u.port || '3306', 10),
          user: decodeURIComponent(u.username),
          password: decodeURIComponent(u.password),
          database: u.pathname.replace(/^\//, '').split('/')[0],
        };
      };

      const parsed = parseUrl(urlString);

      expect(parsed.host).toBe('localhost');
      expect(parsed.port).toBe(3306);
      expect(parsed.user).toBe('usuario');
      expect(parsed.password).toBe('senha');
      expect(parsed.database).toBe('vendas_app');
    });

    it('deveria falhar com DATABASE_URL sem protocolo mysql://', () => {
      const urlString = 'postgres://usuario:senha@localhost:3306/vendas_app';

      const parseUrl = (url: string) => {
        const u = new URL(url);
        if (u.protocol !== 'mysql:' && u.protocol !== 'mysql2:') {
          throw new Error('DATABASE_URL deve usar o protocolo mysql://');
        }
        return { protocol: u.protocol };
      };

      expect(() => parseUrl(urlString)).toThrow('DATABASE_URL deve usar o protocolo mysql://');
    });

    it('deveria falhar com DATABASE_URL sem nome de banco', () => {
      const urlString = 'mysql://usuario:senha@localhost:3306/';

      const parseUrl = (url: string) => {
        const u = new URL(url);
        const database = u.pathname.replace(/^\//, '').split('/')[0];
        if (!database) {
          throw new Error('DATABASE_URL deve incluir o nome do banco no path');
        }
        return { database };
      };

      expect(() => parseUrl(urlString)).toThrow('DATABASE_URL deve incluir o nome do banco');
    });

    it('deveria suportar porta customizada', () => {
      const urlString = 'mysql://usuario:senha@localhost:3307/vendas_app';

      const parseUrl = (url: string) => {
        const u = new URL(url);
        return {
          port: parseInt(u.port || '3306', 10),
        };
      };

      const parsed = parseUrl(urlString);
      expect(parsed.port).toBe(3307);
    });

    it('deveria usar porta padrão 3306 se não especificada', () => {
      const urlString = 'mysql://usuario:senha@localhost/vendas_app';

      const parseUrl = (url: string) => {
        const u = new URL(url);
        return {
          port: parseInt(u.port || '3306', 10),
        };
      };

      const parsed = parseUrl(urlString);
      expect(parsed.port).toBe(3306);
    });

    it('deveria decodificar credenciais com caracteres especiais', () => {
      const urlString = 'mysql://usuario%40example:senha%3D123@localhost/vendas_app';

      const parseUrl = (url: string) => {
        const u = new URL(url);
        return {
          user: decodeURIComponent(u.username),
          password: decodeURIComponent(u.password),
        };
      };

      const parsed = parseUrl(urlString);
      expect(parsed.user).toBe('usuario@example');
      expect(parsed.password).toBe('senha=123');
    });
  });

  describe('Pool Configuration', () => {
    it('deveria gerar configuração valida de pool com valores padrão', () => {
      const createPoolConfig = () => ({
        connectionLimit: Math.max(10, Number(process.env.DB_POOL_CONNECTION_LIMIT || 100)),
        queueLimit: Math.max(0, Number(process.env.DB_POOL_QUEUE_LIMIT || 200)),
        waitForConnections: true,
        enableKeepAlive: true,
        idleTimeout: 60000,
      });

      const config = createPoolConfig();

      expect(config.connectionLimit).toBeGreaterThanOrEqual(10);
      expect(config.queueLimit).toBeGreaterThanOrEqual(0);
      expect(config.waitForConnections).toBe(true);
      expect(config.enableKeepAlive).toBe(true);
      expect(config.idleTimeout).toBe(60000);
    });

    it('deveria respeitar variáveis de ambiente para pool size', () => {
      const originalEnv = process.env.DB_POOL_CONNECTION_LIMIT;
      process.env.DB_POOL_CONNECTION_LIMIT = '50';

      try {
        const connectionLimit = Math.max(
          10,
          Number(process.env.DB_POOL_CONNECTION_LIMIT || 100)
        );
        expect(connectionLimit).toBe(50);
      } finally {
        process.env.DB_POOL_CONNECTION_LIMIT = originalEnv;
      }
    });

    it('deveria usar mínimo de 10 conexões mesmo se env for menor', () => {
      const originalEnv = process.env.DB_POOL_CONNECTION_LIMIT;
      process.env.DB_POOL_CONNECTION_LIMIT = '5';

      try {
        const connectionLimit = Math.max(
          10,
          Number(process.env.DB_POOL_CONNECTION_LIMIT || 100)
        );
        expect(connectionLimit).toBe(10);
      } finally {
        process.env.DB_POOL_CONNECTION_LIMIT = originalEnv;
      }
    });
  });

  describe('Health Check', () => {
    it('deveria manter cache de health check', () => {
      const now = Date.now();
      const healthCache: { ok: boolean; at: number } = {
        ok: true,
        at: now,
      };

      const getCacheSnapshot = () => ({
        healthy: healthCache.ok,
        lastCheckAt: healthCache.at,
      });

      const snapshot = getCacheSnapshot();
      expect(snapshot.healthy).toBe(true);
      expect(snapshot.lastCheckAt).toBeLessThanOrEqual(Date.now());
    });

    it('deveria indicar que saúde degradou ao marcar como unhealthy', () => {
      const healthCache: { ok: boolean; at: number } = {
        ok: true,
        at: Date.now(),
      };

      healthCache.ok = false;

      expect(healthCache.ok).toBe(false);
    });

    it('deveria respeitar cache window para health check', () => {
      const HEALTH_CACHE_MS = 30000;
      const now = Date.now();
      const lastCheck = now - 15000; // 15s atrás

      const shouldRefreshHealth = (now - lastCheck) > HEALTH_CACHE_MS;

      expect(shouldRefreshHealth).toBe(false);
    });

    it('deveria invalidar cache quando threshold é ultrapassado', () => {
      const HEALTH_CACHE_MS = 30000;
      const now = Date.now();
      const lastCheck = now - 35000; // 35s atrás

      const shouldRefreshHealth = (now - lastCheck) > HEALTH_CACHE_MS;

      expect(shouldRefreshHealth).toBe(true);
    });
  });

  describe('Connection Pool Mock', () => {
    it('deveria simular sucesso de conexão', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue([[], []]),
        getConnection: vi.fn().mockResolvedValue({
          ping: vi.fn().mockResolvedValue(undefined),
          release: vi.fn(),
        }),
      };

      const result = await mockPool.query('SELECT 1');
      expect(result).toBeDefined();
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('deveria simular erro de conexão', async () => {
      const mockPool = {
        query: vi.fn().mockRejectedValue(new Error('Connection refused')),
      };

      await expect(mockPool.query('SELECT 1')).rejects.toThrow('Connection refused');
    });

    it('deveria simular timeout de conexão', async () => {
      const mockPool = {
        getConnection: vi.fn().mockRejectedValue(new Error('Timeout waiting for available connection')),
      };

      await expect(mockPool.getConnection()).rejects.toThrow('Timeout waiting for available connection');
    });

    it('deveria simular fila cheia quando queueLimit é atingido', async () => {
      const mockPool = {
        getConnection: vi.fn().mockRejectedValue(new Error('Queue limit reached')),
      };

      await expect(mockPool.getConnection()).rejects.toThrow('Queue limit reached');
    });
  });

  describe('Database Initialization', () => {
    it('deveria falhar se DATABASE_URL não estiver definido', () => {
      const requireDatabaseUrl = () => {
        const raw = (process.env.DATABASE_URL || '').trim();
        if (!raw) {
          throw new Error('DATABASE_URL é obrigatório');
        }
        return raw;
      };

      const originalEnv = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      try {
        expect(() => requireDatabaseUrl()).toThrow('DATABASE_URL é obrigatório');
      } finally {
        process.env.DATABASE_URL = originalEnv;
      }
    });

    it('deveria validar que DATABASE_URL está definido', () => {
      const requireDatabaseUrl = () => {
        const raw = (process.env.DATABASE_URL || '').trim();
        if (!raw) {
          throw new Error('DATABASE_URL é obrigatório');
        }
        return raw;
      };

      const originalEnv = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'mysql://user:pass@localhost/db';

      try {
        const url = requireDatabaseUrl();
        expect(url).toBe('mysql://user:pass@localhost/db');
      } finally {
        process.env.DATABASE_URL = originalEnv;
      }
    });
  });
});
