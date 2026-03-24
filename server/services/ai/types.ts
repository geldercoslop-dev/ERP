/**
 * Tipos para Serviços AI
 * Interfaces fortemente tipadas para evitar retornos não tipados.
 */

export interface AIQueryResult {
  response: string;
  confidence: number;
  metadata?: Record<string, unknown>;
  suggestions?: string[];
  error?: string;
}

export interface AIAnalysisResult {
  summary: string;
  entities: {
    tipo: string;
    valor: string;
    confianca: number;
  }[];
  intent: string;
  parameters: Record<string, unknown>;
  error?: string;
}

export interface AITaskResult {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  progress?: number;
  estimatedTime?: number;
}

export interface AIScreenAnalysis {
  elements: Array<{
    type: 'button' | 'input' | 'text' | 'image' | 'link';
    text?: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    confidence: number;
  }>;
  summary: string;
  confidence: number;
  error?: string;
}

export interface AIAppDiscovery {
  applications: Array<{
    name: string;
    path: string;
    version?: string;
    size?: number;
    lastModified?: Date;
  }>;
  summary: string;
  totalFound: number;
  error?: string;
}

export interface AIContextEngine {
  context: {
    user?: {
      id: string;
      name: string;
      role: string;
    };
    session: {
      id: string;
      startTime: Date;
      lastActivity: Date;
    };
    application: {
      name: string;
      version: string;
      environment: 'development' | 'production' | 'staging';
    };
  };
  variables: Record<string, unknown>;
  history: Array<{
    timestamp: Date;
    action: string;
    result: unknown;
  }>;
}

export interface AIERPInsight {
  metric: string;
  value: number;
  trend: 'up' | 'down' | 'stable';
  change: number;
  period: string;
  insights: string[];
  recommendations: string[];
}

export interface AILearningData {
  patterns: Array<{
    pattern: string;
    frequency: number;
    confidence: number;
    lastSeen: Date;
  }>;
  improvements: Array<{
    area: string;
    suggestion: string;
    impact: 'low' | 'medium' | 'high';
  }>;
  performance: {
    accuracy: number;
    responseTime: number;
    successRate: number;
  };
}
