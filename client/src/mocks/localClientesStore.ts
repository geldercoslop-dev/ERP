import type { ClienteLocal } from "@/types/appDomain";
import { newLocalId } from "@/mocks/id";

const STORAGE_KEY = "grs-mock-clientes-v1";

function safeParse(raw: string | null): ClienteLocal[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is ClienteLocal =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as ClienteLocal).id === "string" &&
        typeof (x as ClienteLocal).nome === "string"
    );
  } catch {
    return [];
  }
}

export function loadClientesMock(): ClienteLocal[] {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveClientesMock(items: ClienteLocal[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function seedClientesIfEmpty(): ClienteLocal[] {
  const cur = loadClientesMock();
  if (cur.length > 0) return cur;
  const seed: ClienteLocal[] = [
    {
      id: newLocalId(),
      nome: "Cliente Exemplo",
      telefone: "(11) 99999-0000",
      endereco: "Rua das Flores, 100 — São Paulo/SP",
      createdAt: new Date().toISOString(),
    },
  ];
  saveClientesMock(seed);
  return seed;
}
