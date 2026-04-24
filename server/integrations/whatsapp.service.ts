/**
 * Integração WhatsApp — Z-API ou Evolution API (self-hosted).
 * Requer configuração: ZAPI_INSTANCE, ZAPI_TOKEN ou EVOLUTION_API_URL + EVOLUTION_API_KEY.
 */
function getZApiConfig(): { instance: string; token: string } | null {
  const i = process.env.ZAPI_INSTANCE ?? process.env.EVOLUTION_INSTANCE;
  const t = process.env.ZAPI_TOKEN ?? process.env.EVOLUTION_API_KEY;
  if (i && t) return { instance: i, token: t };
  return null;
}

function getEvolutionBase(): string | null {
  return process.env.EVOLUTION_API_URL ?? null;
}

/**
 * Envia mensagem de texto via WhatsApp (Z-API ou Evolution).
 */
export async function enviarMensagemWhatsApp(
  numero: string,
  mensagem: string
): Promise<{ ok: boolean; erro?: string }> {
  const zapi = getZApiConfig();
  if (zapi) {
    try {
      const res = await fetch(
        `https://api.z-api.io/instances/${zapi.instance}/token/${zapi.token}/send-text`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: numero.replace(/\D/g, ""),
            message: mensagem,
          }),
        }
      );
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) return { ok: false, erro: data?.message ?? data?.error ?? "Falha ao enviar." };
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, erro: e instanceof Error ? e.message : "Erro Z-API." };
    }
  }
  const evolution = getEvolutionBase();
  if (evolution) {
    try {
      const instance = process.env.EVOLUTION_INSTANCE ?? "default";
      const res = await fetch(`${evolution}/message/sendText/${instance}`, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", apikey: process.env.EVOLUTION_API_KEY ?? "" },
        body: JSON.stringify({ number: numero.replace(/\D/g, ""), text: mensagem }),
      });
      if (!res.ok) return { ok: false, erro: "Evolution API: falha ao enviar." };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.message ?? "Erro Evolution API." };
    }
  }
  return { ok: false, erro: "WhatsApp não configurado (Z-API ou Evolution API)." };
}

/** Envia link de boleto por WhatsApp. */
export async function enviarBoletoWhatsApp(
  numero: string,
  texto: string,
  urlBoleto?: string
): Promise<{ ok: boolean; erro?: string }> {
  const msg = urlBoleto ? `${texto}\n\n${urlBoleto}` : texto;
  return enviarMensagemWhatsApp(numero, msg);
}

/** Envia status de entrega (texto livre). */
export async function enviarStatusEntrega(
  numero: string,
  pedidoRef: string,
  status: string,
  detalhe?: string
): Promise<{ ok: boolean; erro?: string }> {
  const msg = `Status da entrega - ${pedidoRef}\n${status}${detalhe ? "\n" + detalhe : ""}`;
  return enviarMensagemWhatsApp(numero, msg);
}
