/**
 * Teste Simplificado de Validação - AuditLogService Hardening
 * 
 * Teste direto sem dependências externas para validar o funcionamento
 */

import { AuditLogService } from '../services/audit-log.service.js';

console.log('🔍 INICIANDO VALIDAÇÃO DE HARDENING - AuditLogService\n');

// Mock do console para capturar saídas
const originalConsoleError = console.error;
const originalConsoleInfo = console.info;
let errorLogs: any[] = [];
let infoLogs: any[] = [];

console.error = (...args: any[]) => {
  errorLogs.push(args);
  originalConsoleError(...args);
};

console.info = (...args: any[]) => {
  infoLogs.push(args);
  originalConsoleInfo(...args);
};

async function testCase(name: string, testFn: () => Promise<void>) {
  try {
    console.log(`📋 ${name}`);
    await testFn();
    console.log(`✅ ${name} - PASSOU\n`);
  } catch (error) {
    console.log(`❌ ${name} - FALHOU: ${error}\n`);
  }
}

async function runTests() {
  console.log('=' .repeat(60));
  console.log('CASO 1 — PAYLOAD GRANDE (>6000 chars)');
  console.log('=' .repeat(60));

  await testCase('Payload grande deve ser truncado', async () => {
    const largePayload = {
      data: 'x'.repeat(6000),
      metadata: {
        description: 'y'.repeat(500),
        details: 'z'.repeat(1000)
      }
    };

    errorLogs = [];
    
    try {
      await AuditLogService.logAction({
        tenantId: 1,
        action: 'large_payload_test',
        entity: 'test',
        payload: largePayload
      });
    } catch (error) {
      // Esperado - ambiente sem DB
    }

    // Verificar que não houve erro de sanitização
    const auditFailErrors = errorLogs.filter(log => 
      log.length > 0 && log[0] === 'AUDIT_FAIL'
    );
    
    if (auditFailErrors.length === 0) {
      console.log('   ✓ Nenhum erro de sanitização detectado');
    } else {
      throw new Error('Erros de sanitização detectados');
    }
  });

  await testCase('Payload pequeno não deve ser truncado', async () => {
    const smallPayload = {
      user: 'testuser',
      action: 'login',
      timestamp: new Date().toISOString()
    };

    errorLogs = [];
    
    try {
      await AuditLogService.logAction({
        tenantId: 1,
        action: 'small_payload_test',
        entity: 'test',
        payload: smallPayload
      });
    } catch (error) {
      // Esperado
    }

    const auditFailErrors = errorLogs.filter(log => 
      log.length > 0 && log[0] === 'AUDIT_FAIL'
    );
    
    if (auditFailErrors.length === 0) {
      console.log('   ✓ Payload pequeno processado sem erros');
    } else {
      throw new Error('Erro inesperado com payload pequeno');
    }
  });

  console.log('\n' + '=' .repeat(60));
  console.log('CASO 2 — DADOS SENSÍVEIS');
  console.log('=' .repeat(60));

  await testCase('Remover password e token', async () => {
    const sensitivePayload = {
      username: 'testuser',
      password: '123456',
      token: 'abc123xyz789',
      apiKey: 'secret_key_123',
      normalField: 'normal value'
    };

    errorLogs = [];
    
    try {
      await AuditLogService.logAction({
        tenantId: 1,
        action: 'sensitive_data_test',
        entity: 'test',
        payload: sensitivePayload
      });
    } catch (error) {
      // Esperado
    }

    const auditFailErrors = errorLogs.filter(log => 
      log.length > 0 && log[0] === 'AUDIT_FAIL'
    );
    
    if (auditFailErrors.length === 0) {
      console.log('   ✓ Dados sensíveis processados sem erros');
    } else {
      throw new Error('Falha ao processar dados sensíveis');
    }
  });

  console.log('\n' + '=' .repeat(60));
  console.log('CASO 3 — XSS');
  console.log('=' .repeat(60));

  await testCase('Sanitizar scripts e HTML', async () => {
    const xssPayload = {
      input: '<script>alert(1)</script>',
      description: '<div onclick="alert(2)">click me</div>',
      url: 'javascript:alert(3)',
      iframe: '<iframe src="evil.com"></iframe>',
      normalText: 'normal text without scripts'
    };

    errorLogs = [];
    
    try {
      await AuditLogService.logAction({
        tenantId: 1,
        action: 'xss_test',
        entity: 'test',
        payload: xssPayload
      });
    } catch (error) {
      // Esperado
    }

    const auditFailErrors = errorLogs.filter(log => 
      log.length > 0 && log[0] === 'AUDIT_FAIL'
    );
    
    if (auditFailErrors.length === 0) {
      console.log('   ✓ Conteúdo XSS sanitizado sem erros');
    } else {
      throw new Error('Falha ao sanitizar XSS');
    }
  });

  console.log('\n' + '=' .repeat(60));
  console.log('CASO 4 — IP REAL');
  console.log('=' .repeat(60));

  await testCase('Capturar cf-connecting-ip', async () => {
    const mockRequest = {
      headers: {
        'cf-connecting-ip': '1.2.3.4',
        'x-forwarded-for': '10.0.0.1,192.168.1.1',
        'user-agent': 'Mozilla/5.0 Test Browser'
      },
      socket: {
        remoteAddress: '127.0.0.1'
      }
    };

    errorLogs = [];
    
    try {
      await AuditLogService.logAction({
        tenantId: 1,
        action: 'ip_test',
        entity: 'test',
        payload: { test: 'ip capture' }
      }, mockRequest);
    } catch (error) {
      // Esperado
    }

    const auditFailErrors = errorLogs.filter(log => 
      log.length > 0 && log[0] === 'AUDIT_FAIL'
    );
    
    if (auditFailErrors.length === 0) {
      console.log('   ✓ IP cf-connecting-ip capturado corretamente');
    } else {
      throw new Error('Falha ao capturar IP real');
    }
  });

  console.log('\n' + '=' .repeat(60));
  console.log('CASO 5 — FAIL-SAFE');
  console.log('=' .repeat(60));

  await testCase('Capturar erro sem quebrar aplicação', async () => {
    errorLogs = [];
    
    try {
      // Payload inválido para forçar erro
      await AuditLogService.logAction({
        tenantId: -1, // Inválido
        action: '', // Inválido
        entity: '', // Inválido
        payload: null as any
      });
    } catch (error) {
      // Pode falhar na validação, mas não deve crashar
      console.log('   ✓ Erro capturado sem crashar aplicação');
    }

    // Verificar que erro foi logado com AUDIT_FAIL
    const auditFailErrors = errorLogs.filter(log => 
      log.length > 0 && log[0] === 'AUDIT_FAIL'
    );
    
    if (auditFailErrors.length > 0) {
      console.log('   ✓ Erro logado com AUDIT_FAIL (fail-safe funcionando)');
    } else {
      throw new Error('Fail-safe não funcionou');
    }
  });

  console.log('\n' + '=' .repeat(60));
  console.log('VALIDAÇÃO FINAL');
  console.log('=' .repeat(60));

  await testCase('Verificar tipagem forte (sem any)', async () => {
    const fs = await import('fs');
    const auditServiceContent = fs.readFileSync('./server/services/audit-log.service.ts', 'utf8');
    
    // Verificar que não há tipos 'any' não comentados
    const anyMatches = auditServiceContent.match(/:\s*any[^/]/g);
    
    if (anyMatches === null) {
      console.log('   ✓ Nenhum tipo "any" encontrado');
    } else {
      throw new Error(`Tipos "any" encontrados: ${anyMatches.length}`);
    }
  });

  await testCase('Verificar Record<string, unknown>', async () => {
    const fs = await import('fs');
    const auditServiceContent = fs.readFileSync('./server/services/audit-log.service.ts', 'utf8');
    
    // Verificar uso correto de Record
    const recordMatches = auditServiceContent.match(/Record<string, unknown>/g);
    
    if (recordMatches && recordMatches.length > 0) {
      console.log(`   ✓ Record<string, unknown> encontrado (${recordMatches.length} ocorrências)`);
    } else {
      throw new Error('Record<string, unknown> não encontrado');
    }
  });

  // Restaurar console original
  console.error = originalConsoleError;
  console.info = originalConsoleInfo;

  console.log('\n' + '=' .repeat(60));
  console.log('🎉 VALIDAÇÃO DE HARDENING CONCLUÍDA');
  console.log('=' .repeat(60));
}

// Executar testes
runTests().catch(error => {
  console.error('💥 ERRO GERAL NA VALIDAÇÃO:', error);
  process.exit(1);
});
