import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Search, UserPlus, Pencil, Trash2, Users, Eye } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { PageHeader } from "../../components/layout/PageHeader";
import { PAGE_WRAPPER, PAGE_MAIN } from "../../components/layout/pageLayout";

import { trpc } from "../../lib/trpcClient";
import { maskPhoneBr, onlyDigits, maskCpf, maskCep } from "../../lib/masks";
import { toast } from "sonner";
import { useAuth } from "../../hooks/useAuth";

type SituacaoCliente = "ATIVO" | "INATIVO" | "PROSPECT";

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
  condominio?: string;
  bloco?: string;
  apartamento?: string;
  dataNascimento?: string;
  observacao?: string;
  situacao?: SituacaoCliente;
  /** Somente create/admin: id do vendedor principal como string (Select). */
  vendedorIdPrincipal?: string;
};

/** Linha retornada pela listagem (API paginada ou legado). */
type ClienteListRow = ClienteForm & { id: number; createdAt?: string };

function extractClientesList(d: unknown): ClienteListRow[] {
  if (Array.isArray(d)) return d as ClienteListRow[];
  if (d && typeof d === "object" && d !== null) {
    const o = d as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as ClienteListRow[];
    if (Array.isArray(o.clientes)) return o.clientes as ClienteListRow[];
  }
  return [];
}

function upper(v: string) {
  return (v ?? "").toUpperCase();
}

/** YYYY-MM-DD (ou ISO) -> dd/mm/aaaa, sem depender de fuso. */
function fmtDateBr(v?: string) {
  const s = String(v ?? "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** Campo read-only do card de perfil. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="text-slate-800 break-words">{value}</div>
    </div>
  );
}



