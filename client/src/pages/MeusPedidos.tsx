import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpcClient";
import { useLocation } from "wouter";
import { 
  ArrowLeft, Search, Printer, Trash2, Edit,
  Package, AlertCircle, CheckCircle2, Ban
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";


export default function MeusPedidos() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === 'admin';



  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  // Modal entrega
  const [openEntrega, setOpenEntrega] = useState(false);
  const [pedidoEntregaId, setPedidoEntregaId] = useState<number | null>(null);
  const [entradaForma, setEntradaForma] = useState<'PIX'|'BOLETO'|'CARTAO'|'DINHEIRO'>('PIX');
  const [usarBoleto, setUsarBoleto] = useState(false);
  const [entradaValor, setEntradaValor] = useState('0,00');
  const [boletoParcelas, setBoletoParcelas] = useState(3);
  const [boletoPrimeiroVenc, setBoletoPrimeiroVenc] = useState(new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]);
  const [boletoVencimentos, setBoletoVencimentos] = useState<string[]>([]);
  const [vencimentosEditados, setVencimentosEditados] = useState(false);

  const { data: pedidos, isLoading } = trpc.pedidos.list.useQuery({
    status: filtroStatus,
    busca: busca,
    dataInicio: dataInicio ? new Date(dataInicio) : undefined,
    dataFim: dataFim ? new Date(dataFim) : undefined,
  });

  const updateStatusMutation = trpc.pedidos.updateStatus.useMutation({
    onSuccess: () => {
      utils.pedidos.list.invalidate();
      toast({ title: "Sucesso", description: "Status atualizado!" });
    },
    onError: (e) => {
      toast({ title: "Erro", description: e.message || "Falha ao atualizar status", variant: "destructive" });
    },
  });

  const gerarPDFPedido = trpc.pedidos.gerarPDF.useMutation();

  const downloadDataUri = (dataUri: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = fileName;
    a.click();
  };

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


  const buildVencimentos = (primeiroISO: string, parcelas: number): string[] => {
    const base = new Date(primeiroISO + 'T00:00:00');
    const out: string[] = [];
    for (let i = 0; i < Math.max(1, parcelas); i++) {
      const d = new Date(base.getTime() + i * 30 * 24 * 60 * 60 * 1000);
      out.push(d.toISOString().split('T')[0]);
    }
    return out;
  };

  useEffect(() => {
    const usando = entradaForma === 'BOLETO' || usarBoleto;
    if (!usando) return;
    if (vencimentosEditados) return;
    setBoletoVencimentos(buildVencimentos(boletoPrimeiroVenc, boletoParcelas));
  }, [boletoPrimeiroVenc, boletoParcelas, entradaForma, usarBoleto, vencimentosEditados]);
  const marcarEntregueMutation = trpc.pedidos.marcarEntregue.useMutation({
    onSuccess: (data: any) => {
      utils.pedidos.list.invalidate();
      if (data?.boletosZip?.base64) {
        downloadBase64(data.boletosZip.base64, data.boletosZip.fileName);
        toast({ title: "Boletos gerados", description: "Entrega registrada. ZIP de boletos pronto para enviar ao cliente." });
      } else {
        toast({ title: "Entrega confirmada", description: "Pedido entregue e baixa registrada (financeiro + comissão + caixa). ✅" });
      }
      setOpenEntrega(false);
      setPedidoEntregaId(null);
      setEntradaForma('PIX');
      setUsarBoleto(false);
      setEntradaValor('0,00');
      setBoletoParcelas(3);
      setVencimentosEditados(false);
      setBoletoVencimentos([]);
    }
  });

  const deleteMutation = trpc.pedidos.delete.useMutation({
    onSuccess: () => {
      utils.pedidos.list.invalidate();
      toast({ title: "Sucesso", description: "Pedido excluído e estoque devolvido!" });
    }
  });

  const handleImprimir = async (id: number) => {
    try {
      toast({ title: "Impressão", description: "Gerando PDF do pedido..." });
      const pedido = (pedidos || []).find((p: any) => p.id === id);
      const numero = pedido?.numero ? String(pedido.numero).padStart(4, '0') : '----';
      const cliente = String(pedido?.clienteNome || 'CLIENTE').toUpperCase().replace(/[^A-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);

      const dataUri = await gerarPDFPedido.mutateAsync({ id });
      downloadDataUri(String(dataUri), `PED-${numero}_${cliente}.pdf`);

      // Só muda para IMPRESSO depois de gerar o PDF
      updateStatusMutation.mutate({ id, status: "IMPRESSO" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha ao gerar PDF", variant: "destructive" });
    }
  };

  const abrirEntrega = (id: number) => {
    // Defaults "seguros"
    setEntradaForma('PIX');
    setUsarBoleto(false);
    setEntradaValor('0,00');
    setBoletoParcelas(3);
    const hoje = new Date();
    const dt30 = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
    const iso30 = dt30.toISOString().split('T')[0];
    setBoletoPrimeiroVenc(iso30);
    setBoletoVencimentos([iso30, iso30, iso30]);
    setVencimentosEditados(false);

    // Auto-preenche com o combinado do vendedor (se existir)
    const pedido = (pedidos || []).find((p: any) => p.id === id);
    const combinadoRaw = pedido?.pagamentoCombinado;
    if (combinadoRaw) {
      const combinado = typeof combinadoRaw === 'string' ? (() => { try { return JSON.parse(combinadoRaw); } catch { return null; } })() : combinadoRaw;
      if (combinado?.tipo === 'BOLETO') {
        setEntradaForma('BOLETO');
        setUsarBoleto(false);
        setBoletoParcelas(Math.max(1, Math.min(24, Number(combinado.boletoParcelas || 3))));
      }
      if (combinado?.tipo === 'CARTAO') {
        setEntradaForma('CARTAO');
        setUsarBoleto(false);
      }
      if (combinado?.tipo === 'ENTRADA_BOLETO') {
        setEntradaForma('PIX'); // entrada não precisa travar forma; PIX é default.
        setUsarBoleto(true);
        const ev = Number(combinado.entradaValor || 0);
        setEntradaValor(ev.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
        const parcelas = Math.max(1, Math.min(24, Number(combinado.boletoParcelas || 3)));
        setBoletoParcelas(parcelas);
        const first = combinado.boletoPrimeiroVencimento ? new Date(combinado.boletoPrimeiroVencimento) : dt30;
        const iso = first.toISOString().split('T')[0];
        setBoletoPrimeiroVenc(iso);
        // gera vencimentos (mensal) — você pode editar 1 a 1 no modal.
        const vencs: string[] = [];
        for (let i = 0; i < parcelas; i++) {
          const d = new Date(first);
          d.setMonth(d.getMonth() + i);
          vencs.push(d.toISOString().split('T')[0]);
        }
        setBoletoVencimentos(vencs);
      }
    }

    setPedidoEntregaId(id);
    setOpenEntrega(true);
  };

  const confirmarEntrega = () => {
    if (!pedidoEntregaId) return;
    const pedido = (pedidos || []).find((p: any) => p.id === pedidoEntregaId);
    const total = Number(pedido?.total || 0);
    const parseBRL = (v: string) => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
    const entrada = parseBRL(entradaValor);

    if (entradaForma !== 'BOLETO' && usarBoleto && (entrada <= 0 || entrada >= total)) {
      toast({ title: 'Erro', description: 'Entrada inválida. Deve ser maior que 0 e menor que o total.', variant: 'destructive' });
      return;
    }

    marcarEntregueMutation.mutate({
      id: pedidoEntregaId,
      entradaForma,
      entradaValor: entradaForma === 'BOLETO' ? undefined : (usarBoleto ? entrada : total),
      boletoParcelas: (entradaForma === 'BOLETO' || usarBoleto) ? boletoParcelas : undefined,
      boletoVencimentos: (entradaForma === 'BOLETO' || usarBoleto) ? boletoVencimentos.map(d => new Date(d)) : undefined,
      boletoPrimeiroVencimento: (entradaForma === 'BOLETO' || usarBoleto) ? new Date(boletoPrimeiroVenc) : undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'GERADO': return <Badge className="bg-[#eab308] text-black">GERADO</Badge>;
      case 'IMPRESSO': return <Badge className="bg-[#3b82f6] text-white">IMPRESSO</Badge>;
      case 'EM_ROTA': return <Badge className="bg-[#a855f7] text-white">EM ROTA</Badge>;
      case 'ENTREGUE': return <Badge className="bg-[#22c55e] text-white">ENTREGUE</Badge>;
      case 'CANCELADO': return <Badge className="bg-[#ef4444] text-white">CANCELADO</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const resumo = useMemo(() => {
    const base = { GERADO: 0, IMPRESSO: 0, EM_ROTA: 0, ENTREGUE: 0, CANCELADO: 0 };
    for (const p of (isLoading ? [] : (pedidos || []))) {
      const s = (p.status || '') as keyof typeof base;
      if (s in base) base[s] += 1;
    }
    return base;
  }, [pedidos, isLoading]);

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={isAdmin ? "Consulta de Pedidos" : "Meus Pedidos"}
        subtitle="Pesquise e gerencie os pedidos realizados"
        icon={<Package className="h-5 w-5" />}
      />

      <main className={PAGE_MAIN}>
        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm text-center">
            <div className="text-[10px] font-bold text-muted-foreground">GERADO</div>
            <div className="text-2xl font-extrabold" style={{ color: '#eab308' }}>{resumo.GERADO}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm text-center">
            <div className="text-[10px] font-bold text-muted-foreground">IMPRESSO</div>
            <div className="text-2xl font-extrabold" style={{ color: '#3b82f6' }}>{resumo.IMPRESSO}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm text-center">
            <div className="text-[10px] font-bold text-muted-foreground">ENTREGUE</div>
            <div className="text-2xl font-extrabold" style={{ color: '#22c55e' }}>{resumo.ENTREGUE}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm text-center">
            <div className="text-[10px] font-bold text-muted-foreground">CANCELADO</div>
            <div className="text-2xl font-extrabold" style={{ color: '#ef4444' }}>{resumo.CANCELADO}</div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 shadow-sm mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Nº Pedido ou Nome do Cliente..." 
                value={busca} 
                onChange={e => setBusca(e.target.value)} 
                className="pl-10"
              />
            </div>
            
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os Status</SelectItem>
                <SelectItem value="GERADO">Gerados</SelectItem>
                <SelectItem value="IMPRESSO">Impressos</SelectItem>
                <SelectItem value="EM_ROTA">Em rota</SelectItem>
                <SelectItem value="ENTREGUE">Entregues</SelectItem>
                <SelectItem value="CANCELADO">Cancelados</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Input 
                type="date" 
                value={dataInicio} 
                onChange={e => setDataInicio(e.target.value)} 
                className="flex-1 text-xs"
              />
              <Input 
                type="date" 
                value={dataFim} 
                onChange={e => setDataFim(e.target.value)} 
                className="flex-1 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground border-b border-border">
                  <th className="px-4 py-3 w-20">Nº</th>
                  <th className="px-4 py-3">Cliente / Vendedor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pedidos?.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-4 font-bold text-primary">
                      PED-{String(p.numero).padStart(4, '0')}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm uppercase">{p.clienteNome}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {p.vendedorNome || 'Vendedor'} • {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(p.status)}
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-sm">
                      R$ {parseFloat(p.total.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          title="Imprimir"
                          onClick={() => handleImprimir(p.id)}
                          disabled={p.status !== 'GERADO'}
                        >
                          <Printer className="h-4 w-4 text-blue-600" />
                        </Button>

                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          title="Entregar"
                          onClick={() => abrirEntrega(p.id)}
                          disabled={p.status !== 'IMPRESSO' && p.status !== 'EM_ROTA'}
                        >
                          <CheckCircle2 className="h-4 w-4 text-green-700" />
                        </Button>

                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          title="Editar"
                          onClick={() => setLocation(`/nova-venda?edit=${p.id}`)}
                        >
                          <Edit className="h-4 w-4 text-slate-700" />
                        </Button>

                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          title="Cancelar"
                          onClick={() => {
                            if (confirm('Cancelar este pedido?')) {
                              updateStatusMutation.mutate({ id: p.id, status: 'CANCELADO' });
                            }
                          }}
                          disabled={p.status === 'ENTREGUE' || p.status === 'CANCELADO'}
                        >
                          <Ban className="h-4 w-4 text-red-700" />
                        </Button>

                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          title="Excluir"
                          onClick={() => {
                            if (p.status === 'ENTREGUE') return;
                            if (confirm('Deseja realmente excluir este pedido? O estoque será devolvido automaticamente.')) {
                              deleteMutation.mutate({ id: p.id });
                            }
                          }}
                          disabled={p.status === 'ENTREGUE'}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!pedidos || pedidos.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-12 w-12 text-muted-foreground/30" />
                        <p className="text-muted-foreground font-medium">Nenhum pedido encontrado.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {openEntrega && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/35"
            onClick={() => setOpenEntrega(false)}
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <Card className="w-full max-w-md rounded-2xl shadow-2xl">
              <CardHeader>
                <CardTitle>Marcar como Entregue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
            <div className="text-xs font-bold text-muted-foreground">Forma de pagamento (1 ou 2 formas)</div>
            <div className="grid grid-cols-2 gap-2">
              {(['DINHEIRO','PIX','CARTAO','BOLETO'] as const).map(f => (
                <Button
                  key={f}
                  type="button"
                  variant={entradaForma === f ? 'default' : 'outline'}
                  className={`h-10 text-xs font-bold ${entradaForma === f ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  onClick={() => {
                    setEntradaForma(f);
                    if (f === 'BOLETO') setUsarBoleto(false);
                  }}
                >
                  {f === 'CARTAO' ? 'CARTÃO' : f}
                </Button>
              ))}
            </div>

            {entradaForma !== 'BOLETO' && (
              <Button
                type="button"
                variant={usarBoleto ? 'default' : 'outline'}
                className={`w-full h-9 text-xs font-bold ${usarBoleto ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                onClick={() => setUsarBoleto(v => !v)}
              >
                {usarBoleto ? 'ENTRADA + BOLETO (ATIVO)' : 'ADICIONAR BOLETO (2ª FORMA)'}
              </Button>
            )}

            {(entradaForma === 'BOLETO' || usarBoleto) && (
              <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 space-y-3">
                {entradaForma !== 'BOLETO' && (
                  <div>
                    <div className="text-[10px] font-bold text-blue-700 mb-1">ENTRADA RECEBIDA (R$)</div>
                    <Input value={entradaValor} onChange={(e) => setEntradaValor(e.target.value)} className="h-8 text-right font-bold" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-bold text-blue-700 mb-1">PARCELAS</div>
                    <Input value={String(boletoParcelas)} onChange={(e) => setBoletoParcelas(Math.max(1, Math.min(24, Number(e.target.value || 1))))} className="h-8 text-right font-bold" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-blue-700 mb-1">1º VENCIMENTO</div>
                    <Input type="date" value={boletoPrimeiroVenc} onChange={(e) => setBoletoPrimeiroVenc(e.target.value)} className="h-8" />
                  </div>
                </div>

                {(boletoParcelas > 1) && (
                  <div className="mt-2">
                    <div className="text-[10px] font-bold text-blue-700 mb-1">VENCIMENTOS (EDITÁVEL)</div>
                    <div className="grid grid-cols-2 gap-2">
                      {boletoVencimentos.map((d, idx) => (
                        <Input
                          key={idx}
                          type="date"
                          value={d}
                          onChange={(e) => {
                            setVencimentosEditados(true);
                            const next = [...boletoVencimentos];
                            next[idx] = e.target.value;
                            setBoletoVencimentos(next);
                          }}
                          className="h-8"
                        />
                      ))}
                    </div>
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 text-[10px]"
                        onClick={() => {
                          setVencimentosEditados(false);
                          setBoletoVencimentos(buildVencimentos(boletoPrimeiroVenc, boletoParcelas));
                        }}
                      >
                        REGERAR DATAS (30 EM 30)
                      </Button>
                    </div>
                  </div>
                )}
                <div className="text-[10px] text-blue-700">Ao confirmar, o sistema gera o ZIP dos boletos automaticamente.</div>
              </div>
            )}
                <div className="pt-2 flex gap-2 justify-end">
                  <Button variant="outline" className="rounded-xl" onClick={() => setOpenEntrega(false)}>Cancelar</Button>
                  <Button onClick={confirmarEntrega} disabled={marcarEntregueMutation.isPending} className="rounded-xl">
                    Confirmar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
