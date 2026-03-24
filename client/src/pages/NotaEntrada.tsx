import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, PackagePlus, CalendarDays, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpcClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

type Forma = "PIX" | "DINHEIRO" | "BOLETO" | "CHEQUE" | "CARTAO";

/** Campos usados na tela; o retorno de `produtos.buscar` no cliente pode ser parcial na inferência. */
type ProdutoBusca = {
  id?: number;
  descricao: string;
  valorVenda: number;
  marca?: string | null;
};

export default function NotaEntrada() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Header (1 marca por nota)
  const [dataChegada, setDataChegada] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [marca, setMarca] = useState<string>("");
  const [valorTotal, setValorTotal] = useState<string>("");
  const [formaPagamento, setFormaPagamento] = useState<Forma>("PIX");
  const [parcelasCount, setParcelasCount] = useState<number>(3);
  const [datasVenc, setDatasVenc] = useState<string[]>([]);
  const [obs, setObs] = useState<string>("");

  // Itens
  const [produtoBusca, setProdutoBusca] = useState<string>("");
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<number | null>(null);
  const [qtd, setQtd] = useState<number>(1);
  const [custoUnit, setCustoUnit] = useState<string>("");
  const [itens, setItens] = useState<Array<{ produtoId: number; descricao: string; quantidade: number; custoUnit?: number }>>([]);

  const { data: produtosResp } = trpc.produtos.buscar.useQuery({ query: produtoBusca || undefined });
  const produtos = (produtosResp?.produtos ?? []) as unknown as ProdutoBusca[];

  const marcasSugestoes = useMemo(() => {
    const s = new Set<string>();
    for (const p of produtos) if (p.marca) s.add(String(p.marca));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [produtos]);

  const createMutation = trpc.notasEntrada.create.useMutation({
    onSuccess: () => {
      utils.produtos.list.invalidate();
      utils.produtos.buscar.invalidate();
      utils.pendencias.list.invalidate();
      toast({ title: "Nota lançada", description: "Estoque + financeiro + baixas automáticas concluídos." });
      setItens([]);
      setProdutoBusca("");
      setProdutoSelecionadoId(null);
      setQtd(1);
      setCustoUnit("");
      setValorTotal("");
      setObs("");
    },
    onError: (e) => toast({ title: "Erro", description: e.message }),
  });

  const gerarDatasPadrao = (primeira: string, n: number) => {
    const base = new Date(primeira + "T12:00:00");
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(base);
      d.setMonth(d.getMonth() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      out.push(`${yyyy}-${mm}-${dd}`);
    }
    setDatasVenc(out);
  };

  const addItem = () => {
    if (typeof produtoSelecionadoId !== "number") {
      toast({ title: "Selecione um produto", description: "Produto é obrigatório (sempre cadastrado)." });
      return;
    }
    const selectedId = produtoSelecionadoId;
    if (!marca.trim()) {
      toast({ title: "Informe a marca", description: "A nota é sempre de uma marca." });
      return;
    }
    const prod = produtos.find((p) => p.id === selectedId);
    if (!prod || typeof prod.id !== "number") {
      toast({ title: "Produto inválido", description: "Rebusque o produto." });
      return;
    }
    const prodId = prod.id;
    if (prod.marca && String(prod.marca).trim() !== marca.trim()) {
      toast({
        title: "Marca diferente",
        description: `Esse produto é da marca "${prod.marca}". A nota está como "${marca}".`
      });
      return;
    }
    setItens(prev => {
      const exists = prev.find((i) => i.produtoId === selectedId);
      if (exists) {
        return prev.map((i) => i.produtoId === selectedId
          ? { ...i, quantidade: i.quantidade + qtd, custoUnit: custoUnit ? Number(custoUnit) : i.custoUnit }
          : i
        );
      }
      return [...prev, {
        produtoId: prodId,
        descricao: String(prod.descricao),
        quantidade: qtd,
        ...(custoUnit ? { custoUnit: Number(custoUnit) } : {}),
      }];
    });
    setProdutoBusca("");
    setProdutoSelecionadoId(null);
    setQtd(1);
    setCustoUnit("");
  };

  const removerItem = (produtoId: number) => setItens(prev => prev.filter(i => i.produtoId !== produtoId));

  const salvarNota = () => {
    const total = Number(valorTotal || 0);
    if (!marca.trim()) return toast({ title: "Marca obrigatória", description: "Informe a marca da nota." });
    if (!dataChegada) return toast({ title: "Data obrigatória", description: "Informe a data que chegou." });
    if (!total || total <= 0) return toast({ title: "Valor inválido", description: "Informe o valor total da nota." });
    if (!itens.length) return toast({ title: "Sem itens", description: "Adicione pelo menos 1 produto." });

    const precisaParcelas = formaPagamento === "BOLETO" || formaPagamento === "CHEQUE";
    let parcelas: any[] | undefined = undefined;
    if (precisaParcelas) {
      if (datasVenc.length !== parcelasCount) {
        toast({ title: "Vencimentos", description: "Gere/ajuste as datas de vencimento." });
        return;
      }
      const valorParcela = Number((total / parcelasCount).toFixed(2));
      parcelas = datasVenc.map((d, idx) => ({
        parcela: idx + 1,
        valor: idx === parcelasCount - 1 ? Number((total - valorParcela * (parcelasCount - 1)).toFixed(2)) : valorParcela,
        dataVencimento: d,
      }));
    }

    createMutation.mutate({
      marca: marca.trim(),
      dataChegada: new Date(dataChegada + "T12:00:00").toISOString(),
      valorTotal: total,
      formaPagamento,
      observacao: obs || undefined,
      parcelas,
      itens: itens.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade, ...(i.custoUnit ? { custoUnit: i.custoUnit } : {}) })),
    });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-black flex items-center gap-2">
              <ReceiptText className="h-5 w-5" /> Nota de Entrada
            </h1>
            <p className="text-sm text-muted-foreground">1 marca por nota • salva e dispara estoque + financeiro + baixas</p>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Dados da Nota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Data que chegou</Label>
                <Input type="date" value={dataChegada} onChange={(e) => setDataChegada(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Marca (Fábrica)</Label>
                <Input
                  placeholder="Ex: PANAN"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  list="marcas"
                />
                <datalist id="marcas">
                  {marcasSugestoes.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Valor total da nota</Label>
                <Input inputMode="decimal" placeholder="0,00" value={valorTotal} onChange={(e) => setValorTotal(e.target.value.replace(',', '.'))} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Pagamento</Label>
                <Select value={formaPagamento} onValueChange={(v) => setFormaPagamento(v as Forma)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="DINHEIRO">DINHEIRO</SelectItem>
                    <SelectItem value="CARTAO">CARTÃO</SelectItem>
                    <SelectItem value="BOLETO">BOLETO</SelectItem>
                    <SelectItem value="CHEQUE">CHEQUE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(formaPagamento === "BOLETO" || formaPagamento === "CHEQUE") && (
                <>
                  <div className="space-y-2">
                    <Label>Parcelas</Label>
                    <Input
                      type="number"
                      min={1}
                      value={parcelasCount}
                      onChange={(e) => setParcelasCount(Math.max(1, Number(e.target.value || 1)))}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Vencimentos (editável)</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => gerarDatasPadrao(dataChegada, parcelasCount)}
                      >
                        <Plus className="h-4 w-4" /> Gerar 30/30
                      </Button>
                      <Badge variant="outline" className="h-10 flex items-center">{datasVenc.length}/{parcelasCount}</Badge>
                    </div>
                    {datasVenc.length > 0 && (
                      <div className="grid gap-2 md:grid-cols-3">
                        {datasVenc.map((d, idx) => (
                          <Input
                            key={idx}
                            type="date"
                            value={d}
                            onChange={(e) => setDatasVenc(prev => prev.map((x, i) => i === idx ? e.target.value : x))}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Input placeholder="Ex: Nota chegou com 1 volume faltando" value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5" /> Itens da Nota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-12 items-end">
              <div className="md:col-span-6 space-y-2">
                <Label>Buscar produto (obrigatório cadastrado)</Label>
                <Input
                  placeholder="Digite para buscar..."
                  value={produtoBusca}
                  onChange={(e) => {
                    setProdutoBusca(e.target.value);
                    setProdutoSelecionadoId(null);
                  }}
                />
                {produtoBusca && (
                  <div className="border rounded-xl bg-background max-h-56 overflow-auto">
                    {produtos.slice(0, 12).map((p: any) => (
                      <button
                        type="button"
                        key={p.id}
                        className={`w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between gap-2 ${produtoSelecionadoId === p.id ? 'bg-muted/40' : ''}`}
                        onClick={() => {
                          setProdutoSelecionadoId(p.id);
                          setProdutoBusca(`${p.descricao}`);
                        }}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm">{p.descricao}</span>
                          <span className="text-xs text-muted-foreground">Marca: {p.marca || '-'}</span>
                        </div>
                        <Badge variant="outline">Est: {p.estoque}</Badge>
                      </button>
                    ))}
                    {produtos.length === 0 && (
                      <div className="px-3 py-3 text-sm text-muted-foreground">Nenhum produto encontrado.</div>
                    )}
                  </div>
                )}
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label>Qtd</Label>
                <Input type="number" min={1} value={qtd} onChange={(e) => setQtd(Math.max(1, Number(e.target.value || 1)))} />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label>Custo unit (opcional)</Label>
                <Input inputMode="decimal" placeholder="0,00" value={custoUnit} onChange={(e) => setCustoUnit(e.target.value.replace(',', '.'))} />
              </div>

              <div className="md:col-span-2">
                <Button type="button" onClick={addItem} className="w-full gap-2">
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
            </div>

            <div className="rounded-xl border overflow-hidden">
              <div className="grid grid-cols-12 bg-muted/40 text-xs font-bold uppercase text-muted-foreground px-3 py-2">
                <div className="col-span-7">Produto</div>
                <div className="col-span-2 text-center">Qtd</div>
                <div className="col-span-2 text-right">Custo</div>
                <div className="col-span-1 text-right">Ação</div>
              </div>
              {itens.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">Nenhum item adicionado.</div>
              ) : (
                <div className="divide-y">
                  {itens.map((it) => (
                    <div key={it.produtoId} className="grid grid-cols-12 px-3 py-3 items-center">
                      <div className="col-span-7 flex items-center gap-2">
                        <PackagePlus className="h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm">{it.descricao}</span>
                          <span className="text-xs text-muted-foreground">ID: {it.produtoId}</span>
                        </div>
                      </div>
                      <div className="col-span-2 text-center font-black">{it.quantidade}</div>
                      <div className="col-span-2 text-right text-sm font-semibold">{it.custoUnit ? `R$ ${it.custoUnit.toFixed(2)}` : '-'}</div>
                      <div className="col-span-1 flex justify-end">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removerItem(it.produtoId)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between pt-2">
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold">Regra:</span> salvar nota atualiza estoque e dá baixa automática em COLETA/REPOSIÇÃO.
              </div>
              <Button
                type="button"
                onClick={salvarNota}
                disabled={createMutation.isPending}
                className="gap-2"
              >
                <ReceiptText className="h-4 w-4" />
                {createMutation.isPending ? "Salvando..." : "Salvar Nota"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
