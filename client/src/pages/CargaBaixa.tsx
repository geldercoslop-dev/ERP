import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpcClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";
import { mensagemStatusPedido } from "@/lib/pedidoMessages";

// Tela separada para BAIXA (não mistura com detalhes/edição da carga).
export default function CargaBaixa() {
  const { id } = useParams();
  const cargaId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: carga, isLoading } = trpc.cargas.getById.useQuery({ id: cargaId });
  const baixarPedido = trpc.cargas.baixarPedido.useMutation();

  const [showBaixa, setShowBaixa] = useState(false);
  const [pedidoSelecionado, setPedidoSelecionado] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Baixa: 1 forma ou 2 formas (segunda pode ser BOLETO)
  const [forma1, setForma1] = useState<'DINHEIRO'|'PIX'|'CARTAO'|'BOLETO'>('DINHEIRO');
  const [valor1, setValor1] = useState('0,00');
  const [usarSegunda, setUsarSegunda] = useState(false);
  const [forma2, setForma2] = useState<'DINHEIRO'|'PIX'|'CARTAO'|'BOLETO'>('BOLETO');
  const [valor2, setValor2] = useState('0,00');
  const [boletoParcelas, setBoletoParcelas] = useState(3);
  const [boletoPrimeiroVenc, setBoletoPrimeiroVenc] = useState(new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]);

  const parseBRL = (v: string) => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
  const money = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  const pendentes = useMemo(() => (carga?.pedidos || []).filter((p: any) => !p.entregue), [carga]);

  const downloadBase64 = (base64: string, fileName: string, mime = 'application/zip') => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const abrirBaixa = (p: any) => {
    setPedidoSelecionado(p);
    setShowBaixa(true);
    setForma1('DINHEIRO');
    setValor1(money(Number(p.total || 0)));
    setUsarSegunda(false);
    setForma2('BOLETO');
    setValor2('0,00');
    setBoletoParcelas(3);
  };

  const confirmarBaixa = async () => {
    const total = Number(pedidoSelecionado?.total || 0);
    const v1 = parseBRL(valor1);
    const v2 = usarSegunda ? parseBRL(valor2) : 0;
    if (!pedidoSelecionado?.pedidoCargaId) return;

    // Validações duras (evita erro futuro)
    if (v1 <= 0) {
      toast({ title: 'Erro', description: 'Informe o valor recebido na forma 1.', variant: 'destructive' });
      return;
    }
    if (usarSegunda && v2 <= 0 && forma2 !== 'BOLETO') {
      toast({ title: 'Erro', description: 'Informe o valor da 2ª forma.', variant: 'destructive' });
      return;
    }
    if (!usarSegunda && Math.abs(v1 - total) > 0.01 && forma1 !== 'BOLETO') {
      // Se não tiver segunda forma, e não for boleto, precisa bater o total.
      toast({ title: 'Erro', description: 'O valor recebido deve ser igual ao total (ou adicione 2ª forma / boleto).', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Montagem:
      // - Se forma1 = BOLETO: gera boletos do total
      // - Se tiver segunda forma = BOLETO: gera boletos do restante
      const payload: any = {
        pedidoCargaId: pedidoSelecionado.pedidoCargaId,
        entradaForma: forma1,
        entradaValor: forma1 === 'BOLETO' ? undefined : v1,
      };

      if (usarSegunda) {
        if (forma2 === 'BOLETO') {
          payload.boletoParcelas = boletoParcelas;
          payload.boletoPrimeiroVencimento = new Date(boletoPrimeiroVenc);
        } else {
          payload.segundaForma = forma2;
          payload.segundaValor = v2;
        }
      }

      if (forma1 === 'BOLETO') {
        payload.boletoParcelas = boletoParcelas;
        payload.boletoPrimeiroVencimento = new Date(boletoPrimeiroVenc);
      }

      const res: any = await baixarPedido.mutateAsync(payload);
      if (res?.boletosZip?.base64) {
        downloadBase64(res.boletosZip.base64, res.boletosZip.fileName);
        toast({ title: 'Boletos gerados', description: 'Entrega registrada. ZIP pronto para enviar ao cliente.' });
      } else {
        toast({ title: mensagemStatusPedido('ENTREGUE', pedidoSelecionado?.clienteNome || res?.clienteNome, pedidoSelecionado?.numero || res?.pedidoNumero || pedidoSelecionado?.pedidoId || undefined).title, description: mensagemStatusPedido('ENTREGUE', pedidoSelecionado?.clienteNome || res?.clienteNome, pedidoSelecionado?.numero || res?.pedidoNumero || pedidoSelecionado?.pedidoId || undefined).description });
      }

      setShowBaixa(false);
      setPedidoSelecionado(null);
      utils.cargas.getById.invalidate({ id: cargaId });
      utils.cargas.list.invalidate();
      utils.pedidos.list.invalidate();
      utils.contasReceber.list.invalidate();
      utils.comissoes.list.invalidate();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!isLoading && !carga) return <div className="p-20 text-center">Carga não encontrada.</div>;
  if (!carga) return <div className="min-h-screen bg-muted/30" />;

if ((carga as any).status !== 'EM_ROTA') {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/cargas/${cargaId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Dar baixa</h1>
            <div className="text-xs opacity-70">Esta carga ainda não foi liberada para rota.</div>
          </div>
        </div>
      </header>
      <main className="container py-10 max-w-3xl">
        <div className="rounded-xl border bg-card p-6">
          <div className="font-medium">Ação indisponível</div>
          <div className="text-sm opacity-80 mt-1">
            Você só pode dar baixa quando a carga estiver <b>EM ROTA</b>.
          </div>
          <div className="mt-4">
            <Button onClick={() => setLocation(`/cargas/${cargaId}`)}>Voltar</Button>
          </div>
        </div>
      </main>
    </div>
  );
}


  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/cargas/${cargaId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Dar baixa — Carga #{carga.numero}</h1>
            <p className="text-xs text-muted-foreground uppercase">{carga.cidadeRota}</p>
          </div>
          <div className="ml-auto">
            <Badge className={String(carga.status) === 'ENTREGUE' ? 'bg-green-600' : 'bg-[#a855f7]'}>
              {String(carga.status) === 'ENTREGUE' ? 'ENTREGUE' : 'EM ROTA'}
            </Badge>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-4xl space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-bold">PENDENTES</p>
                <p className="text-2xl font-black">{pendentes.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground font-bold">TOTAL NA CARGA</p>
                <p className="text-lg font-black">{(carga.pedidos || []).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {pendentes.length === 0 ? (
            <div className="text-center text-muted-foreground py-20">Nenhum pedido pendente.</div>
          ) : (
            pendentes.map((p: any) => (
              <Card key={p.id} className="border-l-4 border-l-yellow-500">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold">PEDIDO #{p.numero}</div>
                    <div className="text-sm uppercase font-medium">{p.clienteNome}</div>
                    <div className="text-xs text-muted-foreground">TOTAL: R$ {money(Number(p.total || 0))}</div>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 gap-2" onClick={() => abrirBaixa(p)}>
                    <CheckCircle className="h-4 w-4" /> DAR BAIXA
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>

      <Dialog open={showBaixa} onOpenChange={setShowBaixa}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Baixa — Pedido #{pedidoSelecionado?.numero}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-xs text-muted-foreground font-bold">CLIENTE</p>
              <p className="font-bold uppercase">{pedidoSelecionado?.clienteNome}</p>
              <p className="text-lg font-black text-primary mt-1">TOTAL: R$ {money(Number(pedidoSelecionado?.total || 0))}</p>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-xs">FORMA 1</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['DINHEIRO','PIX','CARTAO','BOLETO'] as const).map(f => (
                  <Button
                    key={f}
                    variant={forma1 === f ? 'default' : 'outline'}
                    className={`h-10 text-xs font-bold ${forma1 === f ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    onClick={() => setForma1(f)}
                  >
                    {f === 'CARTAO' ? 'CARTÃO' : f}
                  </Button>
                ))}
              </div>
              {forma1 !== 'BOLETO' && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold">VALOR (R$)</Label>
                  <Input className="h-8 text-right font-bold" value={valor1} onChange={e => setValor1(e.target.value)} />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                variant={usarSegunda ? 'default' : 'outline'}
                className={`w-full h-9 text-xs font-bold ${usarSegunda ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                onClick={() => setUsarSegunda(v => !v)}
              >
                {usarSegunda ? '2ª FORMA (ATIVA)' : 'ADICIONAR 2ª FORMA'}
              </Button>
            </div>

            {usarSegunda && (
              <div className="space-y-3 p-3 border border-blue-200 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 text-blue-700 font-bold text-xs">
                  <AlertCircle className="h-4 w-4" /> SEGUNDA FORMA
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['DINHEIRO','PIX','CARTAO','BOLETO'] as const).map(f => (
                    <Button
                      key={f}
                      variant={forma2 === f ? 'default' : 'outline'}
                      className={`h-9 text-[11px] font-bold ${forma2 === f ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                      onClick={() => setForma2(f)}
                    >
                      {f === 'CARTAO' ? 'CARTÃO' : f}
                    </Button>
                  ))}
                </div>

                {forma2 !== 'BOLETO' && (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold">VALOR (R$)</Label>
                    <Input className="h-8 text-right font-bold" value={valor2} onChange={e => setValor2(e.target.value)} />
                  </div>
                )}

                {(forma1 === 'BOLETO' || forma2 === 'BOLETO') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold">PARCELAS</Label>
                      <Input
                        className="h-8 text-right font-bold"
                        value={String(boletoParcelas)}
                        onChange={e => setBoletoParcelas(Math.max(1, Math.min(24, Number(e.target.value || 1))))}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold">1º VENCIMENTO</Label>
                      <Input className="h-8" type="date" value={boletoPrimeiroVenc} onChange={e => setBoletoPrimeiroVenc(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBaixa(false)}>CANCELAR</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={confirmarBaixa} disabled={loading}>
              {loading ? 'PROCESSANDO...' : 'CONFIRMAR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
