/** Tipos de domínio do app (frontend). Alinhar com API quando integrar. */

export type AppUserRole = "admin" | "vendedor";

export interface AppUser {
  id: number;
  openId: string;
  name: string;
  email?: string | null;
  role: AppUserRole;
}

/** Cliente em modo local/mock (cadastro simplificado). */
export interface ClienteLocal {
  id: string;
  nome: string;
  telefone: string;
  endereco: string;
  createdAt: string;
}

/** Produto em modo local/mock (base para futuro estoque). */
export interface ProdutoLocal {
  id: string;
  nome: string;
  preco: number;
  descricao: string;
  estoquePrevisto?: number;
  createdAt: string;
}

/** Resumo de venda para dashboard mock. */
export interface VendaResumoMock {
  id: string;
  clienteNome: string;
  valor: number;
  data: string;
}
