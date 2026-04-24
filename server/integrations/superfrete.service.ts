/**
 * Integração SuperFrete — cotação, etiqueta e rastreamento.
 * Requer SUPERFRETE_API_KEY.
 * Documentação: https://superfrete.readme.io/
 * Cache: 5 min para cotação (server/cache/api-cache.ts).
 */
import { getOrSet } from "../cache/api-cache.js";

const BASE = process.env.SUPERFRETE_SANDBOX === "1"
  ? "https://sandbox.superfrete.com"
  : "https://api.superfrete.com";

function getToken(): string | undefined {
  return process.env.SUPERFRETE_API_KEY;
}

function getHeaders(): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "User-Agent": "ERP-GRS-Leo/1.0 (contato@grs.app)",
  };
}

export type CotacaoSuperFreteParams = {
  cepOrigem: string;
  cepDestino: string;
  peso: number; // kg
  largura?: number; // cm
  altura?: number; // cm
  comprimento?: number; // cm
};

export type OpcaoSuperFrete = {
  nome: string;
  preco: number;
  prazo: number; // dias
};

/**
 * Cotar frete via SuperFrete.
 * Sem chave retorna: "integração SuperFrete não configurada"
 */
export async function cotarFreteSuperFrete(params: CotacaoSuperFreteParams): Promise<{
  ok: boolean;
  opcoes?: OpcaoSuperFrete[];
  erro?: string;
}> {
  const token = getToken();
  if (!token) {
    return { ok: false, erro: "integração SuperFrete não configurada" };
  }
  const cacheKey = `superfrete:${params.cepOrigem.replace(/\D/g, "")}:${params.cepDestino.replace(/\D/g, "")}:${params.peso}:${params.largura ?? 16}:${params.altura ?? 10}:${params.comprimento ?? 20}`;
  return getOrSet(cacheKey, async () => {
    const TIMEOUT_MS = 20000;
    try {
      const body = {
        from: { postal_code: params.cepOrigem.replace(/\D/g, "").slice(0, 8) },
        to: { postal_code: params.cepDestino.replace(/\D/g, "").slice(0, 8) },
        package: {
          weight: params.peso,
          width: params.largura ?? 16,
          height: params.altura ?? 10,
          length: params.comprimento ?? 20,
        },
      };
      const res = await fetch(`${BASE}/api/v0/calculator`, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text();
        return { ok: false, erro: err || "Erro ao cotar frete SuperFrete." };
      }
      const data = await res.json() as unknown;
      const dataRecord = data as Record<string, unknown>;
      const list = Array.isArray(data) ? data : (dataRecord.data as unknown[] | undefined) ?? (dataRecord.offers as unknown[] | undefined) ?? [];
      const opcoes: OpcaoSuperFrete[] = list.map((x: unknown) => {
        const item = x as Record<string, unknown>;
        const carrier = item.carrier as Record<string, unknown> | undefined;
        return {
          nome: String(carrier?.name ?? item.name ?? item.transportadora ?? "Transportadora"),
          preco: Number(item.price ?? item.valor ?? item.cost ?? 0),
          prazo: Number(item.delivery_time ?? item.prazo ?? item.days ?? 0),
        };
      }).filter((o: OpcaoSuperFrete) => o.nome);
      return { ok: true, opcoes: opcoes.length ? opcoes : undefined };
    } catch (e: unknown) {
      const msg = e instanceof Error && e.name === "AbortError" ? "Timeout ao cotar SuperFrete." : e instanceof Error ? e.message : "Erro ao cotar frete.";
      return { ok: false, erro: msg };
    }
  });
}

/**
 * Gera etiqueta de envio (requer pedido/serviço já criado no SuperFrete).
 */
export async function gerarEtiquetaSuperFrete(shipmentId: string): Promise<{
  ok: boolean;
  urlEtiqueta?: string;
  erro?: string;
}> {
  const token = getToken();
  if (!token) {
    return { ok: false, erro: "integração SuperFrete não configurada" };
  }
  try {
    const res = await fetch(`${BASE}/api/v0/shipments/${shipmentId}/label`, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
      headers: getHeaders(),
    });
    if (!res.ok) return { ok: false, erro: "Erro ao gerar etiqueta SuperFrete." };
    const data = await res.json() as unknown;
    const dataRecord = data as Record<string, unknown>;
    const url = String(dataRecord.url ?? dataRecord.link ?? dataRecord.label_url ?? dataRecord.pdf_url);
    return { ok: true, urlEtiqueta: url };
  } catch (e: unknown) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Timeout ao gerar etiqueta." : e instanceof Error ? e.message : "Erro ao gerar etiqueta.";
    return { ok: false, erro: msg };
  }
}

/**
 * Consulta rastreamento de entrega pelo código.
 */
export async function consultarRastreamentoSuperFrete(codigo: string): Promise<{
  ok: boolean;
  codigo?: string;
  eventos?: { data: string; hora?: string; descricao: string; local?: string }[];
  erro?: string;
}> {
  const token = getToken();
  if (!token) {
    return { ok: false, erro: "integração SuperFrete não configurada" };
  }
  const c = String(codigo).trim().replace(/\s/g, "");
  if (!c) return { ok: false, erro: "Informe o código de rastreio." };
  try {
    const res = await fetch(`${BASE}/api/v0/tracking?code=${encodeURIComponent(c)}`, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
      headers: getHeaders(),
    });
    if (!res.ok) return { ok: false, erro: "Rastreamento não encontrado ou indisponível." };
    const data = await res.json() as unknown;
    const eventos = ((data as { tracking?: { events?: unknown[] } }).tracking?.events ?? (data as { events?: unknown[] }).events ?? (data as { history?: unknown[] }).history ?? []).map((e: unknown) => ({
      data: (e as { date?: string; data?: string }).date ?? (e as { data?: string }).data ?? "",
      hora: (e as { time?: string; hora?: string }).time ?? (e as { hora?: string }).hora,
      descricao: (e as { description?: string; descricao?: string; status?: string }).description ?? (e as { descricao?: string }).descricao ?? (e as { status?: string }).status ?? "",
      local: (e as { location?: string; local?: string; place?: string }).location ?? (e as { local?: string }).local ?? (e as { place?: string }).place,
    }));
    return {
      ok: true,
      codigo: c,
      eventos: eventos.length ? eventos : undefined,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Timeout ao rastrear." : (e instanceof Error ? e.message : "Erro ao rastrear.");
    return { ok: false, erro: msg };
  }
}
