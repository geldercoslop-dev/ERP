import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpcClient";
import { useLocation } from "wouter";
import { Download, Package, Zap } from "lucide-react";
import { AjusteEstoqueModal } from "@/components/AjusteEstoqueModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Estoque() {
  const [, setLocation] = useLocation();

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const modo = useMemo(() => new URLSearchParams(window.location.search).get("modo") ?? "", []);
  // Vendedor: sempre consulta (não altera/exclui).
  // Admin: pode forçar consulta via ?modo=consulta.
  const isConsulta = !isAdmin || modo === "consulta";

  const [busca, setBusca] = useState("");
  const [ajusteModal, setAjusteModal] = useState<{
    isOpen: boolean;
    produtoId: number;
    produtoNome: string;
    estoqueAtual: number;
  }>({
    isOpen: false,
    produtoId: 0,
    produtoNome: "",
    estoqueAtual: 0,
  });

  const { data: produtos, isLoading, isFetching, refetch } = trpc.produtos.list.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const list = (produtos ?? []) as any[];
    if (!termo) return list;
    return list.filter((p) => {
      return (
        String(p.descricao || "").toLowerCase().includes(termo) ||
        String(p.marca || "").toLowerCase().includes(termo) ||
        String(p.fornecedor || "").toLowerCase().includes(termo) ||
        String(p.categoria || "").toLowerCase().includes(termo)
      );
    });
  }, [produtos, busca]);

  const resumoEstoque = useMemo(() => {
    const list = (produtos ?? []) as any[];
    const positivos = list.filter((p) => Number(p.estoque) > 0);
    const totalCusto = positivos.reduce((acc, p) => acc + Number(p.custo || 0) * Number(p.estoque || 0), 0);
    const totalVenda = positivos.reduce((acc, p) => acc + Number(p.valorVenda || 0) * Number(p.estoque || 0), 0);
    return {
      skusPositivos: positivos.length,
      totalCusto,
      totalVenda,
    };
  }, [produtos]);

  const baixarListaEstoque = () => {
    if (!produtos) return;

    let csv = "Quantidade,Descrição,Marca,Fornecedor,Categoria,Custo,ValorVenda\n";
    (produtos as any[]).forEach((p) => {
      const custo = Number(p.custo || 0).toFixed(2);
      const venda = Number(p.valorVenda || 0).toFixed(2);
      csv += `${p.estoque},"${p.descricao}","${p.marca || "-"}","${p.fornecedor || "-"}","${p.categoria || "-"}","${custo}","${venda}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `estoque_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const qtyPill = (q: number) => {
    if (q > 0) return "bg-green-600 text-white";
    if (q === 0) return "bg-sky-100 text-sky-700 border border-sky-200";
    return "bg-red-600 text-white";
  };

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={isConsulta ? "Consulta de Estoque" : "Estoque"}
        subtitle={isConsulta ? "Consulta rápida de disponibilidade" : "Lista em tempo real (com ajuste manual)"}
        icon={<Package className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => refetch()}
              size="sm"
              variant="outline"
              className="gap-2 rounded-xl"
              disabled={isFetching}
              title="Buscar estoque agora"
            >
              <Zap className="h-4 w-4" /> {isFetching ? "Atualizando..." : "Atualizar"}
            </Button>
            {isAdmin && !isConsulta && (
              <Button onClick={baixarListaEstoque} size="sm" variant="outline" className="gap-2 rounded-xl">
                <Download className="h-4 w-4" /> Exportar
              </Button>
            )}
          </div>
        }
      />

      <main className={PAGE_MAIN + " space-y-4"}>
        {/* Apenas 2 contadores (estoque positivo) */}
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total em Custo (estoque positivo)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold">{fmtBRL(resumoEstoque.totalCusto)}</div>
              <div className="text-xs text-muted-foreground">{resumoEstoque.skusPositivos} produtos com saldo</div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total em Venda (estoque positivo)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold">{fmtBRL(resumoEstoque.totalVenda)}</div>
              <div className="text-xs text-muted-foreground">{resumoEstoque.skusPositivos} produtos com saldo</div>
            </CardContent>
          </Card>
        </div>

        {/* Busca menor */}
        <div className="flex items-center justify-between gap-2">
          <div className="w-full md:w-[420px]">
            <Input
              placeholder="Buscar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
        </div>

        {/* Lista */}
        <Card className="rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground border-b border-border">
                  <th className="px-4 py-3 w-20 text-center">Qtd</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3 w-44 text-right">{isAdmin ? "Venda / Custo" : "Venda"}</th>
                  {isAdmin && !isConsulta && <th className="px-4 py-3 w-28 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {produtosFiltrados.map((p: any) => {
                  const q = Number(p.estoque || 0);
                  const desc = String(p.descricaoOperacional || p.descricao || "").toUpperCase();

                  return (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-extrabold ${qtyPill(q)}`}
                          title={q < 0 ? "Estoque negativo" : q === 0 ? "Zerado" : "Positivo"}
                        >
                          {q}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-extrabold text-sm truncate">{desc}</div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="font-extrabold text-sm">{fmtBRL(Number(p.valorVenda || 0))}</div>
                        {isAdmin && <div className="text-xs text-muted-foreground">Custo: {fmtBRL(Number(p.custo || 0))}</div>}
                      </td>

                      {isAdmin && !isConsulta && (
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() =>
                              setAjusteModal({
                                isOpen: true,
                                produtoId: p.id,
                                produtoNome: p.descricao,
                                estoqueAtual: q,
                              })
                            }
                          >
                            <Zap className="h-4 w-4" /> Ajustar
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {produtosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin && !isConsulta ? 4 : 3} className="px-4 py-12 text-center">
                      <div className="text-muted-foreground">Nenhum produto encontrado</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      {isAdmin && !isConsulta && (
        <AjusteEstoqueModal
          isOpen={ajusteModal.isOpen}
          onClose={() => setAjusteModal({ ...ajusteModal, isOpen: false })}
          produtoId={ajusteModal.produtoId}
          produtoNome={ajusteModal.produtoNome}
          estoqueAtual={ajusteModal.estoqueAtual}
        />
      )}
    </div>
  );
}
