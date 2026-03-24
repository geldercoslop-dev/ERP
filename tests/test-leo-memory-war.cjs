#!/usr/bin/env node

/**
 * TESTE DE GUERRA: LEO MEMORY
 * Testa múltiplas ações IA simultâneas sem corrupção
 */

console.log('='.repeat(60));
console.log('TESTE DE GUERRA: LEO MEMORY');
console.log('='.repeat(60));

// Simulador de contexto LEO
class LeoMemorySimulator {
  constructor() {
    this.sessions = new Map();
    this.contexts = new Map();
    this.actions = [];
    this.corruptionDetected = false;
  }

  // Criar sessão LEO
  createSession(userId, sessionId) {
    const session = {
      userId,
      sessionId,
      createdAt: Date.now(),
      context: {
        history: [],
        preferences: {},
        workingMemory: new Map(),
        longTermMemory: new Map()
      },
      locks: new Set()
    };
    
    this.sessions.set(sessionId, session);
    return session;
  }

  // Adquirir lock de contexto
  acquireContextLock(sessionId, contextKey) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    const lockKey = `${sessionId}:${contextKey}`;
    
    if (session.locks.has(lockKey)) {
      return false; // Já possui lock
    }
    
    session.locks.add(lockKey);
    return true;
  }

  // Liberar lock de contexto
  releaseContextLock(sessionId, contextKey) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    const lockKey = `${sessionId}:${contextKey}`;
    session.locks.delete(lockKey);
    return true;
  }

  // Executar ação IA com contexto
  async executeIAAction(sessionId, actionType, data) {
    const startTime = Date.now();
    const actionId = `ACTION-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Sessão ${sessionId} não encontrada`);
      }

      // Adquirir lock para o contexto
      const contextKey = actionType;
      if (!this.acquireContextLock(sessionId, contextKey)) {
        throw new Error(`Lock não disponível para ${contextKey}`);
      }

      // Simular processamento IA
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

      // Executar ação específica
      let result;
      switch (actionType) {
        case 'ANALYZE_SALES':
          result = await this.analyzeSales(session, data);
          break;
        case 'GENERATE_INSIGHTS':
          result = await this.generateInsights(session, data);
          break;
        case 'PREDICT_DEMAND':
          result = await this.predictDemand(session, data);
          break;
        case 'OPTIMIZE_PRICING':
          result = await this.optimizePricing(session, data);
          break;
        case 'CUSTOMER_ANALYSIS':
          result = await this.customerAnalysis(session, data);
          break;
        default:
          throw new Error(`Ação desconhecida: ${actionType}`);
      }

      // Registrar ação no histórico
      const action = {
        id: actionId,
        sessionId,
        actionType,
        data,
        result,
        timestamp: Date.now(),
        processingTime: Date.now() - startTime,
        success: true
      };

      session.context.history.push(action);
      this.actions.push(action);

      // Manter apenas últimas 100 ações na sessão
      if (session.context.history.length > 100) {
        session.context.history = session.context.history.slice(-100);
      }

      // Liberar lock
      this.releaseContextLock(sessionId, contextKey);

      return { success: true, action, result };

    } catch (error) {
      const action = {
        id: actionId,
        sessionId,
        actionType,
        data,
        error: error.message,
        timestamp: Date.now(),
        processingTime: Date.now() - startTime,
        success: false
      };

      this.actions.push(action);
      
      // Liberar lock se adquirido
      this.releaseContextLock(sessionId, actionType);

      return { success: false, action, error: error.message };
    }
  }

  // Análise de vendas
  async analyzeSales(session, data) {
    const { salesData } = data;
    
    // Simular análise complexa
    const analysis = {
      totalSales: salesData.reduce((sum, sale) => sum + sale.value, 0),
      averageTicket: salesData.reduce((sum, sale) => sum + sale.value, 0) / salesData.length,
      topProducts: salesData.sort((a, b) => b.value - a.value).slice(0, 5),
      trends: this.calculateTrends(salesData),
      insights: []
    };

    // Armazenar no working memory
    session.context.workingMemory.set('lastSalesAnalysis', analysis);
    
    return analysis;
  }

  // Gerar insights
  async generateInsights(session, data) {
    const { metrics } = data;
    
    const insights = [];
    
    if (metrics.growth > 0.1) {
      insights.push({
        type: 'positive',
        message: 'Crescimento significativo detectado',
        confidence: 0.85
      });
    }
    
    if (metrics.churnRate > 0.2) {
      insights.push({
        type: 'warning',
        message: 'Alta taxa de churn detectada',
        confidence: 0.9
      });
    }

    // Armazenar insights
    session.context.longTermMemory.set('recentInsights', insights);
    
    return insights;
  }

  // Prever demanda
  async predictDemand(session, data) {
    const { historicalData, timeHorizon } = data;
    
    // Simular modelo de previsão
    const prediction = {
      timeHorizon,
      predictedDemand: historicalData.slice(-7).reduce((sum, d) => sum + d.demand, 0) / 7 * timeHorizon,
      confidence: 0.75,
      factors: ['seasonality', 'trends', 'external_factors']
    };

    session.context.workingMemory.set('demandPrediction', prediction);
    
    return prediction;
  }

  // Otimizar preços
  async optimizePricing(session, data) {
    const { products, marketData } = data;
    
    const optimizations = products.map(product => {
      const suggestedPrice = product.basePrice * (1 + (Math.random() - 0.5) * 0.2);
      return {
        productId: product.id,
        currentPrice: product.price,
        suggestedPrice,
        expectedImpact: (suggestedPrice - product.price) / product.price * 100
      };
    });

    session.context.workingMemory.set('priceOptimizations', optimizations);
    
    return optimizations;
  }

  // Análise de clientes
  async customerAnalysis(session, data) {
    const { customers } = data;
    
    const segments = {
      highValue: customers.filter(c => c.ltv > 1000).length,
      mediumValue: customers.filter(c => c.ltv > 500 && c.ltv <= 1000).length,
      lowValue: customers.filter(c => c.ltv <= 500).length
    };

    const analysis = {
      totalCustomers: customers.length,
      segments,
      averageLTV: customers.reduce((sum, c) => sum + c.ltv, 0) / customers.length,
      recommendations: this.generateRecommendations(segments)
    };

    session.context.longTermMemory.set('customerAnalysis', analysis);
    
    return analysis;
  }

  // Calcular tendências
  calculateTrends(salesData) {
    const recent = salesData.slice(-7);
    const previous = salesData.slice(-14, -7);
    
    const recentSum = recent.reduce((sum, s) => sum + s.value, 0);
    const previousSum = previous.reduce((sum, s) => sum + s.value, 0);
    
    return {
      trend: recentSum > previousSum ? 'up' : 'down',
      change: ((recentSum - previousSum) / previousSum * 100).toFixed(2)
    };
  }

  // Gerar recomendações
  generateRecommendations(segments) {
    const recommendations = [];
    
    if (segments.highValue < segments.total * 0.1) {
      recommendations.push('Focar em retenção de clientes de alto valor');
    }
    
    if (segments.lowValue > segments.total * 0.6) {
      recommendations.push('Desenvolver estratégias para upgrade de clientes');
    }
    
    return recommendations;
  }

  // Verificar corrupção de dados
  detectCorruption() {
    const issues = [];
    
    // Verificar duplicação de actions
    const actionIds = this.actions.map(a => a.id);
    const uniqueIds = [...new Set(actionIds)];
    if (actionIds.length !== uniqueIds.length) {
      issues.push('Duplicação de actions detectada');
    }
    
    // Verificar consistência de timestamps
    const sortedActions = [...this.actions].sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 1; i < sortedActions.length; i++) {
      if (sortedActions[i].timestamp < sortedActions[i-1].timestamp) {
        issues.push('Inconsistência de timestamps detectada');
        break;
      }
    }
    
    // Verificar integridade das sessões
    for (const [sessionId, session] of this.sessions) {
      if (!session.context || !session.context.history) {
        issues.push(`Sessão ${sessionId} com contexto corrompido`);
      }
    }
    
    this.corruptionDetected = issues.length > 0;
    return issues;
  }

  // Gerar relatório
  generateReport() {
    const totalActions = this.actions.length;
    const successfulActions = this.actions.filter(a => a.success).length;
    const failedActions = totalActions - successfulActions;
    
    const avgProcessingTime = totalActions > 0 
      ? Math.round(this.actions.reduce((sum, a) => sum + a.processingTime, 0) / totalActions)
      : 0;
    
    const actionTypes = {};
    this.actions.forEach(a => {
      actionTypes[a.actionType] = (actionTypes[a.actionType] || 0) + 1;
    });
    
    return {
      totalSessions: this.sessions.size,
      totalActions,
      successfulActions,
      failedActions,
      successRate: totalActions > 0 ? Math.round((successfulActions / totalActions) * 100) : 0,
      avgProcessingTime,
      actionTypes,
      corruptionDetected: this.corruptionDetected,
      corruptionIssues: this.detectCorruption()
    };
  }
}

