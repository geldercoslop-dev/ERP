import { Request } from 'express';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';

// Tipos reais para type safety
interface Item {
  produto_id: number;
  quantidade: number;
  subtotal: number;
}

interface TopProduto {
  produto_id: number;
  produto_nome: string;
  quantidade: number;
  valor_total: number;
}

const pedidoItemSchema = z.object({
  produto_id: z.number().min(1, 'ID do produto é obrigatório'),
  quantidade: z.number().min(1, 'Quantidade deve ser maior que 0'),
  preco_unitario: z.number().min(0, 'Preço unitário deve ser maior ou igual a 0'),
  subtotal: z.number().min(0, 'Subtotal deve ser maior ou igual a 0')
});

const pedidoSchema = z.object({
  id: z.number().optional(),
  cliente_id: z.number().min(1, 'ID do cliente é obrigatório'),
  data_pedido: z.string().min(1, 'Data do pedido é obrigatória'),
  status: z.enum(['PENDENTE', 'CONFIRMADO', 'EM_PRODUCAO', 'PRONTO', 'ENTREGUE', 'CANCELADO']),
  forma_pagamento: z.enum(['PIX', 'BOLETO', 'CARTAO', 'DINHEIRO', 'MISTO']),
  valor_total: z.number().min(0, 'Valor total deve ser maior ou igual a 0'),
  valor_desconto: z.number().min(0, 'Valor do desconto deve ser maior ou igual a 0').optional(),
  valor_acrescimo: z.number().min(0, 'Valor do acréscimo deve ser maior ou igual a 0').optional(),
  observacoes: z.string().optional(),
  endereco_entrega: z.object({
    rua: z.string().min(1, 'Rua é obrigatória'),
    numero: z.string().min(1, 'Número é obrigatório'),
    bairro: z.string().min(1, 'Bairro é obrigatório'),
    cidade: z.string().min(1, 'Cidade é obrigatória'),
    estado: z.string().length(2, 'Estado deve ter 2 dígitos'),
    cep: z.string().min(8, 'CEP deve ter pelo menos 8 dígitos')
  }),
  itens: z.array(pedidoItemSchema).min(1, 'Pedido deve ter pelo menos um item'),
  data_entrega: z.string().optional(),
  data_confirmacao: z.string().optional()
});

type Pedido = z.infer<typeof pedidoSchema>;
type PedidoItem = z.infer<typeof pedidoItemSchema>;

// Mock de produtos (em produção viria do banco de dados)
const produtos = [
  { id: 1, nome: 'Sofá 3 Lugares', estoque: 12, preco: 1200.00 },
  { id: 2, nome: 'Mesa de Jantar', estoque: 8, preco: 850.00 },
  { id: 3, nome: 'Cadeira Escritório', estoque: 25, preco: 320.00 }
];

// Mock de clientes
const clientes = [
  { id: 1, nome: 'João Silva' },
  { id: 2, nome: 'Maria Santos' },
  { id: 3, nome: 'Carlos Oliveira' }
];

let pedidos: Pedido[] = [
  {
    id: 1,
    cliente_id: 1,
    data_pedido: '2024-06-15',
    status: 'ENTREGUE',
    forma_pagamento: 'DINHEIRO',
    valor_total: 2450.00,
    endereco_entrega: {
      rua: 'Rua das Flores',
      numero: '123',
      bairro: 'Centro',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01234567'
    },
    itens: [
      {
        produto_id: 1,
        quantidade: 1,
        preco_unitario: 1200.00,
        subtotal: 1200.00
      },
      {
        produto_id: 2,
        quantidade: 1,
        preco_unitario: 850.00,
        subtotal: 850.00
      }
    ],
    data_entrega: '2024-06-16',
    data_confirmacao: '2024-06-15'
  }
];

// Função para verificar estoque
function verificarEstoqueDisponivel(itens: PedidoItem[]): { disponivel: boolean; itensIndisponiveis: unknown[] } {
  const itensIndisponiveis: unknown[] = [];
  
  for (const item of itens) {
    const produto = produtos.find(p => p.id === item.produto_id);
    if (!produto) {
      itensIndisponiveis.push({
        produto_id: item.produto_id,
        erro: 'Produto não encontrado'
      });
      continue;
    }
    
    if (produto.estoque < item.quantidade) {
      itensIndisponiveis.push({
        produto_id: item.produto_id,
        produto_nome: produto.nome,
        estoque_disponivel: produto.estoque,
        quantidade_solicitada: item.quantidade,
        erro: 'Estoque insuficiente'
      });
    }
  }
  
  return {
    disponivel: itensIndisponiveis.length === 0,
    itensIndisponiveis
  };
}

// Função para subtrair estoque
function subtrairEstoque(itens: PedidoItem[]): void {
  for (const item of itens) {
    const produto = produtos.find(p => p.id === item.produto_id);
    if (produto) {
      produto.estoque -= item.quantidade;
    }
  }
}

