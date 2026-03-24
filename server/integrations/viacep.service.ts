/**
 * Integração ViaCEP — consulta de endereço por CEP (gratuito, sem chave).
 * https://viacep.com.br/
 * Cache: 5 min (server/cache/api-cache.ts).
 */
import { getOrSet } from "../cache/api-cache";

export type EnderecoViaCep = {
  cep: string;
  logradouro: string;
  complemento?: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
};

const BASE = "https://viacep.com.br/ws";

/** Remove não-dígitos do CEP. */
function limparCep(cep: string): string {
  return String(cep).replace(/\D/g, "").slice(0, 8);
}

/**
 * Busca endereço por CEP.
 * Retorna rua (logradouro), bairro, cidade (localidade), estado (uf).
 */
export async function buscarEnderecoPorCep(cep: string): Promise<{
  ok: boolean;
  rua?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  erro?: string;
}> {
  const c = limparCep(cep);
  if (c.length !== 8) return { ok: false, erro: "CEP deve ter 8 dígitos." };
  return getOrSet(`viacep:${c}`, async () => {
  const TIMEOUT_MS = 15000;
  try {
    const res = await fetch(`${BASE}/${c}/json/`, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json()) as EnderecoViaCep;
    if (data.erro) return { ok: false, erro: "CEP não encontrado." };
    return {
      ok: true,
      cep: data.cep,
      rua: data.logradouro || undefined,
      bairro: data.bairro || undefined,
      cidade: data.localidade,
      estado: data.uf,
    };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Timeout ao consultar ViaCEP." : e?.message ?? "Erro ao consultar ViaCEP.";
    return { ok: false, erro: msg };
  }
  });
}
