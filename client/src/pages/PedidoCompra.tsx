import { useMemo, useState } from "react";
import { trpc } from "../lib/trpcClient";
import { PageHeader } from "../components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "../components/layout/pageLayout";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { useToast } from "../hooks/use-toast";
import { FileText, Search, ShoppingCart } from "lucide-react";

type Row = {
  fornecedor: string | null;
  produtoId: number;
  descricao: string;
  marca: string | null;
  quantidade: number;
  qtdPedidos: number;
};

export default function PedidoCompra() {
  const { toast } = useToast();

  const [busca, setBusca] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("TODOS");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.pedidoCompra.listPorFornecedor.useQuery(undefined, { staleTime: 15_000 });
  const rows = (Array.isArray(data) ? data : []) as Row[];

  const fornecedores = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add((r.fornecedor ? String(r.fornecedor) : "SEM FORNECEDOR").toUpperCase());
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return rows.filter((r) => {
      const forn = (r.fornecedor ? String(r.fornecedor) : "SEM FORNECEDOR").toUpperCase();
      const okF = filtroFornecedor === "TODOS" || forn === filtroFornecedor;
      const okB =
        !term ||
        String(r.descricao || "").toLowerCase().includes(term) ||
        String(r.marca || "").toLowerCase().includes(term) ||
        forn.toLowerCase().includes(term) ||
        String(r.produtoId).includes(term);
      return okF && okB;
    });
  }, [rows, busca, filtroFornecedor]);

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      const key = (r.fornecedor ? String(r.fornecedor) : "SEM FORNECEDOR").toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const totalQtd = useMemo(() => filtered.reduce((acc, r) => acc + Number(r.quantidade ?? 0), 0), [filtered]);

  const gerarPdf = trpc.pedidoCompra.gerarPdf.useMutation({
    onSuccess: async (res: any) => {
      const a = document.createElement("a");
      a.href = res.dataUri;
      a.download = res.fileName ?? "pedido_compra.pdf";
      a.click();
      toast({ title: "PDF gerado", description: "Pedido de compra baixado." });
      await utils.pedidoCompra.listPorFornecedor.invalidate();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggle = (produtoId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(produtoId)) next.delete(produtoId);
      else next.add(produtoId);
      return next;
    });
  };

  const selectFornecedor = (forn: string, items: Row[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of items) next.add(it.produtoId);
      return next;
    });
  };

  const clearAll = () => setSelected(new Set());

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Pedido de compra"
        subtitle="Selecione pendências e gere um PDF agrupado por fornecedor"
        icon={<ShoppingCart className="h-5 w-5 text-primary" />}
      />

      <main className={PAGE_MAIN + " space-y-4"}>
        <Card className="rounded-2xl">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por produto, marca, fornecedor ou ID…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[220px]"
                value={filtroFornecedor}
                onChange={(e) => setFiltroFornecedor(e.target.value)}
              >
                <option value="TODOS">TODOS OS FORNECEDORES</option>
                {fornecedores.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <Button variant="outline" onClick={clearAll} disabled={selected.size === 0}>
                Limpar seleção
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 gap-2"
                disabled={selected.size === 0 || gerarPdf.isPending}
                onClick={() => gerarPdf.mutate({ produtoIds: Array.from(selected.values()) })}
              >
                <FileText className="h-4 w-4" /> {gerarPdf.isPending ? "Gerando…" : `Gerar PDF (${selected.size})`}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="font-black">
                Itens: {filtered.length}
              </Badge>
              <Badge variant="outline" className="font-black">
                Qtd total: {totalQtd}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-16">Carregando…</div>
        ) : groups.length === 0 ? (
          <div className="text-center text-muted-foreground py-16">Nenhuma pendência PENDENTE encontrada.</div>
        ) : (
          <div className="space-y-4">
            {groups.map(([forn, items]) => (
              <Card key={forn} className="rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div className="font-black text-sm">
                    FORNECEDOR: <span className="text-primary">{forn}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge variant="outline" className="font-black">
                      {items.length} produto(s)
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => selectFornecedor(forn, items)}>
                      Selecionar fornecedor
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground border-b border-border">
                        <th className="px-4 py-3 w-14 text-center">Sel</th>
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3 w-40">Marca</th>
                        <th className="px-4 py-3 w-24 text-center">Qtd</th>
                        <th className="px-4 py-3 w-24 text-center">Pedidos</th>
                        <th className="px-4 py-3 w-20 text-center">ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map((r) => (
                        <tr key={r.produtoId} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={selected.has(r.produtoId)}
                              onChange={() => toggle(r.produtoId)}
                              className="h-4 w-4"
                            />
                          </td>
                          <td className="px-4 py-3 font-bold uppercase">{String(r.descricao || "")}</td>
                          <td className="px-4 py-3 text-sm">{String(r.marca || "—").toUpperCase()}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge className="bg-destructive text-white font-black">{Number(r.quantidade ?? 0)}</Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className="font-black">{Number(r.qtdPedidos ?? 0)}</Badge>
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs">{r.produtoId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

