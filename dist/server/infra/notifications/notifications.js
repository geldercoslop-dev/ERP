import { notifyOwner } from '../../_core/notification.js';
import { nanoid } from 'nanoid';
// Armazenamento em memória (mock)
const notifications = [];
/**
 * Função principal de notificação
 */
export async function notify(notification) {
    const fullNotification = {
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
    }
    catch (error) {
        console.error('[Notificação] Erro ao enviar:', error);
        // Mesmo se falhar o envio, salvamos localmente
        notifications.push(fullNotification);
        throw error;
    }
}
/**
 * Envia múltiplas notificações
 */
export async function notifyMultiple(notificationsData) {
    const results = [];
    for (const notificationData of notificationsData) {
        try {
            const result = await notify(notificationData);
            results.push(result);
        }
        catch (error) {
            console.error('[Notificação] Erro ao enviar múltiplas:', error);
            // Continua enviando as outras
        }
    }
    return results;
}
/**
 * Busca notificações
 */
export async function getNotifications(userId) {
    if (userId) {
        return notifications.filter(n => n.userId === userId);
    }
    return [...notifications];
}
/**
 * Marca notificação como lida (mock)
 */
export async function markAsRead(notificationId) {
    // TODO: Implementar marcação como lida
    return true;
}
/**
 * Envia notificação push para o proprietário (admin)
 */
export async function notificarAdmin(titulo, mensagem) {
    try {
        await notify({
            type: 'info',
            message: mensagem,
            userId: 'admin',
        });
        return true;
    }
    catch (error) {
        console.error('[Notificações] Erro ao enviar notificação para admin:', error);
        return false;
    }
}
/**
 * Envia notificação push para um vendedor específico
 * TODO: Implementar sistema de notificações para vendedores
 * Por enquanto, apenas loga a notificação
 */
export async function notificarVendedor(vendedorId, titulo, mensagem) {
    try {
        await notify({
            type: 'info',
            message: mensagem,
            userId: vendedorId.toString(),
        });
        return true;
    }
    catch (error) {
        console.error('[Notificações] Erro ao enviar notificação para vendedor:', error);
        return false;
    }
}
