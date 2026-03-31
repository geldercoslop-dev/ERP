import { useState, useMemo } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { trpc } from "../lib/trpcClient";
import { useLocation } from "wouter";
import { Search, ShoppingCart, CheckCircle, Clock, ExternalLink, Package, User, Calendar, Filter } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { Badge } from "../components/ui/badge";
import { PageHeader } from "../components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "../components/layout/pageLayout";

export default function Pendencias() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("TODOS");

  const { data: pendencias, isLoading } = trpc.pendencias.list.useQuery();
  
  const updateStatusMutation = trpc.pendencias.updateStatus.useMutation({
    onSuccess: () => {
      utils.pendencias.list.invalidate();
      toast({ title: "Sucesso", description: "Status atualizado!" });
    },
    onError: (e) => {
      toast({ title: "Erro", description: e.message || "Falha ao atualizar", variant: "destructive" });
    },
  });

  const pendenciasFiltradas = useMemo(() => {
    return pendencias?.filter(p => {
      const termo = busca.toLowerCase();
      const matchesBusca = 
        p.produtoDescricao.toLowerCase().includes(termo) ||
        p.vendedorNome.toLowerCase().includes(termo) ||
        p.clienteNome.toLowerCase().includes(termo) ||
        p.pedidoNumero.toString().includes(termo);
      
      const matchesStatus = filtroStatus === "TODOS" || p.status === filtroStatus;
      
      return matchesBusca && matchesStatus;
    });
  }, [pendencias, busca, filtroStatus]);

  const pendenciasPorMarca = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of (pendenciasFiltradas || [])) {
      const m = (p as any).produtoMarca ? String((p as any).produtoMarca).toUpperCase() : 'SEM MARCA';
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pendenciasFiltradas]);

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Gestão de Pendências"
        subtitle="Monitoramento de vendas sem estoque em tempo real"
        icon={<Clock className="h-5 w-5 text-destructive" />}
      />

      <main className={PAGE_MAIN}>
        {/* Filtros e Busca */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm mb-6 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por produto, vendedor, cliente ou pedido..." 
              value={busca} 
              onChange={e => setBusca(e.target.value)} 
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button 
              variant={filtroStatus === "TODOS" ? "default" : "outline"} 
              size="sm" 
              onClick={() => setFiltroStatus("TODOS")}
            >
              Todos
            </Button>
            <Button 
              variant={filtroStatus === "PENDENTE" ? "destructive" : "outline"} 
              size="sm" 
              onClick={() => setFiltroStatus("PENDENTE")}
              className="gap-1"
            >
              <Clock className="h-3 w-3" /> A Comprar
            </Button>
            <Button 
              variant={filtroStatus === "COMPRADO" ? "default" : "outline"} 
              size="sm" 
              onClick={() => setFiltroStatus("COMPRADO")}
              className="gap-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <ShoppingCart className="h-3 w-3" /> Comprado
            </Button>
          </div>
        </div>

        {/* Lista de Pendências (agrupada por Marca/Fábrica) */}
        <div className="space-y-4">
          {pendenciasPorMarca.map(([marca, items]) => (
            <div key={marca} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="font-black text-sm">MARCA: <span className="text-primary">{marca}</span></div>
                <Badge variant="outline" className="font-black">{items.length} item(ns)</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground border-b border-border">
                      <th className="px-4 py-3">Data/Pedido</th>
                      <th className="px-4 py-3">Vendedor/Cliente</th>
                      <th className="px-4 py-3">Produto/Cor</th>
                      <th className="px-4 py-3 text-center">Qtd</th>
                      <th className="px-4 py-3">Status Atual</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-primary">#{p.pedidoNumero}</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-2 w-2" />
                          {new Date(p.dataPedido).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" /> {p.vendedorNome}
                        </span>
                        <span className="text-xs text-muted-foreground uppercase">{p.clienteNome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm flex items-center gap-1">
                          <Package className="h-3 w-3 text-primary" /> {p.produtoDescricao}
                        </span>
                        {p.corNome && <span className="text-xs text-muted-foreground">Cor: {p.corNome}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge variant="outline" className="font-black text-destructive border-destructive">
                        {p.quantidade}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      {p.status === "PENDENTE" ? (
                        <Badge className="bg-destructive text-white animate-pulse">PENDENTE A COMPRAR</Badge>
                      ) : (
                        <Badge className="bg-blue-600 text-white">JÁ COMPRADO</Badge>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {p.status === "PENDENTE" ? (
                          <Button 
                            size="sm" 
                            className="h-8 bg-blue-600 hover:bg-blue-700 text-white gap-1"
                            onClick={() => updateStatusMutation.mutate({ id: p.id, status: "COMPRADO" })}
                          >
                            <ShoppingCart className="h-3 w-3" /> Marcar Comprado
                          </Button>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="h-8 gap-1 border-destructive text-destructive hover:bg-destructive/10"
                            onClick={() => updateStatusMutation.mutate({ id: p.id, status: "PENDENTE" })}
                          >
                            <Clock className="h-3 w-3" /> Voltar Pendente
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0"
                          onClick={() => setLocation(`/meus-pedidos?id=${p.pedidoId}`)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {(!pendenciasFiltradas || pendenciasFiltradas.length === 0) && (
            <div className="bg-card rounded-xl border border-border shadow-sm p-12 text-center">
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="h-12 w-12 text-green-500/30" />
                <p className="text-muted-foreground font-medium">Tudo em dia! Nenhuma pendência encontrada.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
