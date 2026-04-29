/**
 * Integração BrasilAPI — CNPJ, DDD, feriados nacionais (gratuito).
 * https://brasilapi.com.br/
 * Cache: 5 min (server/cache/api-cache.ts).
 */
import { getOrSet } from "../cache/api-cache.js";

const BASE = "https://brasilapi.com.br/api";

export type CnpjResponse = {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  data_inicio_atividade?: string;
};

export type DddResponse = { state: string; cities: string[] };

export type FeriadoResponse = { date: string; name: string; type: string };

function limparCnpj(cnpj: string): string {
  return String(cnpj).replace(/\D/g, "").slice(0, 14);
}

/** Consulta CNPJ na Receita (via BrasilAPI). */
export async function consultarCnpj(cnpj: string): Promise<{
  ok: boolean;
  dados?: CnpjResponse;
  erro?: string;
}> {
  const c = limparCnpj(cnpj);
  if (c.length !== 14) return { ok: false, erro: "CNPJ deve ter 14 dígitos." };
  return getOrSet(`brasilapi:cnpj:${c}`, async () => {
    try {
      const res = await fetch(`${BASE}/cnpj/v1/${c}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { ok: false, erro: "CNPJ não encontrado ou serviço indisponível." };
      const data = (await res.json()) as CnpjResponse;
      return { ok: true, dados: data };
    } catch (e: unknown) {
      const msg = e instanceof Error && e.name === "AbortError" ? "Timeout ao consultar CNPJ." : e instanceof Error ? e.message : "Erro ao consultar BrasilAPI.";
      return { ok: false, erro: msg };
    }
  });
}

/** Consulta DDD (lista de cidades do estado). */
export async function consultarDdd(ddd: string): Promise<{
  ok: boolean;
  estado?: string;
  cidades?: string[];
  erro?: string;
}> {
  const d = String(ddd).replace(/\D/g, "").slice(0, 2);
  if (d.length !== 2) return { ok: false, erro: "DDD deve ter 2 dígitos." };
  return getOrSet(`brasilapi:ddd:${d}`, async () => {
    try {
      const res = await fetch(`${BASE}/ddd/v1/${d}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { ok: false, erro: "DDD não encontrado." };
      const data = (await res.json()) as DddResponse;
      return { ok: true, estado: data.state, cidades: data.cities };
    } catch (e: unknown) {
      return { ok: false, erro: e instanceof Error ? e.message : "Erro ao consultar DDD." };
    }
  });
}

/** Feriados nacionais do ano. */
export async function listarFeriadosNacionais(ano: number): Promise<{
  ok: boolean;
  feriados?: FeriadoResponse[];
  erro?: string;
}> {
  return getOrSet(`brasilapi:feriados:${ano}`, async () => {
    try {
      const res = await fetch(`${BASE}/feriados/v1/${ano}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { ok: false, erro: "Erro ao listar feriados." };
      const data = (await res.json()) as FeriadoResponse[];
      return { ok: true, feriados: data };
    } catch (e: unknown) {
      const msg = e instanceof Error && e.name === "AbortError" ? "Timeout ao listar feriados." : e instanceof Error ? e.message : "Erro ao consultar feriados.";
      return { ok: false, erro: msg };
    }
  });
}
