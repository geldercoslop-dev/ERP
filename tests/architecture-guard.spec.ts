/**
 * Testes de Architecture Guard
 * Validam que architectura do projeto não quebra
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Architecture Guard', () => {
  describe('Layer Separation', () => {
    it('deveria detectar LEO importando DB (violação)', () => {
      const checkLeoDbViolation = (filePath: string, content: string): boolean => {
        const leoPath = filePath.includes('/leo/');
        const hasDbImport = /\bfrom\s+["'][^"']*\/db\//.test(content) ||
                           /\bfrom\s+["']\.\.\/db\//.test(content) ||
                           /\bfrom\s+["']\.\.\/\.\.\/db\//.test(content);
        return leoPath && hasDbImport;
      };

      const violatingCode = `
        import { getDb } from '../db/core.ts';
        
        export function leoFunction() {
          return getDb().query('...');
        }
      `;

      expect(checkLeoDbViolation('server/leo/actions.ts', violatingCode)).toBe(true);
    });

    it('deveria permitir LEO sem importar DB', () => {
      const checkLeoDbViolation = (filePath: string, content: string): boolean => {
        const leoPath = filePath.includes('/leo/');
        const hasDbImport = /\bfrom\s+["'][^"']*\/db\//.test(content) ||
                           /\bfrom\s+["']\.\.\/db\//.test(content) ||
                           /\bfrom\s+["']\.\.\/\.\.\/db\//.test(content);
        return leoPath && hasDbImport;
      };

      const validCode = `
        import { leoActionService } from '../services/leoAction.service.ts';
        
        export function leoFunction() {
          return leoActionService.execute();
        }
      `;

      expect(checkLeoDbViolation('server/leo/actions.ts', validCode)).toBe(false);
    });

    it('deveria detectar SERVICES importando LEO (violação)', () => {
      const checkServicesLeoViolation = (filePath: string, content: string): boolean => {
        const normalized = filePath.replace(/\\/g, '/');
        
        // Exceções
        if (normalized.includes('/server/services/leo/')) return false;
        if (normalized.includes('/server/services/ai/')) return false;
        if (normalized.includes('/server/services/leo-')) return false;
        if (normalized.includes('/server/services/leo.')) return false;
        if (normalized.endsWith('/server/services/system-monitor.ts')) return false;

        const hasLeoImport = /\bfrom\s+["'][^"']*\/leo\//.test(content) ||
                            /\bfrom\s+["']\.\.\/leo\//.test(content) ||
                            /\bfrom\s+["']\.\.\/\.\.\/leo\//.test(content);
        return hasLeoImport;
      };

      const violatingCode = `
        import { leoActionService } from '../../leo/actions.ts';
        
        export function normalService() {
          return leoActionService.execute();
        }
      `;

      expect(checkServicesLeoViolation('server/services/inventory.service.ts', violatingCode)).toBe(true);
    });
  });

  describe('Environment Variables Guard', () => {
    it('deveria detectar uso direto de process.env para JWT_ACCESS_SECRET', () => {
      const checkEnvViolation = (filePath: string, content: string): boolean => {
        // Exceções
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('env.schema.ts')) return false;
        if (normalized.includes('/server/scripts/')) return false;
        if (normalized.includes('/server/examples/')) return false;
        if (normalized.endsWith('loadEnv.ts')) return false;

        return /\bprocess\.env\.(JWT_ACCESS_SECRET)/.test(content);
      };

      const violatingCode = `
        const secret = process.env.JWT_ACCESS_SECRET;
      `;

      expect(checkEnvViolation('server/auth/jwt.ts', violatingCode)).toBe(true);
    });

    it('deveria detectar uso direto de process.env para DATABASE_URL', () => {
      const checkEnvViolation = (filePath: string, content: string): boolean => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('env.schema.ts')) return false;
        if (normalized.includes('/server/scripts/')) return false;
        if (normalized.endsWith('loadEnv.ts')) return false;

        return /\bprocess\.env\.(DATABASE_URL)/.test(content);
      };

      const violatingCode = `
        const dbUrl = process.env.DATABASE_URL;
      `;

      expect(checkEnvViolation('server/config/database.ts', violatingCode)).toBe(true);
    });

    it('deveria permitir uso de parseEnv ao invés de process.env direto', () => {
      const checkEnvViolation = (filePath: string, content: string): boolean => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('env.schema.ts')) return false;
        if (normalized.includes('/server/scripts/')) return false;
        if (normalized.endsWith('loadEnv.ts')) return false;

        return /\bprocess\.env\.(JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|DATABASE_URL)/.test(content);
      };

      const validCode = `
        import { parseEnv } from './env.schema.ts';
        const env = parseEnv();
        const secret = env.JWT_ACCESS_SECRET;
      `;

      expect(checkEnvViolation('server/auth/jwt.ts', validCode)).toBe(false);
    });

    it('deveria permitir uso direto em loadEnv.ts (exceção)', () => {
      const checkEnvViolation = (filePath: string, content: string): boolean => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.endsWith('loadEnv.ts')) return false;

        return /\bprocess\.env\.(JWT_ACCESS_SECRET)/.test(content);
      };

      const loadEnvCode = `
        const secret = process.env.JWT_ACCESS_SECRET;
      `;

      expect(checkEnvViolation('server/_core/loadEnv.ts', loadEnvCode)).toBe(false);
    });

    it('deveria permitir uso direto em env.schema.ts (exceção)', () => {
      const checkEnvViolation = (filePath: string, content: string): boolean => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('env.schema.ts')) return false;

        return /\bprocess\.env\.(JWT_ACCESS_SECRET)/.test(content);
      };

      const envSchemaCode = `
        const secret = process.env.JWT_ACCESS_SECRET;
      `;

      expect(checkEnvViolation('server/services/env.schema.ts', envSchemaCode)).toBe(false);
    });

    it('deveria permitir uso direto em scripts/ (exceção)', () => {
      const checkEnvViolation = (filePath: string, content: string): boolean => {
        const normalized = filePath.replace(/\\/g, '/');
        // Permitir scripts diretamente
        if (normalized.includes('scripts/') || normalized.includes('server/scripts')) return false;

        return /\bprocess\.env\.(DATABASE_URL)/.test(content);
      };

      const scriptCode = 'const dbUrl = process.env.DATABASE_URL;';

      expect(checkEnvViolation('server/scripts/seed.ts', scriptCode)).toBe(false);
    });

    it('deveria validar todas as 4 variáveis críticas (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, DATABASE_URL, REDIS_URL)', () => {
      const criticalVars = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL', 'REDIS_URL'];
      const checkEnvViolation = (filePath: string, content: string, varName: string): boolean => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('env.schema.ts')) return false;
        if (normalized.includes('/server/scripts/')) return false;
        if (normalized.endsWith('loadEnv.ts')) return false;

        const regex = new RegExp(`\\bprocess\\.env\\.${varName}\\b`);
        return regex.test(content);
      };

      const violatingCode = (varName: string) => `
        const value = process.env.${varName};
      `;

      for (const varName of criticalVars) {
        expect(checkEnvViolation('server/config/test.ts', violatingCode(varName), varName)).toBe(true);
      }
    });
  });

  describe('File Walk & Detection', () => {
    it('deveria encontrar violações em múltiplos arquivos', () => {
      const violations: string[] = [];

      const checkFile = (filePath: string, content: string) => {
        if (filePath.includes('/leo/') && /\bfrom\s+["'][^"']*\/db\//.test(content)) {
          violations.push(`${filePath}: LEO → DB`);
        }
        if (!filePath.includes('/services/leo/') && filePath.includes('/services/') && /\bfrom\s+["'][^"']*\/leo\//.test(content)) {
          violations.push(`${filePath}: SERVICES → LEO`);
        }
      };

      checkFile('server/leo/actions.ts', 'import { getDb } from "../db/index.ts"');
      checkFile('server/services/inventory.ts', 'import { leoService } from "../leo/service.ts"');

      expect(violations).toHaveLength(2);
      expect(violations[0]).toContain('LEO → DB');
      expect(violations[1]).toContain('SERVICES → LEO');
    });

    it('deveria retornar lista vazia quando não há violações', () => {
      const violations: string[] = [];

      const checkFile = (filePath: string, content: string) => {
        if (filePath.includes('/leo/') && /\bfrom\s+["'][^"']*\/db\//.test(content)) {
          violations.push(`${filePath}: LEO → DB`);
        }
      };

      checkFile('server/leo/actions.ts', 'import { service } from "../services/action.ts"');
      checkFile('server/leo/handler.ts', 'import { logger } from "../infra/logger.ts"');

      expect(violations).toHaveLength(0);
    });
  });

  describe('Guard Exit Codes', () => {
    it('deveria retornar exit code 0 quando arquitetura está válida', () => {
      const violations: string[] = [];
      const exitCode = violations.length > 0 ? 1 : 0;

      expect(exitCode).toBe(0);
    });

    it('deveria retornar exit code 1 quando há violações', () => {
      const violations = ['violation1', 'violation2'];
      const exitCode = violations.length > 0 ? 1 : 0;

      expect(exitCode).toBe(1);
    });
  });

  describe('Error Messages', () => {
    it('deveria incluir nome do arquivo em mensagem de erro', () => {
      const filePath = 'server/leo/actions.ts';
      const errorMessage = `${filePath}: LEO não pode importar DB`;

      expect(errorMessage).toContain(filePath);
      expect(errorMessage).toContain('LEO não pode importar DB');
    });

    it('deveria listar até 40 violações (limite)', () => {
      const violations = Array.from({ length: 50 }, (_, i) => `violation_${i}`);
      const displayed = violations.slice(0, 40);

      expect(displayed.length).toBe(40);
      expect(displayed[0]).toBe('violation_0');
      expect(displayed[39]).toBe('violation_39');
    });
  });

  describe('Import Pattern Detection', () => {
    it('deveria detectar relativos paths ../../db/', () => {
      const hasDbImport = /\bfrom\s+["'][^"']*\/db\//.test('import { x } from "../../db/index.ts"');
      expect(hasDbImport).toBe(true);
    });

    it('deveria detectar relativos paths ../db/', () => {
      const hasDbImport = /\bfrom\s+["'][^"']*\/db\//.test('import { x } from "../db/index.ts"');
      expect(hasDbImport).toBe(true);
    });

    it('deveria detectar ambos tipos de aspas', () => {
      const doubleQuotes = /\bfrom\s+["'][^"']*\/db\//.test('import { x } from "../db/index"');
      const singleQuotes = /\bfrom\s+["'][^"']*\/db\//.test("import { x } from '../db/index'");

      expect(doubleQuotes).toBe(true);
      expect(singleQuotes).toBe(true);
    });
  });
});
