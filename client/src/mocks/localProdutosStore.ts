import type { ProdutoLocal } from "@/types/appDomain";
import { newLocalId } from "@/mocks/id";

const STORAGE_KEY = "grs-mock-produtos-v1";

function safeParse(raw: string | null): ProdutoLocal[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is ProdutoLocal =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as ProdutoLocal).id === "string" &&
        typeof (x as ProdutoLocal).nome === "string"
    );
  } catch {
    return [];
  }
}

export function loadProdutosMock(): ProdutoLocal[] {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveProdutosMock(items: ProdutoLocal[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function seedProdutosIfEmpty(): ProdutoLocal[] {
  const cur = loadProdutosMock();
  if (cur.length > 0) return cur;
  const seed: ProdutoLocal[] = [
    {
      id: newLocalId(),
      nome: "Mesa de Jantar 6 lugares",
      preco: 1899.9,
      descricao: "MDF premium, pés em alumínio",
      estoquePrevisto: 12,
      createdAt: new Date().toISOString(),
    },
  ];
  saveProdutosMock(seed);
  return seed;
}
