import { notifyOwner } from '../../_core/notification';
import { nanoid } from 'nanoid';

// Tipo principal de notificação
export type Notification = {
  id: string;
  type: "info" | "warning" | "error";
  message: string;
  userId?: string;
  createdAt: Date;
};

// Armazenamento em memória (mock)
const notifications: Notification[] = [];

/**
 * Função principal de notificação
 */
export async function notify(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification> {
  const fullNotification: Notification = {
    ...notification,
    id: nanoid(),
    createdAt: new Date(),
  };

  try {
    await notifyOwner({
      title: `[${notification.type.toUpperCase()}]`,
      content: notification.message,
    });
    
    // Salvar no armazenamento
    notifications.push(fullNotification);
    console.log(`[Notificação] Enviada: ${fullNotification.id}`);
    
    return fullNotification;
  } catch (error) {
    console.error('[Notificação] Erro ao enviar:', error);
    // Mesmo se falhar o envio, salvamos localmente
    notifications.push(fullNotification);
    throw error;
  }
}

/**
 * Envia múltiplas notificações
 */
export async function notifyMultiple(notificationsData: Omit<Notification, 'id' | 'createdAt'>[]): Promise<Notification[]> {
  const results: Notification[] = [];
  
  for (const notificationData of notificationsData) {
    try {
      const result = await notify(notificationData);
      results.push(result);
    } catch (error) {
      console.error('[Notificação] Erro ao enviar múltiplas:', error);
      // Continua enviando as outras
    }
  }
  
  return results;
}

/**
 * Busca notificações
 */
export async function getNotifications(userId?: string): Promise<Notification[]> {
  if (userId) {
    return notifications.filter(n => n.userId === userId);
  }
  return [...notifications];
}

/**
 * Marca notificação como lida (mock)
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
  // TODO: Implementar marcação como lida
  return true;
}

/**
 * Envia notificação push para o proprietário (admin)
 */
export async function notificarAdmin(titulo: string, mensagem: string): Promise<boolean> {
  try {
    await notify({
      type: 'info',
      message: mensagem,
      userId: 'admin',
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
export async function notificarVendedor(vendedorId: number, titulo: string, mensagem: string): Promise<boolean> {
  try {
    await notify({
      type: 'info',
      message: mensagem,
      userId: vendedorId.toString(),
    });
    return true;
  } catch (error) {
    console.error('[Notificações] Erro ao enviar notificação para vendedor:', error);
    return false;
  }
}
