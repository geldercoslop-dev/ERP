/**
 * Notificações externas — MOCK (console).
 * Estrutura pronta para substituir por API WhatsApp / e-mail real.
 */
export async function sendWhatsApp(message) {
    console.log("[NOTIFICATION:WHATSAPP mock]", message);
    // TODO: integrar provedor (ex.: Twilio, Meta Cloud API, etc.)
}
export async function sendEmail(message) {
    console.log("[NOTIFICATION:EMAIL mock]", message);
    // TODO: integrar SMTP / SendGrid / SES, etc.
}
