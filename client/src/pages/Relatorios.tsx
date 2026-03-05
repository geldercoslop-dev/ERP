import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft, TrendingUp, Users, Package, CreditCard, DollarSign, Calendar, BarChart3 } from "lucide-react";
import { trpc } from "@/lib/trpcClient";
import { useState, useMemo } from "react";

export default function Relatorios() {
  const [, setLocation] = useLocation();
  const [periodo, setPeriodo] = useState<'hoje' | 'semana' | 'mes' | 'total'>('mes');

  // Queries para os relatórios
  const { data: comissoes } = trpc.comissoes.list.useQuery();
  const { data: pedidosData } = trpc.pedidos.list.useQuery();
  const pedidos = (pedidosData as any)?.items ?? [];
  const { data: vendedores } = trpc.vendedores.list.useQuery();

  const filteredData = useMemo(() => {
    if (!pedidos || !comissoes) return { pedidos: [], comissoes: [] };

    const agora = new Date();
    const inicio = new Date();
    
    if (periodo === 'hoje') {
      inicio.setHours(0, 0, 0, 0);
    } else if (periodo === 'semana') {
      inicio.setDate(agora.getDate() - 7);
    } else if (periodo === 'mes') {
      inicio.setMonth(agora.getMonth() - 1);
    } else {
      return { pedidos, comissoes };
    }

    return {
      pedidos: pedidos.filter(p => new Date(p.createdAt) >= inicio),
      comissoes: comissoes.filter(c => new Date(c.createdAt) >= inicio)
    };
  }, [pedidos, comissoes, periodo]);

  // Estatísticas calculadas
  const stats = useMemo(() => {
    const totalVendas = filteredData.pedidos.reduce((sum, p) => sum + parseFloat(p.total.toString()), 0);
    const comissoesPendentes = filteredData.comissoes.filter(c => c.status === 'PENDENTE');
    const totalComissoes = comissoesPendentes.reduce((sum, c) => sum + parseFloat(c.valorComissao.toString()), 0);
    
    // Performance por vendedor
    const perfVendedores = filteredData.pedidos.reduce((acc, p) => {
      const vId = p.vendedorId;
      if (!acc[vId]) {
        const vNome = vendedores?.find(v => v.id === vId)?.nome || `Vendedor #${vId}`;
        acc[vId] = { nome: vNome, total: 0, qtd: 0 };
      }
      acc[vId].total += parseFloat(p.total.toString());
      acc[vId].qtd += 1;
      return acc;
    }, {} as Record<number, { nome: string; total: number; qtd: number }>);

    // Formas de pagamento
    const formasPagto = filteredData.pedidos.reduce((acc, p) => {
      const forma = p.formaPagamento || 'Não Informado';
      acc[forma] = (acc[forma] || 0) + parseFloat(p.total.toString());
      return acc;
    }, {} as Record<string, number>);

    return {
      totalVendas,
      totalComissoes,
      qtdPedidos: filteredData.pedidos.length,
      comissoesPendentesCount: comissoesPendentes.length,
      perfVendedores: (Object.entries(perfVendedores) as Array<
        [string, { nome: string; total: number; qtd: number }]
      >).sort((a, b) => b[1].total - a[1].total),
      formasPagto: (Object.entries(formasPagto) as Array<[string, number]>).sort(
        (a, b) => b[1] - a[1]
      ),
    };
  }, [filteredData, vendedores]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Relatórios e Performance</h1>
              <p className="text-sm text-muted-foreground">Análise detalhada do seu negócio</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-6xl">
        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-8 bg-card p-2 rounded-lg border border-border w-fit">
          <Button
            variant={periodo === 'hoje' ? 'default' : 'ghost'}
            onClick={() => setPeriodo('hoje')}
            size="sm"
            className="gap-2"
          >
            <Calendar className="h-4 w-4" /> Hoje
          </Button>
          <Button
            variant={periodo === 'semana' ? 'default' : 'ghost'}
            onClick={() => setPeriodo('semana')}
            size="sm"
            className="gap-2"
          >
            <Calendar className="h-4 w-4" /> 7 Dias
          </Button>
          <Button
            variant={periodo === 'mes' ? 'default' : 'ghost'}
            onClick={() => setPeriodo('mes')}
            size="sm"
            className="gap-2"
          >
            <Calendar className="h-4 w-4" /> 30 Dias
          </Button>
          <Button
            variant={periodo === 'total' ? 'default' : 'ghost'}
            onClick={() => setPeriodo('total')}
            size="sm"
            className="gap-2"
          >
            <BarChart3 className="h-4 w-4" /> Total
          </Button>
        </div>

        {/* Cards Principais */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Vendas Totais</span>
            </div>
            <p className="text-2xl font-bold">R$ {stats.totalVendas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.qtdPedidos} pedidos realizados</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                <DollarSign className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Comissões a Pagar</span>
            </div>
            <p className="text-2xl font-bold">R$ {stats.totalComissoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.comissoesPendentesCount} comissões pendentes</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 rounded-lg text-green-600">
                <Users className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Vendedores</span>
            </div>
            <p className="text-2xl font-bold">{stats.perfVendedores.length}</p>
            <p className="text-xs text-muted-foreground mt-1">ativos no período</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                <Package className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Ticket Médio</span>
            </div>
            <p className="text-2xl font-bold">
              R$ {(stats.qtdPedidos > 0 ? stats.totalVendas / stats.qtdPedidos : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">por pedido</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Performance por Vendedor */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Performance por Vendedor
              </h3>
            </div>
            <div className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-4 font-medium">Vendedor</th>
                    <th className="text-center p-4 font-medium">Pedidos</th>
                    <th className="text-right p-4 font-medium">Total Vendido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.perfVendedores.map(([id, data]) => (
                    <tr key={id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium">{data.nome}</td>
                      <td className="p-4 text-center">{data.qtd}</td>
                      <td className="p-4 text-right font-bold">R$ {data.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {stats.perfVendedores.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-muted-foreground italic">Nenhum dado para este período</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Formas de Pagamento */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="font-bold flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" /> Vendas por Forma de Pagamento
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {stats.formasPagto.map(([forma, total]) => {
                const percent = (total / stats.totalVendas) * 100;
                return (
                  <div key={forma}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{forma}</span>
                      <span className="text-muted-foreground">
                        R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({percent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {stats.formasPagto.length === 0 && (
                <div className="p-8 text-center text-muted-foreground italic">Nenhum dado para este período</div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