function pick<T extends Record<string, unknown>>(obj: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  keys.forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

export default function ClientesConnected() {
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
  const [filtroSituacao, setFiltroSituacao] = useState<"TODAS" | SituacaoCliente>("TODAS");
  const [editId, setEditId] = useState<number | null>(null);
  const [selectedClienteId, setSelectedClienteId] = useState<number | null>(null);

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
    condominio: "",
    bloco: "",
    apartamento: "",
    dataNascimento: "",
    observacao: "",
    situacao: "ATIVO",
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
      condominio: "",
      bloco: "",
      apartamento: "",
      dataNascimento: "",
      observacao: "",
      situacao: "ATIVO",
      vendedorIdPrincipal: "",
    });
  }

  function loadForEdit(c: ClienteListRow) {
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
      condominio: c.condominio ?? "",
      bloco: c.bloco ?? "",
      apartamento: c.apartamento ?? "",
      dataNascimento: String(c.dataNascimento ?? "").slice(0, 10),
      observacao: c.observacao ?? "",
      situacao: c.situacao ?? "ATIVO",
      vendedorIdPrincipal: "",
    });
    setLocation("/clientes?modo=cadastro");
  }

  const listData = useMemo(() => extractClientesList(qList.data), [qList.data]);

  const selectedCliente = useMemo(
    () => (selectedClienteId != null ? listData.find((c) => c.id === selectedClienteId) ?? null : null),
    [listData, selectedClienteId]
  );

  useEffect(() => {
    if (selectedClienteId != null && !selectedCliente) setSelectedClienteId(null);
  }, [selectedClienteId, selectedCliente]);

  const qVendPrincipal = trpc.clientes.getVendedorPrincipal.useQuery(
    { clienteId: selectedClienteId ?? 0 },
    { enabled: selectedClienteId != null }
  );

  // adminProcedure: só dispara para admin
  const qVendedores = trpc.vendedores.list.useQuery(undefined, { enabled: isAdmin });
  const vendedoresLista = useMemo(
    () => (Array.isArray(qVendedores.data) ? (qVendedores.data as { id: number; nome: string }[]) : []),
    [qVendedores.data]
  );

  const items = useMemo(() => {
    const term = upper(busca.trim());
    const arr = listData;
    const filtered = arr.filter((c) => {
      const matchSituacao = filtroSituacao === "TODAS" || (c.situacao ?? "ATIVO") === filtroSituacao;
      if (!matchSituacao) return false;
      if (!term) return true;
      const hay = upper(
        `${c.nome ?? ""} ${c.telefone ?? ""} ${c.cidade ?? ""} ${c.uf ?? ""} ${c.cpf ?? ""} ${c.cep ?? ""} ${c.situacao ?? ""} ${c.condominio ?? ""} ${c.bloco ?? ""} ${c.apartamento ?? ""}`
      );
      return hay.includes(term);
    });

    return filtered.sort((a, b) => {
      const da = new Date(a.createdAt ?? 0).getTime();
      const db = new Date(b.createdAt ?? 0).getTime();
      if (db !== da) return db - da;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [listData, busca, filtroSituacao]);

  const saving = mCreate.isPending || mUpdate.isPending;

  const canSubmit = form.nome.trim().length > 0 && !saving;

  function submit() {
    const patch: ClienteForm = {
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
      condominio: (form.condominio ?? "").trim() || undefined,
      bloco: (form.bloco ?? "").trim() || undefined,
      apartamento: (form.apartamento ?? "").trim() || undefined,
      dataNascimento: form.dataNascimento?.trim() || undefined,
      observacao: form.observacao?.trim() || undefined,
      situacao: form.situacao || "ATIVO",
    };

    const updateKeys: (keyof ClienteForm)[] = [
      "nome",
      "telefone",
      "telefoneRecado",
      "cpf",
      "cep",
      "rua",
      "numero",
      "bairro",
      "cidade",
      "uf",
      "referencia",
      "condominio",
      "bloco",
      "apartamento",
      "dataNascimento",
      "observacao",
      "situacao",
    ];

    if (editId) {
      mUpdate.mutate({
        id: editId,
        ...pick(patch as ClienteForm & Record<string, unknown>, updateKeys),
      } as never);
    } else {
      // vendedorIdPrincipal: só admin pode definir no create; nunca vai no update
      const createVars: Record<string, unknown> = { ...patch };
      if (isAdmin && patch.vendedorIdPrincipal?.trim()) {
        createVars.vendedorIdPrincipal = Number(patch.vendedorIdPrincipal);
      } else {
        delete createVars.vendedorIdPrincipal;
      }
      mCreate.mutate(createVars as never);
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

              <div className="md:col-span-4">
                <Label className="text-slate-700 font-medium">Condomínio</Label>
                <Input value={form.condominio ?? ""} onChange={(e) => setForm((s) => ({ ...s, condominio: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-2">
                <Label className="text-slate-700 font-medium">Bloco</Label>
                <Input value={form.bloco ?? ""} onChange={(e) => setForm((s) => ({ ...s, bloco: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-2">
                <Label className="text-slate-700 font-medium">Apartamento</Label>
                <Input value={form.apartamento ?? ""} onChange={(e) => setForm((s) => ({ ...s, apartamento: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-4">
                <Label className="text-slate-700 font-medium">Data de Nascimento</Label>
                <Input type="date" value={form.dataNascimento ?? ""} onChange={(e) => setForm((s) => ({ ...s, dataNascimento: e.target.value }))} className="bg-white border-slate-200 text-slate-900" />
              </div>

              <div className="md:col-span-4">
                <Label className="text-slate-700 font-medium">Situação</Label>
                <Select
                  value={form.situacao ?? "ATIVO"}
                  onValueChange={(v) => setForm((s) => ({ ...s, situacao: v as SituacaoCliente }))}
                >
                  <SelectTrigger className="bg-white border-slate-200 text-slate-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ATIVO">Ativo</SelectItem>
                    <SelectItem value="INATIVO">Inativo</SelectItem>
                    <SelectItem value="PROSPECT">Prospect</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isAdmin && !editId && (
                <div className="md:col-span-4">
                  <Label className="text-slate-700 font-medium">Vendedor Principal</Label>
                  <Select
                    value={form.vendedorIdPrincipal || "NONE"}
                    onValueChange={(v) => setForm((s) => ({ ...s, vendedorIdPrincipal: v === "NONE" ? "" : v }))}
                  >
                    <SelectTrigger className="bg-white border-slate-200 text-slate-900">
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Sem vínculo inicial</SelectItem>
                      {vendedoresLista.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isAdmin && editId != null && (
                <div className="md:col-span-12 text-xs text-muted-foreground">
                  Alteração de vendedor principal será liberada em fase backend.
                </div>
              )}

              <div className="md:col-span-8">
                <Label className="text-slate-700 font-medium">Observação</Label>
                <Textarea
                  value={form.observacao ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, observacao: e.target.value }))}
                  className="bg-white border-slate-200 text-slate-900"
                  rows={2}
                />
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

        {/* Perfil detalhado (somente no modo perfil, quando há cliente selecionado) */}
        {modo === "perfil" && selectedCliente && (
          <div className="bg-white/95 text-slate-800 border border-slate-200 rounded-2xl shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 font-black text-slate-900">
                <Eye className="h-5 w-5" />
                {upper(selectedCliente.nome ?? "")}
                <Badge
                  variant={
                    selectedCliente.situacao === "INATIVO"
                      ? "destructive"
                      : selectedCliente.situacao === "PROSPECT"
                        ? "secondary"
                        : "default"
                  }
                >
                  {selectedCliente.situacao ?? "ATIVO"}
                </Badge>
              </div>
              <Button variant="outline" onClick={() => setSelectedClienteId(null)}>
                Fechar perfil
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <Field label="Telefone" value={selectedCliente.telefone ? maskPhoneBr(selectedCliente.telefone) : "—"} />
              <Field label="Telefone recado" value={selectedCliente.telefoneRecado ? maskPhoneBr(selectedCliente.telefoneRecado) : "—"} />
              <Field label="CPF" value={selectedCliente.cpf ? maskCpf(selectedCliente.cpf) : "—"} />
              <Field label="CEP" value={selectedCliente.cep ? maskCep(selectedCliente.cep) : "—"} />
              <Field
                label="Endereço"
                value={upper([selectedCliente.rua, selectedCliente.numero].filter(Boolean).join(", ")) || "—"}
              />
              <Field label="Bairro" value={upper(selectedCliente.bairro ?? "") || "—"} />
              <Field
                label="Cidade/UF"
                value={upper([selectedCliente.cidade, selectedCliente.uf].filter(Boolean).join("/")) || "—"}
              />
              <Field label="Referência" value={upper(selectedCliente.referencia ?? "") || "—"} />
              <Field label="Condomínio" value={upper(selectedCliente.condominio ?? "") || "—"} />
              <Field label="Bloco" value={upper(selectedCliente.bloco ?? "") || "—"} />
              <Field label="Apartamento" value={upper(selectedCliente.apartamento ?? "") || "—"} />
              <Field
                label="Nascimento"
                value={selectedCliente.dataNascimento ? fmtDateBr(selectedCliente.dataNascimento) : "—"}
              />
              <Field
                label="Vendedor principal"
                value={
                  qVendPrincipal.isLoading
                    ? "Carregando..."
                    : (qVendPrincipal.data?.vendedorNome ?? "Sem vendedor principal")
                }
              />
              <Field label="Cadastrado em" value={selectedCliente.createdAt ? fmtDateBr(selectedCliente.createdAt) : "—"} />
              <div className="md:col-span-3">
                <div className="text-xs font-bold text-slate-500">Observação</div>
                <div className="text-slate-800 break-words">{selectedCliente.observacao?.trim() || "—"}</div>
              </div>
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

            <div className="flex items-center gap-2 w-full max-w-md">
              <Input
                placeholder="Buscar por nome, telefone, cidade ou CPF..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="flex-1"
              />
              <Select value={filtroSituacao} onValueChange={(v) => setFiltroSituacao(v as typeof filtroSituacao)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas</SelectItem>
                  <SelectItem value="ATIVO">Ativo</SelectItem>
                  <SelectItem value="INATIVO">Inativo</SelectItem>
                  <SelectItem value="PROSPECT">Prospect</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!qList.isLoading && items.length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
          )}

          <div className="divide-y border rounded-xl overflow-hidden">
            {items.map((c) => (
              <div key={c.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedClienteId(c.id)}>
                  <div className="font-black truncate flex items-center gap-2">
                    {upper(c.nome ?? "")}
                    <Badge
                      variant={
                        c.situacao === "INATIVO"
                          ? "destructive"
                          : c.situacao === "PROSPECT"
                            ? "secondary"
                            : "default"
                      }
                    >
                      {c.situacao ?? "ATIVO"}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground truncate">
                    {(c.telefone ?? "—")} • {upper(c.cidade ?? "—")} {c.uf ? `- ${upper(c.uf)}` : ""}
                  </div>
                  {(c.cpf || c.cep || c.condominio || c.bloco || c.apartamento || c.dataNascimento) && (
                    <div className="text-xs text-muted-foreground truncate">
                      {[
                        c.cpf ? `CPF ${maskCpf(c.cpf)}` : null,
                        c.cep ? `CEP ${maskCep(c.cep)}` : null,
                        [c.condominio, c.bloco, c.apartamento].filter(Boolean).length > 0
                          ? `Cond. ${upper([c.condominio, c.bloco, c.apartamento].filter(Boolean).join(" "))}`
                          : null,
                        c.dataNascimento ? `Nasc. ${fmtDateBr(c.dataNascimento)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedClienteId(c.id);
                      setLocation("/clientes?modo=perfil");
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>

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
