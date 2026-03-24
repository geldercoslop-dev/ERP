#!/usr/bin/env node
/**
 * TESTE DE CONCORRÊNCIA - 10 REQUISIÇÕES SIMULTÂNEAS
 * ⚙️ Backend Architect
 * 
 * Objetivo:
 * ✅ Enviar 10 requests simultâneos para criar o MESMO pedido
 * ✅ Verificar que APENAS 1 pedido foi criado
 * ✅ Verificar que 9 receberam "duplicata" ou "já existe"
 * ✅ Validar que não há duplicação mesmo com race condition
 */

const http = require('http');
const { nanoid } = require('nanoid');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(color, label, msg = '') {
  const time = new Date().toLocaleTimeString('pt-BR');
  console.log(`${colors[color]}[${time}] ${label}${colors.reset} ${msg}`);
}

function request(url, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const duration = Date.now() - startTime;
        resolve({
          status: res.statusCode,
          duration,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function main() {
  log('bright', '═══════════════════════════════════════════════════════════════');
  log('bright', '🔥 TESTE DE CONCORRÊNCIA - 10 REQUISIÇÕES SIMULTÂNEAS');
  log('bright', '═══════════════════════════════════════════════════════════════');

  const baseUrl = process.env.API_URL || 'http://localhost:3006';
  const requestId = nanoid(16); // ID único para todo este teste

  log('cyan', '\n▶ SETUP');
  log('green', '  • Base URL:', baseUrl);
  log('green', '  • RequestID (mesmo para todos):', requestId);
  log('green', '  • Total de requisições: 10');
  log('green', '  • Simultaneidade: 100% paralela');

  // Dados do pedido (mesmo para todos)
  const pedidoData = {
    cliente: {
      nome: 'CLIENTE TESTE CONCORRÊNCIA',
      telefone: '11999999999',
    },
    subtotal: 1000.00,
    desconto: 0,
    frete: 50.00,
    total: 1050.00,
    itens: [
      {
        tipo: 'LIVRE',
        descricao: 'Produto Test Concorrência',
        quantidade: 1,
        valorUnitario: 1000.00,
        custo: 0,
        prazoGarantia: 0,
      },
    ],
    idempotencyKey: requestId,
  };

  log('cyan', '\n▶ FASE 1: Enviar 10 requisições SIMULTÂNEAS');

  const startTime = Date.now();
  const startPhase = Date.now();

  // Criar 10 promises simultâneas
  const promises = Array(10)
    .fill(0)
    .map(async (_, i) => {
      const reqStart = Date.now();
      try {
        const result = await request(`${baseUrl}/api/trpc/pedidos.createVenda`, 'POST', pedidoData);
        const duration = Date.now() - reqStart;

        return {
          index: i + 1,
          status: result.status,
          duration,
          success: result.status === 200,
          body: result.body,
        };
      } catch (e) {
        const duration = Date.now() - reqStart;
        return {
          index: i + 1,
          status: 0,
          duration,
          success: false,
          error: (e).message,
        };
      }
    });

  // Executar TODAS em paralelo
  const results = await Promise.allSettled(promises);
  const phaseTime = Date.now() - startPhase;

  log('green', `  ✔ Todas 10 requisições enviadas em ${phaseTime}ms`);

  // Processar resultados
  log('cyan', '\n▶ FASE 2: Analisar Resultados');

  let successCount = 0;
  let conflictCount = 0;
  let errorCount = 0;
  let pedidosCriados = [];
  let pedidosDuplicata = [];
  const latencies = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    if (result.status === 'fulfilled') {
      const r = result.value;
      latencies.push(r.duration);

      log('cyan', `\n  Requisição ${r.index}:`);
      log('green', `    Status HTTP: ${r.status}`);
      log('green', `    Latência: ${r.duration}ms`);

      if (r.success) {
        try {
          const body = JSON.parse(r.body);
          
          // Trata resposta TRPC
          if (body.result?.data?.pedidoId) {
            successCount++;
            const pedidoId = body.result.data.pedidoId;
            const numero = body.result.data.numero;
            
            log('green', `    ✅ SUCESSO: Pedido #${numero} (ID: ${pedidoId})`);
            
            pedidosCriados.push({ index: r.index, pedidoId, numero });
          } else if (body.error?.code === 'CONFLICT') {
            conflictCount++;
            log('yellow', `    ⚠️  DUPLICATA: ${body.error.message}`);
            
            // Extrair número do erro
            const match = body.error.message.match(/#(\d+)/);
            if (match) {
              pedidosDuplicata.push({ index: r.index, numero: parseInt(match[1]) });
            }
          } else if (body.error) {
            errorCount++;
            log('red', `    ❌ ERRO: ${body.error.message || body.error.code}`);
          } else {
            successCount++;
            log('green', `    ✅ SUCESSO (resposta completa)`);
          }
        } catch (e) {
          errorCount++;
          log('red', `    ❌ Erro ao parsear resposta`);
        }
      } else {
        errorCount++;
        log('red', `    ❌ FALHA HTTP ${r.status}`);
      }
    } else {
      errorCount++;
      log('red', `  Requisição ${i + 1}:`);
      log('red', `    ❌ Promise rejeitada: ${(result.reason).message}`);
    }
  }

  // ANÁLISE FINAL
  log('bright', '\n═══════════════════════════════════════════════════════════════');
  log('bright', '📊 RESULTADO FINAL');
  log('bright', '═══════════════════════════════════════════════════════════════');

  const totalTime = Date.now() - startTime;

  log('bright', '\nESTATÍSTICAS:');
  log('green', `  • Total de requisições: 10`);
  log('green', `  • Tempo total: ${totalTime}ms`);
  log('green', `  • Latência mín: ${Math.min(...latencies)}ms`);
  log('green', `  • Latência máx: ${Math.max(...latencies)}ms`);
  log('green', `  • Latência média: ${(latencies.reduce((a, b) => a + b) / latencies.length).toFixed(0)}ms`);

  log('bright', '\nRESULTADOS:');
  log('green', `  • Pedidos criados: ${pedidosCriados.length}/10`);

  if (pedidosCriados.length > 0) {
    log('green', `    Detalhes:`);
    pedidosCriados.forEach((p) => {
      log('green', `      - Requisição ${p.index}: Pedido #${p.numero} (ID: ${p.pedidoId})`);
    });
  }

  log('yellow', `  • Conflitos (já existe): ${conflictCount}/10`);

  if (pedidosDuplicata.length > 0) {
    log('yellow', `    Detalhes:`);
    pedidosDuplicata.forEach((p) => {
      log('yellow', `      - Requisição ${p.index}: Tentou, mas pedido #${p.numero} já existia`);
    });
  }

  log('red', `  • Erros: ${errorCount}/10`);

  // CRITÉRIO DE SUCESSO
  log('bright', '\n🎯 CRITÉRIO DE ACEITAÇÃO:');

  const uniquePedidos = new Set(
    [...pedidosCriados.map((p) => p.numero), ...pedidosDuplicata.map((p) => p.numero)].filter((n) => n)
  );
  const apenasUmPedido = uniquePedidos.size === 1;
  const nenhmaAtualmente = uniquePedidos.size === 0;

  if (apenasUmPedido) {
    log('green', `  ✅ APENAS 1 PEDIDO CRIADO (protegido contra duplicação)`);
    log('green', `     Pedido número: ${Array.from(uniquePedidos)[0]}`);
  } else if (nenhmaAtualmente) {
    log('yellow', `  ⚠️  Nenhum pedido foi criado (pode ser erro de autenticação ou API offline)`);
  } else {
    log('red', `  ❌ MÚLTIPLOS PEDIDOS CRIADOS (${uniquePedidos.size} pedidos)`);
    log('red', `     Números: ${Array.from(uniquePedidos).join(', ')}`);
  }

  if (pedidosCriados.length + conflictCount === 10) {
    log('green', `  ✅ TODAS 10 REQUISIÇÕES RESPONDERAM`);
  } else {
    log('yellow', `  ⚠️  Apenas ${pedidosCriados.length + conflictCount + errorCount}/10 responderam`);
  }

  if (conflictCount === 9 && pedidosCriados.length === 1) {
    log('green', `  ✅ PADRÃO ESPERADO: 1 sucesso + 9 conflitos`);
  } else if (conflictCount >= 5 && pedidosCriados.length >= 1) {
    log('yellow', `  ⚠️  Padrão aceitável: alguns conflitos detectados`);
  }

  // RESUMO FINAL
  log('bright', '\n═══════════════════════════════════════════════════════════════');

  if (apenasUmPedido && pedidosCriados.length + conflictCount === 10) {
    log('green', '✅ TESTE PASSADO - SISTEMA À PROVA DE DUPLICAÇÃO');
    log('green', '\n📋 CONCLUSÃO:');
    log('green', '  • 10 requisições simultâneas');
    log('green', '  • 1 pedido criado');
    log('green', '  • 9 rejeitadas como duplicata');
    log('green', '  • Zero race condition');
    log('green', '  • Concorrência real 100% controlada');
  } else if (nenhmaAtualmente) {
    log('yellow', '\n⚠️  TESTE NÃO PODE SER VALIDADO');
    log('yellow', '  • API pode estar offline ou sem autenticação');
    log('yellow', '  • Verifique logs do servidor');
  } else {
    log('red', '❌ TESTE FALHOU - DUPLICAÇÃO DETECTADA');
    log('red', `\n  ${uniquePedidos.size} pedidos diferentes foram criados!`);
    log('red', '  Esto indica um problema nas proteções de concorrência.');
  }

  log('bright', '═══════════════════════════════════════════════════════════════\n');

  process.exit(apenasUmPedido && pedidosCriados.length + conflictCount === 10 ? 0 : 1);
}

main().catch((error) => {
  log('red', '❌ ERRO CRÍTICO:', error.message);
  process.exit(1);
});
