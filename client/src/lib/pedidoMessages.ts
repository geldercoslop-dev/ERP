/**
 * Mensagens padronizadas para o sistema de pedidos
 */

/**
 * Retorna a mensagem de venda gerada com sucesso
 */
export function mensagemVendaGerada(clienteNome: string) {
  return {
    title: "Venda Registrada",
    description: `Pedido para ${clienteNome} registrado com sucesso!`,
  };
}

/**
 * Retorna a mensagem de pendência gerada
 */
export function mensagemPendenciaGerada(clienteNome: string) {
  return {
    title: "Pendência Gerada",
    description: `Uma pendência de compra foi gerada para atender ${clienteNome}`,
  };
}

/**
 * Retorna a mensagem de status do pedido
 * @param status Status do pedido
 * @param clienteNome Nome do cliente
 * @param numeroPedido Número do pedido
 * @returns Objeto com título e descrição da mensagem
 */
export function mensagemStatusPedido(status: string, clienteNome: string, numeroPedido?: number | string) {
  const numFormatado = numeroPedido ? `#${numeroPedido}` : '';
  
  switch (status) {
    case 'ENTREGUE':
      return {
        title: "Pedido Entregue",
        description: `Pedido ${numFormatado} para ${clienteNome} foi entregue com sucesso!`,
      };
    case 'CANCELADO':
      return {
        title: "Pedido Cancelado",
        description: `Pedido ${numFormatado} para ${clienteNome} foi cancelado.`,
      };
    case 'EM_ROTA':
      return {
        title: "Pedido em Rota",
        description: `Pedido ${numFormatado} para ${clienteNome} está em rota de entrega.`,
      };
    case 'PENDENTE':
      return {
        title: "Pedido Pendente",
        description: `Pedido ${numFormatado} para ${clienteNome} está pendente de processamento.`,
      };
    case 'SEPARADO':
      return {
        title: "Pedido Separado",
        description: `Pedido ${numFormatado} para ${clienteNome} foi separado e está pronto para entrega.`,
      };
    default:
      return {
        title: "Status Atualizado",
        description: `Pedido ${numFormatado} para ${clienteNome} teve seu status atualizado para ${status}.`,
      };
  }
}