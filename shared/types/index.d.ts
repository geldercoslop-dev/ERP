/**
 * Tipos compartilhados — única definição por entidade.
 * Backend: import { Cliente } from "./index.ts"
 * Frontend: import { Cliente } from "../../client/src/shared/types"
 */
export * from "./entities";
export type { User, CreateUserData, UpdateUserData } from "./user";
export type { Product, Produto, CreateProductData, UpdateProductData, ProductFilter, StockOperation, } from "./product";
export * from "./order";
export type { StockInfo, StockLock, StockMovement, StockOperationRequest, StockResult, StockFilter, } from "./stock";
export * from "./financial";
export * from "./leo";
export * from "./utils";
export type { UserRole, ApiResponse, ApiListResponse, ClientAppRouter } from "./frontend";
export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export interface FilterOptions {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
}
export interface DateRange {
    inicio: Date;
    fim: Date;
}
export interface Address {
    rua: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade: string;
    estado: string;
    cep: string;
}
export interface ContactInfo {
    telefone?: string;
    email?: string;
    celular?: string;
}
export type UserStatus = "active" | "inactive" | "suspended";
export type OrderStatus = "GERADO" | "CONFERIDO" | "EM_ROTA" | "ENTREGUE" | "CANCELADO" | "PENDENTE_ESTOQUE";
export type PaymentStatus = "pending" | "processing" | "completed" | "failed" | "refunded";
export type StockStatus = "normal" | "baixo" | "critico";
export interface HealthCheck {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: Date;
    uptime: number;
    version: string;
    environment: string;
}
export interface LeoCommand {
    id: string;
    comando: string;
    usuario?: string;
    parametros?: Record<string, unknown>;
    origem?: string;
    status: "pending" | "processing" | "completed" | "failed";
    resultado?: unknown;
    mensagem?: string;
    createdAt: Date;
    updatedAt?: Date;
}
export interface LeoMemory {
    id: string;
    tipo: string;
    conteudo: unknown;
    contexto?: string;
    entidade?: string;
    entidadeId?: string;
    confianca: number;
    criadoEm: Date;
    ultimoAcesso: Date;
    numeroAcessos: number;
}
