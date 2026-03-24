// Global types for the ERP system

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  vendedorId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Vendedor {
  id: number;
  nome: string;
  comissao: number;
  meta: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Cliente {
  id: number;
  nome: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  vendedorId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Produto {
  id: number;
  nome: string;
  descricao?: string;
  preco: number;
  estoque: number;
  categoria?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Venda {
  id: number;
  clienteId: number;
  vendedorId: number;
  total: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendaItem {
  id: number;
  vendaId: number;
  produtoId: number;
  quantidade: number;
  preco: number;
  total: number;
}

// LEO Agent Types
export type LeoMode = 'SAFE' | 'ASSIST' | 'OPERATOR' | 'AUTONOMOUS';

export interface LeoContext {
  userId?: number;
  vendedorId?: number;
  sessionId: string;
  mode: LeoMode;
  permissions: string[];
  timestamp: Date;
}

export interface LeoEvent {
  id: string;
  type: string;
  source: string;
  data: Record<string, any>;
  timestamp: Date;
  context: LeoContext;
}

export interface LeoTask {
  id: string;
  type: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  updatedAt: Date;
  context: LeoContext;
  result?: unknown;
  error?: string;
}

export interface LeoInsight {
  id: string;
  type: 'pattern' | 'anomaly' | 'recommendation' | 'alert';
  title: string;
  description: string;
  data: Record<string, any>;
  confidence: number;
  timestamp: Date;
  category: string;
}

export interface LeoMemory {
  id: string;
  key: string;
  value: unknown;
  type: 'user' | 'system' | 'session' | 'permanent';
  context: LeoContext;
  expiresAt?: Date;
  createdAt: Date;
}

// Intelligence Module Types
export interface SalesPattern {
  period: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  percentage: number;
  confidence: number;
  factors: string[];
}

export interface ClientBehavior {
  clientId: number;
  lastPurchase: Date;
  frequency: number;
  avgTicket: number;
  status: 'active' | 'inactive' | 'at_risk';
  recommendations: string[];
}

export interface StockAlert {
  productId: number;
  productName: string;
  currentStock: number;
  minStock: number;
  status: 'critical' | 'low' | 'normal';
  recommendation: string;
}

export interface AnomalyDetection {
  type: 'sales' | 'inventory' | 'behavior' | 'system';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  data: Record<string, any>;
  detectedAt: Date;
  actions: string[];
}

// Desktop Automation Types
export interface DesktopAction {
  type: 'click' | 'type' | 'screenshot' | 'open' | 'close' | 'wait';
  params: Record<string, any>;
  timeout?: number;
}

export interface AutomationScript {
  id: string;
  name: string;
  description: string;
  steps: DesktopAction[];
  permissions: string[];
  createdAt: Date;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// System Health Types
export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: Record<string, {
    status: 'up' | 'down';
    responseTime?: number;
    error?: string;
  }>;
  memory?: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu?: {
    usage: number;
  };
}
