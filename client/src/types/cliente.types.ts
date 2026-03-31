/**
 * Tipos para Clientes
 * Sem `any` - tipagem 100% forte
 */

export interface Cliente {
  id: number;
  nome: string;
  telefone?: string;
  telefoneRecado?: string;
  cpf?: string;
  cep?: string;
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  referencia?: string;
  condominio?: string;
  bloco?: string;
  apartamento?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClienteCreateInput {
  nome: string;
  telefone: string;
  telefoneRecado?: string;
  cpf?: string;
  cep?: string;
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  referencia?: string;
  condominio?: string;
  bloco?: string;
  apartamento?: string;
  vendedorIdPrincipal?: number;
}

export interface ClienteUpdateInput extends Partial<ClienteCreateInput> {
  id: number;
}

export interface ClienteListResponse {
  items: Cliente[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ClienteListParams {
  page?: number;
  pageSize?: number;
}
