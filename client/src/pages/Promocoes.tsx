import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CalendarDays, Tag, Trash2, PackageSearch, Save, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpcClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Item = { produtoId: number; precoPromocional: string };

function isoHoje() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function moneyToNumberBr(v: string) {
  const s = (v || "").trim();
  if (!s) return 0;
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function fmtDateShort(v: any) {
  if (!v) return "-";
  return String(v).slice(0, 10);
}

function isEmVigencia(p: any) {
  const hoje = new Date();
  const ini = new Date(String(p.inicio));
  const fim = new Date(String(p.fim));
  return !!p.ativo && ini <= hoje && fim >= hoje;
}

export default function Promocoes() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const promocoesQ = trpc.promocoes.list.useQuery();
  const produtosQ = trpc.produtos.list.useQuery();

  const promocoes = (() => {
    const d = promocoesQ.data as any;
    if (Array.isArray(d)) return d;
    if (d?.promocoes && Array.isArray(d.promocoes)) return d.promocoes;
    return [];
  })();
  const produtos = (() => {
    const d = produtosQ.data as any;
    if (Array.isArray(d)) return d;
    if (d?.produtos && Array.isArray(d.produtos)) return d.produtos;
    return [];
  })();

  // ===== Form (sempre visível) =====
  const [editId, setEditId] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState(isoHoje());
  const [fim, setFim] = useState(isoHoje());
  const [ativo, setAtivo] = useState(true);
  const [produtoBusca, setProdutoBusca] = useState("");
  const [itens, setItens] = useState<Item[]>([]);

  const limpar = () => {
    setEditId(null);
    setNome("");
    setInicio(isoHoje());
    setFim(isoHoje());
    setAtivo(true);
    setProdutoBusca("");
    setItens([]);
  };

  const produtosFiltrados = useMemo(() => {
    const q = (produtoBusca || "").trim().toLowerCase();
    if (!q) return produtos.slice(0, 30);
    return produtos
      .filter((p: any) => String(p.descricao || "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [produtos, produtoBusca]);

  const addItem = (produtoId: number) => {
    setItens((prev) => {
      if (prev.some((x) => x.produtoId === produtoId)) return prev;
      return [...prev, { produtoId, precoPromocional: "" }];
    });
  };

  const createMutation = trpc.promocoes.create.useMutation({
    onSuccess: async () => {
      await utils.promocoes.list.invalidate();
      toast({ title: "Promoção cadastrada", description: "Vigência salva e itens aplicados." });
      limpar();
    },
    onError: (e) => toast({ title: "Erro", description: e.message }),
  });

  const updateMutation = trpc.promocoes.update.useMutation({
    onSuccess: async () => {
      await utils.promocoes.list.invalidate();
      toast({ title: "Promoção atualizada", description: "Alterações aplicadas." });
      limpar();
    },
    onError: (e) => toast({ title: "Erro", description: e.message }),
  });

  const deleteMutation = trpc.promocoes.delete.useMutation({
    onSuccess: async () => {
      await utils.promocoes.list.invalidate();
      toast({ title: "Promoção removida", description: "Ok." });
      if (editId) limpar();
    },
    onError: (e) => toast({ title: "Erro", description: e.message }),
  });

  const abrirEditar = async (p: any) => {
    setEditId(Number(p.id));
    setNome(String(p.nome || ""));
    setInicio(String(p.inicio).slice(0, 10));
    setFim(String(p.fim).slice(0, 10));
    setAtivo(!!p.ativo);

    try {
      const det = await utils.promocoes.detalhes.fetch({ id: Number(p.id) } as any);
      const its = (det as any)?.itens ?? [];
      setItens(
        its.map((i: any) => ({
          produtoId: Number(i.produtoId),
          precoPromocional: Number(i.precoPromocional ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
        }))
      );
    } catch {
      setItens([]);
    }

    // sobe pro topo (cadastro)
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const salvar = async () => {
    if (!nome.trim()) {
      toast({ title: "Informe o nome", description: "Ex: Promoção de Carnaval" });
      return;
    }
    if (!inicio || !fim || fim < inicio) {
      toast({ title: "Datas inválidas", description: "Data fim não pode ser menor que início." });
      return;
    }

    const itensPayload = itens
      .filter((i) => i.produtoId)
      .map((i) => ({ produtoId: i.produtoId, precoPromocional: moneyToNumberBr(i.precoPromocional) }))
      .filter((i) => i.precoPromocional > 0);

    if (itensPayload.length === 0) {
      toast({ title: "Sem itens", description: "Adicione pelo menos 1 produto com preço promocional." });
      return;
    }

    if (editId) {
      await updateMutation.mutateAsync({
        id: editId,
        data: {
          nome: nome.trim().toUpperCase(),
          inicio: new Date(inicio + "T12:00:00"),
          fim: new Date(fim + "T23:59:59"),
          ativo,
          itens: itensPayload,
        },
      } as any);
      return;
    }

    await createMutation.mutateAsync({
      nome: nome.trim().toUpperCase(),
      inicio: new Date(inicio + "T12:00:00"),
      fim: new Date(fim + "T23:59:59"),
      ativo,
      itens: itensPayload,
    } as any);
  };

  // garante datas válidas
  useEffect(() => {
    if (!inicio) setInicio(isoHoje());
    if (!fim) setFim(isoHoje());
  }, [inicio, fim]);

  const promocoesOrdenadas = useMemo(() => {
    const arr = [...promocoes];
    arr.sort((a: any, b: any) => {
      const da = new Date(String(a.createdAt || a.inicio)).getTime();
      const db = new Date(String(b.createdAt || b.inicio)).getTime();
      return db - da;
    });
    return arr;
  }, [promocoes]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center gap-4">
          <Button
            variant="outline"
            className="gap-2 rounded-xl"
            onClick={() => setLocation("/")}
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>

          <div className="flex-1">
            <h1 className="text-xl font-black flex items-center gap-2">
              <Tag className="h-5 w-5" /> Promoções
            </h1>
            <p className="text-sm text-muted-foreground">Cadastro + lista (novas primeiro)</p>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* CADASTRO (PADRÃO NOTA DE ENTRADA) */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" /> {editId ? "Editar Promoção" : "Cadastrar Promoção"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Nome da promoção</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: PROMOÇÃO CARNAVAL"
                />
              </div>

              <div className="space-y-2">
                <Label>Início</Label>
                <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Fim</Label>
                <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="promo-ativa"
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="promo-ativa">Ativa</Label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PackageSearch className="h-4 w-4" /> Buscar produto
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    value={produtoBusca}
                    onChange={(e) => setProdutoBusca(e.target.value)}
                    placeholder="Digite para filtrar..."
                  />

                  <div className="max-h-56 overflow-auto rounded-xl border">
                    {produtosFiltrados.map((p: any) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm flex items-center justify-between"
                        onClick={() => addItem(Number(p.id))}
                        type="button"
                      >
                        <span className="truncate font-semibold">{String(p.descricao || "").toUpperCase()}</span>
                        <span className="text-xs text-muted-foreground">#{p.id}</span>
                      </button>
                    ))}
                    {produtosFiltrados.length === 0 && (
                      <div className="px-3 py-4 text-sm text-muted-foreground">Nenhum produto.</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Itens e preço promocional</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {itens.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Adicione produtos ao lado.</div>
                  ) : (
                    <div className="space-y-2">
                      {itens.map((i, idx) => {
                        const prod = produtos.find((p: any) => Number(p.id) === Number(i.produtoId));
                        return (
                          <div key={i.produtoId} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-bold text-muted-foreground">PRODUTO</div>
                              <div className="text-sm font-semibold truncate">{String(prod?.descricao || `#${i.produtoId}`).toUpperCase()}</div>
                            </div>
                            <div className="w-40">
                              <div className="text-[11px] font-bold text-muted-foreground">PREÇO PROMO</div>
                              <Input
                                value={i.precoPromocional}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setItens((prev) => prev.map((x, j) => (j === idx ? { ...x, precoPromocional: v } : x)));
                                }}
                                placeholder="0,00"
                                className="text-right font-bold"
                              />
                            </div>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 rounded-xl"
                              title="Remover item"
                              onClick={() => setItens((prev) => prev.filter((x) => x.produtoId !== i.produtoId))}
                              type="button"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-end pt-2">
              {editId && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 rounded-xl"
                  onClick={limpar}
                >
                  <XCircle className="h-4 w-4" /> Cancelar edição
                </Button>
              )}
              {!editId && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 rounded-xl"
                  onClick={limpar}
                >
                  <XCircle className="h-4 w-4" /> Limpar
                </Button>
              )}
              <Button
                type="button"
                className="gap-2 rounded-xl"
                onClick={salvar}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                <Save className="h-4 w-4" /> {editId ? "Salvar" : "Cadastrar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* LISTA */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4" /> Promoções cadastradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(promocoesQ.isLoading ? [] : promocoesOrdenadas).length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhuma promoção cadastrada.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground border-b border-border">
                      <th className="px-4 py-3">Criada</th>
                      <th className="px-4 py-3">Promoção</th>
                      <th className="px-4 py-3">Fim</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(promocoesQ.isLoading ? [] : promocoesOrdenadas).map((p: any) => {
                      const vig = isEmVigencia(p);
                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDateShort(p.createdAt || p.inicio)}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => abrirEditar(p)}
                              className="font-bold text-sm uppercase hover:underline text-left"
                              title="Clique para editar"
                            >
                              {String(p.nome || "").toUpperCase()}
                            </button>
                            <div className="text-xs text-muted-foreground">{fmtDateShort(p.inicio)} → {fmtDateShort(p.fim)}</div>
                          </td>
                          <td className="px-4 py-3 text-sm">{fmtDateShort(p.fim)}</td>
                          <td className="px-4 py-3">
                            <Badge className={vig ? "bg-green-600" : "bg-slate-500"}>
                              {vig ? "EM VIGÊNCIA" : "FINALIZADA"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="outline"
                              className="rounded-xl"
                              onClick={() => {
                                if (!confirm("Excluir esta promoção?")) return;
                                deleteMutation.mutate({ id: Number(p.id) } as any);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
