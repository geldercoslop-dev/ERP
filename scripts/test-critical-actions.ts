/**
 * TESTE LÓGICO - VALIDAÇÃO DAS AÇÕES CRÍTICAS
 */

import { LeoActionService } from '../server/services/leoAction.service';

console.log('🧪 TESTE LÓGICO - AÇÕES CRÍTICAS');
console.log('===============================\n');

const service = new LeoActionService();

async function testCriticalActions() {
  // Teste CREATE_ORDER
  const createOrderRequest = {
    action: 'CREATE_ORDER' as const,
    payload: {
      clienteId: 1,
      clienteNome: 'Test Cliente',
      subtotal: 100,
      desconto: 0,
      frete: 10,
      total: 110,
      itens: [{
        tipo: 'LIVRE' as const,
        descricao: 'Test Item',
        quantidade: 1,
        valorUnitario: 100,
        custo: 50
      }]
    },
    actor: {
      userId: 123,
      userName: 'Test User',
      role: 'admin',
      tenantId: 1,
      vendedorId: 456
    },
    confirmed: true
  };

  try {
    const result = await service.executeAction(createOrderRequest);
    console.log('CREATE_ORDER:', result.ok ? '✅ SUCESSO' : '❌ FALHA');
    console.log('Requires confirmation:', result.requiresConfirmation);
    console.log('Message:', result.message);
  } catch (error) {
    console.log('CREATE_ORDER: ❌ ERRO -', error.message);
  }

  console.log('\n---\n');

  // Teste PROCESS_PAYMENT
  const processPaymentRequest = {
    action: 'PROCESS_PAYMENT' as const,
    payload: {
      contaId: 1,
      dataRecebimento: '2024-01-01',
      formaPagamento: 'DINHEIRO'
    },
    actor: {
      userId: 123,
      userName: 'Test User',
      role: 'admin',
      tenantId: 1,
      vendedorId: 456
    },
    confirmed: true
  };

  try {
    const result = await service.executeAction(processPaymentRequest);
    console.log('PROCESS_PAYMENT:', result.ok ? '✅ SUCESSO' : '❌ FALHA');
    console.log('Requires confirmation:', result.requiresConfirmation);
    console.log('Message:', result.message);
  } catch (error) {
    console.log('PROCESS_PAYMENT: ❌ ERRO -', error.message);
  }

  console.log('\n---\n');

  // Teste REGISTER_SALE (não crítica)
  const registerSaleRequest = {
    action: 'REGISTER_SALE' as const,
    payload: {
      clienteId: 1,
      clienteNome: 'Test Cliente',
      total: 100
    },
    actor: {
      userId: 123,
      userName: 'Test User',
      role: 'vendedor',
      tenantId: 1,
      vendedorId: 456
    },
    confirmed: true
  };

  try {
    const result = await service.executeAction(registerSaleRequest);
    console.log('REGISTER_SALE (vendedor):', result.ok ? '✅ SUCESSO' : '❌ FALHA');
    console.log('Requires confirmation:', result.requiresConfirmation);
    console.log('Message:', result.message);
  } catch (error) {
    console.log('REGISTER_SALE: ❌ ERRO -', error.message);
  }

  console.log('\n---\n');

  // Teste CREATE_ORDER com vendedor (deve falhar por ser crítica)
  const createOrderVendedorRequest = {
    ...createOrderRequest,
    actor: {
      ...createOrderRequest.actor,
      role: 'vendedor'
    }
  };

  try {
    const result = await service.executeAction(createOrderVendedorRequest);
    console.log('CREATE_ORDER (vendedor):', result.ok ? '❌ FALHA DE SEGURANÇA' : '✅ BLOQUEADO');
    console.log('Message:', result.message);
  } catch (error) {
    console.log('CREATE_ORDER (vendedor): ❌ ERRO -', error.message);
  }
}

testCriticalActions().then(() => {
  console.log('\n✅ TESTE CONCLUÍDO');
}).catch(error => {
  console.log('❌ ERRO GERAL:', error.message);
});
