import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Search, UserPlus, Pencil, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";

import { trpc } from "@/lib/trpcClient";
import { maskPhoneBr, onlyDigits, maskCpf, maskCep } from "@/lib/masks";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type ClienteForm = {
  id?: number;
  nome: string;
  telefone?: string;
  telefoneRecado?: string;
  cpf?: string;
  cep?: string;
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  referencia?: string;
};

function upper(v: string) {
  return (v ?? "").toUpperCase();
}



function pick<T extends object>(obj: any, keys: Array<keyof T>): Partial<T> {
  const out: any = {};
  keys.forEach((k) => {
    if (obj?.[k as any] !== undefined) out[k as any] = obj[k as any];
  });
  return out;
}

export default function Clientes() {
  const [location, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(location.includes("?") ? location.split("?")[1]! : ""), [location]);
  const modo = (params.get("modo") || "cadastro") as "cadastro" | "perfil";

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const utils = trpc.useUtils();
  const qList = trpc.clientes.list.useQuery(undefined, { staleTime: 10_000 });

  const mCreate = trpc.clientes.create.useMutation({
    onSuccess: () => {
      toast.success("Cliente cadastrado!");
      reset();
      setEditId(null);
    },
    onError: (e) => toast.error(e.message || "Erro ao cadastrar cliente"),
    onSettled: () => utils.clientes.list.invalidate(),
  });

  const mUpdate = trpc.clientes.update.useMutation({
    onSuccess: () => {
      toast.success("Cliente atualizado!");
      reset();
      setEditId(null);
    },
    onError: (e) => toast.error(e.message || "Erro ao atualizar cliente"),
    onSettled: () => utils.clientes.list.invalidate(),
  });

  const mDelete = trpc.clientes.delete.useMutation({
    onSuccess: () => toast.success("Cliente excluído!"),
    onError: (e) => toast.error(e.message || "Erro ao excluir cliente"),
    onSettled: () => utils.clientes.list.invalidate(),
  });

  const [busca, setBusca] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  const [form, setForm] = useState<ClienteForm>({
    nome: "",
    telefone: "",
    telefoneRecado: "",
    cpf: "",
    cep: "",
    rua: "",
    numero: "",
    bairro: "",
    cidade: "",
    uf: "",
    referencia: "",
  });

  function reset() {
    setForm({
      nome: "",
      telefone: "",
      telefoneRecado: "",
      cpf: "",
      cep: "",
      rua: "",
      numero: "",
      bairro: "",
      cidade: "",
      uf: "",
      referencia: "",
    });
  }

  function loadForEdit(c: any) {
    setEditId(c.id);
    setForm({
      id: c.id,
      nome: c.nome ?? "",
      telefone: maskPhoneBr(c.telefone ?? ""),
      telefoneRecado: maskPhoneBr(c.telefoneRecado ?? ""),
      cpf: maskCpf(c.cpf ?? ""),
      cep: maskCep(c.cep ?? ""),
      rua: c.rua ?? "",
      numero: c.numero ?? "",
      bairro: c.bairro ?? "",
      cidade: c.cidade ?? "",
      uf: c.uf ?? "",
      referencia: c.referencia ?? "",
    });
    setLocation("/clientes?modo=cadastro");
  }

  // Normaliza resposta do backend (pode ser array ou { clientes: [] })
  const listData = useMemo(() => {
    const d = qList.data;
    if (Array.isArray(d)) return d;
    if (d && typeof d === "object" && Array.isArray((d as any).clientes)) return (d as any).clientes;
    return [];
  }, [qList.data]);

  const items = useMemo(() => {
    const term = upper(busca.trim());
    const arr = listData as any[];
    const filtered = !term
      ? arr
      : arr.filter((c) => {
          const hay = upper(`${c.nome ?? ""} ${c.telefone ?? ""} ${c.cidade ?? ""} ${c.uf ?? ""}`);
          return hay.includes(term);
        });

    // Novos primeiro (createdAt se existir)
    return filtered.sort((a, b) => {
      const da = new Date(a.createdAt ?? 0).getTime();
      const db = new Date(b.createdAt ?? 0).getTime();
      if (db !== da) return db - da;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [listData, busca]);

  const saving = mCreate.isPending || mUpdate.isPending;

  const canSubmit = form.nome.trim().length > 0 && !saving;

  function submit() {
    const payload: any = {
      ...form,
      nome: upper(form.nome),
      telefone: onlyDigits(form.telefone || "") || undefined,
      telefoneRecado: onlyDigits(form.telefoneRecado || "") || undefined,
      cpf: onlyDigits(form.cpf || "") || undefined,
      cep: onlyDigits(form.cep || "") || undefined,
      rua: upper(form.rua ?? "") || undefined,
      numero: upper(form.numero ?? "") || undefined,
      bairro: upper(form.bairro ?? "") || undefined,
      cidade: upper(form.cidade ?? "") || undefined,
      uf: upper(form.uf ?? "") || undefined,
      referencia: upper(form.referencia ?? "") || undefined,
    };

    if (editId) {
      // update permite parcial; mandamos só campos relevantes
      mUpdate.mutate({ id: editId, ...(pick<ClienteForm>(payload, [
        "nome","telefone","telefoneRecado","cpf","cep","rua","numero","bairro","cidade","uf","referencia"
      ]) as any) });
    } else {
      mCreate.mutate(payload);
    }
  }

  useEffect(() => {
    // se entrar no modo perfil, limpa edição pra não confundir
    if (modo === "perfil") setEditId(null);
  }, [modo]);

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={modo === "perfil" ? "Perfil do Cliente" : "Cad. de Clientes"}
        subtitle={modo === "perfil" ? "Consulte os dados" : "Cadastre e edite clientes"}
        icon={<Users className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button
              variant={modo === "cadastro" ? "default" : "outline"}
              onClick={() => setLocation("/clientes?modo=cadastro")}
            >
              Cadastro
            </Button>
            <Button
              variant={modo === "perfil" ? "default" : "outline"}
              onClick={() => setLocation("/clientes?modo=perfil")}
            >
              Consulta
            </Button>
          </div>
        }
      />

      <div className={PAGE_MAIN}>
        {/* Card do cadastro (somente no modo cadastro) */}
        {modo === "cadastro" && (
          <div className="bg-white/95 text-slate-800 border border-slate-200 rounded-2xl shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 font-black text-slate-900">
                <UserPlus className="h-5 w-5" />
                {editId ? "Editar cliente" : "Cadastrar cliente"}
              </div>
              {editId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditId(null);
                    reset();
                  }}
                >
                  Cancelar edição
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-6">
                <Label className="text-slate-700 font-medium">Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-3">
                <Label className="text-slate-700 font-medium">Telefone</Label>
                <Input value={form.telefone ?? ""} onChange={(e) => setForm((s) => ({ ...s, telefone: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-3">
                <Label className="text-slate-700 font-medium">Recado</Label>
                <Input value={form.telefoneRecado ?? ""} onChange={(e) => setForm((s) => ({ ...s, telefoneRecado: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-3">
                <Label className="text-slate-700 font-medium">CPF</Label>
                <Input value={form.cpf ?? ""} onChange={(e) => setForm((s) => ({ ...s, cpf: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-3">
                <Label className="text-slate-700 font-medium">CEP</Label>
                <Input value={form.cep ?? ""} onChange={(e) => setForm((s) => ({ ...s, cep: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-4">
                <Label className="text-slate-700 font-medium">Rua</Label>
                <Input value={form.rua ?? ""} onChange={(e) => setForm((s) => ({ ...s, rua: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-2">
                <Label className="text-slate-700 font-medium">Número</Label>
                <Input value={form.numero ?? ""} onChange={(e) => setForm((s) => ({ ...s, numero: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-4">
                <Label className="text-slate-700 font-medium">Bairro</Label>
                <Input value={form.bairro ?? ""} onChange={(e) => setForm((s) => ({ ...s, bairro: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-4">
                <Label className="text-slate-700 font-medium">Cidade</Label>
                <Input value={form.cidade ?? ""} onChange={(e) => setForm((s) => ({ ...s, cidade: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-2">
                <Label className="text-slate-700 font-medium">UF</Label>
                <Input value={form.uf ?? ""} onChange={(e) => setForm((s) => ({ ...s, uf: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-6">
                <Label className="text-slate-700 font-medium">Referência</Label>
                <Input value={form.referencia ?? ""} onChange={(e) => setForm((s) => ({ ...s, referencia: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <Button onClick={submit} disabled={!canSubmit}>
                {editId ? "Salvar alterações" : "Cadastrar"}
              </Button>
              <Button variant="outline" onClick={reset}>
                Limpar
              </Button>
            </div>
          </div>
        )}

        {/* Lista (sempre) */}
        <div className="bg-white/95 text-slate-800 border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="font-black flex items-center gap-2 text-slate-900">
              <Search className="h-5 w-5" />
              Clientes cadastrados
            </div>

            <div className="w-full max-w-md">
              <Input
                placeholder="Buscar por nome, telefone ou cidade..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          {!qList.isLoading && items.length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
          )}

          <div className="divide-y border rounded-xl overflow-hidden">
            {items.map((c: any) => (
              <div key={c.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-black truncate">{upper(c.nome ?? "")}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    {(c.telefone ?? "—")} • {upper(c.cidade ?? "—")} {c.uf ? `- ${upper(c.uf)}` : ""}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => loadForEdit(c)}>
                    <Pencil className="h-4 w-4 mr-1" />
                    Editar
                  </Button>

                  {isAdmin && (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (confirm(`Excluir o cliente "${c.nome}"?`)) mDelete.mutate({ id: c.id });
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Excluir
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!isAdmin && (
            <div className="mt-3 text-xs text-muted-foreground">
              * Exclusão é apenas para Admin.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
