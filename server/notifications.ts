import { notifyOwner } from './_core/notification.js';
import { createLogger } from './infra/structured-logger.js';

const logger = createLogger('Notifications');

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
    logger.error('[Notificações] Erro ao enviar notificação para admin', error instanceof Error ? error : new Error(String(error)), {
      operation: 'notificarAdmin'
    });
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
    logger.error('[Notificações] Erro ao enviar notificação para vendedor', error instanceof Error ? error : new Error(String(error)), {
      operation: 'notificarVendedor',
      vendedorId
    });
    return false;
  }
}
