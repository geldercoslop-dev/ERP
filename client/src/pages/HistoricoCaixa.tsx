import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft, Calendar, Landmark, CreditCard, Wallet, DollarSign, History } from "lucide-react";
import { trpc } from "@/lib/trpcClient";

export default function HistoricoCaixa() {
  const [, setLocation] = useLocation();
  const { data: historico, isLoading } = trpc.caixaMensal.listAll.useQuery();

  const formatCurrency = (val: string | number | undefined) => {
    const n = parseFloat(val?.toString() || "0");
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatMesAno = (mesAno: string) => {
    const [ano, mes] = mesAno.split('-');
    const meses = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${meses[parseInt(mes) - 1]} / ${ano}`;
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/financeiro")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Histórico de Caixa</h1>
              <p className="text-sm text-muted-foreground">Fechamentos mensais consolidados</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-4xl">
        <div className="space-y-6">
            {(isLoading ? [] : historico || []).map((mes) => (
              <div key={mes.id} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="bg-muted/50 p-4 border-b border-border flex justify-between items-center">
                  <h3 className="font-bold flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    {formatMesAno(mes.mesAno)}
                  </h3>
                  <div className="text-sm font-black text-primary bg-primary/10 px-3 py-1 rounded-full">
                    Total: {formatCurrency(mes.totalGeral)}
                  </div>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase">
                      <Wallet className="h-3 w-3 text-green-500" /> PIX
                    </div>
                    <p className="text-sm font-bold">{formatCurrency(mes.totalPix)}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase">
                      <Landmark className="h-3 w-3 text-blue-500" /> Boleto
                    </div>
                    <p className="text-sm font-bold">{formatCurrency(mes.totalBoleto)}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase">
                      <CreditCard className="h-3 w-3 text-purple-500" /> Cartão
                    </div>
                    <p className="text-sm font-bold">{formatCurrency(mes.totalCartao)}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase">
                      <DollarSign className="h-3 w-3 text-amber-500" /> Dinheiro
                    </div>
                    <p className="text-sm font-bold">{formatCurrency(mes.totalDinheiro)}</p>
                  </div>
                </div>
              </div>
            ))}

            {!isLoading && (historico?.length === 0) && (
              <div className="text-center py-12 bg-card rounded-xl border border-dashed border-border">
                <History className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">Nenhum histórico de caixa encontrado.</p>
              </div>
            )}
          </div>
      </main>
    </div>
  );
}
