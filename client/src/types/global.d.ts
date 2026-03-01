// Tipos globais para o projeto

// Re-exportar tipos do Drizzle para facilitar o uso
import type {
  Vendedor,
  Cliente,
  Produto,
  Pedido,
  ItemPedido,
  Carga,
  PedidoCarga,
  Comissao,
  GrupoPrecificacao,
  Pendencia,
  Cor,
} from "../../../drizzle/schema";

// Declarar os tipos globalmente
declare global {
  // Tipos de entidades
  type TVendedor = Vendedor;
  type TCliente = Cliente;
  type TProduto = Produto;
  type TPedido = Pedido;
  type TItemPedido = ItemPedido;
  type TCarga = Carga;
  type TPedidoCarga = PedidoCarga;
  type TComissao = Comissao;
  type TGrupoPrecificacao = GrupoPrecificacao;
  type TPendencia = Pendencia;
  type TCor = Cor;
  
  // Tipos de usuário
  type UserRole = 'admin' | 'vendedor';
  
  // Definição do objeto User para IntelliSense
  interface User {
    id: number;
    openId: string;
    name: string;
    email?: string | null;
    role: UserRole;
    nivel_acesso?: string;  // Campo legado para compatibilidade
  }
  
  // Tipos de formulários
  interface FormErrors {
    [key: string]: string;
  }
  
  // Tipos de respostas da API
  interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
  }
}

// Exportar para uso em arquivos TypeScript
export type {
  Vendedor,
  Cliente,
  Produto,
  Pedido,
  ItemPedido,
  Carga,
  PedidoCarga,
  Comissao,
  GrupoPrecificacao,
  Pendencia,
  Cor,
};