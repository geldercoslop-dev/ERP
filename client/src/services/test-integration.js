/**
 * Script de Teste - Cole no Console do Navegador
 * http://localhost:5173
 * 
 * Testará:
 * - API Client básico
 * - Login
 * - Requisições autenticadas
 */

console.log('%c🧪 Iniciando testes de integração...', 'color: blue; font-size: 14px; font-weight: bold;');

// ============================================
// 1. TESTE: API GET
// ============================================
async function testeApiGet() {
  console.log('\n%c📍 Teste 1: API GET', 'color: purple;');
  try {
    const response = await fetch('http://localhost:3000/health', {
      credentials: 'include'
    });
    const data = await response.json();
    console.log('✅ Backend respondendo:', data);
    return true;
  } catch (err) {
    console.error('❌ Erro:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

// ============================================
// 2. TESTE: LOGIN
// ============================================
async function testeLogin() {
  console.log('\n%c🔐 Teste 2: LOGIN', 'color: purple;');
  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin' // MUDE CONFORME SEU BANCO
      })
    });

    const result = await response.json();

    if (result?.ok) {
      console.log('✅ Login bem-sucedido:', result);
      console.log('   Token:', result.sessionToken);
      console.log('   Usuário:', result.name);
      return true;
    }

    console.error('❌ Login falhou:', result);
    return false;
  } catch (err) {
    console.error('❌ Erro:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

// ============================================
// 3. TESTE: API Client (se importável)
// ============================================
async function testeApiClient() {
  console.log('\n%c🔌 Teste 3: API Client do Frontend', 'color: purple;');
  try {
    // Tente chamar a função do módulo
    const response = await (window as any).apiGet?.('/api/health');
    console.log('✅ API Client funcionando:', response);
    return true;
  } catch (err) {
    console.log('⚠️  API Client não acessível (expectado em produção)');
    return false;
  }
}

// ============================================
// 4. TESTE: Auth Service
// ============================================
async function testeAuthService() {
  console.log('\n%c👤 Teste 4: Auth Service', 'color: purple;');
  try {
    // Tente chamar a função do módulo
    const result = await (window as any).loginService?.({
      username: 'admin',
      password: 'admin'
    });
    console.log('✅ Auth Service funcionando:', result);
    return true;
  } catch (err) {
    console.log('⚠️  Auth Service não acessível no contexto global');
    return false;
  }
}

// ============================================
// 5. TESTE: Requisição Autenticada
// ============================================
async function testeRequisicaoAutenticada() {
  console.log('\n%c🔒 Teste 5: Requisição Autenticada', 'color: purple;');
  try {
    const response = await fetch('http://localhost:3000/api/auth/me', {
      method: 'GET',
      credentials: 'include',
    });

    if (response.status === 401) {
      console.log('⚠️  Não autenticado (401) - Faça login primeiro');
      return false;
    }

    const data = await response.json();
    console.log('✅ Requisição autenticada respondeu:', data);
    return true;
  } catch (err) {
    console.error('❌ Erro:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

// ============================================
// EXECUTAR TODOS OS TESTES
// ============================================
async function executarTodosTestes() {
  const testes = [
    { nome: 'API GET', fn: testeApiGet },
    { nome: 'LOGIN', fn: testeLogin },
    { nome: 'API Client', fn: testeApiClient },
    { nome: 'Auth Service', fn: testeAuthService },
    { nome: 'Requisição Autenticada', fn: testeRequisicaoAutenticada },
  ];

  const resultados: Record<string, boolean> = {};

  for (const teste of testes) {
    try {
      resultados[teste.nome] = await teste.fn();
    } catch (err) {
      console.error(`❌ Erro no teste ${teste.nome}:`, err);
      resultados[teste.nome] = false;
    }
    // Aguardar um pouco entre testes
    await new Promise(r => setTimeout(r, 500));
  }

  // ============================================
  // RELATÓRIO FINAL
  // ============================================
  console.log('\n%c═════════════════════════════════════', 'color: green; font-size: 12px;');
  console.log('%c📊 RELATÓRIO FINAL', 'color: green; font-size: 14px; font-weight: bold;');
  console.log('%c═════════════════════════════════════', 'color: green; font-size: 12px;');

  let totalOk = 0;
  for (const [teste, ok] of Object.entries(resultados)) {
    console.log(`${ok ? '✅' : '❌'} ${teste}`);
    if (ok) totalOk++;
  }

  console.log('%c═════════════════════════════════════', 'color: green; font-size: 12px;');
  const percentage = Math.round((totalOk / testes.length) * 100);
  console.log(`%c${totalOk}/${testes.length} testes passaram (${percentage}%)`, 
    `color: ${percentage === 100 ? 'green' : 'orange'}; font-size: 14px; font-weight: bold;`);
  console.log('%c═════════════════════════════════════', 'color: green; font-size: 12px;');

  if (percentage === 100) {
    console.log('%c🎉 Sistema pronto para usar!', 'color: green; font-size: 14px; font-weight: bold;');
  } else if (percentage >= 60) {
    console.log('%c⚠️  Alguns testes falharam - verifique logs acima', 'color: orange; font-size: 14px;');
  } else {
    console.log('%c🔴 Muitos testes falharam - confira a infraestrutura', 'color: red; font-size: 14px;');
  }
}

// ============================================
// EXECUTAR
// ============================================
executarTodosTestes().catch(console.error);

// Adicionar função global para rodar testes manualmente depois
(window as any).testeIntegracao = { executarTodosTestes };
console.log('\n💡 Dica: Rode novamente com: window.testeIntegracao.executarTodosTestes()');
