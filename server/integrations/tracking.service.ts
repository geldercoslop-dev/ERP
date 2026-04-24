/**
 * Rastreamento de entregas — LinkeTrack (linketrack.com) agrega Correios e outras transportadoras.
 * API pública; documentação: https://linketrack.com/api
 */
const TRACKING_BASE = "https://linketrack.com/track/json";

/**
 * Rastreia um código de objeto/entrega.
 * Tenta Link&Track (linketrack.com) que agrega Correios e outras.
 */
export async function rastrearEntrega(codigo: string): Promise<{
  ok: boolean;
  codigo?: string;
  eventos?: { data: string; hora?: string; descricao: string; local?: string }[];
  erro?: string;
}> {
  const c = String(codigo).trim().replace(/\s/g, "");
  if (!c) return { ok: false, erro: "Informe o código de rastreio." };
  try {
    const res = await fetch(`${TRACKING_BASE}?codigo=${encodeURIComponent(c)}`, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, erro: "Serviço de rastreio indisponível." };
    const data = await res.json() as unknown;
    const eventos = ((data as { eventos?: unknown[] }).eventos ?? []).map((e: unknown) => ({
      data: (e as { data?: string }).data ?? "",
      hora: (e as { hora?: string }).hora,
      descricao: (e as { descricao?: string; status?: string }).descricao ?? (e as { status?: string }).status ?? "",
      local: (e as { unidade?: { local?: string; cidade?: string }; local?: string }).unidade?.local ?? (e as { unidade?: { cidade?: string } }).unidade?.cidade ?? (e as { local?: string }).local,
    }));
    return {
      ok: true,
      codigo: c,
      eventos: eventos.length ? eventos : undefined,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Timeout ao rastrear. Tente novamente." : (e instanceof Error ? e.message : "Erro ao rastrear. Verifique o código.");
    return { ok: false, erro: msg };
  }
}
