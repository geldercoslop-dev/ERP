import { useState, useMemo } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { trpc } from "../lib/trpcClient";
import { useLocation } from "wouter";
import { 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  BrainCircuit, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  MessageCircle, 
  History,
  Landmark,
  Receipt,
  CreditCard,
  Plus,
  ArrowLeft
} from "lucide-react";
import { PageHeader } from "../components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "../components/layout/pageLayout";
import { toast } from "sonner";

/**
 * Financeiro Inteligente (AI) — Dashboard consolidado com LEO.
 */
export default function FinanceiroAi() {
  const [, setLocation] = useLocation();
  const [pergunta, setPergunta] = useState("");

  const { data: dash, isLoading: loadingResumo } = trpc.dashboard.insights.useQuery(undefined, {
    staleTime: 60_000,
  });

  const resumo = useMemo(() => {
    if (!dash) return null;
    const insights: Array<{ tipo: string; titulo: string; detalhe: string; valor: string }> = [
      ...dash.pedidosAtrasados.map((p) => ({
        tipo: "finance",
        titulo: `Pedido atrasado #${p.pedidoId}`,
        detalhe: `${p.cliente} — ${p.diasAtraso} dia(s)`,
        valor: String(p.diasAtraso),
      })),
      ...dash.contasVencidas.map((c) => ({
        tipo: "finance",
        titulo: "Conta vencida",
        detalhe: c.cliente,
        valor: String(c.valor),
      })),
      ...dash.produtosQueVaoFaltar.slice(0, 8).map((p) => ({
        tipo: "estoque",
        titulo: `Risco: ${p.nomeProduto}`,
        detalhe: `Estoque atual ${p.estoqueAtual} · sugerido comprar ${p.quantidadeSugeridaCompra}`,
        valor: String(p.estoqueProjetado),
      })),
    ];
    const alertas = dash.contasVencidas.map((c) => ({
      mensagem: `${c.cliente}: atraso ${c.diasAtraso}d — R$ ${c.valor}`,
      severidade: c.diasAtraso > 30 ? ("critico" as const) : ("medio" as const),
    }));
    return {
      insights,
      alertas,
      previsoes: { vendas: { projecaoProximoMes: 0, mediaDiaria: 0 } },
    };
  }, [dash]);

  const fmtMoeda = (n: number | undefined) => {
    if (n === undefined || isNaN(n)) return "R$ 0,00";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const handleAskLeo = async () => {
    if (!pergunta.trim()) return;
    setLocation(`/assistente?q=${encodeURIComponent(pergunta)}`);
  };

  if (loadingResumo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Filtrar insights e alertas financeiros
  const insightsFin =
    resumo?.insights.filter(
      (i) =>
        i.tipo.includes("finance") ||
        i.titulo.toLowerCase().includes("venda") ||
        i.titulo.toLowerCase().includes("financeiro")
    ) ?? [];

  const alertasFin =
    resumo?.alertas.filter(
      (a) =>
        a.mensagem.toLowerCase().includes("boleto") ||
        a.mensagem.toLowerCase().includes("venda") ||
        a.mensagem.toLowerCase().includes("pagamento") ||
        a.mensagem.toLowerCase().includes("atraso")
    ) ?? [];

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Financeiro IA"
        subtitle="Inteligência operacional e controle consolidado"
        icon={<BrainCircuit className="h-5 w-5 text-primary" />}
        backTo="/"
        actions={
          <div className="flex items-center gap-2">
            <Button className="gap-2" onClick={() => setLocation("/contas-receber")}>
              <Plus className="h-4 w-4" /> Nova conta
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setLocation("/assistente")}>
              <MessageCircle className="h-4 w-4" /> Perguntar ao LEO
            </Button>
          </div>
        }
      />

      <main className={PAGE_MAIN + " space-y-6"}>
        {/* Banner de Inteligência */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Projeção de Vendas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {fmtMoeda(resumo?.previsoes.vendas.projecaoProximoMes)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Baseado na média diária de {fmtMoeda(resumo?.previsoes.vendas.mediaDiaria)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-orange-50 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700">
                <AlertTriangle className="h-4 w-4" />
                Alertas Financeiros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-700">
                {alertasFin.length} Pendência(s)
              </div>
              <p className="text-xs text-orange-600/80 mt-1">
                {alertasFin[0]?.mensagem.slice(0, 40) || "Nenhum alerta crítico no momento"}...
              </p>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-700">
                <BrainCircuit className="h-4 w-4" />
                Insights do LEO
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700">
                {insightsFin.length} Dica(s)
              </div>
              <p className="text-xs text-blue-600/80 mt-1">
                {insightsFin[0]?.titulo || "Análise em tempo real ativa"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Atalhos Rápidos */}
        <div>
          <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            Controle Operacional
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button 
              variant="outline" 
              className="h-auto py-6 flex-col gap-2 bg-card hover:bg-primary/5 transition-all"
              onClick={() => setLocation('/contas-receber')}
            >
              <Landmark className="h-6 w-6 text-blue-600" />
              <div className="text-center">
                <p className="font-bold">Receber</p>
                <p className="text-[10px] text-muted-foreground">Contas e Cobranças</p>
              </div>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-6 flex-col gap-2 bg-card hover:bg-primary/5 transition-all"
              onClick={() => setLocation('/contas-pagar')}
            >
              <Receipt className="h-6 w-6 text-red-600" />
              <div className="text-center">
                <p className="font-bold">Pagar</p>
                <p className="text-[10px] text-muted-foreground">Despesas e Fornecedores</p>
              </div>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-6 flex-col gap-2 bg-card hover:bg-primary/5 transition-all"
              onClick={() => setLocation("/boletos")}
            >
              <CreditCard className="h-6 w-6 text-purple-600" />
              <div className="text-center">
                <p className="font-bold">Boletos</p>
                <p className="text-[10px] text-muted-foreground">Gestão e Conciliação</p>
              </div>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-6 flex-col gap-2 bg-card hover:bg-primary/5 transition-all"
              onClick={() => setLocation("/financeiro/historico")}
            >
              <History className="h-6 w-6 text-orange-600" />
              <div className="text-center">
                <p className="font-bold">Histórico</p>
                <p className="text-[10px] text-muted-foreground">Fluxo de Caixa</p>
              </div>
            </Button>
          </div>
        </div>

        {/* Seção Principal: Insights Detalhados e Chat LEO */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Insights da IA */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-primary" />
                Análise Inteligente do LEO
              </CardTitle>
              <CardDescription>
                Insights gerados automaticamente com base nos dados financeiros atuais.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insightsFin.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground italic">
                  O LEO está processando os dados para gerar novos insights...
                </div>
              ) : (
                <div className="grid gap-4">
                  {insightsFin.map((insight, idx: number) => (
                    <div key={idx} className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
                      <div className="p-2 bg-primary/10 rounded-full">
                        <TrendingUp className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">{insight.titulo}</h4>
                        <p className="text-sm text-muted-foreground mb-1">{insight.detalhe}</p>
                        <Badge variant="outline" className="bg-background">
                          {String(insight.valor)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {alertasFin.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-orange-600 uppercase">
                    <AlertTriangle className="h-4 w-4" /> Atenção Necessária
                  </h3>
                  <div className="space-y-2">
                    {alertasFin.map((alerta: { mensagem: string; severidade: string }, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-md border border-orange-100 bg-orange-50/50">
                        <span className="text-sm text-orange-800">{alerta.mensagem}</span>
                        <Badge variant={alerta.severidade === 'critico' ? 'destructive' : 'secondary'}>
                          {alerta.severidade}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat Rápido com LEO Financeiro */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                Perguntar ao LEO
              </CardTitle>
              <CardDescription>
                Dúvidas sobre o financeiro? O LEO tem a resposta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase">Exemplos:</p>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="text-[10px] h-7"
                    onClick={() => setPergunta("Quanto temos a receber hoje?")}
                  >
                    Quanto a receber hoje?
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="text-[10px] h-7"
                    onClick={() => setPergunta("Quais boletos estão vencidos?")}
                  >
                    Boletos vencidos?
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="text-[10px] h-7"
                    onClick={() => setPergunta("Resumo financeiro da semana")}
                  >
                    Resumo da semana
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <textarea
                  className="w-full min-h-[100px] p-3 rounded-md border bg-background text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                  placeholder="Escreva sua pergunta aqui..."
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                />
                <Button 
                  className="w-full gap-2 font-bold shadow-lg"
                  onClick={handleAskLeo}
                  disabled={!pergunta.trim()}
                >
                  <BrainCircuit className="h-4 w-4" />
                  ANALISAR COM IA
                </Button>
              </div>

              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-[10px] leading-relaxed text-muted-foreground italic text-center">
                  "O LEO analisa em tempo real o fluxo de caixa, inadimplência e projeções para te dar a melhor visão estratégica."
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
