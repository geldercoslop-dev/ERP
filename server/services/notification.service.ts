import { createLogger } from "../infra/structured-logger.js";
import { ValidationError } from "../_core/errors/typed-errors.js";

const logger = createLogger("notification-service");

export type NotificationChannel = "whatsapp" | "email";

export type NotificationResult = {
  channel: NotificationChannel;
  status: "disabled";
  delivered: false;
  reason: string;
};

/**
 * Notificações externas — Provider explícito desabilitado.
 * 
 * Este serviço retorna status "disabled" quando provedores não estão configurados.
 * Para habilitar notificações reais, configure as variáveis de ambiente apropriadas
 * e implemente a integração com o provider (Twilio, Meta Cloud API, SMTP, etc.).
 */

export async function sendWhatsApp(message: string): Promise<NotificationResult> {
  if (!message || message.trim().length === 0) {
    throw new ValidationError("EMPTY_NOTIFICATION_MESSAGE");
  }

  logger.warn("WhatsApp notification disabled - provider not configured", {
    metadata: {
      channel: "whatsapp",
      messageLength: message.length,
    },
  });

  return {
    channel: "whatsapp",
    status: "disabled",
    delivered: false,
    reason: "WHATSAPP_PROVIDER_NOT_CONFIGURED",
  };
}

export async function sendEmail(message: string): Promise<NotificationResult> {
  if (!message || message.trim().length === 0) {
    throw new ValidationError("EMPTY_NOTIFICATION_MESSAGE");
  }

  logger.warn("Email notification disabled - provider not configured", {
    metadata: {
      channel: "email",
      messageLength: message.length,
    },
  });

  return {
    channel: "email",
    status: "disabled",
    delivered: false,
    reason: "EMAIL_PROVIDER_NOT_CONFIGURED",
  };
}
