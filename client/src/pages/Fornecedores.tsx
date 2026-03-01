import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Building2, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpcClient";
import { toast } from "sonner";

type Fornecedor = {
  id: number;
  nome: string;
  telefone?: string | null;
  tipo?: string | null;
  observacoes?: string | null;
};

function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

function maskTelefone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function codigoAuto(id: number) {
  return `F${String(id).padStart(4, "0")}`;
}

export default function Fornecedores() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Fornecedor | null>(null);

  const [nome, setNome] = useState("");
  const [representante, setRepresentante] = useState("");
  const [tipo, setTipo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const fornecedoresQuery = trpc.fornecedores.list.useQuery();

  const criar = trpc.fornecedores.create.useMutation({
    onSuccess: async () => {
      await utils.fornecedores.list.invalidate();
      toast.success("Fornecedor cadastrado!");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar"),
  });

  const atualizar = trpc.fornecedores.update.useMutation({
    onSuccess: async () => {
      await utils.fornecedores.list.invalidate();
      toast.success("Fornecedor atualizado!");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar"),
  });

  const deletar = trpc.fornecedores.delete.useMutation({
    onSuccess: async () => {
      await utils.fornecedores.list.invalidate();
      toast.success("Fornecedor excluído!");
    },
    onError: (e) => toast.error(e.message || "Erro ao excluir"),
  });

  const limparForm = () => {
    setEditando(null);
    setNome("");
    setRepresentante("");
    setTipo("");
    setTelefone("");
    setObservacoes("");
  };

  const editar = (f: Fornecedor) => {
    setEditando(f);
    setNome(f.nome || "");
    setTipo(f.tipo || "");
    setTelefone(f.telefone || "");

    // Se a observação foi salva com prefixo "REP:", re-hidrata no campo Representante
    const obs = f.observacoes || "";
    const repMatch = obs.match(/REP:\s*([^\n\r]+)/i);
    setRepresentante(repMatch ? repMatch[1].trim() : "");
    setObservacoes(obs.replace(/REP:\s*[^\n\r]+/i, "").trim());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("Nome do fornecedor é obrigatório");
      return;
    }

    const obsFinal = [
      representante.trim() ? `REP: ${representante.trim()}` : null,
      observacoes.trim() ? observacoes.trim() : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const payload: any = {
      nome: nome.trim(),
      tipo: tipo.trim() || undefined,
      telefone: telefone.trim() || undefined,
      observacoes: obsFinal || undefined,
    };

    try {
      if (editando) {
        await atualizar.mutateAsync({ id: editando.id, ...payload });
      } else {
        await criar.mutateAsync(payload);
      }
      limparForm();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    }
  };

  const excluir = async (f: Fornecedor) => {
    if (!confirm(`Excluir o fornecedor "${f.nome}"?`)) return;
    await deletar.mutateAsync({ id: f.id });
    if (editando?.id === f.id) limparForm();
  };

  const fornecedoresFiltrados = useMemo(() => {
    const data = (fornecedoresQuery.data ?? []) as Fornecedor[];
    const q = busca.trim().toLowerCase();
    if (!q) return data;
    return data.filter((f) =>
      String(f.nome || "").toLowerCase().includes(q) ||
      String(f.telefone || "").toLowerCase().includes(q) ||
      String(f.tipo || "").toLowerCase().includes(q) ||
      String(f.observacoes || "").toLowerCase().includes(q)
    );
  }, [fornecedoresQuery.data, busca]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-4">
        {/* Header premium */}
        <div className="mb-4 flex items-center justify-between">
          <Button
            variant="destructive"
            className="gap-2 rounded-xl"
            onClick={() => setLocation("/")}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>

          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-emerald-600" />
            <div className="text-right">
              <div className="text-lg font-semibold">Cad. Fornecedor</div>
              <div className="text-sm text-slate-500">Cadastrar</div>
            </div>
          </div>
        </div>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Digite os dados</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label>Código</Label>
                <Input value={editando ? codigoAuto(editando.id) : "AUTO"} readOnly />
              </div>

              <div className="md:col-span-2">
                <Label>Nome fornecedor *</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>

              <div className="md:col-span-2">
                <Label>Nome representante</Label>
                <Input value={representante} onChange={(e) => setRepresentante(e.target.value)} />
              </div>

              <div>
                <Label>Tipo</Label>
                <Input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Ex: Fábrica / Loja / Transporte" />
              </div>

              <div>
                <Label>Telefone</Label>
                <Input
                  value={telefone}
                  onChange={(e) => setTelefone(maskTelefone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                />
              </div>

              <div className="md:col-span-2">
                <Label>Observações</Label>
                <Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
              </div>
            </div>

            {/* Botões: Novo cinza e Salvar verde */}
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={limparForm}
                disabled={criar.isPending || atualizar.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo
              </Button>

              <Button
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
                onClick={salvar}
                disabled={criar.isPending || atualizar.isPending}
              >
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4 rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-600" />
              Consultar
            </CardTitle>

            <div className="w-full max-w-sm">
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar fornecedor..."
              />
            </div>
          </CardHeader>

          <CardContent>
            {!fornecedoresQuery.isLoading && fornecedoresFiltrados.length === 0 && (
              <div className="text-sm text-slate-500">Nenhum fornecedor encontrado.</div>
            )}

            <div className="divide-y rounded-xl border">
              {fornecedoresFiltrados.map((f) => (
                <div key={f.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">
                      {codigoAuto(f.id)} • {f.nome}
                    </div>
                    <div className="truncate text-sm text-slate-500">
                      {(f.telefone || "—")} • {(f.tipo || "—")}
                      {f.observacoes ? ` • ${f.observacoes}` : ""}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="rounded-xl" onClick={() => editar(f)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button variant="destructive" className="rounded-xl" onClick={() => excluir(f)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
