import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { trpc } from "../lib/trpcClient";
import { useLocation } from "wouter";
import { ArrowLeft, Search, FileText, CheckCircle2, User, Calendar, DollarSign, Printer, Info, X, Hash } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { useToast } from "../hooks/use-toast";

function asTrpcString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function asTrpcNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function FinanceiroBoletos() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  
  const [busca, setBusca] = useState("");
  const [showBaixa, setShowBaixa] = useState(false);
  const [boletoSelecionado, setBoletoSelecionado] = useState<any>(null);
  const [valorPago, setValorPago] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: user } = trpc.auth.me.useQuery();
  const { data: boletos, isLoading } = trpc.boletos.list.useQuery({ busca });
  
  const baixarParcial = trpc.boletos.baixarParcial.useMutation();
  const gerarPDF = trpc.boletos.gerarPDF.useMutation();
  const gerarExtrato = trpc.boletos.gerarExtrato.useMutation();

  const handleBaixaParcial = async () => {
    const valor = Number(valorPago.replace(',', '.'));
    if (!valor || valor <= 0) {
      toast({ title: "Erro", description: "Informe um valor válido", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await baixarParcial.mutateAsync({
        boletoId: boletoSelecionado.id,
        valorPago: valor
      });
      toast({ title: "Sucesso", description: "Pagamento registrado!" });
      setShowBaixa(false);
      setValorPago("");
      setBusca(""); 
      utils.boletos.list.invalidate();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async (id: number) => {
    try {
      const dataUri = await gerarPDF.mutateAsync({ id });
      const link = document.createElement('a');
      link.href = dataUri;
      link.download = `boleto_id_${id}.pdf`;
      link.click();
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao gerar PDF", variant: "destructive" });
    }
  };

  const handleDownloadExtrato = async (clienteId: number) => {
    try {
      const dataUri = await gerarExtrato.mutateAsync({ clienteId });
      const link = document.createElement('a');
      link.href = dataUri;
      link.download = `extrato_financeiro.pdf`;
      link.click();
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao gerar extrato", variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string, vencimento: string) => {
    const isAtrasado = new Date(vencimento) < new Date() && status !== 'PAGO';
    if (status === 'PAGO') return <Badge className="bg-green-600">PAGO</Badge>;
    if (isAtrasado) return <Badge variant="destructive">ATRASADO</Badge>;
    if (status === 'PARCIAL') return <Badge className="bg-blue-600">PARCIAL</Badge>;
    return <Badge variant="outline" className="border-yellow-500 text-yellow-700">ABERTO</Badge>;
  };

  // Filtro local adicional para busca por valor exato
  const boletosFiltrados = boletos?.filter(b => {
    if (!busca) return true;
    const termo = busca.toLowerCase().replace(',', '.');
    
    // Busca por ID formatado (00001)
    if (b.id.toString().padStart(5, '0').includes(termo)) return true;
    
    // Busca por Nome do Cliente
    if ((b as any).clienteNome?.toLowerCase().includes(termo)) return true;
    
    // Busca por Valor Exato
    const valorAberto = Number(b.valorAberto).toFixed(2);
    if (valorAberto === termo || valorAberto.replace('.', ',') === termo) return true;
    
    // Busca por Número do Pedido
    if (b.numeroPedido.toString().includes(termo)) return true;

    return false;
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">Financeiro / Boletos</h1>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-5xl space-y-6">
        {/* LOCALIZADOR INTELIGENTE POR VALOR OU ID */}
        <div className="bg-primary/5 p-5 rounded-xl border border-primary/20 shadow-sm space-y-3">
          <Label className="text-primary font-black flex items-center gap-2 text-sm uppercase tracking-wider">
            <Search className="h-4 w-4" /> LOCALIZADOR DE PAGAMENTOS (CONCILIAÇÃO)
          </Label>
          <div className="relative">
            <Input 
              placeholder="Digite o VALOR (ex: 167,00), o NOME ou o CÓD. ID que viu no extrato..." 
              className="pl-10 h-14 text-lg border-primary/30 focus:ring-primary shadow-inner bg-background" 
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
            {busca && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setBusca("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-6 w-6 text-primary/60" />
          </div>
          <div className="flex gap-4 text-[10px] text-muted-foreground font-medium">
            <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> BUSCA POR ID</span>
            <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> BUSCA POR VALOR EXATO</span>
            <span className="flex items-center gap-1"><User className="h-3 w-3" /> BUSCA POR CLIENTE</span>
          </div>
        </div>

        <div className="grid gap-4">
            {(isLoading ? [] : (boletosFiltrados || [])).length === 0 ? (
              <div className="text-center py-20 bg-card rounded-lg border border-dashed border-border">
                <p className="text-muted-foreground">Nenhum boleto localizado com este valor ou identificador.</p>
              </div>
            ) : (
              (isLoading ? [] : (boletosFiltrados || [])).map((boleto) => {
                const status = asTrpcString(boleto.status);
                const dataVenc = asTrpcString(boleto.dataVencimento);
                const clienteNome = asTrpcString((boleto as { clienteNome?: unknown }).clienteNome);
                const boletoId = asTrpcNumber(boleto.id);
                const clienteId = asTrpcNumber((boleto as { clienteId?: unknown }).clienteId);
                return (
                <Card key={boletoId} className="overflow-hidden border-l-4 border-l-primary shadow-sm hover:border-l-green-500 transition-all">
                  <CardContent className="p-0">
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-black text-primary border-primary/20">
                            ID: {boletoId.toString().padStart(5, '0')}
                          </Badge>
                          <span className="font-bold text-lg">PEDIDO #{asTrpcNumber(boleto.numeroPedido)}</span>
                          {getStatusBadge(status, dataVenc)}
                        </div>
                        <p className="font-bold text-primary uppercase flex items-center gap-2">
                          <User className="h-4 w-4" /> {clienteNome || "CLIENTE"}
                        </p>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> VENC: {new Date(dataVenc || Date.now()).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground font-bold uppercase">SALDO EM ABERTO</p>
                          <p className="text-3xl font-black text-destructive">R$ {Number(boleto.valorAberto).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-2 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                            onClick={() => handleDownloadPDF(boletoId)}
                          >
                            <Printer className="h-3 w-3" /> BOLETO PDF
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-2 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                            onClick={() => handleDownloadExtrato(clienteId)}
                          >
                            <FileText className="h-3 w-3" /> EXTRATO
                          </Button>
                          
                          {user?.role === 'admin' && status !== 'PAGO' && (
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700 gap-2 text-xs font-bold shadow-sm"
                              onClick={() => { setBoletoSelecionado(boleto); setShowBaixa(true); }}
                            >
                              <CheckCircle2 className="h-3 w-3" /> DAR BAIXA
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
              })
            )}
          </div>
      </main>

      {/* MODAL BAIXA (APENAS ADMIN) */}
      <Dialog open={showBaixa} onOpenChange={setShowBaixa}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conciliação Bancária Manual</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-2 border border-border">
              <div className="flex justify-between text-xs">
                <span>CÓDIGO ID:</span>
                <span className="font-black text-primary">{boletoSelecionado?.id.toString().padStart(5, '0')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Cliente:</span>
                <span className="font-bold uppercase">{boletoSelecionado?.clienteNome}</span>
              </div>
              <div className="flex justify-between text-xl pt-2 border-t border-border/50">
                <span>Valor no Extrato:</span>
                <span className="font-black text-destructive">R$ {Number(boletoSelecionado?.valorAberto).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">VALOR PARA BAIXA (R$)</Label>
              <Input 
                value={valorPago} 
                onChange={e => setValorPago(e.target.value)} 
                placeholder="0,00" 
                className="text-3xl font-black h-16 text-right border-green-300 focus:ring-green-500 bg-green-50/30"
                autoFocus
              />
              <div className="bg-blue-50 p-3 rounded-md flex gap-2 items-start mt-2 border border-blue-100">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <p className="text-[10px] text-blue-700 leading-tight italic">
                  Confirme se o valor no seu extrato bancário bate com o valor digitado acima. 
                  O sistema liquidará este boleto e atualizará seu saldo financeiro.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBaixa(false)}>CANCELAR</Button>
            <Button onClick={handleBaixaParcial} disabled={loading} className="bg-green-600 hover:bg-green-700 font-bold">
              {loading ? "PROCESSANDO..." : "CONFIRMAR RECEBIMENTO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
