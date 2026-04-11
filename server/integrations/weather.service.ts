/**
 * Integração OpenWeatherMap — previsão do tempo (requer API key gratuita).
 * https://openweathermap.org/api
 * Cache: 5 min (server/cache/api-cache.ts).
 */
import { getOrSet } from "../cache/api-cache.js";

const BASE = "https://api.openweathermap.org/data/2.5";

export type WeatherResult = {
  descricao: string;
  temperatura: number;
  sensacao: number;
  umidade: number;
  chuva?: number;
  previsao: string;
};

interface OpenWeatherResponse {
  name: string;
  weather: Array<{ description: string }>;
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
  };
  rain?: {
    '1h'?: number;
    '3h'?: number;
  };
}

function getApiKey(): string | undefined {
  return process.env.OPENWEATHER_API_KEY ?? process.env.OPENWEATHERMAP_API_KEY;
}

/** Busca coordenadas aproximadas por nome de cidade (Geocoding). */
async function buscarCoordenadas(cidade: string): Promise<{ lat: number; lon: number } | null> {
  const key = getApiKey();
  if (!key) return null;
  const TIMEOUT_MS = 15000;
  try {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cidade)},BR&limit=1&appid=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = await res.json();
    if (Array.isArray(data) && data[0]) {
      return { lat: data[0].lat, lon: data[0].lon };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Previsão do tempo para uma cidade (ex.: Vila Velha).
 * Retorna previsão, temperatura, chuva (pop e rain 1h se existir).
 */
export async function previsaoPorCidade(cidade: string): Promise<{
  ok: boolean;
  cidade?: string;
  dados?: WeatherResult;
  erro?: string;
}> {
  const key = getApiKey();
  if (!key) {
    return { ok: false, erro: "OpenWeatherMap não configurado. Defina OPENWEATHER_API_KEY." };
  }
  const cacheKey = `weather:${String(cidade).toLowerCase().trim()}`;
  return getOrSet(cacheKey, async () => {
  const coords = await buscarCoordenadas(cidade);
  if (!coords) {
    return { ok: false, erro: `Cidade não encontrada: ${cidade}.` };
  }
  const TIMEOUT_MS = 15000;
  try {
    const url = `${BASE}/weather?lat=${coords.lat}&lon=${coords.lon}&units=metric&lang=pt_br&appid=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ok: false, erro: "Serviço de clima indisponível." };
    const data = (await res.json()) as OpenWeatherResponse;
    const rain = data.rain?.["1h"] ?? data.rain?.["3h"] ?? 0;
    return {
      ok: true,
      cidade: data.name,
      dados: {
        descricao: data.weather?.[0]?.description ?? "",
        temperatura: Math.round(Number(data.main?.temp ?? 0)),
        sensacao: Math.round(Number(data.main?.feels_like ?? 0)),
        umidade: Number(data.main?.humidity ?? 0),
        chuva: rain > 0 ? rain : undefined,
        previsao: data.weather?.[0]?.description ?? "N/A",
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Timeout ao consultar clima." : e instanceof Error ? e.message : "Erro ao consultar clima.";
    return { ok: false, erro: msg };
  }
  });
}
