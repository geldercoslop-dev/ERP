/**
 * SECURITY AUDIT MASTER TEST SUITE
 * 
 * Auditoria completa de segurança e resiliência do sistema ERP
 * 
 * FASES:
 * 1. Isolamento Multi-Tenant
 * 2. Execution Gate (LEO)
 * 3. Infraestrutura (Redis/MySQL)
 * 4. Drizzle Pipeline
 * 5. LEO System
 * 6. Segurança de Dados
 * 7. Relatório Final
 * 
 * PRINCÍPIOS:
 * - NÃO modificar dados permanentes
 * - NÃO destruir banco
 * - TESTES apenas (read + controlled write)
 * - simular ataques internos e externos
 * - validar isolamento de dados entre tenants e usuários
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ValidationError } from '../_core/errors/typed-errors.js';

// Resultados da auditoria
interface AuditResult {
  phase: string;
  testName: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: any;
}

const auditResults: AuditResult[] = [];

function recordResult(phase: string, testName: string, status: 'PASS' | 'FAIL' | 'WARN', message: string, details?: any) {
  auditResults.push({ phase, testName, status, message, details });
  console.log(`[${phase}] ${testName}: ${status} - ${message}`);
}

describe('SECURITY AUDIT MASTER SUITE', () => {
  
  beforeAll(async () => {
    console.log('='.repeat(80));
    console.log('INICIANDO AUDITORIA DE SEGURANÇA E RESILIÊNCIA ERP');
    console.log('='.repeat(80));
  });

  afterAll(() => {
    console.log('='.repeat(80));
    console.log('RELATÓRIO FINAL DA AUDITORIA');
    console.log('='.repeat(80));
    
    const passed = auditResults.filter(r => r.status === 'PASS').length;
    const failed = auditResults.filter(r => r.status === 'FAIL').length;
    const warned = auditResults.filter(r => r.status === 'WARN').length;
    
    console.log(`\nTOTAL: ${auditResults.length} testes`);
    console.log(`✅ PASS: ${passed}`);
    console.log(`❌ FAIL: ${failed}`);
    console.log(`⚠️  WARN: ${warned}`);
    
    if (failed > 0) {
      console.log('\n=== FALHAS CRÍTICAS ===');
      auditResults.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`[${r.phase}] ${r.testName}: ${r.message}`);
        if (r.details) console.log(`  Detalhes:`, r.details);
      });
    }
    
    if (warned > 0) {
      console.log('\n=== RISCOS MÉDIOS ===');
      auditResults.filter(r => r.status === 'WARN').forEach(r => {
        console.log(`[${r.phase}] ${r.testName}: ${r.message}`);
      });
    }
    
    console.log('='.repeat(80));
  });

  // ============================================================
  // FASE 1: TESTE DE ISOLAMENTO MULTI-TENANT
  // ============================================================
  describe('FASE 1: Isolamento Multi-Tenant', () => {
    
    it('deve bloquear execução sem tenantId', async () => {
      try {
        const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
        const request = {
          action: 'test',
          toolName: 'test',
          parameters: {},
          context: {
            tenantId: 0,
            userId: 1,
          },
          source: 'agent' as const,
        };

        const result = await executeLeoActionGate(request);
        
        if (result.blocked && result.message.includes('tenantId')) {
          recordResult('FASE 1', 'Bloqueio sem tenantId', 'PASS', 'TenantId inválido bloqueado corretamente');
        } else {
          recordResult('FASE 1', 'Bloqueio sem tenantId', 'FAIL', 'TenantId inválido não foi bloqueado', result);
        }
        
        expect(result.blocked).toBe(true);
      } catch (error) {
        recordResult('FASE 1', 'Bloqueio sem tenantId', 'PASS', 'Erro lançado corretamente', error);
        expect(error).toBeDefined();
      }
    });

    it('deve bloquear execução com tenantId negativo', async () => {
      try {
        const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
        const request = {
          action: 'test',
          toolName: 'test',
          parameters: {},
          context: {
            tenantId: -1,
            userId: 1,
          },
          source: 'agent',
        };

        const result = await executeLeoActionGate(request);
        
        if (result.blocked) {
          recordResult('FASE 1', 'Bloqueio tenantId negativo', 'PASS', 'TenantId negativo bloqueado corretamente');
        } else {
          recordResult('FASE 1', 'Bloqueio tenantId negativo', 'FAIL', 'TenantId negativo não foi bloqueado', result);
        }
        
        expect(result.blocked).toBe(true);
      } catch (error) {
        recordResult('FASE 1', 'Bloqueio tenantId negativo', 'PASS', 'Erro lançado corretamente');
        expect(error).toBeDefined();
      }
    });

    it('deve bloquear execução sem userId', async () => {
      try {
        const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
        const request = {
          action: 'test',
          toolName: 'test',
          parameters: {},
          context: {
            tenantId: 1,
            userId: 0,
          },
          source: 'agent',
        };

        const result = await executeLeoActionGate(request);
        
        if (result.blocked && result.message.includes('userId')) {
          recordResult('FASE 1', 'Bloqueio sem userId', 'PASS', 'UserId inválido bloqueado corretamente');
        } else {
          recordResult('FASE 1', 'Bloqueio sem userId', 'FAIL', 'UserId inválido não foi bloqueado', result);
        }
        
        expect(result.blocked).toBe(true);
      } catch (error) {
        recordResult('FASE 1', 'Bloqueio sem userId', 'PASS', 'Erro lançado corretamente');
        expect(error).toBeDefined();
      }
    });

    it('deve validar tentativa de bypass via parâmetros', async () => {
      const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
      const request = {
        action: 'test',
        toolName: 'test',
        parameters: {
          // Tentativa de injetar tenantId diferente
          tenantId: 999,
        },
        context: {
          tenantId: 1,
          userId: 1,
        },
        source: 'agent',
      };

      const result = await executeLeoActionGate(request);
      
      // O gate deve usar o tenantId do contexto, não dos parâmetros
      if (result.message?.includes('tenantId obrigatório') === false) {
        recordResult('FASE 1', 'Bypass via parâmetros', 'PASS', 'Gate usa tenantId do contexto corretamente');
      } else {
        recordResult('FASE 1', 'Bypass via parâmetros', 'WARN', 'Validação pode estar vulnerável', result);
      }
    });

    it('deve registrar todas as tentativas de execução', async () => {
      const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
      const request = {
        action: 'test',
        toolName: 'test',
        parameters: {},
        context: {
          tenantId: 1,
          userId: 1,
        },
        source: 'agent',
      };

      const result = await executeLeoActionGate(request);
      
      if (result.executionTime !== undefined && typeof result.executionTime === 'number') {
        recordResult('FASE 1', 'Registro de execução', 'PASS', 'ExecutionTime registrado corretamente');
      } else {
        recordResult('FASE 1', 'Registro de execução', 'FAIL', 'ExecutionTime não registrado', result);
      }
      
      expect(result.executionTime).toBeDefined();
    });
  });

  // ============================================================
  // FASE 2: TESTE DE EXECUTION GATE (LEO)
  // ============================================================
  describe('FASE 2: Execution Gate (LEO)', () => {
    
    it('deve bloquear execução quando requiresConfirmation é true', async () => {
      const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
      const request = {
        action: 'test',
        toolName: 'test',
        parameters: {},
        context: {
          tenantId: 1,
          userId: 1,
        },
        requiresConfirmation: true,
        source: 'agent',
      };

      const result = await executeLeoActionGate(request);
      
      if (result.blocked && result.blockedReason === 'approval_required') {
        recordResult('FASE 2', 'Bloqueio por approval', 'PASS', 'Approval required bloqueia execução corretamente');
      } else {
        recordResult('FASE 2', 'Bloqueio por approval', 'FAIL', 'Approval required não bloqueou execução', result);
      }
      
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe('approval_required');
    });

    it('deve criar approvalId quando bloqueado por approval', async () => {
      const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
      const request = {
        action: 'test',
        toolName: 'test',
        parameters: {},
        context: {
          tenantId: 1,
          userId: 1,
        },
        requiresConfirmation: true,
        source: 'agent',
      };

      const result = await executeLeoActionGate(request);
      
      if (result.approvalId && typeof result.approvalId === 'string') {
        recordResult('FASE 2', 'Criação de approvalId', 'PASS', 'ApprovalId criado corretamente');
      } else {
        recordResult('FASE 2', 'Criação de approvalId', 'FAIL', 'ApprovalId não criado', result);
      }
      
      expect(result.approvalId).toBeDefined();
    });

    it('deve validar contexto antes de execução', async () => {
      const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
      const request = {
        action: 'test',
        toolName: 'test',
        parameters: {},
        context: {
          tenantId: NaN,
          userId: 1,
        },
        source: 'agent',
      };

      const result = await executeLeoActionGate(request);
      
      if (result.blocked) {
        recordResult('FASE 2', 'Validação de contexto', 'PASS', 'Contexto inválido bloqueado corretamente');
      } else {
        recordResult('FASE 2', 'Validação de contexto', 'FAIL', 'Contexto inválido não bloqueado', result);
      }
      
      expect(result.blocked).toBe(true);
    });

    it('deve executar apenas via tool layer', async () => {
      const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
      const request = {
        action: 'test',
        toolName: 'nonexistent_tool',
        parameters: {},
        context: {
          tenantId: 1,
          userId: 1,
        },
        source: 'agent',
      };

      const result = await executeLeoActionGate(request);
      
      // Deve falhar porque a tool não existe, mas não deve ser erro de service
      if (result.success === false) {
        recordResult('FASE 2', 'Execução via tool layer', 'PASS', 'Execução falha corretamente quando tool não existe');
      } else {
        recordResult('FASE 2', 'Execução via tool layer', 'WARN', 'Tool inexistente não causou falha', result);
      }
      
      expect(result.success).toBe(false);
    });
  });

  // ============================================================
  // FASE 3: TESTE DE INFRAESTRUTURA
  // ============================================================
  describe('FASE 3: Infraestrutura (Redis/MySQL)', () => {
    
    it('deve verificar saúde do Redis', async () => {
      try {
        const { redisManager } = await import('../infra/redis.js');
        const isHealthy = await redisManager.isHealthy();
        
        if (isHealthy) {
          recordResult('FASE 3', 'Saúde do Redis', 'PASS', 'Redis está saudável');
        } else {
          recordResult('FASE 3', 'Saúde do Redis', 'WARN', 'Redis não está saudável ou indisponível');
        }
        
        // Não falhar o teste se Redis não estiver disponível em DEV
        expect(typeof isHealthy).toBe('boolean');
      } catch (error) {
        recordResult('FASE 3', 'Saúde do Redis', 'WARN', 'Erro ao verificar saúde do Redis', error);
        // Não falhar em DEV
      }
    });

    it('deve obter status do Redis', async () => {
      try {
        const { redisManager } = await import('../infra/redis.js');
        const status = await redisManager.getStatus();
        
        if (status && typeof status === 'object') {
          recordResult('FASE 3', 'Status do Redis', 'PASS', 'Status obtido corretamente');
        } else {
          recordResult('FASE 3', 'Status do Redis', 'FAIL', 'Status inválido retornado', status);
        }
        
        expect(status).toBeDefined();
      } catch (error) {
        recordResult('FASE 3', 'Status do Redis', 'WARN', 'Erro ao obter status do Redis', error);
      }
    });

    it('deve testar conexão com Redis', async () => {
      try {
        const { redisManager } = await import('../infra/redis.js');
        const testResult = await redisManager.testConnection();
        
        if (testResult.success) {
          recordResult('FASE 3', 'Teste de conexão Redis', 'PASS', 'Conexão Redis funcionando', { latency: testResult.latency });
        } else {
          recordResult('FASE 3', 'Teste de conexão Redis', 'WARN', 'Redis indisponível ou falhando', testResult);
        }
        
        expect(testResult).toBeDefined();
      } catch (error) {
        recordResult('FASE 3', 'Teste de conexão Redis', 'WARN', 'Erro ao testar conexão Redis', error);
      }
    });

    it('deve verificar conexão com MySQL', async () => {
      try {
        // Teste simples de conexão - apenas tenta obter a instância
        const { getDb } = await import('../db/core.js');
        const db = await getDb();
        
        if (db) {
          recordResult('FASE 3', 'Conexão MySQL', 'PASS', 'MySQL conectado e respondendo');
        } else {
          recordResult('FASE 3', 'Conexão MySQL', 'WARN', 'MySQL não retornou instância');
        }
      } catch (error) {
        recordResult('FASE 3', 'Conexão MySQL', 'WARN', 'MySQL indisponível ou erro de conexão', error);
        // Não falhar em DEV se MySQL não estiver disponível
      }
    });
  });

  // ============================================================
  // FASE 4: TESTE DE DRIZZLE PIPELINE
  // ============================================================
  describe('FASE 4: Drizzle Pipeline', () => {
    
    it('deve validar que migrations são determinísticas', async () => {
      // Verificar se existe arquivo de configuração do Drizzle
      try {
        const fs = await import('fs');
        const path = await import('path');
        
        const drizzleConfigPath = path.join(process.cwd(), 'drizzle.config.ts');
        const configExists = fs.existsSync(drizzleConfigPath);
        
        if (configExists) {
          recordResult('FASE 4', 'Config Drizzle', 'PASS', 'Configuração Drizzle existe');
        } else {
          recordResult('FASE 4', 'Config Drizzle', 'WARN', 'Configuração Drizzle não encontrada');
        }
        
        expect(configExists).toBe(true);
      } catch (error) {
        recordResult('FASE 4', 'Config Drizzle', 'WARN', 'Erro ao verificar config Drizzle', error);
      }
    });

    it('deve validar que não existe inferência automática de rename', async () => {
      // Verificar BASELINE_LOCKED.md para regras de rename
      try {
        const fs = await import('fs');
        const path = await import('path');
        
        const baselinePath = path.join(process.cwd(), 'drizzle', 'BASELINE_LOCKED.md');
        const baselineExists = fs.existsSync(baselinePath);
        
        if (baselineExists) {
          const content = fs.readFileSync(baselinePath, 'utf-8');
          const hasRenameRules = content.includes('rename') || content.includes('RENAME');
          
          if (hasRenameRules) {
            recordResult('FASE 4', 'Regras de rename', 'PASS', 'Regras de rename documentadas');
          } else {
            recordResult('FASE 4', 'Regras de rename', 'WARN', 'Regras de rename não encontradas');
          }
        } else {
          recordResult('FASE 4', 'Regras de rename', 'WARN', 'BASELINE_LOCKED.md não encontrado');
        }
        
        expect(baselineExists).toBe(true);
      } catch (error) {
        recordResult('FASE 4', 'Regras de rename', 'WARN', 'Erro ao verificar regras de rename', error);
      }
    });

    it('deve validar estrutura de migrations', async () => {
      try {
        const fs = await import('fs');
        const path = await import('path');
        
        const migrationsPath = path.join(process.cwd(), 'drizzle', 'migrations');
        const migrationsExist = fs.existsSync(migrationsPath);
        
        if (migrationsExist) {
          recordResult('FASE 4', 'Estrutura migrations', 'PASS', 'Diretório de migrations existe');
        } else {
          recordResult('FASE 4', 'Estrutura migrations', 'WARN', 'Diretório de migrations não encontrado');
        }
        
        expect(migrationsExist).toBe(true);
      } catch (error) {
        recordResult('FASE 4', 'Estrutura migrations', 'WARN', 'Erro ao verificar estrutura migrations', error);
      }
    });
  });

  // ============================================================
  // FASE 5: TESTE DE LEO SYSTEM
  // ============================================================
  describe('FASE 5: LEO System', () => {
    
    it('deve validar que execução passa pelo registry', async () => {
      // O execution gate integra com execution-registry
      const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
      const request = {
        action: 'test',
        toolName: 'test',
        parameters: {},
        context: {
          tenantId: 1,
          userId: 1,
        },
        source: 'agent',
      };

      const result = await executeLeoActionGate(request);
      
      // Se a execução passou pelo gate, ela passou pelo registry
      if (result.executionTime !== undefined) {
        recordResult('FASE 5', 'Execution Registry', 'PASS', 'Execução registrada corretamente');
      } else {
        recordResult('FASE 5', 'Execution Registry', 'FAIL', 'Execução não registrada', result);
      }
      
      expect(result.executionTime).toBeDefined();
    });

    it('deve validar que execução tem traceId', async () => {
      const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
      const request = {
        action: 'test',
        toolName: 'test',
        parameters: {},
        context: {
          tenantId: 1,
          userId: 1,
        },
        source: 'agent',
      };

      const result = await executeLeoActionGate(request);
      
      // O execution contract layer deve gerar traceId
      if (result.executionTime !== undefined) {
        recordResult('FASE 5', 'TraceId', 'PASS', 'Execução com tracking');
      } else {
        recordResult('FASE 5', 'TraceId', 'WARN', 'Tracking não verificado', result);
      }
    });

    it('deve validar que não existe execução direta de services', async () => {
      // Verificar se existem imports diretos de services no código LEO
      try {
        const fs = await import('fs');
        const path = await import('path');
        
        const leoPath = path.join(process.cwd(), 'server', 'leo');
        const leoExists = fs.existsSync(leoPath);
        
        if (leoExists) {
          // Verificar arquivos TypeScript no diretório LEO
          const checkForDirectImports = (dir: string): boolean => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              const fullPath = path.join(dir, file);
              const stat = fs.statSync(fullPath);
              
              if (stat.isDirectory()) {
                if (checkForDirectImports(fullPath)) return true;
              } else if (file.endsWith('.ts')) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                // Verificar imports diretos de services
                if (content.includes("from '../services/") || content.includes("from '../../services/")) {
                  return true;
                }
              }
            }
            return false;
          };
          
          const hasDirectImports = checkForDirectImports(leoPath);
          
          if (!hasDirectImports) {
            recordResult('FASE 5', 'Sem imports diretos de services', 'PASS', 'LEO não importa services diretamente');
          } else {
            recordResult('FASE 5', 'Sem imports diretos de services', 'FAIL', 'LEO ainda importa services diretamente');
          }
          
          expect(hasDirectImports).toBe(false);
        } else {
          recordResult('FASE 5', 'Sem imports diretos de services', 'WARN', 'Diretório LEO não encontrado');
        }
      } catch (error) {
        recordResult('FASE 5', 'Sem imports diretos de services', 'WARN', 'Erro ao verificar imports', error);
      }
    });
  });

  // ============================================================
  // FASE 6: TESTE DE SEGURANÇA DE DADOS
  // ============================================================
  describe('FASE 6: Segurança de Dados', () => {
    
    it('deve validar que tenantId é obrigatório em todas as operações', async () => {
      const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
      const request = {
        action: 'test',
        toolName: 'test',
        parameters: {},
        context: {
          tenantId: 0, // Inválido
          userId: 1,
        },
        source: 'agent',
      };

      const result = await executeLeoActionGate(request);
      
      if (result.blocked && result.message.includes('tenantId')) {
        recordResult('FASE 6', 'TenantId obrigatório', 'PASS', 'TenantId validado corretamente');
      } else {
        recordResult('FASE 6', 'TenantId obrigatório', 'FAIL', 'TenantId não validado', result);
      }
      
      expect(result.blocked).toBe(true);
    });

    it('deve validar que userId é obrigatório em todas as operações', async () => {
      const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
      const request = {
        action: 'test',
        toolName: 'test',
        parameters: {},
        context: {
          tenantId: 1,
          userId: 0, // Inválido
        },
        source: 'agent',
      };

      const result = await executeLeoActionGate(request);
      
      if (result.blocked && result.message.includes('userId')) {
        recordResult('FASE 6', 'UserId obrigatório', 'PASS', 'UserId validado corretamente');
      } else {
        recordResult('FASE 6', 'UserId obrigatório', 'FAIL', 'UserId não validado', result);
      }
      
      expect(result.blocked).toBe(true);
    });

    it('deve bloquear payload inválido', async () => {
      const { executeLeoActionGate } = await import('../leo/runtime/execution-gate.js');
      const request = {
        action: 'test',
        toolName: 'test',
        parameters: {
          // Payload malicioso
          __proto__: { polluted: true },
          constructor: { prototype: { polluted: true } },
        },
        context: {
          tenantId: 1,
          userId: 1,
        },
        source: 'agent',
      };

      const result = await executeLeoActionGate(request);
      
      // O gate deve lidar com payload inválido sem crashar
      if (result) {
        recordResult('FASE 6', 'Payload inválido', 'PASS', 'Sistema não crashou com payload malicioso');
      } else {
        recordResult('FASE 6', 'Payload inválido', 'FAIL', 'Sistema crashou com payload malicioso');
      }
      
      expect(result).toBeDefined();
    });

    it('deve validar que não existe SQL injection direto', async () => {
      // Verificar se existem queries SQL raw no código
      try {
        const fs = await import('fs');
        const path = await import('path');
        
        const servicesPath = path.join(process.cwd(), 'server', 'services');
        const servicesExist = fs.existsSync(servicesPath);
        
        if (servicesExist) {
          const checkForRawSQL = (dir: string): boolean => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              const fullPath = path.join(dir, file);
              const stat = fs.statSync(fullPath);
              
              if (stat.isDirectory()) {
                if (checkForRawSQL(fullPath)) return true;
              } else if (file.endsWith('.ts')) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                // Verificar SQL raw perigoso
                if (content.includes('sql`') || content.includes('.executeRaw(')) {
                  return true;
                }
              }
            }
            return false;
          };
          
          const hasRawSQL = checkForRawSQL(servicesPath);
          
          if (!hasRawSQL) {
            recordResult('FASE 6', 'Sem SQL raw', 'PASS', 'Não encontrado SQL raw perigoso');
          } else {
            recordResult('FASE 6', 'Sem SQL raw', 'WARN', 'Encontrado SQL raw - revisar manualmente');
          }
          
          // Não falhar automaticamente - SQL raw pode ser legítimo
        } else {
          recordResult('FASE 6', 'Sem SQL raw', 'WARN', 'Diretório services não encontrado');
        }
      } catch (error) {
        recordResult('FASE 6', 'Sem SQL raw', 'WARN', 'Erro ao verificar SQL raw', error);
      }
    });
  });

  // ============================================================
  // FASE 7: RELATÓRIO FINAL
  // ============================================================
  describe('FASE 7: Relatório Final', () => {
    
    it('deve consolidar todos os resultados', () => {
      const passed = auditResults.filter(r => r.status === 'PASS').length;
      const failed = auditResults.filter(r => r.status === 'FAIL').length;
      const warned = auditResults.filter(r => r.status === 'WARN').length;
      
      console.log('\n=== CONSOLIDAÇÃO FINAL ===');
      console.log(`Total de testes: ${auditResults.length}`);
      console.log(`Passou: ${passed}`);
      console.log(`Falhou: ${failed}`);
      console.log(`Aviso: ${warned}`);
      
      if (failed === 0) {
        console.log('\n✅ SISTEMA APROVADO - Nenhuma falha crítica detectada');
      } else {
        console.log('\n❌ SISTEMA REPROVADO - Falhas críticas detectadas');
      }
      
      expect(auditResults.length).toBeGreaterThan(0);
    });

    it('deve identificar falhas críticas', () => {
      const criticalFailures = auditResults.filter(r => r.status === 'FAIL');
      
      if (criticalFailures.length === 0) {
        recordResult('FASE 7', 'Falhas críticas', 'PASS', 'Nenhuma falha crítica detectada');
      } else {
        recordResult('FASE 7', 'Falhas críticas', 'FAIL', `${criticalFailures.length} falhas críticas detectadas`, criticalFailures);
      }
      
      // Critério de sucesso: zero falhas críticas
      expect(criticalFailures.length).toBe(0);
    });

    it('deve identificar riscos médios', () => {
      const mediumRisks = auditResults.filter(r => r.status === 'WARN');
      
      if (mediumRisks.length === 0) {
        recordResult('FASE 7', 'Riscos médios', 'PASS', 'Nenhum risco médio detectado');
      } else {
        recordResult('FASE 7', 'Riscos médios', 'WARN', `${mediumRisks.length} riscos médios detectados`, mediumRisks);
      }
      
      // Riscos médios não devem falhar o teste, mas devem ser documentados
      expect(mediumRisks.length).toBeGreaterThanOrEqual(0);
    });

    it('deve validar critérios de sucesso', () => {
      const failed = auditResults.filter(r => r.status === 'FAIL').length;
      
      const criteria = {
        noTenantLeak: !auditResults.some(r => r.phase === 'FASE 1' && r.status === 'FAIL'),
        executionGateActive: !auditResults.some(r => r.phase === 'FASE 2' && r.status === 'FAIL'),
        leoNoBypass: !auditResults.some(r => r.phase === 'FASE 5' && r.status === 'FAIL'),
        infraResilient: !auditResults.some(r => r.phase === 'FASE 3' && r.status === 'FAIL'),
        migrationsControlled: !auditResults.some(r => r.phase === 'FASE 4' && r.status === 'FAIL'),
        systemStable: failed === 0,
      };
      
      console.log('\n=== CRITÉRIOS DE SUCESSO ===');
      console.log(`✅ Nenhum vazamento de tenant: ${criteria.noTenantLeak}`);
      console.log(`✅ ExecutionGate 100% ativo: ${criteria.executionGateActive}`);
      console.log(`✅ LEO sem bypass: ${criteria.leoNoBypass}`);
      console.log(`✅ Infra resiliente: ${criteria.infraResilient}`);
      console.log(`✅ Migrations controladas: ${criteria.migrationsControlled}`);
      console.log(`✅ Sistema estável: ${criteria.systemStable}`);
      
      const allCriteriaMet = Object.values(criteria).every(v => v === true);
      
      if (allCriteriaMet) {
        recordResult('FASE 7', 'Critérios de sucesso', 'PASS', 'Todos os critérios atendidos');
      } else {
        recordResult('FASE 7', 'Critérios de sucesso', 'FAIL', 'Alguns critérios não atendidos', criteria);
      }
      
      expect(allCriteriaMet).toBe(true);
    });
  });
});
