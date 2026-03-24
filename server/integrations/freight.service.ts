/**
 * Integração Melhor Envio — cotação de frete e etiqueta.
 * Requer token em MELHOR_ENVIO_TOKEN e configuração no painel.
 * https://melhorenvio.com.br/documentacao/api
 * Cache: 5 min para cotação (server/cache/api-cache.ts).
 */
import { getOrSet } from "../cache/api-cache";

function getToken(): string | undefined {
  return process.env.MELHOR_ENVIO_TOKEN;
}

export type CotacaoFreteParams = {
  cepOrigem: string;
  cepDestino: string;
  peso: number; // kg
  largura?: number; // cm
  altura?: number; // cm
  comprimento?: number; // cm
};

export type OpcaoFrete = {
  nome: string;
  preco: number;
  prazo: number; // dias
};

/**
 * Cotar frete entre origem e destino.
 * Sem token retorna mensagem para configurar.
 */
export async function cotarFrete(params: CotacaoFreteParams): Promise<{
  ok: boolean;
  opcoes?: OpcaoFrete[];
  erro?: string;
}> {
  const token = getToken();
  if (!token) {
    return {
      ok: false,
      erro: "Melhor Envio não configurado. Defina MELHOR_ENVIO_TOKEN no ambiente.",
    };
  }
  const cacheKey = `freight:${params.cepOrigem.replace(/\D/g, "")}:${params.cepDestino.replace(/\D/g, "")}:${params.peso}:${params.largura ?? 16}:${params.altura ?? 10}:${params.comprimento ?? 20}`;
  return getOrSet(cacheKey, async () => {
  const TIMEOUT_MS = 20000;
  try {
    const body = {
      from: { postal_code: params.cepOrigem.replace(/\D/g, "") },
      to: { postal_code: params.cepDestino.replace(/\D/g, "") },
      products: [
        {
          weight: params.peso,
          width: params.largura ?? 16,
          height: params.altura ?? 10,
          length: params.comprimento ?? 20,
        },
      ],
    };
    const res = await fetch("https://melhorenvio.com.br/api/v2/me/shipment/calculate", {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, erro: err || "Erro ao cotar frete." };
    }
    const data = (await res.json()) as any;
    const opcoes: OpcaoFrete[] = (data ?? []).map((x: any) => ({
      nome: x.name ?? x.company?.name ?? "Transportadora",
      preco: Number(x.price ?? 0),
      prazo: Number(x.delivery_time ?? 0),
    }));
    return { ok: true, opcoes };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Timeout ao cotar frete. Tente novamente." : e?.message ?? "Erro ao cotar frete.";
    return { ok: false, erro: msg };
  }
  });
}

/** Gera etiqueta de envio (requer pedido/serviço já criado no Melhor Envio). */
export async function gerarEtiqueta(servicoId: string): Promise<{
  ok: boolean;
  urlEtiqueta?: string;
  erro?: string;
}> {
  const token = getToken();
  if (!token) {
    return { ok: false, erro: "Melhor Envio não configurado." };
  }
  try {
    const res = await fetch(`https://melhorenvio.com.br/api/v2/me/cart/${servicoId}/print`, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, erro: "Erro ao gerar etiqueta." };
    const data = (await res.json()) as any;
    return { ok: true, urlEtiqueta: data.url ?? data.link };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Timeout ao gerar etiqueta." : e?.message ?? "Erro ao gerar etiqueta.";
    return { ok: false, erro: msg };
  }
}
