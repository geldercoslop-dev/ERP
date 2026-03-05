import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpcClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Package, Plus, Save, X, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";

/**
 * Cadastro de Produtos (padrão Nota de Entrada):
 * - Cadastro em cima + lista embaixo
 * - Cores: Voltar vermelho, Novo cinza, Salvar verde, Cancelar cinza
 * - Preço sugerido automático
 * - Opcionais: nome + acréscimo no custo + custo total (base + acréscimo) + lixeira + Enter cria nova linha
 */
export default function Produtos() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Data — resposta paginada { items, total, page, pageSize, hasMore }
  const { data: produtosRaw, isLoading } = trpc.produtos.list.useQuery();
  const produtos = useMemo(() => {
    const d = produtosRaw;
    if (Array.isArray(d)) return d;
    if (d && typeof d === "object" && Array.isArray((d as any).items)) return (d as any).items;
    if (d && typeof d === "object" && Array.isArray((d as any).produtos)) return (d as any).produtos;
    return [];
  }, [produtosRaw]);
  const { data: grupos } = trpc.gruposPrecificacao.list.useQuery();
  const { data: cores } = trpc.cores.list.useQuery();

  // Mutations com tratamento de erro e invalidação garantida via onSettled
  const createMutation = trpc.produtos.create.useMutation({
    onError: (e) => toast.error(e.message || "Erro ao cadastrar produto"),
    onSettled: () => utils.produtos.list.invalidate(),
  });
  const updateMutation = trpc.produtos.update.useMutation({
    onError: (e) => toast.error(e.message || "Erro ao atualizar produto"),
    onSettled: () => utils.produtos.list.invalidate(),
  });
  const deleteMutation = trpc.produtos.delete.useMutation({
    onError: (e) => toast.error(e.message || "Erro ao excluir produto"),
    onSettled: () => utils.produtos.list.invalidate(),
  });

  // UI
  const [busca, setBusca] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    descricao: "",
    marca: "",
    grupoId: undefined as number | undefined,

    // custo base
    custo: 0,

    // regras (mantidas para o motor existente)
    descontoFabrica: 0,
    ipi: 0,
    frete: 0,
    montagem: 0,
    lucro: 0,
    comissao: 0,
    jurosCartao: 0,

    // calculado
    valorVenda: 0,

    // compat (backend)
    fornecedor: "",
    categoria: "",
    prazoGarantia: 90,
  });

  // Cores e estoque por cor
  const [coresSelecionadas, setCoresSelecionadas] = useState<{ corId: number; estoque: number }[]>([]);

  // Opcionais (ex: "COM ESPELHO", "COM PÉS", etc.)
  const [opcionais, setOpcionais] = useState<
    { nome: string; acrescimoCusto: number; estoque: number }[]
  >([{ nome: "", acrescimoCusto: 0, estoque: 0 }]);

  const calcularPrecoVenda = (custo: number) => {
    const descFab = Number(formData.descontoFabrica) / 100;
    const ipi = Number(formData.ipi) / 100;
    const frete = Number(formData.frete);
    const montagem = Number(formData.montagem);
    const lucro = Number(formData.lucro);
    const comissao = Number(formData.comissao) / 100;
    const juros = Number(formData.jurosCartao) / 100;

    const custoLiquido = custo * (1 - descFab);
    const impostosEExtras = custoLiquido * (1 + ipi) + frete + montagem + lucro;
    const divisor = 1 - comissao - juros;

    const venda = divisor > 0 ? impostosEExtras / divisor : impostosEExtras;
    const vendaArred = Math.ceil(venda / 10) * 10 - 1; // padrão do projeto
    return vendaArred > 0 ? vendaArred : 0;
  };

  useEffect(() => {
    const preco = calcularPrecoVenda(formData.custo);
    if (preco !== formData.valorVenda) {
      setFormData((p) => ({ ...p, valorVenda: preco }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.custo,
    formData.descontoFabrica,
    formData.ipi,
    formData.frete,
    formData.montagem,
    formData.lucro,
    formData.comissao,
    formData.jurosCartao,
  ]);

  const produtosFiltrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    if (!produtos) return [];
    if (!term) return [...produtos].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    return produtos
      .filter((p: any) => `${p.descricao ?? ""} ${p.marca ?? ""}`.toLowerCase().includes(term))
      .sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));
  }, [produtos, busca]);

  const codigoProdutoLabel = editingId ? `P${String(editingId).padStart(4, "0")}` : "AUTO";

  function limparForm() {
    setEditingId(null);
    setFormData((p) => ({
      ...p,
      descricao: "",
      marca: "",
      grupoId: undefined,
      custo: 0,
      valorVenda: 0,
    }));
    setCoresSelecionadas([]);
    setOpcionais([{ nome: "", acrescimoCusto: 0, estoque: 0 }]);
  }

  function carregarParaEdicao(p: any) {
    setEditingId(p.id);
    setFormData((prev) => ({
      ...prev,
      descricao: p.descricao ?? "",
      marca: p.marca ?? "",
      grupoId: p.grupoId ?? undefined,
      custo: Number(p.custo ?? 0),
      valorVenda: Number(p.valorVenda ?? 0),
      fornecedor: p.fornecedor ?? "",
      categoria: p.categoria ?? "",
      prazoGarantia: Number(p.prazoGarantia ?? 90),
    }));

    // o backend pode variar — se não existir, mantém vazio
    if (Array.isArray(p.cores)) setCoresSelecionadas(p.cores);
    if (Array.isArray(p.variacoes) && p.variacoes.length) {
      // compat: se vier do modelo antigo (tamanho/espelho), tenta mapear em opcionais
      const mapped = p.variacoes.map((v: any) => ({
        nome: (v.nome ?? (v.temEspelho ? "COM ESPELHO" : v.tamanho ? String(v.tamanho) : "")).toUpperCase(),
        acrescimoCusto: Number(v.acrescimoCusto ?? 0),
        estoque: Number(v.estoque ?? 0),
      }));
      setOpcionais(mapped.length ? mapped : [{ nome: "", acrescimoCusto: 0, estoque: 0 }]);
    } else {
      setOpcionais([{ nome: "", acrescimoCusto: 0, estoque: 0 }]);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave() {
    if (!formData.descricao.trim()) {
      toast.error("Descrição é obrigatória");
      return;
    }

    try {
      const estoqueCores = coresSelecionadas.reduce((s, c) => s + Number(c.estoque ?? 0), 0);
      const estoqueOpcionais = opcionais.reduce((s, o) => s + Number(o.estoque ?? 0), 0);
      const estoqueTotal = estoqueCores + estoqueOpcionais;

      const payload = {
        ...formData,
        estoque: Number(estoqueTotal),
        cores: coresSelecionadas.map((c) => ({ corId: c.corId, estoque: Number(c.estoque ?? 0) })),
        // envia opcionais no mesmo campo "variacoes" (compat com backend atual)
        variacoes: opcionais
          .filter((o) => o.nome.trim())
          .map((o) => ({
            tamanho: "", // compat
            temEspelho: false, // compat
            nome: o.nome.trim().toUpperCase(),
            acrescimoCusto: Number(o.acrescimoCusto || 0),
            estoque: Number(o.estoque ?? 0),
          })),
      };

      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload } as any);
        toast.success("Produto atualizado!");
      } else {
        await createMutation.mutateAsync(payload as any);
        toast.success("Produto cadastrado!");
      }

      await utils.produtos.list.invalidate();
      limparForm();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir este produto?")) return;
    try {
      await deleteMutation.mutateAsync({ id } as any);
      toast.success("Produto excluído");
      await utils.produtos.list.invalidate();
      if (editingId === id) limparForm();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir");
    }
  }

  const salvarClass = "bg-emerald-600 hover:bg-emerald-700 text-white";
  const neutroClass = "bg-slate-100 hover:bg-slate-200 text-slate-900";

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Cadastro de Produtos"
        subtitle="Cadastro em cima + lista embaixo"
        icon={<Package className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={limparForm} className={`gap-2 ${neutroClass}`}>
            <Plus className="h-4 w-4" /> Novo
          </Button>
        }
      />

      <div className={PAGE_MAIN + " max-w-7xl mx-auto space-y-6"}>

        {/* CADASTRO (em cima) */}
        <Card className="border-primary/15 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-bold uppercase text-slate-700">Dados do produto</div>
              <div className="text-xs text-slate-500">
                Código: <span className="font-semibold text-slate-800">{codigoProdutoLabel}</span>
              </div>
            </div>

            {/* Linha 1: Código / Descrição */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
              <div className="md:col-span-1">
                <Label className="text-xs font-bold uppercase">Código</Label>
                <Input value={codigoProdutoLabel} disabled className="bg-slate-50" />
              </div>

              <div className="md:col-span-5">
                <Label className="text-xs font-bold uppercase">Descrição</Label>
                <Input
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Ex: Roupeiro Florença"
                />
              </div>
            </div>

            {/* Linha 2: Marca / Grupo */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-6">
              <div className="md:col-span-3">
                <Label className="text-xs font-bold uppercase">Marca</Label>
                <Input value={formData.marca} onChange={(e) => setFormData({ ...formData, marca: e.target.value })} />
              </div>

              <div className="md:col-span-3">
                <Label className="text-xs font-bold uppercase">Grupo</Label>
                <Select
                  value={formData.grupoId ? String(formData.grupoId) : ""}
                  onValueChange={(v) => setFormData({ ...formData, grupoId: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {grupos?.map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha 3: Custo / Preço sugerido */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-6">
              <div className="md:col-span-2">
                <Label className="text-xs font-bold uppercase">Custo (R$)</Label>
                <Input
                  type="number"
                  value={formData.custo}
                  onChange={(e) => setFormData({ ...formData, custo: Number(e.target.value) })}
                />
              </div>

              <div className="md:col-span-4">
                <div className="rounded-xl border bg-blue-700 p-3 text-white">
                  <div className="text-[11px] font-bold uppercase opacity-90">Preço sugerido (automático)</div>
                  <div className="text-2xl font-black">
                    R$ {Number(formData.valorVenda || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] opacity-80">
                    * Calculado pelo motor (grupo + taxas). Só organizei visualmente.
                  </div>
                </div>
              </div>
            </div>

            {/* CORES + ESTOQUE */}
            <div className="mt-6 border-t pt-5">
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm font-bold">Cores e estoque</div>
                <Select
                  onValueChange={(v) => {
                    const corId = Number(v);
                    if (!coresSelecionadas.find((c) => c.corId === corId)) {
                      setCoresSelecionadas([...coresSelecionadas, { corId, estoque: 0 }]);
                    }
                  }}
                >
                  <SelectTrigger className="w-full md:w-64">
                    <SelectValue placeholder="Adicionar cor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cores?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {coresSelecionadas.map((cs, idx) => (
                  <div key={cs.corId} className="flex items-end gap-2 rounded-xl border bg-white p-3">
                    <div className="flex-1">
                      <div className="text-[11px] font-bold uppercase text-slate-500">
                        {cores?.find((c: any) => c.id === cs.corId)?.nome ?? "Cor"}
                      </div>
                      <Input
                        type="number"
                        className="mt-1 h-9"
                        placeholder="Qtd"
                        min={0}
                        value={cs.estoque == null ? "" : cs.estoque}
                        onChange={(e) => {
                          const next = [...coresSelecionadas];
                          const raw = e.target.value;
                          next[idx].estoque = raw === "" ? 0 : Number(raw);
                          setCoresSelecionadas(next);
                        }}
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setCoresSelecionadas(coresSelecionadas.filter((c) => c.corId !== cs.corId))}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* OPCIONAIS */}
            <div className="mt-6 border-t pt-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold">Opcionais (alteram custo)</div>
                  <div className="text-xs text-slate-500">Ex.: COM ESPELHO, COM PÉS… (Enter cria nova linha)</div>
                </div>
                <Button
                  size="sm"
                  className={neutroClass}
                  onClick={() => setOpcionais([...opcionais, { nome: "", acrescimoCusto: 0, estoque: 0 }])}
                >
                  + Adicionar
                </Button>
              </div>

              <div className="space-y-2">
                {opcionais.map((o, idx) => {
                  const custoTotal = Number(formData.custo || 0) + Number(o.acrescimoCusto || 0);
                  const vendaOpc = calcularPrecoVenda(custoTotal);

                  return (
                    <div key={idx} className="grid grid-cols-1 gap-2 rounded-xl border bg-slate-50 p-3 md:grid-cols-12 md:items-end">
                      <div className="md:col-span-5">
                        <Label className="text-[10px] uppercase">Nome do opcional</Label>
                        <Input
                          value={o.nome}
                          placeholder="Ex: COM ESPELHO"
                          className="h-9"
                          onChange={(e) => {
                            const next = [...opcionais];
                            next[idx].nome = e.target.value;
                            setOpcionais(next);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const next = [...opcionais];
                              if (idx === next.length - 1) next.push({ nome: "", acrescimoCusto: 0, estoque: 0 });
                              setOpcionais(next);
                            }
                          }}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Label className="text-[10px] uppercase">+ Custo (R$)</Label>
                        <Input
                          type="number"
                          className="h-9"
                          value={o.acrescimoCusto}
                          onChange={(e) => {
                            const next = [...opcionais];
                            next[idx].acrescimoCusto = Number(e.target.value);
                            setOpcionais(next);
                          }}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Label className="text-[10px] uppercase">Estoque (opcional)</Label>
                        <Input
                          type="number"
                          className="h-9"
                          min={0}
                          value={o.estoque == null ? "" : o.estoque}
                          onChange={(e) => {
                            const next = [...opcionais];
                            const raw = e.target.value;
                            next[idx].estoque = raw === "" ? 0 : Number(raw);
                            setOpcionais(next);
                          }}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <div className="rounded-lg bg-blue-100 p-2 text-center">
                          <div className="text-[9px] font-bold uppercase text-blue-700">Custo total</div>
                          <div className="text-sm font-black text-blue-800">
                            R$ {custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-blue-700">
                            Venda: R$ {vendaOpc.toLocaleString("pt-BR")}
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-1 flex justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => setOpcionais(opcionais.filter((_, i) => i !== idx))}
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ações */}
            <div className="mt-6 flex flex-col gap-2 md:flex-row md:justify-end">
              <Button
                variant="outline"
                className={neutroClass}
                onClick={limparForm}
              >
                Cancelar
              </Button>

              <Button
                onClick={handleSave}
                className={`gap-2 ${salvarClass}`}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                <Save className="h-4 w-4" /> Salvar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* LISTA (embaixo) */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição ou marca..."
                  className="h-10 pl-10"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <div className="text-xs text-slate-500">
                {`${produtosFiltrados.length} produtos`}
              </div>
            </div>

            <div className="grid gap-2">
              {produtosFiltrados.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border bg-white p-3 hover:shadow-sm">
                  <div className="min-w-0">
                    <div className="truncate font-bold uppercase text-slate-900">
                      {p.descricao}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      <span className="font-semibold">{p.marca || "—"}</span>{" "}
                      <span className="text-slate-400">•</span>{" "}
                      <span className="text-slate-600">
                        Venda: R$ {Number(p.valorVenda || 0).toLocaleString("pt-BR")}
                      </span>{" "}
                      <span className="text-slate-400">•</span>{" "}
                      <span className="text-slate-600">Estoque: {p.estoque ?? 0}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" className={neutroClass} onClick={() => carregarParaEdicao(p)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(p.id)}>
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Nota: removi os modais de "cadastrar cor/grupo" aqui para não fugir do padrão.
            Se você quiser, eu reencaixo no padrão (tela inteira, sem modal). */}
      </div>
    </div>
  );
}
