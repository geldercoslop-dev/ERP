/**
 * Integração Telegram Bot API — envio de mensagens e alertas.
 * Requer TELEGRAM_BOT_TOKEN e opcionalmente TELEGRAM_CHAT_ID.
 * https://core.telegram.org/bots/api
 */
function getConfig() {
    return {
        token: process.env.TELEGRAM_BOT_TOKEN ?? "",
        chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    };
}
export async function enviarMensagemTelegram(texto, chatId) {
    const { token, chatId: defaultChat } = getConfig();
    const dest = chatId ?? defaultChat;
    if (!token || !dest) {
        return { ok: false, erro: "Telegram não configurado (TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID)." };
    }
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: dest,
                text: texto.slice(0, 4096),
                parse_mode: "HTML",
            }),
        });
        const data = (await res.json());
        if (!data.ok)
            return { ok: false, erro: data.description ?? "Falha ao enviar." };
        return { ok: true };
    }
    catch (e) {
        const msg = e?.name === "AbortError" ? "Timeout ao enviar mensagem Telegram." : e?.message ?? "Erro ao enviar Telegram.";
        return { ok: false, erro: msg };
    }
}
/** Envia alerta formatado (ex.: venda realizada, estoque zerado, pedido faturado). */
export async function enviarAlertaTelegram(tipo, dados, chatId) {
    const titulos = {
        venda_realizada: "Venda realizada",
        estoque_zerado: "Estoque zerado",
        pedido_faturado: "Pedido faturado",
        alerta: "Alerta",
    };
    const titulo = titulos[tipo] ?? "Notificação";
    const linhas = Object.entries(dados).map(([k, v]) => `<b>${k}</b>: ${v}`);
    const texto = `🔔 <b>${titulo}</b>\n\n${linhas.join("\n")}`;
    return enviarMensagemTelegram(texto, chatId);
}
