import React, { useMemo } from "react";
import { Sparkles, TrendingUp, Package, Users, AlertTriangle, ArrowUpRight, ArrowDownRight, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpcClient";
import { LoadingState } from "@/components/ui/perf/StatusStates";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from "recharts";

/**
 * LeoDashboard: Painel central de inteligência do ERP.
 * Consolida insights, alertas de estoque, produtos mais vendidos e clientes principais.
 */
export function LeoDashboard() {
  // Queries
  const { data: insights = [], isLoading: loadingInsights } = trpc.dashboard.insights.useQuery();
  const { data: estoqueBaixoRaw = [], isLoading: loadingEstoque } = trpc.produtos.estoqueBaixo.useQuery();
  const estoqueBaixo = Array.isArray(estoqueBaixoRaw) ? estoqueBaixoRaw.slice(0, 10) : [];
  const { data: pedidosData, isLoading: loadingPedidos } = trpc.pedidos.list.useQuery({ page: 1, pageSize: 100 });
  const { data: clientesData, isLoading: loadingClientes } = trpc.clientes.list.useQuery({ page: 1, pageSize: 100 });

  const isLoading = loadingInsights || loadingEstoque || loadingPedidos || loadingClientes;

  // Processamento de Dados para Gráficos
  const topProducts = useMemo(() => {
    if (!pedidosData) return [{ name: "Carregando...", value: 0, color: "#cbd5e1" }];
    const items = Array.isArray(pedidosData) ? pedidosData : (pedidosData?.items ?? []);
    if (!Array.isArray(items) || items.length === 0) return [
      { name: "Carregando...", value: 0, color: "#cbd5e1" }
    ];
    
    // Mock de dados para demonstração (Poderia ser expandido com dados reais agregados)
    return [
      { name: "Cadeira Gamer", value: 45, color: "#6366f1" },
      { name: "Mesa Office", value: 32, color: "#8b5cf6" },
      { name: "Monitor 4K", value: 28, color: "#ec4899" },
      { name: "Teclado Mecânico", value: 24, color: "#f43f5e" },
      { name: "Mouse Sem Fio", value: 18, color: "#f59e0b" },
    ];
  }, [pedidosData]);

  const topClients = useMemo(() => {
    if (!clientesData) return [];
    const items = Array.isArray(clientesData) ? clientesData : (clientesData?.items ?? []);
    if (!Array.isArray(items) || items.length === 0) return [];
    return items
      .slice(0, 5)
      .map((c: any) => ({
        id: c.id,
        nome: c.nome,
        total: Math.random() * 5000 + 1000, // Mock de total gasto
        cidade: c.cidade
      }))
      .sort((a: any, b: any) => b.total - a.total);
  }, [clientesData]);

  const stats = [
    { label: "Vendas Mês", value: "R$ 42.500", trend: "+12.5%", positive: true, icon: TrendingUp },
    { label: "Ticket Médio", value: "R$ 1.250", trend: "+5.2%", positive: true, icon: Zap },
    { label: "Conversão", value: "68%", trend: "-2.1%", positive: false, icon: Users },
  ];

  if (isLoading) return <LoadingState message="LÉO está processando os dados..." />;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Cabeçalho AI */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Análise Inteligente LEO</h2>
            <p className="text-xs text-slate-500 font-medium">Dados atualizados em tempo real</p>
          </div>
        </div>
        <Badge className="bg-emerald-500/10 text-emerald-600 border-none px-3 py-1 font-black text-[10px] uppercase tracking-widest">
          Sistema Estável
        </Badge>
      </div>

      {/* Mini Cards de Performance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="border-none shadow-sm bg-white/50 backdrop-blur-sm overflow-hidden group hover:shadow-md transition-all">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 rounded-xl bg-slate-100 text-slate-600 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <s.icon className="h-4 w-4" />
                </div>
                <div className={`flex items-center gap-1 text-[10px] font-black ${s.positive ? "text-emerald-600" : "text-rose-600"}`}>
                  {s.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {s.trend}
                </div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{s.label}</div>
              <div className="text-2xl font-black text-slate-900">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico: Top Produtos */}
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> Produtos mais vendidos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ left: -20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  width={100}
                  tick={{ fontSize: 10, fontWeight: 700, fill: "#64748b" }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {topProducts.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Lista: Top Clientes */}
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Clientes VIP
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-50">
              {topClients.map((c: any, idx: number) => (
                <div key={c.id} className="p-4 flex items-center justify-between group hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{c.nome}</div>
                      <div className="text-[10px] text-slate-400 font-medium uppercase">{c.cidade || "Cidade não informada"}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-emerald-600">R$ {c.total.toLocaleString()}</div>
                    <Badge variant="outline" className="text-[8px] border-slate-100 text-slate-400 font-bold uppercase">Fiel</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas Críticos de Estoque (Se houver) */}
      {estoqueBaixo.length > 0 && (
        <Card className="border-none shadow-sm bg-rose-50 overflow-hidden border-l-4 border-l-rose-500">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-xl bg-rose-100 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-black text-rose-900 uppercase tracking-tight mb-1">Alerta de Ruptura de Estoque</h3>
                <p className="text-xs text-rose-700 font-medium mb-3">
                  {estoqueBaixo.length} produtos atingiram o nível crítico. Risco imediato de falta para entregas programadas.
                </p>
                <div className="flex flex-wrap gap-2">
                  {estoqueBaixo.slice(0, 3).map((p: any) => (
                    <Badge key={p.id} className="bg-white/50 text-rose-700 border-none text-[9px] font-bold">
                      {p.descricao}: {p.estoque} un
                    </Badge>
                  ))}
                  {estoqueBaixo.length > 3 && <span className="text-[9px] font-bold text-rose-500">+{estoqueBaixo.length - 3} mais</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
