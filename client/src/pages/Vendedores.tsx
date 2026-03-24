import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Pencil, Plus, Search, Shield, Trash2, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpcClient";
import { onlyDigits, maskPhoneBr } from "@/lib/masks";
import { toast } from "sonner";

type Vendedor = {
  id: number;
  nome: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  admin: boolean;
  ativo?: boolean | null;
  userId?: number | null;
};



export default function Vendedores() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Vendedor | null>(null);
  const [linkModalVendedor, setLinkModalVendedor] = useState<Vendedor | null>(null);
  const [linkOpenId, setLinkOpenId] = useState("");
  const [linkPassword, setLinkPassword] = useState("");

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [senhaPin, setSenhaPin] = useState("");
  const [admin, setAdmin] = useState(false);

  const vendedoresQuery = trpc.vendedores.list.useQuery();
  const linkUserMutation = trpc.vendedores.linkUser.useMutation({
    onSuccess: () => {
      toast.success("Login vinculado ao vendedor");
      setLinkModalVendedor(null);
      setLinkOpenId("");
      setLinkPassword("");
      utils.vendedores.list.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao vincular login"),
  });

  const criar = trpc.vendedores.create.useMutation({
    onSuccess: async () => {
      toast.success("Vendedor cadastrado com sucesso!");
      limparForm();
      await utils.vendedores.list.invalidate();
      await utils.vendedores.list.refetch();
    },
    onError: (error: any) => {
      console.error("Erro ao criar vendedor:", error);
      const code = error.data?.code;
      let msg = "Erro ao salvar vendedor.";
      
      if (code === "UNAUTHORIZED") {
        msg = "Sessão expirada ou não enviada. Faça login novamente.";
      } else if (code === "FORBIDDEN") {
        msg = "Acesso negado. Apenas administradores podem cadastrar vendedores.";
      } else if (code === "CONFLICT") {
        msg = "Já existe um vendedor com este nome ou email.";
      } else if (error?.message) {
        msg = error.message;
      } else if (error?.data?.message) {
        msg = error.data.message;
      } else if (typeof error?.data?.zodError === "object") {
        const zodErrors = (error.data?.zodError as { fieldErrors?: Record<string, string[]> })?.fieldErrors;
        if (zodErrors) {
          const errorMessages = Object.entries(zodErrors)
            .map(([field, errors]) => `${field}: ${(errors as string[])[0]}`)
            .join(", ");
          msg = `Verifique os campos: ${errorMessages}`;
        } else {
          msg = "Verifique os campos (nome, cidade, senha 6 dígitos).";
        }
      }
      
      toast.error(msg);
    },
  });
  const atualizar = trpc.vendedores.update.useMutation({
    onSuccess: async () => {
      toast.success("Vendedor atualizado!");
      limparForm();
      await utils.vendedores.list.invalidate();
      await utils.vendedores.list.refetch();
    },
    onError: (e: any) => {
      const code = e?.data?.code;
      const msg = code === "FORBIDDEN" ? "Acesso negado. Apenas administradores." : (e?.message ?? e?.data?.message ?? "Erro ao salvar.");
      toast.error(msg);
    },
  });
  const deletar = trpc.vendedores.delete.useMutation({
    onSuccess: () => toast.success("Vendedor excluído!"),
    onError: (e) => toast.error(e.message || "Erro ao excluir"),
    onSettled: () => utils.vendedores.list.invalidate(),
  });

  const limparForm = () => {
    setEditando(null);
    setNome("");
    setTelefone("");
    setCidade("");
    setSenhaPin("");
    setAdmin(false);
  };

  const editar = (v: Vendedor) => {
    setEditando(v);
    setNome(v.nome || "");
    setTelefone(v.telefone || "");
    setCidade(v.cidade || "");
    setSenhaPin("");
    setAdmin(!!v.admin);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const salvar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    // Validação do formulário
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!cidade.trim()) {
      toast.error("Cidade é obrigatória");
      return;
    }

    const pin = onlyDigits(senhaPin);
    if (!editando && pin.length !== 6) {
      toast.error("Senha deve ter 6 dígitos");
      return;
    }
    if (editando && pin.length > 0 && pin.length !== 6) {
      toast.error("Senha deve ter 6 dígitos");
      return;
    }

    // Mostrar toast de carregamento
    const loadingToast = toast.loading(
      editando ? "Atualizando vendedor..." : "Cadastrando vendedor..."
    );

    const telefoneValue = telefone.trim();
    const basePayload = {
      nome: nome.trim(),
      cidade: cidade.trim(),
      admin: !!admin,
    };

    try {
      if (editando) {
        // Atualizar vendedor existente
        const updatePayload: {
          id: number;
          nome: string;
          telefone?: string;
          cidade: string;
          admin: boolean;
          senha?: string;
        } = { ...basePayload, id: editando.id, telefone: telefoneValue || undefined };
        if (pin.length === 6) updatePayload.senha = pin;
        
        console.log("Atualizando vendedor:", { ...updatePayload, senha: pin ? "***" : undefined });
        await atualizar.mutateAsync(updatePayload);
        
        // Remover toast de carregamento e mostrar sucesso
        toast.dismiss(loadingToast);
        toast.success("Vendedor atualizado com sucesso!");
        limparForm();
      } else {
        // Criar novo vendedor
        if (pin.length !== 6) {
          toast.error("Senha deve ter 6 dígitos");
          toast.dismiss(loadingToast);
          return;
        }
        
        const createPayload = { ...basePayload, telefone: telefoneValue || null, email: null as string | null, senha: pin };
        console.log("Criando vendedor:", { ...createPayload, senha: "***" });
        await criar.mutateAsync(createPayload);
        
        // Remover toast de carregamento e mostrar sucesso
        toast.dismiss(loadingToast);
        toast.success("Vendedor cadastrado com sucesso!");
        limparForm();
      }
      
      // Atualizar a lista
      utils.vendedores.list.invalidate();
    } catch (err: unknown) {
      // Remover toast de carregamento
      toast.dismiss(loadingToast);
      
      // Este bloco catch só será acionado se houver um erro não tratado pelo onError do useMutation
      console.error("Erro não tratado ao salvar vendedor:", err);
      
      const e = err as any;
      const errorMessage =
        typeof e?.message === "string"
          ? e.message
          : err instanceof Error
            ? err.message
            : "Erro ao salvar. Verifique se está logado como administrador.";
      
      toast.error(errorMessage);
    }
  };

  const excluir = async (v: Vendedor) => {
    if (!confirm(`Excluir o vendedor "${v.nome}"?`)) return;
    await deletar.mutateAsync({ id: v.id });
    if (editando?.id === v.id) limparForm();
  };

  const abrirModalLink = (v: Vendedor) => {
    setLinkModalVendedor(v);
    setLinkOpenId("");
    setLinkPassword("");
  };

  const vincularLogin = () => {
    if (!linkModalVendedor || !linkOpenId.trim()) {
      toast.error("Informe o usuário (openId).");
      return;
    }
    linkUserMutation.mutate({
      vendedorId: linkModalVendedor.id,
      openId: linkOpenId.trim().toLowerCase(),
      password: linkPassword.trim() || undefined,
    });
  };

  const vendedoresFiltrados = useMemo(() => {
    const data = vendedoresQuery.data ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return data;
    return data.filter((v) =>
      String(v.nome || "").toLowerCase().includes(q) ||
      String(v.telefone || "").toLowerCase().includes(q) ||
      String(v.cidade || "").toLowerCase().includes(q)
    );
  }, [vendedoresQuery.data, busca]);

  // Padrão production-ready: botão desabilitado só por campos obrigatórios vazios ou submissão em andamento (local).
  const isSubmitting = criar.isPending || atualizar.isPending;
  const canSubmit =
    nome.trim() !== "" &&
    cidade.trim() !== "" &&
    (editando ? true : onlyDigits(senhaPin).length === 6);
  const submitDisabled = !canSubmit || isSubmitting;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-4">
        {/* Header padrão premium */}
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
            <Users className="h-6 w-6 text-blue-600" />
            <div className="text-right">
              <div className="text-lg font-semibold">Cad. de Vendedor</div>
              <div className="text-sm text-slate-500">Cadastre aqui</div>
            </div>
          </div>
        </div>

        {/* Form no padrão Nota de Entrada */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-600" />
              {editando ? "Editar vendedor" : "Novo vendedor"}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); salvar(); }} noValidate>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label>Nome *</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>

              <div>
                <Label>Cidade *</Label>
                <Input
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value.toUpperCase())}
                  placeholder="Ex: COLATINA"
                />
              </div>

              <div>
                <Label>Telefone</Label>
                <Input
                  value={telefone}
                  onChange={(e) => setTelefone(maskPhoneBr(e.target.value))}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                />
              </div>

              <div>
                <Label>Senha (6 dígitos){editando ? " (opcional)" : " *"}</Label>
                <Input
                  value={senhaPin}
                  onChange={(e) => setSenhaPin(onlyDigits(e.target.value).slice(0, 6))}
                  placeholder="••••••"
                  inputMode="numeric"
                  type="password"
                  maxLength={6}
                />
              </div>

              <div className="flex items-end gap-2 md:col-span-1">
                <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 w-full">
                  <Checkbox checked={admin} onCheckedChange={(v) => setAdmin(!!v)} />
                  <span className="text-sm">Admin</span>
                </div>
              </div>
            </div>

            {/* Botões: Novo (cinza) à esquerda e Salvar (verde) à direita */}
            <div className="mt-4 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={limparForm}
                disabled={isSubmitting}
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo
              </Button>

              <Button
                type="submit"
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
                disabled={submitDisabled}
              >
                {isSubmitting ? "Salvando..." : editando ? "Salvar" : "Salvar"}
              </Button>
            </div>
            </form>
          </CardContent>
        </Card>

        {/* Lista */}
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
                placeholder="Buscar vendedor..."
              />
            </div>
          </CardHeader>

          <CardContent>
            {vendedoresQuery.isError && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-medium">
                  {vendedoresQuery.error?.message ?? "Erro ao carregar a lista. Apenas administradores veem os vendedores."}
                </p>
                <p className="text-amber-700">
                  Se você é admin: faça <strong>logout</strong> e <strong>login de novo</strong> na mesma URL do sistema (frontend e API na mesma origem ou via proxy) para o cookie de sessão ser enviado corretamente.
                </p>
              </div>
            )}
            {!vendedoresQuery.isLoading && !vendedoresQuery.isError && vendedoresFiltrados.length === 0 && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm text-slate-700">
                <p className="font-medium">Nenhum vendedor encontrado.</p>
                <p className="text-slate-600">
                  Se você entrou com usuário <strong>admin</strong> (cadastrado pelo seed ou criado antes), ele aparece na lista só se estiver na tabela de vendedores. Cadastre um vendedor no formulário acima para testar o Salvar.
                </p>
              </div>
            )}

            <div className="divide-y rounded-xl border">
              {vendedoresFiltrados.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{v.nome}</div>
                    <div className="truncate text-sm text-slate-500">
                      {(v.telefone || "—")} • {(v.cidade || "—")}
                      {v.admin ? " • ADMIN" : ""}
                      {v.userId != null ? " • Login vinculado" : ""}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {v.userId != null ? (
                      <span className="text-xs text-emerald-600 font-medium px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
                        Login vinculado
                      </span>
                    ) : (
                      <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => abrirModalLink(v)}>
                        <UserPlus className="h-4 w-4" />
                        Vincular Login
                      </Button>
                    )}
                    <Button variant="outline" className="rounded-xl" onClick={() => editar(v)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button
                      variant="destructive"
                      className="rounded-xl"
                      onClick={() => excluir(v)}
                      disabled={deletar.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Vincular Login */}
            {linkModalVendedor && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setLinkModalVendedor(null)}>
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="font-semibold text-lg">Vincular Login — {linkModalVendedor.nome}</h3>
                  <div>
                    <Label>Usuário (openId) *</Label>
                    <Input
                      value={linkOpenId}
                      onChange={(e) => setLinkOpenId(e.target.value)}
                      placeholder="ex: joao.silva"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Senha (opcional)</Label>
                    <Input
                      type="password"
                      value={linkPassword}
                      onChange={(e) => setLinkPassword(e.target.value)}
                      placeholder="Deixe em branco para não alterar"
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <Button variant="outline" onClick={() => setLinkModalVendedor(null)}>Cancelar</Button>
                    <Button onClick={vincularLogin} disabled={!linkOpenId.trim() || linkUserMutation.isPending}>
                      {linkUserMutation.isPending ? "Vinculando…" : "Vincular"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
