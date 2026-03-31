/**
 * TIPOS BASE PARA CLIENTES
 * 
 * Uso Futuro:
 * - Payloads de API para validação
 * - Estrutura escalável para novos endpoints
 * - Separação entre DTOs e entidades
 * 
 * 🔒 NÃO integrado com lógica atual
 */

/**
 * Payload para criar cliente
 * @future: Substituir input direto do router
 */
export interface ClientePayload {
  nome: string;
  telefone: string;
  telefoneRecado?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  referencia?: string | null;
  condominio?: string | null;
  bloco?: string | null;
  apartamento?: string | null;
}

/**
 * Payload para atualizar cliente
 * @future: Usado em mutations
 */
export interface ClienteUpdatePayload extends Partial<ClientePayload> {
  id: number;
}

/**
 * Resposta de cliente (leitura)
 * @future: Tipo para GET requests
 */
export interface ClienteResponse extends ClientePayload {
  id: number;
  tenantId: number;
  userId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Filtros para listagem
 * @future: Query parameters type-safe
 */
export interface ClienteFilters {
  page?: number;
  pageSize?: number;
  busca?: string;
  vendedorId?: number;
  userId?: number;
}

/**
 * Permissões de acesso a cliente
 * @future: Checar antes de operações
 */
export interface ClienteAccessControl {
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canAddVendedor: boolean;
}
