/**
 * Integração Nominatim (OpenStreetMap) — geocoding gratuito, sem chave.
 * Converte endereço em coordenadas (lat/lon) para mapa de clientes e rotas.
 * https://nominatim.org/release-docs/develop/api/Overview/
 */
const BASE = "https://nominatim.openstreetmap.org/search";

export type Coordenadas = { lat: number; lon: number; displayName?: string };

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Converte endereço em coordenadas (lat, lon).
 */
export async function converterEnderecoCoordenadas(endereco: string): Promise<{
  ok: boolean;
  coordenadas?: Coordenadas[];
  erro?: string;
}> {
  const q = String(endereco).trim();
  if (!q) return { ok: false, erro: "Informe o endereço." };
  try {
    const params = new URLSearchParams({
      q: q + " Brasil",
      format: "json",
      limit: "5",
    });
    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "ERP-GRS-Leo/1.0" },
    });
    if (!res.ok) return { ok: false, erro: "Serviço de geocoding indisponível." };
    const data = (await res.json()) as NominatimResponse[];
    const coordenadas: Coordenadas[] = data.map((d) => ({
      lat: Number(d.lat),
      lon: Number(d.lon),
      displayName: d.display_name,
    }));
    return { ok: true, coordenadas };
  } catch (e: unknown) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Timeout ao converter endereço." : e instanceof Error ? e.message : "Erro ao converter endereço.";
    return { ok: false, erro: msg };
  }
}
