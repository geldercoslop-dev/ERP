import { useEffect, useMemo, useState } from "react";
import { trpc } from "../lib/trpcClient";
import { PageHeader } from "../components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "../components/layout/pageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { CheckCircle2, Search, Filter } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { isInProgress } from "../../../shared/idempotency";

type TabStatus = "TODOS" | "GERADO" | "CONFERIDO";

export default function ConferenciaPedidos() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [tab, setTab] = useState<TabStatus>("TODOS");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [somenteNaoConferidos, setSomenteNaoConferidos] = useState(true);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const q = trpc.pedidos.listConferencia.useQuery(
    {
      status: tab,
      busca: buscaDebounced || undefined,
      dataInicio: dataInicio ? new Date(dataInicio) : undefined,
      dataFim: dataFim ? new Date(dataFim) : undefined,
      somenteNaoConferidos,
      page: 1,
      pageSize: 80,
    },
    { staleTime: 15_000, refetchOnWindowFocus: false }
  );

  const items = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (typeof d === 'object' && 'items' in d && Array.isArray(d.items)) return d.items;
    return [];
  }, [q.data]);

  const marcar = trpc.pedidos.marcarConferido.useMutation({
    onSuccess: async (data: any) => {
      if (isInProgress(data)) {
        toast({ title: "Processando", description: data.message ?? "Já está processando, aguarde…" });
        return;
      }
      await utils.pedidos.listConferencia.invalidate();
      await utils.pedidos.list.invalidate();
      await utils.pedidos.listParaCarga.invalidate();
      toast({ title: "Conferido", description: (data as any)?.already ? "Já estava conferido." : "Pedido marcado como conferido." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const total = items.length;
  const conferidos = items.filter((p: any) => p.conferido).length;
  const naoConferidos = total - conferidos;

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Conferência de pedidos"
        subtitle="Marcar pedidos como conferidos (registro em auditoria operacional)"
        icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
      />

      <main className={PAGE_MAIN + " space-y-4"}>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["TODOS", "GERADO", "CONFERIDO"] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={tab === t ? "default" : "outline"}
                  onClick={() => setTab(t)}
                  disabled={q.isFetching}
                >
                  {t === "TODOS" ? "GERADO + CONFERIDO" : t}
                </Button>
              ))}

              <Button
                size="sm"
                variant={somenteNaoConferidos ? "default" : "outline"}
                onClick={() => setSomenteNaoConferidos((v) => !v)}
                className={somenteNaoConferidos ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
                disabled={q.isFetching}
              >
                {somenteNaoConferidos ? "Só não conferidos" : "Mostrar conferidos"}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente ou número do pedido…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data início</Label>
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data fim</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-9" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="font-bold">
                Total: {total}
              </Badge>
              <Badge className="bg-green-600 text-white font-bold">Conferidos: {conferidos}</Badge>
              <Badge className="bg-amber-600 text-white font-bold">Não conferidos: {naoConferidos}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground border-b border-border">
                  <th className="px-4 py-3 w-28">Pedido</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 w-44">Vendedor</th>
                  <th className="px-4 py-3 w-36">Data</th>
                  <th className="px-4 py-3 w-28">Status</th>
                  <th className="px-4 py-3 w-40">Conferência</th>
                  <th className="px-4 py-3 w-44 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Carregando…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum pedido encontrado.
                    </td>
                  </tr>
                ) : (
                  items.map((p: any) => (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-black text-primary">#{p.numero}</td>
                      <td className="px-4 py-3 font-bold uppercase">{String(p.clienteNome || "")}</td>
                      <td className="px-4 py-3 text-sm">{String(p.vendedorNome || "")}</td>
                      <td className="px-4 py-3 text-sm">{new Date(p.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-black">
                          {String(p.status || "")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {p.conferido ? (
                          <div className="text-xs">
                            <Badge className="bg-green-600 text-white font-bold">CONFERIDO</Badge>
                            <div className="text-muted-foreground mt-1">
                              {p.conferidoAt ? new Date(p.conferidoAt).toLocaleString("pt-BR") : ""}
                            </div>
                          </div>
                        ) : (
                          <Badge className="bg-amber-600 text-white font-bold">PENDENTE</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          className="h-8 bg-green-600 hover:bg-green-700 gap-2"
                          disabled={marcar.isPending || !!p.conferido}
                          onClick={() =>
                            marcar.mutate({
                              id: Number(p.id),
                              idempotencyKey: `conf-${p.id}-${Date.now()}`.slice(0, 64),
                            })
                          }
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {p.conferido ? "Conferido" : marcar.isPending ? "Processando…" : "Marcar conferido"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}

