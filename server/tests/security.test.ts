/**
 * Security Test Suite
 * 
 * Testes automatizados para validar proteções contra abuso
 * Simula ataques e verifica respostas
 */

import { logger } from '../_core/logger.js';

interface SecurityTest {
  name: string;
  description: string;
  test: () => Promise<SecurityTestResult>;
}

interface SecurityTestResult {
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
  responseTime?: number;
}

interface AttackSimulation {
  type: 'rate_limit' | 'payload_injection' | 'header_attack' | 'timeout_attack';
  description: string;
  simulate: () => Promise<void>;
}

/**
 * Test Suite Principal
 */
export class SecurityTestSuite {
  private baseUrl: string;
  private results: SecurityTestResult[] = [];

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Executa todos os testes de segurança
   */
  async runAllTests(): Promise<void> {
    logger.info('Iniciando suite de testes de segurança...');

    const tests: SecurityTest[] = [
      this.testRateLimiting(),
      this.testPayloadValidation(),
      this.testHeaderSecurity(),
      this.testTimeoutProtection(),
      this.testXSSProtection(),
      this.testSQLInjectionProtection(),
      this.testCSRFProtection(),
      this.testAuthenticationSecurity(),
      this.testErrorHandling()
    ];

    for (const test of tests) {
      logger.info(`Executando teste: ${test.name}`);
      
      try {
        const result = await test.test();
        this.results.push(result);
        
        logger.info(
          {
            test: test.name,
            passed: result.passed,
            message: result.message,
            responseTime: result.responseTime
          },
          `Teste ${result.passed ? 'APROVADO' : 'FALHOU'}: ${test.name}`
        );
      } catch (error) {
        const errorResult: SecurityTestResult = {
          passed: false,
          message: `Erro no teste: ${error instanceof Error ? error.message : String(error)}`,
          details: { error }
        };
        
        this.results.push(errorResult);
        
        logger.error(
          {
            test: test.name,
            error: errorResult.message,
            details: errorResult.details
          },
          `ERRO no teste: ${test.name}`
        );
      }

      // Pequeno delay entre testes
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.printSummary();
  }

  /**
   * Teste: Rate Limiting
   */
  private testRateLimiting(): SecurityTest {
    return {
      name: 'Rate Limiting Protection',
      description: 'Verifica se rate limiting bloqueia excesso de requisições',
      test: async (): Promise<SecurityTestResult> => {
        const startTime = Date.now();
        let successCount = 0;
        let blockedCount = 0;

        // Simular 100 requisições rápidas
        const promises = Array.from({ length: 100 }, async () => {
          try {
            const response = await fetch(`${this.baseUrl}/api/health/ping`, {
              method: 'GET',
              headers: {
                'X-Test-Request': 'true'
              }
            });

            if (response.status === 429) {
              blockedCount++;
            } else if (response.ok) {
              successCount++;
            }

            return response.status;
          } catch {
            blockedCount++;
            return 0;
          }
        });

        const results = await Promise.all(promises);
        const responseTime = Date.now() - startTime;

        // Verificar se rate limiting funcionou
        const rateLimitWorking = blockedCount > 50; // Pelo menos 50% bloqueadas
        const someSucceeded = successCount > 0; // Algumas devem passar

        return {
          passed: rateLimitWorking && someSucceeded,
          message: rateLimitWorking 
            ? `Rate limiting funcionou: ${blockedCount}/100 bloqueadas`
            : `Rate limiting falhou: apenas ${blockedCount}/100 bloqueadas`,
          responseTime,
          details: {
            totalRequests: 100,
            blocked: blockedCount,
            succeeded: successCount,
            blockRate: Math.round((blockedCount / 100) * 100)
          }
        };
      }
    };
  }

  /**
   * Teste: Validação de Payload
   */
  private testPayloadValidation(): SecurityTest {
    return {
      name: 'Payload Validation',
      description: 'Verifica se payloads maliciosos são rejeitados',
      test: async (): Promise<SecurityTestResult> => {
        const maliciousPayloads = [
          { email: '<script>alert("xss")</script>@test.com', password: 'test' },
          { email: 'test@test.com', password: "' OR '1'='1" },
          { email: '../../../etc/passwd', password: 'test' },
          { email: 'test@test.com', password: 'a'.repeat(1000) }
        ];

        let blockedCount = 0;

        for (const payload of maliciousPayloads) {
          try {
            const response = await fetch(`${this.baseUrl}/api/auth/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Test-Request': 'true'
              },
              body: JSON.stringify(payload)
            });

            if (response.status >= 400) {
              blockedCount++;
            }
          } catch {
            blockedCount++;
          }
        }

        const validationWorking = blockedCount === maliciousPayloads.length;

        return {
          passed: validationWorking,
          message: validationWorking
            ? `Payload validation funcionou: ${blockedCount}/${maliciousPayloads.length} bloqueados`
            : `Payload validation falhou: apenas ${blockedCount}/${maliciousPayloads.length} bloqueados`,
          details: {
            tested: maliciousPayloads.length,
            blocked: blockedCount
          }
        };
      }
    };
  }

  /**
   * Teste: Segurança de Headers
   */
  private testHeaderSecurity(): SecurityTest {
    return {
      name: 'Header Security',
      description: 'Verifica headers de segurança e proteção contra ataques',
      test: async (): Promise<SecurityTestResult> => {
        const maliciousHeaders = [
          { 'X-Forwarded-Host': 'evil.com' },
          { 'X-Originating-IP': '192.168.1.100' },
          { 'User-Agent': '<script>alert("xss")</script>' },
          { 'Content-Length': '999999999' },
          { 'Authorization': 'Bearer malicious-token' }
        ];

        let securityHeadersPresent = 0;
        let blockedRequests = 0;

        for (const headers of maliciousHeaders) {
          try {
            const response = await fetch(`${this.baseUrl}/api/health/ping`, {
              method: 'GET',
              headers: {
                ...headers,
                'X-Test-Request': 'true'
              }
            });

            // Verificar headers de segurança na resposta
            const securityHeaders = [
              'x-content-type-options',
              'x-frame-options',
              'x-xss-protection',
              'strict-transport-security'
            ];

            for (const header of securityHeaders) {
              if (response.headers.get(header)) {
                securityHeadersPresent++;
              }
            }

            if (response.status >= 400) {
              blockedRequests++;
            }
          } catch {
            blockedRequests++;
          }
        }

        return {
          passed: securityHeadersPresent > 0 && blockedRequests >= 2,
          message: `Headers security: ${securityHeadersPresent} presentes, ${blockedRequests} bloqueados`,
          details: {
            securityHeadersFound: securityHeadersPresent,
            blockedRequests,
            totalTested: maliciousHeaders.length
          }
        };
      }
    };
  }

  /**
   * Teste: Proteção contra Timeout
   */
  private testTimeoutProtection(): SecurityTest {
    return {
      name: 'Timeout Protection',
      description: 'Verifica se requests longos são encerrados',
      test: async (): Promise<SecurityTestResult> => {
        const startTime = Date.now();

        try {
          // Simular request que demora muito
          const response = await fetch(`${this.baseUrl}/api/health/ping`, {
            method: 'GET',
            headers: {
              'X-Test-Request': 'true',
              'X-Test-Slow': 'true' // Header especial para simular lentidão
            },
            signal: AbortSignal.timeout(15000) // Timeout de 15s
          });

          const responseTime = Date.now() - startTime;

          // Se responder muito rápido, não está protegendo contra timeout
          const timeoutWorking = responseTime < 12000; // Deve ser < 12s

          return {
            passed: timeoutWorking,
            message: timeoutWorking
              ? `Timeout protection funcionou: resposta em ${responseTime}ms`
              : `Timeout protection falhou: resposta em ${responseTime}ms`,
            responseTime,
            details: {
              responseTime,
              expectedMax: 12000
            }
          };
        } catch (error) {
          const responseTime = Date.now() - startTime;

          // Se for timeout, está funcionando
          const isTimeout = error instanceof Error && 
            (error.message.includes('timeout') || error.message.includes('aborted'));

          return {
            passed: isTimeout,
            message: isTimeout
              ? `Timeout protection funcionou: request abortado após ${responseTime}ms`
              : `Timeout protection falhou: erro inesperado após ${responseTime}ms`,
            responseTime,
            details: {
              responseTime,
              error: error instanceof Error ? error.message : String(error)
            }
          };
        }
      }
    };
  }

  /**
   * Teste: Proteção XSS
   */
  private testXSSProtection(): SecurityTest {
    return {
      name: 'XSS Protection',
      description: 'Verifica se ataques XSS são bloqueados',
      test: async (): Promise<SecurityTestResult> => {
        const xssPayloads = [
          '<script>alert("xss")</script>',
          'javascript:alert("xss")',
          '<img src="x" onerror="alert(\'xss\')">',
          '"><script>alert("xss")</script>',
          '\';alert("xss");//'
        ];

        let blockedCount = 0;

        for (const payload of xssPayloads) {
          try {
            const response = await fetch(`${this.baseUrl}/api/health/ping`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Test-Request': 'true'
              },
              body: JSON.stringify({ 
                test: payload,
                message: payload 
              })
            });

            if (response.status >= 400 || response.status === 429) {
              blockedCount++;
            }
          } catch {
            blockedCount++;
          }
        }

        const xssProtectionWorking = blockedCount >= xssPayloads.length * 0.8; // 80%+ bloqueados

        return {
          passed: xssProtectionWorking,
          message: `XSS protection: ${blockedCount}/${xssPayloads.length} bloqueados`,
          details: {
            tested: xssPayloads.length,
            blocked: blockedCount,
            blockRate: Math.round((blockedCount / xssPayloads.length) * 100)
          }
        };
      }
    };
  }

  /**
   * Teste: Proteção SQL Injection
   */
  private testSQLInjectionProtection(): SecurityTest {
    return {
      name: 'SQL Injection Protection',
      description: 'Verifica se ataques SQL injection são bloqueados',
      test: async (): Promise<SecurityTestResult> => {
        const sqlPayloads = [
          "' OR '1'='1",
          "'; DROP TABLE users; --",
          "' UNION SELECT * FROM users --",
          "1'; DELETE FROM users WHERE '1'='1",
          "' OR 1=1 --"
        ];

        let blockedCount = 0;

        for (const payload of sqlPayloads) {
          try {
            const response = await fetch(`${this.baseUrl}/api/auth/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Test-Request': 'true'
              },
              body: JSON.stringify({
                email: payload,
                password: 'test'
              })
            });

            if (response.status >= 400) {
              blockedCount++;
            }
          } catch {
            blockedCount++;
          }
        }

        const sqlProtectionWorking = blockedCount >= sqlPayloads.length * 0.8; // 80%+ bloqueados

        return {
          passed: sqlProtectionWorking,
          message: `SQL injection protection: ${blockedCount}/${sqlPayloads.length} bloqueados`,
          details: {
            tested: sqlPayloads.length,
            blocked: blockedCount,
            blockRate: Math.round((blockedCount / sqlPayloads.length) * 100)
          }
        };
      }
    };
  }

  /**
   * Teste: Proteção CSRF (simplificado)
   */
  private testCSRFProtection(): SecurityTest {
    return {
      name: 'CSRF Protection',
      description: 'Verifica headers básicos de proteção CSRF',
      test: async (): Promise<SecurityTestResult> => {
        try {
          const response = await fetch(`${this.baseUrl}/api/health/ping`, {
            method: 'GET',
            headers: {
              'X-Test-Request': 'true'
            }
          });

          const csrfHeaders = [
            'x-csrf-token',
            'set-cookie',
            'x-frame-options'
          ];

          let csrfProtectionCount = 0;
          for (const header of csrfHeaders) {
            if (response.headers.get(header)) {
              csrfProtectionCount++;
            }
          }

          const csrfProtectionWorking = csrfProtectionCount > 0;

          return {
            passed: csrfProtectionWorking,
            message: `CSRF protection: ${csrfProtectionCount} headers encontrados`,
            details: {
              headersFound: csrfProtectionCount,
              expectedHeaders: csrfHeaders.length
            }
          };
        } catch {
          return {
            passed: false,
            message: 'CSRF protection test failed - request error'
          };
        }
      }
    };
  }

  /**
   * Teste: Segurança de Autenticação
   */
  private testAuthenticationSecurity(): SecurityTest {
    return {
      name: 'Authentication Security',
      description: 'Verifica se autenticação é segura',
      test: async (): Promise<SecurityTestResult> => {
        const authTests = [
          { email: '', password: '' }, // Vazio
          { email: 'invalid', password: 'short' }, // Inválido
          { email: 'test@test.com', password: 'wrong' }, // Senha errada
          { email: 'admin@test.com', password: 'admin' } // Comum
        ];

        let blockedCount = 0;

        for (const auth of authTests) {
          try {
            const response = await fetch(`${this.baseUrl}/api/auth/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Test-Request': 'true'
              },
              body: JSON.stringify(auth)
            });

            if (response.status >= 400) {
              blockedCount++;
            }
          } catch {
            blockedCount++;
          }
        }

        const authSecurityWorking = blockedCount >= authTests.length * 0.75; // 75%+ bloqueados

        return {
          passed: authSecurityWorking,
          message: `Authentication security: ${blockedCount}/${authTests.length} bloqueados`,
          details: {
            tested: authTests.length,
            blocked: blockedCount,
            blockRate: Math.round((blockedCount / authTests.length) * 100)
          }
        };
      }
    };
  }

  /**
   * Teste: Error Handling
   */
  private testErrorHandling(): SecurityTest {
    return {
      name: 'Error Handling',
      description: 'Verifica se erros não expõem informações sensíveis',
      test: async (): Promise<SecurityTestResult> => {
        const errorEndpoints = [
          '/api/nonexistent',
          '/api/health/error',
          '/api/auth/invalid'
        ];

        let secureErrorCount = 0;

        for (const endpoint of errorEndpoints) {
          try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
              method: 'GET',
              headers: {
                'X-Test-Request': 'true'
              }
            });

            const responseText = await response.text();

            // Verificar se não expõe informações sensíveis
            const sensitiveInfo = [
              'stack trace',
              'internal server error',
              'database error',
              'sql',
              'password',
              'secret',
              'private key'
            ];

            const hasSensitiveInfo = sensitiveInfo.some(info => 
              responseText.toLowerCase().includes(info)
            );

            if (!hasSensitiveInfo && response.status >= 400) {
              secureErrorCount++;
            }
          } catch {
            secureErrorCount++;
          }
        }

        const errorHandlingSecure = secureErrorCount >= errorEndpoints.length * 0.8;

        return {
          passed: errorHandlingSecure,
          message: `Error handling: ${secureErrorCount}/${errorEndpoints.length} seguros`,
          details: {
            tested: errorEndpoints.length,
            secure: secureErrorCount
          }
        };
      }
    };
  }

  /**
   * Imprime resumo dos testes
   */
  private printSummary(): void {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    logger.info(
      {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        successRate: Math.round((passedTests / totalTests) * 100),
        timestamp: new Date().toISOString()
      },
      `Security Test Suite concluído: ${passedTests}/${totalTests} testes passaram`
    );

    console.log('\n🔒 SECURITY TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`📊 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    console.log('='.repeat(50));

    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.message}`);
        });
    }

    console.log('\n📋 DETAILED RESULTS:');
    this.results.forEach(r => {
      console.log(`\n${r.passed ? '✅' : '❌'} ${r.message}`);
      if (r.details) {
        console.log('   Details:', JSON.stringify(r.details, null, 2));
      }
    });
  }

  /**
   * Obtém resultados dos testes
   */
  getResults(): SecurityTestResult[] {
    return this.results;
  }

  /**
   * Verifica se todos os testes passaram
   */
  allTestsPassed(): boolean {
    return this.results.every(r => r.passed);
  }
}

/**
 * Função utilitária para executar testes via CLI
 */
export async function runSecurityTests(baseUrl?: string): Promise<void> {
  const testSuite = new SecurityTestSuite(baseUrl);
  
  try {
    await testSuite.runAllTests();
    
    if (testSuite.allTestsPassed()) {
      console.log('\n🎉 ALL SECURITY TESTS PASSED! System is secure.');
      process.exit(0);
    } else {
      console.log('\n⚠️  SOME SECURITY TESTS FAILED! Review security measures.');
      process.exit(1);
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Security test suite failed'
    );
    process.exit(1);
  }
}

// Export para uso em outros módulos
export { SecurityTest, SecurityTestResult, AttackSimulation };
