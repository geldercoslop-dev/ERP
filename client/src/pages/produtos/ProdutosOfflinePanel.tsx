import { useMemo, useState } from "react";
import { Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";
import type { ProdutoLocal } from "@/types/appDomain";
import { saveProdutosMock, seedProdutosIfEmpty } from "@/mocks/localProdutosStore";
import { newLocalId } from "@/mocks/id";
import { toast } from "sonner";

/**
 * Lista e cadastro simples offline (nome, preço, descrição) — base para futuro estoque.
 */
export default function ProdutosOfflinePanel() {
  const [items, setItems] = useState<ProdutoLocal[]>(() => seedProdutosIfEmpty());
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [descricao, setDescricao] = useState("");

  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items]
  );

  function persist(next: ProdutoLocal[]) {
    setItems(next);
    saveProdutosMock(next);
  }

  function adicionar() {
    const n = nome.trim();
    if (!n) {
      toast.error("Informe o nome do produto.");
      return;
    }
    const p = Number(String(preco).replace(",", "."));
    if (Number.isNaN(p) || p < 0) {
      toast.error("Preço inválido.");
      return;
    }
    const row: ProdutoLocal = {
      id: newLocalId(),
      nome: n,
      preco: p,
      descricao: descricao.trim(),
      estoquePrevisto: 0,
      createdAt: new Date().toISOString(),
    };
    persist([row, ...items]);
    setNome("");
    setPreco("");
    setDescricao("");
    toast.success("Produto salvo localmente (modo offline).");
  }

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Produtos"
        subtitle="Modo offline — cadastro simplificado; estoque integrado virá com a API"
        icon={<Package className="h-5 w-5" />}
      />
      <div className={PAGE_MAIN}>
        <div className="bg-amber-50 border border-amber-200 text-amber-950 rounded-xl p-4 mb-6 text-sm">
          Servidor indisponível. Os produtos abaixo ficam salvos só neste navegador.
        </div>

        <div className="bg-white/95 text-slate-800 border border-slate-200 rounded-2xl shadow-sm p-5 mb-6">
          <div className="flex items-center gap-2 font-bold text-slate-900 mb-4">
            <Plus className="h-5 w-5" />
            Novo produto
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Guarda-roupa 6 portas" />
            </div>
            <div>
              <Label>Preço (R$)</Label>
              <Input value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhes do produto" />
            </div>
          </div>
          <Button className="mt-4" onClick={adicionar}>
            Salvar localmente
          </Button>
        </div>

        <div className="bg-white/95 border border-slate-200 rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-slate-900 mb-3">Catálogo local ({sorted.length})</h3>
          <div className="space-y-2">
            {sorted.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-100 p-3 flex flex-wrap justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900">{p.nome}</div>
                  <div className="text-xs text-slate-500 mt-1">{p.descricao || "—"}</div>
                </div>
                <div className="font-semibold text-emerald-700">
                  {p.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
