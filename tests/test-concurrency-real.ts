/**
 * TESTE REAL - CONCORRÊNCIA PEDIDOS
 * 🔐 Backend Engineer - 10 Requests Simultâneos
 * 
 * Objetivo:
 * ✅ Apenas 1 pedido criado
 * ✅ 9 retornam resultado em cache (idempotency)
 * ✅ Zero duplicação
 * ✅ SELECT FOR UPDATE funcionando
 */

import axios from 'axios';
import { nanoid } from 'nanoid';

const BASE_URL = 'http://localhost:3000';
const TRPC_ENDPOINT = `${BASE_URL}/api/trpc/pedidos.createVenda`;

interface TestResult {
  requestId: string;
  status: 'SUCCESS' | 'DUPLICATE' | 'ERROR';
  pedidoId?: number;
  numero?: number;
  responseTime: number;
  isDuplicate?: boolean;
  error?: string;
}

async function testConcurrency() {
  console.log(`📊 TESTE DE CONCORRÊNCIA INICIADO`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log('-------------------------------------------\n');

  const idempotencyKey = nanoid(16);
  const clienteMock = {
    nome: `Cliente Teste ${Date.now()}`,
    telefone: '1199999999',
  };

  const payload = {
    cliente: clienteMock,
    subtotal: 100.00,
    desconto: 0,
    frete: 10.00,
    total: 110.00,
    itens: [
      {
        tipo: 'LIVRE',
        descricao: 'Produto Teste',
        quantidade: 1,
        valorUnitario: 100.00,
        custo: 50.00,
        prazoGarantia: 0,
      }
    ],
    idempotencyKey,
  };

  const results: TestResult[] = [];
  const startTime = Date.now();

  console.log(`🔄 Enviando 10 REQUISIÇÕES SIMULTÂNEAS com idempotencyKey: ${idempotencyKey}\n`);

  // 1️⃣ CRIAR 10 REQUISIÇÕES
  const promises = Array.from({ length: 10 }, (_, i) => 
    (async () => {
      const reqStart = Date.now();
      try {
        console.log(`  [REQ ${i + 1}] Enviando...`);
        
        const response = await axios.post(TRPC_ENDPOINT, {
          json: payload,
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': 'sessionToken=test-token',
          },
          timeout: 30000,
        });

        const responseTime = Date.now() - reqStart;
        const data = response.data?.result?.data ?? response.data;
        
        console.log(`  [REQ ${i + 1}] ✅ Status ${response.status} | ${responseTime}ms`);
        
        results.push({
          requestId: idempotencyKey,
          status: 'SUCCESS',
          pedidoId: data?.pedidoId,
          numero: data?.numero,
          responseTime,
          isDuplicate: data?.isDuplicate ?? data?.fromMemoryCache ?? false,
        });

        return {
          pedidoId: data?.pedidoId,
          numero: data?.numero,
          isDuplicate: data?.isDuplicate ?? data?.fromMemoryCache ?? false,
        };
      } catch (error: any) {
        const responseTime = Date.now() - reqStart;
        const errorMsg = error.response?.data?.error?.message ?? error.message;
        
        console.log(`  [REQ ${i + 1}] ❌ ERRO (${responseTime}ms): ${errorMsg}`);
        
        results.push({
          requestId: idempotencyKey,
          status: 'ERROR',
          responseTime,
          error: errorMsg,
        });

        return null;
      }
    })()
  );

  // 2️⃣ AGUARDAR TODAS AS REQUISIÇÕES
  const responses = await Promise.all(promises);
  const totalTime = Date.now() - startTime;

  // 3️⃣ ANÁLISE DOS RESULTADOS
  console.log('\n-------------------------------------------');
  console.log('📊 ANÁLISE DOS RESULTADOS');
  console.log('-------------------------------------------\n');

  const sucessos = responses.filter(r => r !== null);
  const duplicatas = sucessos.filter(r => r?.isDuplicate);
  const unicos = sucessos.filter(r => !r?.isDuplicate);

  const pedidoIds = new Set(sucessos.map(r => r?.pedidoId).filter(Boolean));
  const numeros = new Set(sucessos.map(r => r?.numero).filter(Boolean));

  console.log(`⏱️  Tempo total: ${totalTime}ms`);
  console.log(`✅ Requisições bem-sucedidas: ${sucessos.length}/10`);
  console.log(`🔁 Retornings do cache (duplicatas): ${duplicatas.length}/10`);
  console.log(`📝 Novos pedidos criados: ${unicos.length}/10`);
  console.log(`🎯 Pedidos únicos (IDs): ${pedidoIds.size}`);
  console.log(`🔢 Números únicos: ${numeros.size}\n`);

  // 4️⃣ PROGNÓSTICO
  console.log('🔍 VALIDAÇÃO FINAL:');
  
  const validacoes = [
    { nome: '✅ Apenas 1 pedido criado', ok: pedidoIds.size === 1, required: true },
    { nome: '✅ Demais retornam do cache', ok: duplicatas.length === 9, required: true },
    { nome: '✅ Número sequencial único', ok: numeros.size === 1, required: true },
    { nome: '✅ Tempo total < 10s', ok: totalTime < 10000, required: true },
    { nome: '✅ Nenhum erro de timeout', ok: results.filter(r => r.status === 'ERROR').length === 0, required: true },
  ];

  let allPassed = true;
  for (const val of validacoes) {
    console.log(`  ${val.ok ? '✅' : '❌'} ${val.nome}`);
    if (val.required && !val.ok) allPassed = false;
  }

  console.log('\n-------------------------------------------');
  if (allPassed) {
    console.log('🎉 TESTE PASSOU - PROTEÇÃO DE CONCORRÊNCIA ATIVA');
  } else {
    console.log('❌ TESTE FALHOU - REVISAR INTEGRAÇÃO');
  }
  console.log('-------------------------------------------\n');

  // 5️⃣ DETALHE DOS RESULTADOS
  console.log('📋 DETALHE DAS RESPOSTAS:');
  console.log('');
  sucessos.forEach((r, i) => {
    const tipo = r?.isDuplicate ? '🔁 DUPLICATA' : '📝 NOVO';
    console.log(`  ${tipo} | REQ ${i + 1} | Pedido #${r?.numero} (ID: ${r?.pedidoId})`);
  });

  console.log('');
  erros = results.filter(r => r.status === 'ERROR');
  if (erros.length > 0) {
    console.log('⚠️  ERROS ENCONTRADOS:');
    erros.forEach((r, i) => {
      console.log(`  ❌ REQ ${i + 1} | ${r.error}`);
    });
  }

  return {
    passed: allPassed,
    totalTime,
    pedidosUnicos: pedidoIds.size,
    duplicatas: duplicatas.length,
    erros: results.filter(r => r.status === 'ERROR').length,
  };
}

// 6️⃣ EXECUTAR TESTE
testConcurrency()
  .then(result => {
    console.log('\n✅ Teste finalizado!');
    process.exit(result.passed ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Erro durante teste:', error);
    process.exit(1);
  });

var erros: any;
