interface SystemHealthData {
  status: 'ok' | 'error';
  responseTime: number;
  server: {
    uptime: number;
    environment: string;
    isProduction: boolean;
  };
  database: {
    status: string;
    responseTime: number;
    error?: string;
  };
  redis: {
    status: string;
    responseTime: number;
    error?: string;
  };
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  environment: {
    DATABASE_URL: boolean;
    PORT: boolean;
  };
  allEnvironmentOk: boolean;
}

export interface HealthAnalysis {
  level: 'ok' | 'warn' | 'critical';
  score: number;
  issues: string[];
  recommendations: string[];
  metrics: {
    performance: number;
    reliability: number;
    resource: number;
    environment: number;
  };
}

export function analyzeHealth(data: SystemHealthData): HealthAnalysis {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // Análise de Performance (40% do score)
  let performanceScore = 100;
  
  // Response time geral
  if (data.responseTime > 1000) {
    performanceScore -= 20;
    issues.push(`Tempo de resposta lento: ${data.responseTime}ms`);
    recommendations.push('Otimize o processamento de requisições');
  } else if (data.responseTime > 500) {
    performanceScore -= 10;
    issues.push(`Tempo de resposta moderado: ${data.responseTime}ms`);
  }

  // Database response time
  if (data.database.responseTime > 1000) {
    performanceScore -= 25;
    issues.push(`Banco de dados lento: ${data.database.responseTime}ms`);
    recommendations.push('Verifique índices e consultas SQL');
  } else if (data.database.responseTime > 500) {
    performanceScore -= 15;
    issues.push(`Banco de dados moderado: ${data.database.responseTime}ms`);
  }

  // Análise de Confiabilidade (30% do score)
  let reliabilityScore = 100;

  if (data.status === 'error') {
    reliabilityScore -= 50;
    issues.push('Sistema em estado de erro');
    recommendations.push('Verifique logs e corrija erros críticos');
  }

  if (data.database.status === 'error') {
    reliabilityScore -= 40;
    issues.push('Erro no banco de dados');
    if (data.database.error) {
      issues.push(`Detalhe: ${data.database.error}`);
    }
    recommendations.push('Verifique conexão e configurações do banco');
  }

  if (data.redis.status === 'error') {
    reliabilityScore -= 15;
    issues.push('Redis indisponível ou com falha');
    if (data.redis.error) {
      issues.push(`Redis: ${data.redis.error}`);
    }
    recommendations.push('Verifique REDIS_HOST/REDIS_URL e se o serviço Redis está ativo');
  } else if (data.redis.status === 'slow') {
    reliabilityScore -= 8;
    issues.push(`Redis lento: ${data.redis.responseTime}ms`);
  }

  // Análise de Recursos (20% do score)
  let resourceScore = 100;

  const memUsageMB = data.memory.heapUsed;
  const memUsagePercent = (data.memory.heapUsed / data.memory.heapTotal) * 100;

  if (memUsageMB > 800) {
    resourceScore -= 30;
    issues.push(`Uso de memória crítico: ${memUsageMB}MB`);
    recommendations.push('Considere aumentar memória ou otimizar consumo');
  } else if (memUsageMB > 500) {
    resourceScore -= 15;
    issues.push(`Uso de memória alto: ${memUsageMB}MB`);
    recommendations.push('Monitore crescimento de memória');
  }

  if (memUsagePercent > 90) {
    resourceScore -= 20;
    issues.push(`Percentual de memória crítico: ${memUsagePercent.toFixed(1)}%`);
  }

  // Análise de Ambiente (10% do score)
  let environmentScore = 100;

  if (!data.allEnvironmentOk) {
    environmentScore -= 30;
    issues.push('Variáveis de ambiente ausentes');
    
    const missingVars: string[] = [];
    if (!data.environment.DATABASE_URL) missingVars.push('DATABASE_URL');
    if (!data.environment.PORT) missingVars.push('PORT');
    
    if (missingVars.length > 0) {
      issues.push(`Variáveis faltando: ${missingVars.join(', ')}`);
    }
    recommendations.push('Configure todas as variáveis de ambiente necessárias');
  }

  // Verificações específicas para produção
  if (data.server.isProduction) {
    if (data.server.uptime < 60000) { // menos de 1 minuto
      reliabilityScore -= 10;
      issues.push('Sistema reiniciou recentemente em produção');
      recommendations.push('Investigue causa de reinicialização');
    }
  }

  // Cálculo do score final
  score = Math.round(
    (performanceScore * 0.4) + 
    (reliabilityScore * 0.3) + 
    (resourceScore * 0.2) + 
    (environmentScore * 0.1)
  );

  // Determinação do nível
  let level: 'ok' | 'warn' | 'critical';
  if (score >= 80) {
    level = 'ok';
  } else if (score >= 60) {
    level = 'warn';
  } else {
    level = 'critical';
  }

  // Adicionar recomendações automáticas baseadas no score
  if (score < 70) {
    recommendations.push('Considere acionar equipe de infraestrutura');
  }
  
  if (issues.length === 0) {
    issues.push('Nenhum problema detectado');
  }

  return {
    level,
    score,
    issues,
    recommendations,
    metrics: {
      performance: performanceScore,
      reliability: reliabilityScore,
      resource: resourceScore,
      environment: environmentScore
    }
  };
}

export function getHealthTrend(current: HealthAnalysis, previous?: HealthAnalysis): 'improving' | 'degrading' | 'stable' {
  if (!previous) return 'stable';
  
  if (current.score > previous.score + 5) return 'improving';
  if (current.score < previous.score - 5) return 'degrading';
  return 'stable';
}

export function formatHealthScore(score: number): string {
  if (score >= 90) return 'Excelente';
  if (score >= 80) return 'Bom';
  if (score >= 70) return 'Regular';
  if (score >= 50) return 'Ruim';
  return 'Crítico';
}

export function getPriorityIssues(analysis: HealthAnalysis): string[] {
  return analysis.issues.filter(issue => 
    issue.includes('crítico') || 
    issue.includes('erro') || 
    issue.includes('Error')
  ).slice(0, 3);
}
