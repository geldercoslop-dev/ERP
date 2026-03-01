import { notifyOwner } from './_core/notification';

/**
 * Envia notificação push para o proprietário (admin)
 */
export async function notificarAdmin(titulo: string, mensagem: string) {
  try {
    await notifyOwner({
      title: titulo,
      content: mensagem,
    });
    return true;
  } catch (error) {
    console.error('[Notificações] Erro ao enviar notificação para admin:', error);
    return false;
  }
}

/**
 * Envia notificação push para um vendedor específico
 * TODO: Implementar sistema de notificações para vendedores
 * Por enquanto, apenas loga a notificação
 */
export async function notificarVendedor(vendedorId: number, titulo: string, mensagem: string) {
  try {
    // TODO: Implementar envio real de notificação push para vendedor
    // Por enquanto, apenas registra no console
    console.log(`[Notificação para Vendedor ${vendedorId}] ${titulo}: ${mensagem}`);
    return true;
  } catch (error) {
    console.error('[Notificações] Erro ao enviar notificação para vendedor:', error);
    return false;
  }
}
