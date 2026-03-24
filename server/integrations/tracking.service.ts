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
    const data = (await res.json()) as any;
    const eventos = (data.eventos ?? []).map((e: any) => ({
      data: e.data ?? "",
      hora: e.hora,
      descricao: e.descricao ?? e.status ?? "",
      local: e.unidade?.local ?? e.unidade?.cidade ?? e.local,
    }));
    return {
      ok: true,
      codigo: c,
      eventos: eventos.length ? eventos : undefined,
    };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Timeout ao rastrear. Tente novamente." : e?.message ?? "Erro ao rastrear. Verifique o código.";
    return { ok: false, erro: msg };
  }
}