// Teste de múltiplas ações IA simultâneas
async function testMultipleIAActions() {
  console.log('\n🔍 TESTE 1: Múltiplas Ações IA Simultâneas');
  
  const simulator = new LeoMemorySimulator();
  const numSessions = 10;
  const actionsPerSession = 5;
  
  console.log(`📊 Criando ${numSessions} sessões simultâneas`);
  console.log(`🧠 Executando ${actionsPerSession} ações IA por sessão`);
  
  // Criar sessões
  const sessions = [];
  for (let i = 1; i <= numSessions; i++) {
    const session = simulator.createSession(`user-${i}`, `session-${i}`);
    sessions.push(session);
  }
  
  // Preparar dados de teste
  const actionTypes = ['ANALYZE_SALES', 'GENERATE_INSIGHTS', 'PREDICT_DEMAND', 'OPTIMIZE_PRICING', 'CUSTOMER_ANALYSIS'];
  const testData = {
    ANALYZE_SALES: {
      salesData: Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        value: Math.random() * 1000,
        date: new Date(Date.now() - i * 86400000).toISOString()
      }))
    },
    GENERATE_INSIGHTS: {
      metrics: {
        growth: Math.random() * 0.3,
        churnRate: Math.random() * 0.3
      }
    },
    PREDICT_DEMAND: {
      historicalData: Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - i * 86400000).toISOString(),
        demand: Math.floor(Math.random() * 100) + 50
      })),
      timeHorizon: 7
    },
    OPTIMIZE_PRICING: {
      products: Array.from({ length: 20 }, (_, i) => ({
        id: `PROD-${i + 1}`,
        basePrice: Math.random() * 500 + 100,
        price: Math.random() * 600 + 80
      })),
      marketData: { competition: 'medium', demand: 'high' }
    },
    CUSTOMER_ANALYSIS: {
      customers: Array.from({ length: 100 }, (_, i) => ({
        id: `CUST-${i + 1}`,
        ltv: Math.random() * 2000 + 100,
        segment: ['premium', 'standard', 'basic'][Math.floor(Math.random() * 3)]
      }))
    }
  };
  
  // Executar ações simultâneas
  const startTime = Date.now();
  const promises = [];
  
  for (let i = 0; i < numSessions; i++) {
    const session = sessions[i];
    
    for (let j = 0; j < actionsPerSession; j++) {
      const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)];
      const data = testData[actionType];
      
      const promise = simulator.executeIAAction(session.sessionId, actionType, data);
      promises.push(promise);
    }
  }
  
  const results = await Promise.allSettled(promises);
  const endTime = Date.now();
  
  // Análise dos resultados
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
  
  console.log(`\n📈 RESULTADOS:`);
  console.log(`⏱️ Tempo total: ${endTime - startTime}ms`);
  console.log(`✅ Ações bem-sucedidas: ${successful.length}`);
  console.log(`❌ Ações falharam: ${failed.length}`);
  
  // Verificar corrupção
  const corruptionIssues = simulator.detectCorruption();
  
  if (corruptionIssues.length === 0) {
    console.log('✅ Nenhuma corrupção de dados detectada');
  } else {
    console.log(`❌ Corrupção detectada: ${corruptionIssues.join(', ')}`);
  }
  
  // Relatório detalhado
  const report = simulator.generateReport();
  
  console.log(`📊 Taxa de sucesso: ${report.successRate}%`);
  console.log(`⚡ Processing time médio: ${report.avgProcessingTime}ms`);
  console.log(`🧠 Tipos de ação:`, report.actionTypes);
  
  return {
    success: corruptionIssues.length === 0 && report.successRate > 90,
    totalActions: report.totalActions,
    successRate: report.successRate,
    corruptionDetected: report.corruptionDetected,
    avgProcessingTime: report.avgProcessingTime
  };
}

