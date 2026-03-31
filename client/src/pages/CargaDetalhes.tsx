import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "../lib/trpcClient";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { useToast } from "../hooks/use-toast";
import { ArrowLeft, Pencil, Truck, Plus, Trash2, FileText } from "lucide-react";

// Detalhe da carga: apenas informações + edição (incluir/remover pedidos).
// Baixa é outra tela: /cargas/:id/baixa
export default function CargaDetalhes() {
  const { id } = useParams();
  const cargaId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const downloadDataUri = (dataUri: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    if (a.parentNode === document.body) {
      document.body.removeChild(a);
    }
  };


  const { data: carga, isLoading } = trpc.cargas.getById.useQuery({ id: cargaId });
  const { data: pedidosDisponiveisData } = trpc.pedidos.list.useQuery({ status: "IMPRESSO" });
  const pedidosDisponiveis = (pedidosDisponiveisData as any)?.items ?? [];
  const updatePedidos = trpc.cargas.updatePedidos.useMutation();
  const fecharCarga = trpc.cargas.fechar.useMutation();
  const gerarRomaneio = trpc.cargas.gerarRomaneioPDF.useMutation();


  const [showEditar, setShowEditar] = useState(false);
  const [addSel, setAddSel] = useState<number[]>([]);
  const [removeSel, setRemoveSel] = useState<number[]>([]);
  const [buscaAdd, setBuscaAdd] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(false);

  const money = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  const entregues = useMemo(() => (carga?.pedidos || []).filter((p: any) => p.entregue), [carga]);
  const pendentes = useMemo(() => (carga?.pedidos || []).filter((p: any) => !p.entregue), [carga]);

  const toggle = (arr: number[], id: number) => (arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  const abrirEditar = () => {
    setAddSel([]);
    setRemoveSel([]);
    setBuscaAdd("");
    setShowEditar(true);
  };


const handleGerarRomaneio = async () => {
  try {
    if (!carga) return;
    toast({ title: "Romaneio", description: "Gerando romaneio da carga..." });
    const dataUri = await gerarRomaneio.mutateAsync({ cargaId });
    const numero = String((carga as any).numero || '').padStart(4, '0');
    const cidade = String((carga as any).cidadeRota || 'ROTA').toUpperCase().replace(/[^A-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_').slice(0, 30);
    const dt = (carga as any).dataEntrega ? new Date((carga as any).dataEntrega) : new Date();
    const iso = dt.toISOString().split('T')[0];
    downloadDataUri(String(dataUri), `ROMANEIO_CARGA_${numero}_${cidade}_${iso}.pdf`);
    toast({ title: "Romaneio pronto", description: "Arquivo gerado com sucesso. ✅" });
  } catch (e: any) {
    toast({ title: "Erro", description: e?.message || "Falha ao gerar romaneio", variant: "destructive" });
  }
};

const handleFecharCarga = async () => {
  try {
    await fecharCarga.mutateAsync({ cargaId });
    toast({ title: "Carga liberada", description: "Caminhão liberado. Carga agora está EM ROTA. 🚚" });
    utils.cargas.getById.invalidate({ id: cargaId });
    utils.cargas.list.invalidate();
  } catch (e: any) {
    toast({ title: "Erro", description: e?.message || "Falha ao liberar carga", variant: "destructive" });
  }
};


  const salvarEdicao = async () => {
    if (!addSel.length && !removeSel.length) {
      toast({ title: 'Nada para salvar', description: 'Selecione pedidos para incluir/remover.' });
      return;
    }
    setLoadingEdit(true);
    try {
      await updatePedidos.mutateAsync({ cargaId, addIds: addSel, removeIds: removeSel });
      toast({ title: 'Sucesso', description: 'Carga atualizada.' });
      setShowEditar(false);
      setAddSel([]);
      setRemoveSel([]);
      utils.cargas.getById.invalidate({ id: cargaId });
      utils.cargas.list.invalidate();
      utils.pedidos.list.invalidate();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingEdit(false);
    }
  };

  if (!isLoading && !carga) return <div className="p-20 text-center">Carga não encontrada.</div>;
  if (!carga) return <div className="min-h-screen bg-muted/30" />;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/cargas')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Carga #{carga.numero}</h1>
            <p className="text-xs text-muted-foreground uppercase">{carga.cidadeRota}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Badge className={String(carga.status) === 'ENTREGUE' ? 'bg-green-600' : 'bg-[#a855f7]'}>
              {String(carga.status) === 'ENTREGUE' ? 'ENTREGUE' : 'EM ROTA'}
            </Badge>
            {String(carga.status) !== 'ENTREGUE' && (
              <>
  {(carga as any)?.status === 'ABERTA' && (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={abrirEditar}>
        <Pencil className="h-4 w-4" /> EDITAR
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={handleGerarRomaneio}>
        <FileText className="h-4 w-4" /> ROMANEIO
      </Button>
      <Button size="sm" className="bg-[#a855f7] hover:bg-[#9333ea] gap-2" onClick={handleFecharCarga}>
        <Truck className="h-4 w-4" /> LIBERAR CARGA
      </Button>
    </>
  )}

  {(carga as any)?.status === 'EM_ROTA' && (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={handleGerarRomaneio}>
        <FileText className="h-4 w-4" /> ROMANEIO
      </Button>
      <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-2" onClick={() => setLocation(`/cargas/${cargaId}/baixa`)}>
        <Truck className="h-4 w-4" /> DAR BAIXA
      </Button>
    </>
  )}

  {(carga as any)?.status === 'ENTREGUE' && (
    <Button variant="outline" size="sm" className="gap-2" onClick={handleGerarRomaneio}>
      <FileText className="h-4 w-4" /> ROMANEIO
    </Button>
  )}
</>
            )}
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-4xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground font-bold">TOTAL DE PEDIDOS</p>
              <p className="text-2xl font-black">{(carga.pedidos || []).length}</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-green-600 font-bold">ENTREGUES</p>
              <p className="text-2xl font-black text-green-700">{entregues.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-yellow-600 font-bold">PENDENTES</p>
              <p className="text-2xl font-black text-yellow-700">{pendentes.length}</p>
            </CardContent>
          </Card>
        </div>

        <h2 className="text-lg font-bold">Pedidos da carga</h2>

        <div className="grid gap-3">
          {(carga.pedidos || []).map((p: any) => (
            <Card key={p.id} className={`border-l-4 ${p.entregue ? 'border-l-green-500' : 'border-l-yellow-500'}`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">PEDIDO #{p.numero}</span>
                    <Badge className={p.entregue ? 'bg-green-600' : 'bg-[#a855f7]'}>
                      {p.entregue ? 'ENTREGUE' : 'EM ROTA'}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium uppercase mt-1">{p.clienteNome}</p>
                  <p className="text-xs text-muted-foreground">VALOR: R$ {money(p.total)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      {/* EDITAR CARGA */}
      <Dialog open={showEditar} onOpenChange={setShowEditar}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Editar Carga #{carga.numero}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto pr-2">
            <div className="space-y-2">
              <Label className="font-bold">REMOVER DA CARGA (somente pendentes)</Label>
              <div className="border rounded-lg divide-y">
                {pendentes.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground italic">Nenhum pedido pendente para remover.</p>
                ) : (
                  pendentes.map((p: any) => (
                    <div key={p.id} className="p-3 flex items-center gap-3 hover:bg-muted/50 cursor-pointer" onClick={() => setRemoveSel(prev => toggle(prev, p.id))}>
                      <Checkbox checked={removeSel.includes(p.id)} onCheckedChange={() => setRemoveSel(prev => toggle(prev, p.id))} />
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span className="font-bold text-sm">PEDIDO #{p.numero}</span>
                          <span className="font-bold text-sm">R$ {money(p.total)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground uppercase">{p.clienteNome}</p>
                      </div>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Ao remover, o pedido volta automaticamente para <b>IMPRESSO</b>.</p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="font-bold">INCLUIR NA CARGA (somente IMPRESSO)</Label>
              <Input value={buscaAdd} onChange={e => setBuscaAdd(e.target.value)} placeholder="Buscar por nº pedido / cliente" />
              <div className="border rounded-lg divide-y max-h-[320px] overflow-y-auto">
                {(pedidosDisponiveis ?? [])
                  .filter((p: any) => {
                    const t = buscaAdd.trim().toLowerCase();
                    if (!t) return true;
                    return String(p.numero).includes(t) || String(p.clienteNome || '').toLowerCase().includes(t);
                  })
                  .map((p: any) => (
                    <div key={p.id} className="p-3 flex items-center gap-3 hover:bg-muted/50 cursor-pointer" onClick={() => setAddSel(prev => toggle(prev, p.id))}>
                      <Checkbox checked={addSel.includes(p.id)} onCheckedChange={() => setAddSel(prev => toggle(prev, p.id))} />
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span className="font-bold text-sm">PEDIDO #{p.numero}</span>
                          <span className="font-bold text-sm">R$ {money(p.total)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground uppercase">{p.clienteNome}</p>
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Ao incluir, o pedido muda automaticamente para <b>EM ROTA</b>.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditar(false)}>CANCELAR</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={salvarEdicao} disabled={loadingEdit}>
              {loadingEdit ? 'SALVANDO...' : 'SALVAR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
