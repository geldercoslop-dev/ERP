/**
 * Tipos usados pelo frontend — entidades re-exportadas de entities.ts;
 * apenas tipos específicos de UI/API aqui.
 */
export type { users, vendedores, clientes, cores, produtos, itensPedido, pedidos, cargas, pedidosCarga, pendencias, promocoes, contasReceber, contasPagar, caixaMensal, planoContas, comissoes } from "./entities";

export type UserRole = "admin" | "vendedor" | "user";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  total?: number;
}

export type ClientAppRouter = Record<string, unknown>;
