// Global types for the ERP system

/**
 * User entity
 * All users belong to a specific tenant
 */
export interface User {
  id: number;
  tenantId: number; // MANDATORY: Multi-tenant isolation
  name: string;
  email: string;
  role: string;
  vendedorId?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Vendedor (Salesperson) entity
 * All salespeople belong to a specific tenant
 */
export interface Vendedor {
  id: number;
  tenantId: number; // MANDATORY: Multi-tenant isolation
  nome: string;
  comissao: number;
  meta: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Cliente (Customer) entity
 * All customers belong to a specific tenant
 */
export interface Cliente {
  id: number;
  tenantId: number; // MANDATORY: Multi-tenant isolation
  nome: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  vendedorId: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Produto (Product) entity
 * All products belong to a specific tenant
 */
export interface Produto {
  id: number;
  tenantId: number; // MANDATORY: Multi-tenant isolation
  nome: string;
  descricao?: string;
  preco: number;
  estoque: number;
  categoria?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Venda (Sale) entity
 * All sales belong to a specific tenant
 */
export interface Venda {
  id: number;
  tenantId: number; // MANDATORY: Multi-tenant isolation
  clienteId: number;
  vendedorId: number;
  total: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * VendaItem (Sale Item) entity
 * All sale items belong to a specific tenant
 */
export interface VendaItem {
  id: number;
  tenantId: number; // MANDATORY: Multi-tenant isolation
  vendaId: number;
  produtoId: number;
  quantidade: number;
  preco: number;
  total: number;
}

// LEO Agent Types
export type LeoMode = 'SAFE' | 'ASSIST' | 'OPERATOR' | 'AUTONOMOUS';

/**
 * LEO context carries tenant isolation information
 * MANDATORY: tenantId must ALWAYS be present
 */
export interface LeoContext {
  tenantId: number; // MANDATORY: Multi-tenant isolation
  userId?: number;
  vendedorId?: number;
  sessionId: string;
  mode: LeoMode;
  permissions: string[];
  timestamp: Date;
}

/**
 * LEO event - typed event system
 */
export interface LeoEvent {
  id: string;
  type: string;
  source: string;
  /** Event metadata - typed as Record<string, unknown> for safety */
  data: Record<string, unknown>;
  timestamp: Date;
  context: LeoContext;
}

/**
 * LEO task - async task tracking
 */
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
  data: Record<string, unknown>;
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
  data: Record<string, unknown>;
  detectedAt: Date;
  actions: string[];
}

// Desktop Automation Types
export interface DesktopAction {
  type: 'click' | 'type' | 'screenshot' | 'open' | 'close' | 'wait';
  params: Record<string, unknown>;
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
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
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