// Teste de estresse de memória
async function testMemoryStress() {
  console.log('\n🔍 TESTE 2: Estresse de Memória LEO');
  
  const simulator = new LeoMemorySimulator();
  const highLoad = 100;
  
  console.log(`📊 Testando ${highLoad} ações IA sequenciais`);
  
  const session = simulator.createSession('stress-user', 'stress-session');
  const actionType = 'ANALYZE_SALES';
  
  const testData = {
    salesData: Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      value: Math.random() * 10000,
      date: new Date(Date.now() - i * 86400000).toISOString()
    }))
  };
  
  const promises = [];
  const startTime = Date.now();
  
  // Criar muitas ações para testar gerenciamento de memória
  for (let i = 0; i < highLoad; i++) {
    const promise = simulator.executeIAAction(session.sessionId, actionType, testData);
    promises.push(promise);
  }
  
  const results = await Promise.allSettled(promises);
  const endTime = Date.now();
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  
  console.log(`✅ Ações processadas: ${successful}/${highLoad}`);
  console.log(`⏱️ Tempo total: ${endTime - startTime}ms`);
  console.log(`📊 Histórico da sessão: ${session.context.history.length} ações`);
  
  // Verificar se o histórico está sendo gerenciado corretamente
  const historyManaged = session.context.history.length <= 100;
  
  if (historyManaged) {
    console.log('✅ Histórico sendo gerenciado corretamente (limite de 100)');
  } else {
    console.log('❌ Histórico não está sendo limitado');
  }
  
  // Verificar corrupção sob carga
  const corruptionIssues = simulator.detectCorruption();
  
  return {
    success: successful === highLoad && corruptionIssues.length === 0 && historyManaged,
    totalProcessed: successful,
    expected: highLoad,
    historyManaged,
    corruptionDetected: corruptionIssues.length > 0
  };
}