// Função para devolver estoque
function devolverEstoque(itens: PedidoItem[]): void {
  for (const item of itens) {
    const produto = produtos.find(p => p.id === item.produto_id);
    if (produto) {
      produto.estoque += item.quantidade;
    }
  }
}

// Função para calcular valor total
function calcularValorTotal(itens: PedidoItem[]): number {
  return itens.reduce((total, item) => total + item.subtotal, 0);
}

export async function getPedidos(request: Request) {
  try {
    // Enriquece os pedidos com informações do cliente e produtos
    const pedidosEnriquecidos = pedidos.map(pedido => ({
      ...pedido,
      cliente: clientes.find(c => c.id === pedido.cliente_id),
      itens: pedido.itens.map(item => ({
        ...item,
        produto: produtos.find(p => p.id === item.produto_id)
      }))
    }));
    
    return { pedidos: pedidosEnriquecidos, total: pedidosEnriquecidos.length };
  } catch (error) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar pedidos' });
  }
}

export async function getPedidoById(request: Request) {
  try {
    const { id } = request.params as { id: string };
    const pedido = pedidos.find(p => p.id === parseInt(id));
    
    if (!pedido) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
    }
    
    // Enriquece com informações do cliente e produtos
    const pedidoEnriquecido = {
      ...pedido,
      cliente: clientes.find(c => c.id === pedido.cliente_id),
      itens: pedido.itens.map(item => ({
        ...item,
        produto: produtos.find(p => p.id === item.produto_id)
      }))
    };
    
    return pedidoEnriquecido;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar pedido' });
  }
}

export async function createPedido(request: Request) {
  try {
    const pedidoData = pedidoSchema.parse(request.body);
    
    // Verifica estoque disponível
    const verificacaoEstoque = verificarEstoqueDisponivel(pedidoData.itens);
    
    if (!verificacaoEstoque.disponivel) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Estoque insuficiente' });
    }
    
    // Calcula valor total no servidor (não confia no frontend)
    const valorTotalCalculado = calcularValorTotal(pedidoData.itens);
    const valorFinal = valorTotalCalculado - (pedidoData.valor_desconto || 0) + (pedidoData.valor_acrescimo || 0);
    
    const novoPedido: Pedido = {
      ...pedidoData,
      id: pedidos.length + 1,
      valor_total: valorFinal,
      data_pedido: pedidoData.data_pedido || new Date().toISOString().split('T')[0],
      data_confirmacao: pedidoData.data_confirmacao || new Date().toISOString().split('T')[0]
    };
    
    // Subtrai do estoque
    subtrairEstoque(pedidoData.itens);
    
    pedidos.push(novoPedido);
    
    return {
      message: 'Pedido criado com sucesso',
      pedido: novoPedido,
      estoque_atualizado: produtos.map(p => ({
        id: p.id,
        nome: p.nome,
        estoque_anterior: p.estoque + (pedidoData.itens.find(item => item.produto_id === p.id)?.quantidade || 0),
        estoque_atual: p.estoque
      }))
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dados inválidos' });
    }
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao criar pedido' });
  }
}

export async function updatePedido(request: Request) {
  try {
    const { id } = request.params as { id: string };
    const pedidoData = pedidoSchema.parse(request.body);
    
    const index = pedidos.findIndex(p => p.id === parseInt(id));
    if (index === -1) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
    }
    
    // Se os itens mudaram, verifica estoque novamente
    if (JSON.stringify(pedidos[index].itens) !== JSON.stringify(pedidoData.itens)) {
      const verificacaoEstoque = verificarEstoqueDisponivel(pedidoData.itens);
      
      if (!verificacaoEstoque.disponivel) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Estoque insuficiente' });
      }
      
      // Recalcula o estoque (devolve o antigo e subtrai o novo)
      for (const item of pedidos[index].itens) {
        const produto = produtos.find(p => p.id === item.produto_id);
        if (produto) {
          produto.estoque += item.quantidade;
        }
      }
      subtrairEstoque(pedidoData.itens);
    }
    
    // Recalcula valor total
    const valorTotalCalculado = calcularValorTotal(pedidoData.itens);
    const valorFinal = valorTotalCalculado - (pedidoData.valor_desconto || 0) + (pedidoData.valor_acrescimo || 0);
    
    pedidos[index] = { 
      ...pedidoData, 
      id: parseInt(id),
      valor_total: valorFinal
    };
    
    return { message: 'Pedido atualizado com sucesso', pedido: pedidos[index] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dados inválidos' });
    }
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao atualizar pedido' });
  }
}

export async function updateStatusPedido(request: Request) {
  try {
    const { id } = request.params as { id: string };
    const { status, data_entrega } = request.body as { 
      status: string; 
      data_entrega?: string 
    };
    
    const index = pedidos.findIndex(p => p.id === parseInt(id));
    if (index === -1) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
    }
    
    pedidos[index] = {
      ...pedidos[index],
      status: status as any,
      data_entrega: data_entrega || pedidos[index].data_entrega
    };
    
    return { message: 'Status do pedido atualizado com sucesso', pedido: pedidos[index] };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao atualizar status do pedido' });
  }
}

