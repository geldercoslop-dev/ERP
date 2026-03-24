/**
 * Tipos comuns reutilizáveis
 */

/** Identifica um recurso único */
export type Id = string | number;

/** Status de uma operação assíncrona */
export enum AsyncStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

/** Estado de carregamento genérico */
export type AsyncState<T> = {
  status: AsyncStatus;
  data?: T;
  error?: Error | string;
  isLoading: boolean;
};

/** Resposta paginada */
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

/** Parâmetros de paginação */
export type PaginationParams = {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
};

/** Filtros genéricos */
export type FilterParams = Record<string, unknown>;

/** Resultado de busca */
export type SearchResult<T> = {
  query: string;
  results: T[];
  total: number;
  duration: number;
};

/** Resposta de validação */
export type ValidationResult = {
  valid: boolean;
  errors?: Record<string, string[]>;
  warnings?: Record<string, string[]>;
};

/** Status de autenticação */
export enum AuthStatus {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  AUTHENTICATING = 'AUTHENTICATING',
  AUTHENTICATED = 'AUTHENTICATED',
  ERROR = 'ERROR',
}

/** Informações do usuário */
export type UserInfo = {
  id: Id;
  email: string;
  name: string;
  avatar?: string;
  role?: string;
  permissions?: string[];
};

/** Token de autenticação */
export type AuthToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number | Date;
  type?: 'Bearer' | 'Basic';
};

/** Metadados de requisição */
export type RequestMetadata = {
  requestId: string;
  timestamp: Date;
  userAgent?: string;
  ip?: string;
};

/** Resultado de operação com metadados */
export type ResultWithMetadata<T> = {
  data: T;
  metadata: RequestMetadata;
};