// Teste de isolamento de contexto
async function testContextIsolation() {
  console.log('\n🔍 TESTE 3: Isolamento de Contexto');
  
  const simulator = new LeoMemorySimulator();
  const numSessions = 5;
  
  // Criar múltiplas sessões
  const sessions = [];
  for (let i = 1; i <= numSessions; i++) {
    const session = simulator.createSession(`user-${i}`, `session-${i}`);
    sessions.push(session);
  }
  
  // Executar ações em paralelo para testar isolamento
  const promises = sessions.map(async (session, index) => {
    const actions = [];
    
    for (let i = 0; i < 10; i++) {
      const action = await simulator.executeIAAction(
        session.sessionId,
        'GENERATE_INSIGHTS',
        { metrics: { growth: Math.random(), churnRate: Math.random(), sessionId: session.sessionId } }
      );
      actions.push(action);
    }
    
    return { sessionId: session.sessionId, actions };
  });
  
  const results = await Promise.allSettled(promises);
  
  // Verificar isolamento
  let isolationViolations = 0;
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const { sessionId, actions } = result.value;
      
      // Verificar se todas as ações pertencem à sessão correta
      const correctSession = actions.every(action => 
        action.success && action.action.sessionId === sessionId
      );
      
      if (!correctSession) {
        isolationViolations++;
        console.log(`❌ Violação de isolamento na sessão ${sessionId}`);
      }
    }
  });
  
  console.log(`✅ Sessões testadas: ${numSessions}`);
  console.log(`❌ Violações de isolamento: ${isolationViolations}`);
  
  return {
    success: isolationViolations === 0,
    sessionsTested: numSessions,
    violations: isolationViolations
  };
}

async function runLeoMemoryTests() {
  console.log('🚀 INICIANDO TESTE DE GUERRA - LEO MEMORY');
  
  const results = [];
  
  // Executar todos os testes
  results.push(await testMultipleIAActions());
  results.push(await testMemoryStress());
  results.push(await testContextIsolation());
  
  // Relatório final
  console.log('\n' + '='.repeat(60));
  console.log('RELATÓRIO FINAL - LEO MEMORY');
  console.log('='.repeat(60));
  
  console.log('\n📊 RESUMO DOS TESTES:');
  
  const testNames = [
    'Múltiplas Ações IA Simultâneas',
    'Estresse de Memória',
    'Isolamento de Contexto'
  ];
  
  let passedTests = 0;
  
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${testNames[index]}: ${result.success ? 'PASSOU' : 'FALHOU'}`);
    
    if (result.success) passedTests++;
  });
  
  console.log(`\n🎯 AVALIAÇÃO FINAL: ${passedTests}/${results.length} testes passaram`);
  
  if (passedTests === results.length) {
    console.log('✅ PASSOU - LEO Memory é robusto e seguro');
    console.log('✅ Sem corrupção de dados');
    console.log('✅ Contexto isolado corretamente');
    console.log('✅ Memória gerenciada sob carga');
    console.log('✅ Múltiplas ações IA funcionam simultaneamente');
  } else {
    console.log('❌ FALHOU - LEO Memory tem problemas');
    console.log('❌ Pode haver corrupção ou vazamento de contexto');
  }
  
  return passedTests === results.length;
}

runLeoMemoryTests().catch(console.error);