export async function deletePedido(request: Request) {
  try {
    const { id } = request.params as { id: string };
    const index = pedidos.findIndex(p => p.id === parseInt(id));
    
    if (index === -1) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
    }
    
    const pedidoRemovido = pedidos.splice(index, 1)[0];
    
    // Devolve produtos ao estoque usando função dedicada
    devolverEstoque(pedidoRemovido.itens);
    
    return {
      message: 'Pedido removido com sucesso',
      pedido: pedidoRemovido,
      estoque_devolvido: produtos.map(p => ({
        id: p.id,
        nome: p.nome,
        estoque_atual: p.estoque
      }))
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao remover pedido' });
  }
}

export async function buscarPedidos(request: Request) {
  try {
    const { 
      query, 
      status, 
      cliente_id, 
      data_inicio, 
      data_fim 
    } = request.query as { 
      query?: string; 
      status?: string; 
      cliente_id?: string; 
      data_inicio?: string; 
      data_fim?: string 
    };
    
    let pedidosFiltrados = pedidos.map(pedido => ({
      ...pedido,
      cliente: clientes.find(c => c.id === pedido.cliente_id),
      itens: pedido.itens.map(item => ({
        ...item,
        produto: produtos.find(p => p.id === item.produto_id)
      }))
    }));
    
    // Filtro por texto
    if (query) {
      const queryLower = query.toLowerCase();
      pedidosFiltrados = pedidosFiltrados.filter(pedido => 
        pedido.cliente?.nome.toLowerCase().includes(queryLower) ||
        String(pedido.id ?? "").includes(query)
      );
    }
    
    // Filtro por status
    if (status) {
      pedidosFiltrados = pedidosFiltrados.filter(pedido => 
        pedido.status === status.toUpperCase()
      );
    }
    
    // Filtro por cliente
    if (cliente_id) {
      pedidosFiltrados = pedidosFiltrados.filter(pedido => 
        pedido.cliente_id === parseInt(cliente_id)
      );
    }
    
    // Filtro por período
    if (data_inicio && data_fim) {
      pedidosFiltrados = pedidosFiltrados.filter(pedido => 
        pedido.data_pedido >= data_inicio && pedido.data_pedido <= data_fim
      );
    }
    
    return { pedidos: pedidosFiltrados, total: pedidosFiltrados.length };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar pedidos' });
  }
}

export async function getPedidosPorCliente(request: Request) {
  try {
    const { cliente_id } = request.params as { cliente_id: string };
    
    const pedidosCliente = pedidos
      .filter(p => p.cliente_id === parseInt(cliente_id))
      .map(pedido => ({
        ...pedido,
        cliente: clientes.find(c => c.id === pedido.cliente_id),
        itens: pedido.itens.map(item => ({
          ...item,
          produto: produtos.find(p => p.id === item.produto_id)
        }))
      }));
    
    return {
      cliente: clientes.find(c => c.id === parseInt(cliente_id)),
      pedidos: pedidosCliente,
      total: pedidosCliente.length,
      valor_total: pedidosCliente.reduce((sum, pedido) => sum + pedido.valor_total, 0)
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar pedidos do cliente' });
  }
}

export async function getRelatorioVendas(request: Request) {
  try {
    const { data_inicio, data_fim } = request.query as { 
      data_inicio?: string; 
      data_fim?: string 
    };
    
    let pedidosRelatorio = pedidos;
    
    if (data_inicio && data_fim) {
      pedidosRelatorio = pedidos.filter(pedido => 
        pedido.data_pedido >= data_inicio && pedido.data_pedido <= data_fim
      );
    }
    
    const relatorio = {
      periodo: { data_inicio, data_fim },
      total_pedidos: pedidosRelatorio.length,
      valor_total_vendas: pedidosRelatorio.reduce((sum, pedido) => sum + pedido.valor_total, 0),
      pedidos_por_status: pedidosRelatorio.reduce((acc, pedido) => {
        acc[pedido.status] = (acc[pedido.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      forma_pagamento_mais_usada: pedidosRelatorio.reduce((acc, pedido) => {
        acc[pedido.forma_pagamento] = (acc[pedido.forma_pagamento] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      top_produtos: pedidosRelatorio.flatMap(p => p.itens)
        .reduce((acc, item) => {
          const existing = acc.find((a: TopProduto) => a.produto_id === item.produto_id);
          if (existing) {
            existing.quantidade += item.quantidade;
            existing.valor_total += item.subtotal;
          } else {
            acc.push({
              produto_id: item.produto_id,
              produto_nome: produtos.find(p => p.id === item.produto_id)?.nome || 'Produto não encontrado',
              quantidade: item.quantidade,
              valor_total: item.subtotal
            });
          }
          return acc;
        }, [] as TopProduto[])
        .sort((a: TopProduto, b: TopProduto) => b.valor_total - a.valor_total)
        .slice(0, 10)
    };
    
    return relatorio;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao gerar relatório de vendas' });
  }
}
